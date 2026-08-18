import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeImage } from 'electron'
import { join, resolve } from 'path'
import { createReadStream, existsSync } from 'fs'
import { Readable } from 'stream'
import { pathToFileURL } from 'url'
import { readFile, writeFile, readdir, mkdir, rename, rm, stat, copyFile, open } from 'fs/promises'
import type { Dirent } from 'fs'
import { applyAppMenu, type MenuLocale } from './menu'
import { REVISIONS_DIR } from './ai/revisions'
import {
  docOpen,
  docPatch,
  docSave,
  docDiscard,
  docReloadFromDisk,
  docEvict,
  docSeedFromRenderer,
  docSubscribe,
  docUnsubscribe,
  docUnsubscribeAll,
  type DocSnapshot
} from './documentHub'
import {
  countMainWindows,
  countMainWindowsWithWorkspace,
  floatWindowsForWorkspace,
  getWindowMeta,
  listWorkspaceRoots,
  removeWindowMeta,
  setWindowMeta,
  updateWindowMeta,
  type WindowRole
} from './windowRegistry'
import {
  applyNativeThemeSource,
  readSplashTheme,
  splashBackgroundColor,
  splashThemeCssVars,
  titleBarOverlayFor,
  writeSplashTheme
} from './themeSettings'
import { registerAiIpc } from './ai/registerAiIpc'
import { registerGitIpc } from './git/registerGitIpc'
import { registerStoryboardIpc } from './storyboard/registerStoryboardIpc'
import { registerPdfIpc } from './pdf/registerPdfIpc'
import {
  parseOpenFileFromArgv,
  registerMarkdownOpenWith,
  resolveOpenDocument
} from './windowsFileAssociation'
import { configureGitExecutable } from './git/gitService'
import { loadAiSettings, saveAiSettings } from './ai/aiSettings'
import {
  assertSafeWorkspaceRoot,
  rememberDialogReadPath,
  rememberMediaPath,
  resolveWorkspacePath,
  samePath
} from './ai/workspacePath'
import {
  assertProtocolReadable,
  assertReadableLocalPath,
  assertWritableLocalPath,
  bindNavigationGuard,
  requireSenderWorkspace,
  resolveInSenderWorkspace,
  resolveWriteInSenderWorkspace,
  senderWindow,
  senderWorkspaceOrNull
} from './ipcSandbox'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kentucky-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function appIconPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function windowIcon(): Electron.NativeImage | undefined {
  const path = appIconPath()
  if (!path) return undefined
  const img = nativeImage.createFromPath(path)
  return img.isEmpty() ? undefined : img
}

export interface CreateWindowOpts {
  role?: WindowRole
  workspacePath?: string | null
  filePath?: string
  /** Show branded splash while the main window loads (first launch). */
  showSplash?: boolean
}

function loadRenderer(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSplashWindow(): BrowserWindow {
  const theme = readSplashTheme()
  const icon = windowIcon()
  const splash = new BrowserWindow({
    width: 440,
    height: 300,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    show: false,
    backgroundColor: splashBackgroundColor(theme),
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // Never put '#' in the query string — it becomes a URL hash and drops accent/mode.
  const accentHex = theme.accent.replace(/^#/, '')

  const injectTheme = (): void => {
    if (splash.isDestroyed()) return
    const vars = splashThemeCssVars(theme)
    const js = `(() => {
      const root = document.documentElement;
      root.dataset.bootTheme = ${JSON.stringify(vars.bootTheme)};
      root.style.setProperty('--boot-bg', ${JSON.stringify(vars['--boot-bg'])});
      root.style.setProperty('--boot-elev', ${JSON.stringify(vars['--boot-elev'])});
      root.style.setProperty('--boot-fg', ${JSON.stringify(vars['--boot-fg'])});
      root.style.setProperty('--boot-accent', ${JSON.stringify(vars['--boot-accent'])});
      root.style.setProperty('--boot-accent-soft', ${JSON.stringify(vars['--boot-accent-soft'])});
      root.style.setProperty('--boot-bar-track', ${JSON.stringify(vars['--boot-bar-track'])});
    })();`
    void splash.webContents.executeJavaScript(js, true).catch(() => undefined)
  }

  bindNavigationGuard(splash.webContents)
  splash.webContents.on('dom-ready', injectTheme)
  splash.webContents.on('did-finish-load', injectTheme)

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    // Dev: serve latest public/splash.html + boot-theme.js from Vite (out/renderer can be stale).
    const base = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`
    const u = new URL('splash.html', base)
    u.searchParams.set('accent', accentHex)
    u.searchParams.set('mode', theme.themeMode)
    void splash.loadURL(u.href)
  } else {
    void splash.loadFile(join(__dirname, '../renderer/splash.html'), {
      query: {
        accent: accentHex,
        mode: theme.themeMode
      }
    })
  }

  splash.once('ready-to-show', () => {
    injectTheme()
    if (!splash.isDestroyed()) splash.show()
  })
  return splash
}

const forceCloseIds = new Set<number>()

/**
 * Windows: after maximize / fullscreen / DPI changes, Chromium sometimes leaves the
 * webContents view smaller than the client area (letterbox of backgroundColor).
 * Re-assert content size so the UI fills the frame.
 */
function bindClientAreaFill(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  let ticking = false
  const sync = (): void => {
    if (win.isDestroyed() || ticking) return
    ticking = true
    setImmediate(() => {
      ticking = false
      if (win.isDestroyed()) return
      try {
        const [cw, ch] = win.getContentSize()
        if (cw > 0 && ch > 0) win.setContentSize(cw, ch)
        if (!win.webContents.isDestroyed()) win.webContents.invalidate()
      } catch {
        /* ignore */
      }
    })
  }
  win.on('resize', sync)
  win.on('maximize', sync)
  win.on('unmaximize', sync)
  win.on('restore', sync)
  win.on('enter-full-screen', sync)
  win.on('leave-full-screen', sync)
  win.webContents.on('did-finish-load', sync)
  win.webContents.on('dom-ready', sync)
}

function syncWindowChrome(theme = readSplashTheme()): void {
  applyNativeThemeSource(theme)
  const bg = splashBackgroundColor(theme)
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.setBackgroundColor(bg)
    } catch {
      /* ignore */
    }
    if (process.platform !== 'win32') continue
    const meta = getWindowMeta(win)
    try {
      win.setTitleBarOverlay(titleBarOverlayFor(theme, meta?.role === 'float'))
    } catch {
      /* overlay not enabled on this window */
    }
  }
}

function createWindow(opts: CreateWindowOpts = {}): BrowserWindow {
  const role: WindowRole = opts.role ?? 'main'
  const isFloat = role === 'float'
  const splash = opts.showSplash && !isFloat ? createSplashWindow() : null
  const icon = windowIcon()
  const theme = readSplashTheme()

  const win = new BrowserWindow({
    width: isFloat ? 960 : 1280,
    height: isFloat ? 720 : 800,
    minWidth: isFloat ? 480 : 900,
    minHeight: isFloat ? 360 : 600,
    title: 'KENTUCKY',
    backgroundColor: splashBackgroundColor(theme),
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    ...(icon ? { icon } : {}),
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: titleBarOverlayFor(theme, isFloat),
          backgroundMaterial: 'none' as const
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  setWindowMeta(win, {
    role,
    workspacePath: opts.workspacePath ?? null,
    filePath: opts.filePath
  })

  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false)
  }

  bindClientAreaFill(win)
  bindNavigationGuard(win.webContents)

  const wcId = win.webContents.id
  win.webContents.on('destroyed', () => {
    docUnsubscribeAll(wcId)
    forceCloseIds.delete(win.id)
  })

  win.on('close', (e) => {
    if (forceCloseIds.has(win.id)) {
      forceCloseIds.delete(win.id)
      return
    }
    e.preventDefault()
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('window:close-request')
    }
  })

  win.on('closed', () => {
    const meta = getWindowMeta(win)
    removeWindowMeta(win)
    forceCloseIds.delete(win.id)
    if (splash && !splash.isDestroyed()) {
      splash.destroy()
    }
    if (meta?.role === 'main') {
      const remaining = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
      if (countMainWindows(remaining) === 0) {
        app.quit()
      }
    }
  })

  let revealed = false
  const revealMain = (): void => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    win.show()
    if (splash && !splash.isDestroyed()) {
      splash.close()
    }
  }

  win.once('ready-to-show', revealMain)
  // Fallback if ready-to-show is delayed by large bundles
  win.webContents.once('did-finish-load', () => {
    if (!win.isVisible()) revealMain()
  })

  loadRenderer(win)
  return win
}

function maybeCloseFloatsForWorkspace(workspacePath: string): void {
  const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (countMainWindowsWithWorkspace(all, workspacePath) > 0) return
  for (const fw of floatWindowsForWorkspace(all, workspacePath)) {
    fw.destroy()
  }
}

const MEDIA_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length'
} as const

async function readFileSlice(filePath: string, start: number, end: number): Promise<Buffer> {
  const len = end - start + 1
  const fh = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(len)
    const { bytesRead } = await fh.read(buf, 0, len, start)
    return bytesRead === len ? buf : buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function mediaHeaders(
  contentType: string,
  extra: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    ...(contentType === 'application/pdf' ? { 'Content-Disposition': 'inline' } : {}),
    ...MEDIA_CORS,
    ...extra
  }
}

function streamLocalMedia(filePath: string, request: Request, contentType: string): Promise<Response> {
  return (async () => {
    const st = await stat(filePath)
    const size = st.size
    const range = request.headers.get('Range')
    const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
    let start = 0
    let end = size - 1
    let status = 200
    if (m) {
      start = m[1] ? Number(m[1]) : 0
      end = m[2] ? Number(m[2]) : size - 1
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end >= start &&
        start < size
      ) {
        end = Math.min(end, size - 1)
        status = 206
      } else {
        start = 0
        end = size - 1
      }
    }
    const extra: Record<string, string> = {
      'Content-Length': String(end - start + 1)
    }
    if (status === 206) extra['Content-Range'] = `bytes ${start}-${end}/${size}`

    // PDF plugin Range-reads; Node web-streams flake and show chrome with no pages.
    if (contentType === 'application/pdf') {
      const body = await readFileSlice(filePath, start, end)
      return new Response(new Uint8Array(body), { status, headers: mediaHeaders(contentType, extra) })
    }

    const stream = createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as BodyInit, {
      status,
      headers: mediaHeaders(contentType, extra)
    })
  })()
}

function firstMainWindow(): BrowserWindow | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    if (getWindowMeta(w)?.role === 'main') return w
  }
  return null
}

function focusMainWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function sendOpenDocument(
  win: BrowserWindow,
  payload: { workspacePath: string; filePath: string }
): void {
  const deliver = (): void => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('shell:openDocument', payload)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
}

async function openDocumentFromArgv(argv: string[]): Promise<void> {
  const filePath = parseOpenFileFromArgv(argv)
  if (!filePath) return
  const target = resolveOpenDocument(filePath)
  if ('error' in target) {
    const win = firstMainWindow()
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'KENTUCKY',
        message: '不能把盘符根、系统目录或用户主目录当作工作区打开。请把文件放在项目子文件夹里。'
      })
      focusMainWindow(win)
    }
    return
  }
  let win = firstMainWindow()
  if (!win) {
    win = createWindow({
      role: 'main',
      workspacePath: target.workspacePath,
      filePath: target.filePath
    })
    focusMainWindow(win)
    return
  }
  sendOpenDocument(win, target)
  focusMainWindow(win)
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.ccfox12.kentucky')
}

const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    void openDocumentFromArgv(argv)
  })
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return
  protocol.handle('kentucky-file', async (request) => {
    try {
      const u = new URL(request.url)
      const filePath = u.searchParams.get('path')
      if (!filePath) return new Response('Not found', { status: 404 })
      assertProtocolReadable(filePath)
      const ext = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : ''
      if (ext === '.mp3') return await streamLocalMedia(filePath, request, 'audio/mpeg')
      if (ext === '.mp4') return await streamLocalMedia(filePath, request, 'video/mp4')
      if (ext === '.pdf') return await streamLocalMedia(filePath, request, 'application/pdf')
      return await net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  applyNativeThemeSource()
  applyAppMenu('zh-CN')
  registerAiIpc()
  registerGitIpc()
  registerStoryboardIpc()
  registerPdfIpc()
  try {
    const saved = loadAiSettings().gitPath
    if (saved) {
      const probe = await configureGitExecutable(saved)
      if (!probe.ok) saveAiSettings({ gitPath: '' })
    }
  } catch {
    /* ignore */
  }
  await registerMarkdownOpenWith()
  const launchFile = parseOpenFileFromArgv(process.argv)
  const launchTarget = launchFile ? resolveOpenDocument(launchFile) : null
  const boot =
    launchTarget && !('error' in launchTarget)
      ? {
          role: 'main' as const,
          showSplash: true,
          workspacePath: launchTarget.workspacePath,
          filePath: launchTarget.filePath
        }
      : { role: 'main' as const, showSplash: true }
  createWindow(boot)
  if (launchTarget && 'error' in launchTarget) {
    const win = firstMainWindow()
    if (win) {
      void dialog.showMessageBox(win, {
        type: 'warning',
        title: 'KENTUCKY',
        message: '不能把盘符根、系统目录或用户主目录当作工作区打开。请把文件放在项目子文件夹里。'
      })
    }
  }

  app.on('activate', () => {
    const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (countMainWindows(all) === 0) createWindow({ role: 'main', showSplash: true })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:setMenuLocale', (_e, locale: MenuLocale) => {
  applyAppMenu(locale === 'en' ? 'en' : 'zh-CN')
  return true
})

ipcMain.handle('app:getOsPlatform', () => process.platform)

ipcMain.handle(
  'theme:persist',
  (_e, payload: { themeMode?: 'dark' | 'light'; accent?: string }) => {
    const next = writeSplashTheme(payload ?? {})
    syncWindowChrome(next)
    return true
  }
)

ipcMain.handle('window:getBootstrap', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return { role: 'main' as const, workspacePath: null, filePath: null }
  const meta = getWindowMeta(win)
  return {
    role: meta?.role ?? 'main',
    workspacePath: meta?.workspacePath ?? null,
    filePath: meta?.filePath ?? null
  }
})

ipcMain.handle(
  'window:reportWorkspace',
  (e, workspacePath: string | null) => {
    const win = senderWindow(e)
    if (!win) return { ok: false, error: 'No window' }
    const meta = getWindowMeta(win)
    if (!meta || meta.role !== 'main') return { ok: false, error: 'Not a main window' }
    if (workspacePath) {
      try {
        assertSafeWorkspaceRoot(workspacePath)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }
    const prev = meta.workspacePath
    updateWindowMeta(win, { workspacePath })
    if (prev && prev !== workspacePath) {
      maybeCloseFloatsForWorkspace(prev)
    }
    if (!workspacePath && prev) {
      maybeCloseFloatsForWorkspace(prev)
    }
    return { ok: true }
  }
)

ipcMain.handle(
  'window:newMain',
  (e, payload?: { workspacePath?: string | null }) => {
    const src = senderWindow(e)
    const meta = src ? getWindowMeta(src) : undefined
    let workspacePath =
      payload?.workspacePath !== undefined
        ? payload.workspacePath
        : (meta?.workspacePath ?? null)
    if (workspacePath) {
      const senderRoot = meta?.workspacePath ?? null
      const allowed =
        (senderRoot && samePath(workspacePath, senderRoot)) ||
        listWorkspaceRoots().some((r) => samePath(r, workspacePath!))
      if (!allowed) workspacePath = senderRoot
      try {
        if (workspacePath) assertSafeWorkspaceRoot(workspacePath)
      } catch {
        workspacePath = null
      }
    }
    createWindow({ role: 'main', workspacePath })
    return true
  }
)

ipcMain.handle(
  'window:newFloat',
  (
    e,
    payload: {
      filePath: string
      workspacePath: string
      content: string
      originalContent: string
      dirty: boolean
    }
  ) => {
    if (!payload?.filePath || !payload?.workspacePath) return false
    try {
      const senderRoot = requireSenderWorkspace(e, payload.workspacePath)
      assertSafeWorkspaceRoot(senderRoot)
      const fileAbs = resolveWorkspacePath(senderRoot, payload.filePath)
      docSeedFromRenderer(
        fileAbs,
        payload.content,
        payload.originalContent,
        payload.dirty,
        e.sender.id
      )
      createWindow({
        role: 'float',
        workspacePath: senderRoot,
        filePath: fileAbs
      })
      return true
    } catch {
      return false
    }
  }
)

ipcMain.handle('doc:open', async (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return await docOpen(abs, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:subscribe', (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return docSubscribe(abs, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:unsubscribe', (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    docUnsubscribe(abs, e.sender.id)
  } catch {
    /* ignore */
  }
  return true
})

ipcMain.handle('doc:patch', (e, filePath: string, content: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return docPatch(abs, content, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:save', async (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return await docSave(abs, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:discard', (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return docDiscard(abs, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:reloadFromDisk', async (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    return await docReloadFromDisk(abs)
  } catch {
    return null
  }
})

ipcMain.handle('doc:evict', (e, filePath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, filePath)
    docEvict(abs)
  } catch {
    /* ignore */
  }
  return true
})

ipcMain.handle('window:confirmClose', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return false
  forceCloseIds.add(win.id)
  win.close()
  return true
})

ipcMain.on('doc:renderer-gone', (e) => {
  docUnsubscribeAll(e.sender.id)
})

ipcMain.handle('menu:runAction', (e, action: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return false
  const wc = win.webContents
  switch (action) {
    case 'openFolder':
      wc.send('menu:openFolder')
      break
    case 'save':
      wc.send('menu:save')
      break
    case 'exportPdf':
      wc.send('menu:exportPdf')
      break
    case 'newWindow':
      wc.send('menu:newWindow')
      break
    case 'newMainWindow':
      wc.send('menu:newMainWindow')
      break
    case 'undo':
      wc.undo()
      break
    case 'redo':
      wc.redo()
      break
    case 'cut':
      wc.cut()
      break
    case 'copy':
      wc.copy()
      break
    case 'paste':
      wc.paste()
      break
    case 'selectAll':
      wc.selectAll()
      break
    case 'reload':
      wc.reload()
      break
    case 'resetZoom':
      wc.setZoomLevel(0)
      break
    case 'zoomIn':
      wc.setZoomLevel(wc.getZoomLevel() + 0.5)
      break
    case 'zoomOut':
      wc.setZoomLevel(wc.getZoomLevel() - 0.5)
      break
    case 'toggleFullscreen':
      win.setFullScreen(!win.isFullScreen())
      break
    case 'minimize':
      win.minimize()
      break
    case 'close':
      win.close()
      break
    case 'learnMore':
      void shell.openExternal('https://github.com/CCFOX12/Kentucky-Article-Editor')
      break
    default:
      return false
  }
  return true
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
      }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return rememberDialogReadPath(result.filePaths[0])
})

ipcMain.handle('dialog:openImages', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp']
      }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map((p) => rememberDialogReadPath(p))
})

ipcMain.handle(
  'dialog:openContextFiles',
  async (e, workspacePath?: string | null): Promise<string[]> => {
    let defaultPath: string | undefined
    try {
      defaultPath = requireSenderWorkspace(e, workspacePath || undefined)
    } catch {
      defaultPath = undefined
    }
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      defaultPath
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths.map((p) => rememberDialogReadPath(p))
  }
)

ipcMain.handle('fs:copyFile', async (e, src: string, dest: string) => {
  let root: string | null = null
  try {
    root = requireSenderWorkspace(e)
  } catch {
    root = null
  }
  const srcAbs = resolve(src)
  const destAbs = resolve(dest)
  assertReadableLocalPath(srcAbs, root)
  assertWritableLocalPath(destAbs, root)
  await copyFile(srcAbs, destAbs)
  return true
})

ipcMain.handle('fs:toMediaUrl', async (e, filePath: string) => {
  let root: string | null = null
  try {
    root = requireSenderWorkspace(e)
  } catch {
    root = null
  }
  const abs = resolve(filePath)
  assertReadableLocalPath(abs, root)
  rememberMediaPath(abs)
  return `kentucky-file://local/?path=${encodeURIComponent(abs)}`
})

ipcMain.handle('shell:showItemInFolder', async (e, targetPath: string) => {
  if (!targetPath || typeof targetPath !== 'string') return false
  try {
    let root: string | null = null
    try {
      root = requireSenderWorkspace(e)
    } catch {
      root = null
    }
    const abs = resolve(targetPath)
    try {
      assertReadableLocalPath(abs, root)
    } catch {
      assertWritableLocalPath(abs, root)
    }
    const st = await stat(abs)
    if (st.isDirectory()) {
      const err = await shell.openPath(abs)
      return !err
    }
    shell.showItemInFolder(abs)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    await shell.openExternal(parsed.toString())
    return true
  } catch {
    return false
  }
})

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

const TEXT_EXTS = new Set([
  '.md',
  '.txt',
  '.kmind',
  '.kyboard',
  '.csv',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.yaml',
  '.yml',
  '.png',
  '.mp4',
  '.pdf'
])

function shouldInclude(
  name: string,
  isDirectory: boolean,
  dirPath: string,
  workspaceRoot: string
): boolean {
  if (name.startsWith('.')) return false
  if (name === 'node_modules' || name === 'dist' || name === 'out') return false
  // Agent snapshots: keep on disk, hide from explorer (like .git).
  if (isDirectory && name === REVISIONS_DIR && resolve(dirPath) === resolve(workspaceRoot)) {
    return false
  }
  if (isDirectory) return true
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return true
  return TEXT_EXTS.has(lower.slice(dot))
}

async function readDirTree(
  dirPath: string,
  workspaceRoot: string,
  depth = 0,
  maxDepth = 6
): Promise<FileEntry[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const result: FileEntry[] = []
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    if (!shouldInclude(entry.name, entry.isDirectory(), dirPath, workspaceRoot)) continue
    const fullPath = join(dirPath, entry.name)
    const item: FileEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }
    if (entry.isDirectory() && depth < maxDepth) {
      item.children = await readDirTree(fullPath, workspaceRoot, depth + 1, maxDepth)
    }
    result.push(item)
  }
  return result
}

ipcMain.handle('fs:readDir', async (e, dirPath: string) => {
  const abs = resolveInSenderWorkspace(e, dirPath)
  const ws = senderWorkspaceOrNull(e)
  return readDirTree(abs, ws || abs)
})

ipcMain.handle('fs:readFile', async (e, filePath: string) => {
  const abs = resolveInSenderWorkspace(e, filePath)
  return readFile(abs, 'utf-8')
})

ipcMain.handle('fs:writeFile', async (e, filePath: string, content: string) => {
  const abs = resolveInSenderWorkspace(e, filePath)
  await writeFile(abs, content, 'utf-8')
  return true
})

ipcMain.handle('fs:mkdir', async (e, dirPath: string) => {
  const abs = resolveInSenderWorkspace(e, dirPath)
  await mkdir(abs, { recursive: true })
  return true
})

ipcMain.handle('fs:rename', async (e, oldPath: string, newPath: string) => {
  const from = resolveWriteInSenderWorkspace(e, oldPath)
  const to = resolveWriteInSenderWorkspace(e, newPath)
  await rename(from, to)
  return true
})

ipcMain.handle('fs:delete', async (e, targetPath: string) => {
  const abs = resolveWriteInSenderWorkspace(e, targetPath)
  const s = await stat(abs)
  await rm(abs, { recursive: s.isDirectory(), force: true })
  return true
})

ipcMain.handle('fs:exists', async (e, targetPath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, targetPath)
    await stat(abs)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('fs:isDirectory', async (e, targetPath: string) => {
  try {
    const abs = resolveInSenderWorkspace(e, targetPath)
    const s = await stat(abs)
    return s.isDirectory()
  } catch {
    return false
  }
})

export type { DocSnapshot }
