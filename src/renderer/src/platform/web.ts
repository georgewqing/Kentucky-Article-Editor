/**
 * Web platform: the same KENTUCKY UI running in a plain browser, talking to
 * the Node web server (server/serve.ts) over WebSocket RPC + HTTP.
 *
 * - Document/fs/git/AI/storyboard operations tunnel to the unchanged
 *   main-process logic via the /ws bridge (same channels as Electron IPC).
 * - Native dialogs are replaced by web flows: file picker -> upload,
 *   export -> browser download, PDF -> browser print, extra windows -> tabs.
 * - Files live in the server-side workspace; media is streamed via /api/media.
 */
import type { Platform, FileEntry, DocSnapshot, WindowBootstrap } from './index'

const TOKEN_KEY = 'kentucky-web-token'

// ---------------- token ----------------

function initToken(): string {
  try {
    const u = new URL(location.href)
    const t = u.searchParams.get('token')
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
      u.searchParams.delete('token')
      history.replaceState({}, '', u.pathname + u.search + u.hash)
    }
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

const token = initToken()

// ---------------- posix path helpers (server is Linux) ----------------

function joinPath(...parts: string[]): string {
  const segs = parts
    .filter(Boolean)
    .join('/')
    .split('/')
    .filter((s) => s && s !== '.')
  return '/' + segs.join('/')
}
function basename(p: string): string {
  const n = p.replace(/\/+$/, '')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}
function dirname(p: string): string {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
function extname(p: string): string {
  const n = basename(p)
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i).toLowerCase() : ''
}
function relativeTo(workspaceRoot: string, absolutePath: string): string {
  const root = workspaceRoot.replace(/\/+$/, '')
  if (absolutePath === root) return ''
  return absolutePath.startsWith(root + '/') ? absolutePath.slice(root.length + 1) : absolutePath
}

// ---------------- boot info ----------------

interface BootInfo {
  defaultWorkspace: string
}
let bootInfo: BootInfo | null = null

async function boot(): Promise<BootInfo> {
  if (bootInfo) return bootInfo
  const res = await fetch(`/api/boot?token=${encodeURIComponent(token)}`)
  if (!res.ok) throw new Error(`boot failed: ${res.status}`)
  const json = (await res.json()) as BootInfo
  bootInfo = json
  return json
}

// ---------------- WebSocket RPC ----------------

let ws: WebSocket | null = null
let wsReady: Promise<void> | null = null
let rpcId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const listeners = new Map<string, Set<(payload: unknown) => void>>()
let reconnecting = false

function connect(): Promise<void> {
  if (wsReady) return wsReady
  wsReady = (async () => {
    const b = await boot()
    const q = new URLSearchParams(location.search)
    const params = new URLSearchParams({ token, role: q.get('role') === 'float' ? 'float' : 'main' })
    const wsWorkspace = q.get('workspace') || b.defaultWorkspace
    params.set('workspace', wsWorkspace)
    const file = q.get('file')
    if (file) params.set('file', file)

    await new Promise<void>((resolveOpen, rejectOpen) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${proto}://${location.host}/ws?${params.toString()}`)
      ws = socket
      let opened = false
      socket.onopen = () => {
        opened = true
        resolveOpen()
      }
      socket.onerror = () => {
        if (!opened) rejectOpen(new Error('WebSocket connect failed'))
      }
      socket.onmessage = (ev) => {
        let msg: {
          type?: string
          id?: number
          channel?: string
          payload?: unknown
          result?: unknown
          error?: { message?: string }
        }
        try {
          msg = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (msg.type === 'result' && typeof msg.id === 'number') {
          const p = pending.get(msg.id)
          if (!p) return
          pending.delete(msg.id)
          if (msg.error) p.reject(new Error(msg.error.message || 'RPC error'))
          else p.resolve(msg.result)
        } else if (msg.type === 'event' && msg.channel) {
          listeners.get(msg.channel)?.forEach((cb) => {
            try {
              cb(msg.payload)
            } catch (err) {
              console.error('event handler error', err)
            }
          })
        }
      }
      socket.onclose = () => {
        if (!opened) {
          rejectOpen(new Error('WebSocket closed during handshake'))
          return
        }
        // Server holds all document/agent state; reload re-subscribes cleanly.
        if (!reconnecting) {
          reconnecting = true
          setTimeout(() => location.reload(), 1500)
        }
      }
    })
  })()
  return wsReady
}

function rpc<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return connect().then(
    () =>
      new Promise<T>((resolve, reject) => {
        const id = ++rpcId
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        ws?.send(JSON.stringify({ type: 'invoke', id, channel, args }))
      })
  )
}

function onEvent(channel: string, cb: (payload: unknown) => void): () => void {
  let set = listeners.get(channel)
  if (!set) {
    set = new Set()
    listeners.set(channel, set)
  }
  set.add(cb)
  return () => {
    listeners.get(channel)?.delete(cb)
  }
}

// ---------------- web file flows ----------------

function pickFiles(accept: string | undefined, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    if (multiple) input.multiple = true
    input.style.display = 'none'
    input.onchange = () => resolve(Array.from(input.files || []))
    document.body.appendChild(input)
    input.click()
    setTimeout(() => input.remove(), 60_000)
  })
}

async function uploadFile(file: File, dir: string): Promise<string> {
  const safeName = basename(file.name).replace(/[^\w.\-一-龥]/g, '_')
  const res = await fetch(
    `/api/upload?token=${encodeURIComponent(token)}&dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(safeName)}`,
    { method: 'POST', body: file }
  )
  const json = (await res.json()) as { ok: boolean; path?: string; error?: string }
  if (!json.ok || !json.path) throw new Error(json.error || 'upload failed')
  return json.path
}

async function uploadFiles(files: File[], dir?: string): Promise<string[]> {
  const b = await boot()
  const target = joinPath(dir || b.defaultWorkspace, '.uploads')
  const out: string[] = []
  for (const f of files) out.push(await uploadFile(f, target))
  return out
}

function triggerDownload(absPath: string): void {
  const a = document.createElement('a')
  a.href = `/api/download?token=${encodeURIComponent(token)}&path=${encodeURIComponent(absPath)}`
  a.download = basename(absPath)
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function openTab(params: URLSearchParams): void {
  const u = new URL(location.href)
  u.search = '?' + params.toString()
  u.hash = ''
  window.open(u.pathname + u.search, '_blank')
}

// Print styles mirrored from src/renderer/pdf-print.html (the Electron
// printToPDF shell), so browser-print PDF export looks the same.
const PRINT_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif; }
  .print-article { padding: 18mm 16mm; font-size: 11pt; line-height: 1.55; max-width: 100%; }
  .print-article h1 { font-size: 20pt; margin: 0 0 0.6em; }
  .print-article h2 { font-size: 15pt; margin: 1.1em 0 0.45em; }
  .print-article h3 { font-size: 13pt; margin: 1em 0 0.4em; }
  .print-article p, .print-article li { margin: 0 0 0.55em; }
  .print-article img { max-width: 100%; height: auto; }
  .print-article pre, .print-article code { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 9.5pt; }
  .print-article pre { background: #f4f4f4; padding: 10px 12px; overflow: hidden; white-space: pre-wrap; }
  .print-article table { border-collapse: collapse; width: 100%; margin: 0 0 0.8em; }
  .print-article th, .print-article td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  .print-article a { color: #111; }
  .print-board { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 8mm; box-sizing: border-box; }
  .print-board img { max-width: 100%; max-height: 100vh; object-fit: contain; }
  @page { margin: 12mm; }
`

// ---------------- platform ----------------

export function createWebPlatform(): Platform {
  return {
    openFolder: async () => (await boot()).defaultWorkspace,
    openImage: async () => {
      const files = await pickFiles('image/*', false)
      if (files.length === 0) return null
      return (await uploadFiles(files))[0]
    },
    openImages: async () => {
      const files = await pickFiles('image/*', true)
      return uploadFiles(files)
    },
    openContextFiles: async (workspacePath) => {
      const files = await pickFiles(undefined, true)
      return uploadFiles(files, workspacePath || undefined)
    },
    readDir: (dirPath) => rpc<FileEntry[]>('fs:readDir', dirPath),
    readFile: (filePath) => rpc<string>('fs:readFile', filePath),
    writeFile: async (filePath, content) => {
      await rpc('fs:writeFile', filePath, content)
    },
    mkdir: async (dirPath) => {
      await rpc('fs:mkdir', dirPath)
    },
    rename: async (oldPath, newPath) => {
      await rpc('fs:rename', oldPath, newPath)
    },
    delete: async (targetPath) => {
      await rpc('fs:delete', targetPath)
    },
    exists: (targetPath) => rpc<boolean>('fs:exists', targetPath),
    isDirectory: (targetPath) => rpc<boolean>('fs:isDirectory', targetPath),
    copyFile: async (src, dest) => {
      await rpc('fs:copyFile', src, dest)
    },
    toMediaUrl: async (filePath) =>
      `/api/media?token=${encodeURIComponent(token)}&path=${encodeURIComponent(filePath)}`,
    showItemInFolder: async () => {
      /* no file manager in a browser; nothing to reveal */
    },
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    getOsPlatform: async () => 'linux',
    setMenuLocale: async (locale) => {
      await rpc('app:setMenuLocale', locale)
    },
    persistTheme: async (payload) => {
      await rpc('theme:persist', payload)
    },
    runMenuAction: async (action) => {
      if (['openFolder', 'save', 'exportPdf', 'newWindow', 'newMainWindow'].includes(action)) {
        // Server bounces the matching menu:* event back to this tab.
        await rpc('menu:runAction', action)
      } else if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(action)) {
        try {
          document.execCommand(action)
        } catch {
          /* ignore */
        }
      } else if (action === 'reload') {
        location.reload()
      } else if (action === 'learnMore') {
        window.open('https://github.com/CCFOX12/Kentucky-Article-Editor', '_blank', 'noopener')
      }
      // zoom / fullscreen / minimize / close: handled by the browser itself
    },
    onMenuOpenFolder: (cb) => onEvent('menu:openFolder', () => cb()),
    onMenuSave: (cb) => onEvent('menu:save', () => cb()),
    onMenuExportPdf: (cb) => onEvent('menu:exportPdf', () => cb()),
    onMenuNewWindow: (cb) => onEvent('menu:newWindow', () => cb()),
    onMenuNewMainWindow: (cb) => onEvent('menu:newMainWindow', () => cb()),
    onOpenDocument: (cb) =>
      onEvent('shell:openDocument', (p) => cb(p as { workspacePath: string; filePath: string })),

    getWindowBootstrap: async (): Promise<WindowBootstrap> => {
      const b = await boot()
      const q = new URLSearchParams(location.search)
      return {
        role: q.get('role') === 'float' ? 'float' : 'main',
        workspacePath: q.get('workspace') || b.defaultWorkspace,
        filePath: q.get('file')
      }
    },
    reportWorkspace: (workspacePath) =>
      rpc<{ ok: boolean; error?: string }>('window:reportWorkspace', workspacePath),
    newMainWindow: async (workspacePath) => {
      const params = new URLSearchParams()
      if (workspacePath) params.set('workspace', workspacePath)
      openTab(params)
    },
    newFloatWindow: async (payload) => {
      const params = new URLSearchParams({
        role: 'float',
        workspace: payload.workspacePath,
        file: payload.filePath
      })
      openTab(params)
    },

    docOpen: (filePath) => rpc<DocSnapshot | null>('doc:open', filePath),
    docSubscribe: (filePath) => rpc<DocSnapshot | null>('doc:subscribe', filePath),
    docUnsubscribe: async (filePath) => {
      await rpc('doc:unsubscribe', filePath)
    },
    docPatch: (filePath, content) => rpc<DocSnapshot | null>('doc:patch', filePath, content),
    docSave: (filePath) => rpc<DocSnapshot | null>('doc:save', filePath),
    docDiscard: (filePath) => rpc<DocSnapshot | null>('doc:discard', filePath),
    docReloadFromDisk: (filePath) => rpc<DocSnapshot | null>('doc:reloadFromDisk', filePath),
    docEvict: async (filePath) => {
      await rpc('doc:evict', filePath)
    },
    onDocApply: (cb) => onEvent('doc:apply', (snap) => cb(snap as DocSnapshot)),

    gitProbe: () => rpc('git:probe'),
    gitSetPath: (gitPath) => rpc('git:setPath', gitPath),
    gitFindRoot: (workspaceRoot) => rpc('git:findRoot', workspaceRoot),
    gitInit: (workspaceRoot) => rpc('git:init', workspaceRoot),
    gitEnsure: (workspaceRoot) => rpc('git:ensure', workspaceRoot),
    gitStatus: (workspaceRoot) => rpc('git:status', workspaceRoot),
    gitDiff: (workspaceRoot, path, staged) => rpc('git:diff', workspaceRoot, path, staged),
    gitStage: (workspaceRoot, paths) => rpc('git:stage', workspaceRoot, paths),
    gitUnstage: (workspaceRoot, paths) => rpc('git:unstage', workspaceRoot, paths),
    gitCommit: (workspaceRoot, message) => rpc('git:commit', workspaceRoot, message),
    gitDiscard: (workspaceRoot, absPath, opts) => rpc('git:discard', workspaceRoot, absPath, opts),

    confirmWindowClose: async () => {
      try {
        window.close()
      } catch {
        /* tabs not opened by script cannot be closed */
      }
    },
    onWindowCloseRequest: (cb) => onEvent('window:close-request', () => cb()),

    aiGetSettings: () => rpc('ai:getSettings'),
    aiSaveSettings: (partial) => rpc('ai:saveSettings', partial),
    aiSetKey: (key) => rpc('ai:setKey', key),
    aiClearKey: () => rpc('ai:clearKey'),
    aiListProfiles: () => rpc('ai:listProfiles'),
    aiUpsertProfile: (partial) => rpc('ai:upsertProfile', partial),
    aiDeleteProfile: (id) => rpc('ai:deleteProfile', id),
    aiSetActiveProfile: (id) => rpc('ai:setActiveProfile', id),
    aiSetProfileKey: (id, key) => rpc('ai:setProfileKey', id, key),
    aiClearProfileKey: (id) => rpc('ai:clearProfileKey', id),
    aiGetActiveProfile: () => rpc('ai:getActiveProfile'),
    aiListSessions: (workspacePath) => rpc('ai:listSessions', workspacePath),
    aiCreateSession: (workspacePath) => rpc('ai:createSession', workspacePath),
    aiGetWorkspacePrefs: (workspacePath) => rpc('ai:getWorkspacePrefs', workspacePath),
    aiSetWorkspacePrefs: (workspacePath, partial) =>
      rpc('ai:setWorkspacePrefs', workspacePath, partial),
    aiLoadSession: (id) => rpc('ai:loadSession', id),
    aiDeleteSession: (id) => rpc('ai:deleteSession', id),
    aiContextUsage: (sessionId, mode) => rpc('ai:contextUsage', sessionId, mode),
    aiSend: (payload) => rpc('ai:send', payload),
    aiAbort: () => rpc('ai:abort'),
    aiApplyProposal: (payload) => rpc('ai:applyProposal', payload),
    aiRejectProposal: (payload) => rpc('ai:rejectProposal', payload),
    aiConfirmGitOp: (payload) => rpc('ai:confirmGitOp', payload),
    aiRejectGitOp: (payload) => rpc('ai:rejectGitOp', payload),
    aiAnswerAskUser: (payload) => rpc('ai:answerAskUser', payload),
    aiApplyAllProposals: (sessionId) => rpc('ai:applyAllProposals', sessionId),
    aiListSkills: () => rpc('ai:listSkills'),
    aiSetSkillEnabled: (id, enabled) => rpc('ai:setSkillEnabled', id, enabled),
    aiRevealSkillsDir: async () => true,
    aiImportSkillFolder: async () => ({ ok: false, error: 'WEB_UNSUPPORTED' }),
    onAiEvent: (channel, cb) => onEvent(channel, cb),

    storyboardGenerateBlank: (payload) => rpc('storyboard:generateBlank', payload),
    storyboardImportSheet: (payload) => rpc('storyboard:importSheet', payload),
    storyboardSliceSheet: (payload) => rpc('storyboard:sliceSheet', payload),
    storyboardSheetSize: (layout) => rpc('storyboard:sheetSize', layout),
    storyboardExportMp4: async (payload) => {
      const result = await rpc<{ ok?: boolean; path?: string }>('storyboard:exportMp4', payload)
      if (result && result.ok) {
        triggerDownload(result.path || payload.outAbsPath)
      }
      return result
    },
    openPngDialog: async () => {
      const files = await pickFiles('image/png,.png', false)
      if (files.length === 0) return null
      return (await uploadFiles(files))[0]
    },
    openMp3Dialog: async () => {
      const files = await pickFiles('audio/*,.mp3', false)
      if (files.length === 0) return null
      return (await uploadFiles(files))[0]
    },
    saveMp4Dialog: async (opts) => {
      const suggested = typeof opts === 'string' ? opts : opts?.defaultPath
      if (suggested) return suggested
      const b = await boot()
      return joinPath(b.defaultWorkspace, '.exports', `export-${Date.now()}.mp4`)
    },
    savePngDialog: async (opts) => {
      const suggested = typeof opts === 'string' ? opts : opts?.defaultPath
      if (suggested) return suggested
      const b = await boot()
      return joinPath(b.defaultWorkspace, '.exports', `export-${Date.now()}.png`)
    },
    savePdfDialog: async (opts) => {
      const suggested = typeof opts === 'string' ? opts : opts?.defaultPath
      if (suggested) return suggested
      const b = await boot()
      return joinPath(b.defaultWorkspace, '.exports', `export-${Date.now()}.pdf`)
    },
    exportPdf: async ({ html }) => {
      try {
        const w = window.open('', '_blank')
        if (!w) return { ok: false, error: 'PRINT_FAILED' }
        w.document.open()
        w.document.write(
          `<!doctype html><html><head><meta charset="utf-8"><title>KENTUCKY print</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`
        )
        w.document.close()
        await new Promise<void>((resolvePrint) => {
          const finish = (): void => {
            try {
              w.focus()
              w.print()
            } catch {
              /* ignore */
            }
            resolvePrint()
          }
          const imgs = Array.from(w.document.images)
          let pending = imgs.length
          if (pending === 0) {
            setTimeout(finish, 300)
          } else {
            imgs.forEach((img) => {
              if (img.complete) {
                if (--pending === 0) setTimeout(finish, 300)
              } else {
                img.onload = img.onerror = () => {
                  if (--pending === 0) setTimeout(finish, 300)
                }
              }
            })
            setTimeout(finish, 5000)
          }
        })
        return { ok: true }
      } catch {
        return { ok: false, error: 'PRINT_FAILED' }
      }
    },
    onStoryboardExportProgress: (cb) => onEvent('storyboard:exportProgress', (p) => cb(p as { pct: number }))
  }
}
