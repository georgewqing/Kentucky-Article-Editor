import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { readFile, writeFile, readdir, mkdir, rename, rm, stat, copyFile } from 'fs/promises'
import type { Dirent } from 'fs'
import { applyAppMenu, type MenuLocale } from './menu'
import {
  docOpen,
  docPatch,
  docSave,
  docDiscard,
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
  removeWindowMeta,
  setWindowMeta,
  updateWindowMeta,
  type WindowRole
} from './windowRegistry'

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

export interface CreateWindowOpts {
  role?: WindowRole
  workspacePath?: string | null
  filePath?: string
}

function loadRenderer(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const forceCloseIds = new Set<number>()

function createWindow(opts: CreateWindowOpts = {}): BrowserWindow {
  const role: WindowRole = opts.role ?? 'main'
  const isFloat = role === 'float'

  const win = new BrowserWindow({
    width: isFloat ? 960 : 1280,
    height: isFloat ? 720 : 800,
    minWidth: isFloat ? 480 : 900,
    minHeight: isFloat ? 360 : 600,
    title: 'KENTUCKY',
    backgroundColor: '#141414',
    autoHideMenuBar: process.platform !== 'darwin',
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
    if (meta?.role === 'main') {
      const remaining = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
      if (countMainWindows(remaining) === 0) {
        app.quit()
      }
    }
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

app.whenReady().then(() => {
  protocol.handle('kentucky-file', (request) => {
    try {
      const u = new URL(request.url)
      const filePath = u.searchParams.get('path')
      if (!filePath) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  applyAppMenu('zh-CN')
  createWindow({ role: 'main' })

  app.on('activate', () => {
    const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (countMainWindows(all) === 0) createWindow({ role: 'main' })
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
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    const meta = getWindowMeta(win)
    if (!meta || meta.role !== 'main') return false
    const prev = meta.workspacePath
    updateWindowMeta(win, { workspacePath })
    if (prev && prev !== workspacePath) {
      maybeCloseFloatsForWorkspace(prev)
    }
    if (!workspacePath && prev) {
      maybeCloseFloatsForWorkspace(prev)
    }
    return true
  }
)

ipcMain.handle(
  'window:newMain',
  (e, payload?: { workspacePath?: string | null }) => {
    const src = BrowserWindow.fromWebContents(e.sender)
    const meta = src ? getWindowMeta(src) : undefined
    const workspacePath =
      payload?.workspacePath !== undefined
        ? payload.workspacePath
        : (meta?.workspacePath ?? null)
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
    docSeedFromRenderer(
      payload.filePath,
      payload.content,
      payload.originalContent,
      payload.dirty,
      e.sender.id
    )
    createWindow({
      role: 'float',
      workspacePath: payload.workspacePath,
      filePath: payload.filePath
    })
    return true
  }
)

ipcMain.handle('doc:open', async (e, filePath: string) => {
  try {
    return await docOpen(filePath, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:subscribe', (e, filePath: string) => {
  return docSubscribe(filePath, e.sender.id)
})

ipcMain.handle('doc:unsubscribe', (e, filePath: string) => {
  docUnsubscribe(filePath, e.sender.id)
  return true
})

ipcMain.handle('doc:patch', (e, filePath: string, content: string) => {
  return docPatch(filePath, content, e.sender.id)
})

ipcMain.handle('doc:save', async (e, filePath: string) => {
  try {
    return await docSave(filePath, e.sender.id)
  } catch {
    return null
  }
})

ipcMain.handle('doc:discard', (e, filePath: string) => {
  return docDiscard(filePath, e.sender.id)
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
  return result.filePaths[0]
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
  return result.filePaths
})

ipcMain.handle('fs:copyFile', async (_e, src: string, dest: string) => {
  await copyFile(src, dest)
  return true
})

ipcMain.handle('fs:toMediaUrl', async (_e, filePath: string) => {
  return `kentucky-file://local/?path=${encodeURIComponent(filePath)}`
})

ipcMain.handle('shell:showItemInFolder', async (_e, targetPath: string) => {
  if (!targetPath || typeof targetPath !== 'string') return false
  try {
    const st = await stat(targetPath)
    if (st.isDirectory()) {
      const err = await shell.openPath(targetPath)
      return !err
    }
    shell.showItemInFolder(targetPath)
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

const TEXT_EXTS = new Set(['.md', '.txt', '.kmind', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'])

function shouldInclude(name: string, isDirectory: boolean): boolean {
  if (name.startsWith('.')) return false
  if (name === 'node_modules' || name === 'dist' || name === 'out') return false
  if (isDirectory) return true
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return true
  return TEXT_EXTS.has(lower.slice(dot))
}

async function readDirTree(dirPath: string, depth = 0, maxDepth = 6): Promise<FileEntry[]> {
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
    if (!shouldInclude(entry.name, entry.isDirectory())) continue
    const fullPath = join(dirPath, entry.name)
    const item: FileEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }
    if (entry.isDirectory() && depth < maxDepth) {
      item.children = await readDirTree(fullPath, depth + 1, maxDepth)
    }
    result.push(item)
  }
  return result
}

ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  return readDirTree(dirPath)
})

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  return readFile(filePath, 'utf-8')
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  await writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
  await mkdir(dirPath, { recursive: true })
  return true
})

ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  await rename(oldPath, newPath)
  return true
})

ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  const s = await stat(targetPath)
  await rm(targetPath, { recursive: s.isDirectory(), force: true })
  return true
})

ipcMain.handle('fs:exists', async (_e, targetPath: string) => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
})

export type { DocSnapshot }
