import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createAiApi } from '@/ai-runtime/bridge'
import { KentuckySaf } from '@/plugins/kentuckySaf'

function showPlatformError(message: string): void {
  void import('@/state/appStore')
    .then(({ useAppStore }) => useAppStore.getState().showToast(message, 'error'))
    .catch(() => console.error(message))
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export type WindowRole = 'main' | 'float'

export interface WindowBootstrap {
  role: WindowRole
  workspacePath: string | null
  filePath: string | null
}

export interface DocSnapshot {
  path: string
  content: string
  originalContent: string
  dirty: boolean
  rev: number
}

/** Platform filesystem / dialog abstraction — UI must only use this. */
export interface Platform {
  openFolder(): Promise<string | null>
  openImage(): Promise<string | null>
  openImages(): Promise<string[]>
  openContextFiles(workspacePath?: string | null): Promise<string[]>
  readDir(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(targetPath: string): Promise<void>
  exists(targetPath: string): Promise<boolean>
  copyFile(src: string, dest: string): Promise<void>
  toMediaUrl(filePath: string): Promise<string>
  /** Reveal path in the OS file manager (Explorer / Finder). */
  showItemInFolder(targetPath: string): Promise<void>
  joinPath(...parts: string[]): string
  basename(filePath: string): string
  dirname(filePath: string): string
  extname(filePath: string): string
  /** Absolute path → path relative to workspace root (forward slashes). */
  relativeTo(workspaceRoot: string, absolutePath: string): string
  /** OS platform: darwin keeps native menu; win32/linux use custom menubar. */
  getOsPlatform(): Promise<string>
  setMenuLocale(locale: 'zh-CN' | 'en'): Promise<void>
  /** Sync theme to main-process userData so the startup splash matches. */
  persistTheme(payload: { themeMode?: 'dark' | 'light'; accent?: string }): Promise<void>
  runMenuAction(action: string): Promise<void>
  onMenuOpenFolder(cb: () => void): () => void
  onMenuSave(cb: () => void): () => void
  onMenuNewWindow(cb: () => void): () => void
  onMenuNewMainWindow(cb: () => void): () => void

  getWindowBootstrap(): Promise<WindowBootstrap>
  reportWorkspace(workspacePath: string | null): Promise<void>
  newMainWindow(workspacePath?: string | null): Promise<void>
  newFloatWindow(payload: {
    filePath: string
    workspacePath: string
    content: string
    originalContent: string
    dirty: boolean
  }): Promise<void>

  docOpen(filePath: string): Promise<DocSnapshot | null>
  docSubscribe(filePath: string): Promise<DocSnapshot | null>
  docUnsubscribe(filePath: string): Promise<void>
  docPatch(filePath: string, content: string): Promise<DocSnapshot | null>
  docSave(filePath: string): Promise<DocSnapshot | null>
  docDiscard(filePath: string): Promise<DocSnapshot | null>
  onDocApply(cb: (snap: DocSnapshot) => void): () => void

  confirmWindowClose(): Promise<void>
  onWindowCloseRequest(cb: () => void): () => void

  // AI
  aiGetSettings(): Promise<Record<string, unknown>>
  aiSaveSettings(partial: Record<string, unknown>): Promise<Record<string, unknown>>
  aiSetKey(key: string): Promise<{ hasApiKey: boolean }>
  aiClearKey(): Promise<{ hasApiKey: boolean }>
  aiListProfiles(): Promise<unknown[]>
  aiUpsertProfile(partial: Record<string, unknown>): Promise<unknown>
  aiDeleteProfile(id: string): Promise<boolean>
  aiSetActiveProfile(id: string): Promise<{ profile: unknown; settings: Record<string, unknown> }>
  aiSetProfileKey(id: string, key: string): Promise<{ hasKey: boolean; activeHasKey: boolean }>
  aiClearProfileKey(id: string): Promise<{ hasKey: boolean; activeHasKey: boolean }>
  aiGetActiveProfile(): Promise<unknown>
  aiListSessions(workspacePath?: string | null): Promise<unknown[]>
  aiCreateSession(workspacePath: string | null): Promise<unknown>
  aiGetWorkspacePrefs(workspacePath: string | null): Promise<{ panelVisible: boolean }>
  aiSetWorkspacePrefs(
    workspacePath: string,
    partial: { panelVisible?: boolean }
  ): Promise<{ panelVisible: boolean }>
  aiLoadSession(id: string): Promise<unknown>
  aiDeleteSession(id: string): Promise<boolean>
  aiContextUsage(sessionId: string): Promise<{ used: number; limit: number }>
  aiSend(payload: {
    sessionId: string
    text: string
    mode?: string
    editor: {
      workspacePath: string | null
      activeFilePath: string | null
      selection: string | null
      mentionedPaths: string[]
    }
  }): Promise<{ ok: boolean }>
  aiAbort(): Promise<boolean>
  aiApplyProposal(payload: { sessionId: string; proposalId: string }): Promise<unknown>
  aiRejectProposal(payload: { sessionId: string; proposalId: string }): Promise<unknown>
  aiApplyAllProposals(sessionId: string): Promise<unknown[]>
  aiListSkills(): Promise<unknown[]>
  aiSetSkillEnabled(id: string, enabled: boolean): Promise<unknown[]>
  aiRevealSkillsDir(): Promise<boolean>
  aiImportSkillFolder(): Promise<{ ok: boolean; id?: string; error?: string }>
  onAiEvent(channel: string, cb: (payload: unknown) => void): () => void
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) => index === 0
      ? part.replace(/[/\\]+$/, '')
      : part.replace(/^[/\\]+/, '').replace(/[/\\]+$/, ''))
    .join('/')
}

export function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? filePath : normalized.slice(0, index)
}

export function extname(filePath: string): string {
  const name = basename(filePath)
  const index = name.lastIndexOf('.')
  return index <= 0 ? '' : name.slice(index).toLowerCase()
}

export function relativeTo(workspaceRoot: string, absolutePath: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const absolute = absolutePath.replace(/\\/g, '/')
  if (absolute.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return absolute.slice(root.length + 1)
  return absolute.toLowerCase() === root.toLowerCase() ? '' : absolute
}

type DirectoryHandle = FileSystemDirectoryHandle
type FileHandle = FileSystemFileHandle
type Backend = 'fsa' | 'saf' | 'cap'
type AiPlatform = Pick<Platform, Extract<keyof Platform, `ai${string}`> | 'onAiEvent'>

const IDB_NAME = 'kentucky-android-fs'
const IDB_STORE = 'handles'
const RECENT_KEY = 'workspace'
const CAP_ROOT = 'kentucky-workspace'
const WORKSPACE_ROOT_KEY = 'workspaceRoot'
const WORKSPACE_TREE_URI_KEY = 'workspaceTreeUri'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb()
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}

function splitRel(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

async function getDir(root: DirectoryHandle, path: string, create = false): Promise<DirectoryHandle> {
  let current = root
  for (const segment of splitRel(path)) current = await current.getDirectoryHandle(segment, { create })
  return current
}

async function getFile(root: DirectoryHandle, path: string, create = false): Promise<FileHandle> {
  const segments = splitRel(path)
  const name = segments.pop()
  if (!name) throw new Error('Invalid file path')
  return (segments.length ? await getDir(root, segments.join('/'), create) : root).getFileHandle(name, { create })
}

async function readDirRecursiveFsa(dir: DirectoryHandle, basePath: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  for await (const [name, handle] of dir.entries()) {
    const path = joinPath(basePath, name)
    entries.push(handle.kind === 'directory'
      ? { name, path, isDirectory: true, children: await readDirRecursiveFsa(handle as DirectoryHandle, path) }
      : { name, path, isDirectory: false })
  }
  return entries.sort(sortEntries)
}

function sortEntries(left: FileEntry, right: FileEntry): number {
  if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
  return left.name.localeCompare(right.name)
}

function mediaMimeType(path: string): string {
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf'
  } as Record<string, string>)[extname(path)] ?? 'application/octet-stream'
}

function createLocalDocHub(writeDisk: (path: string, content: string) => Promise<void>) {
  const docs = new Map<string, DocSnapshot>()
  const listeners = new Set<(snap: DocSnapshot) => void>()
  const emit = (snap: DocSnapshot) => listeners.forEach((listener) => listener(snap))
  return {
    async docOpen(path: string, readDisk: (filePath: string) => Promise<string>): Promise<DocSnapshot | null> {
      const existing = docs.get(path)
      if (existing) return existing
      let content = ''
      try { content = await readDisk(path) } catch { /* new document */ }
      const snap = { path, content, originalContent: content, dirty: false, rev: 1 }
      docs.set(path, snap)
      return snap
    },
    async docSubscribe(path: string): Promise<DocSnapshot | null> { return docs.get(path) ?? null },
    async docUnsubscribe(path: string): Promise<void> { docs.delete(path) },
    async docPatch(path: string, content: string): Promise<DocSnapshot | null> {
      const current = docs.get(path)
      if (!current) return null
      const next = { ...current, content, dirty: content !== current.originalContent, rev: current.rev + 1 }
      docs.set(path, next); emit(next); return next
    },
    async docSave(path: string): Promise<DocSnapshot | null> {
      const current = docs.get(path)
      if (!current) return null
      await writeDisk(path, current.content)
      const next = { ...current, originalContent: current.content, dirty: false, rev: current.rev + 1 }
      docs.set(path, next); emit(next); return next
    },
    async docDiscard(path: string): Promise<DocSnapshot | null> {
      const current = docs.get(path)
      if (!current) return null
      const next = { ...current, content: current.originalContent, dirty: false, rev: current.rev + 1 }
      docs.set(path, next); emit(next); return next
    },
    onDocApply(listener: (snap: DocSnapshot) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

const noopUnsub = (): (() => void) => () => undefined

/** Android platform: FSA in Chromium, SAF in native Capacitor, Documents fallback only. */
export function createAndroidPlatform(): Platform {
  let backend: Backend = typeof window.showDirectoryPicker === 'function' ? 'fsa' : 'cap'
  let rootHandle: DirectoryHandle | null = null
  let treeUri: string | null = null
  let workspacePath: string | null = null
  const objectUrls = new Map<string, string>()
  const toRel = (path: string) => workspacePath ? relativeTo(workspacePath, path) : path
  const capPath = (path: string) => {
    const relative = toRel(path)
    return relative ? joinPath(CAP_ROOT, relative) : CAP_ROOT
  }
  const requireSaf = (): string => {
    if (!treeUri) throw new Error('No SAF workspace open')
    return treeUri
  }

  const readDirSaf = async (path: string): Promise<FileEntry[]> => {
    const result = await KentuckySaf.listDir({ treeUri: requireSaf(), path: toRel(path) })
    const entries = await Promise.all(result.entries.map(async (entry) => {
      const childPath = joinPath(path, entry.name)
      return entry.isDirectory
        ? { name: entry.name, path: childPath, isDirectory: true, children: await readDirSaf(childPath) }
        : { name: entry.name, path: childPath, isDirectory: false }
    }))
    return entries.sort(sortEntries)
  }

  const readDirCap = async (path: string): Promise<FileEntry[]> => {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    const result = await Filesystem.readdir({ path: capPath(path), directory: Directory.Documents })
    const entries = await Promise.all(result.files.map(async (file) => {
      const childPath = joinPath(path, file.name)
      return file.type === 'directory'
        ? { name: file.name, path: childPath, isDirectory: true, children: await readDirCap(childPath) }
        : { name: file.name, path: childPath, isDirectory: false }
    }))
    return entries.sort(sortEntries)
  }

  const writeDisk = async (path: string, content: string): Promise<void> => {
    if (backend === 'saf') {
      await KentuckySaf.writeFile({ treeUri: requireSaf(), path: toRel(path), content })
      return
    }
    if (backend === 'cap') {
      const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({ path: capPath(path), data: content, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })
      return
    }
    if (!rootHandle) throw new Error('No workspace open')
    const writable = await (await getFile(rootHandle, toRel(path), true)).createWritable()
    await writable.write(content)
    await writable.close()
  }

  const readDisk = async (path: string): Promise<string> => {
    if (backend === 'saf') return (await KentuckySaf.readFile({ treeUri: requireSaf(), path: toRel(path) })).content
    if (backend === 'cap') {
      const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({ path: capPath(path), directory: Directory.Documents, encoding: Encoding.UTF8 })
      return typeof result.data === 'string' ? result.data : ''
    }
    if (!rootHandle) throw new Error('No workspace open')
    return (await (await getFile(rootHandle, toRel(path))).getFile()).text()
  }

  const deleteDisk = async (path: string): Promise<void> => {
    if (backend === 'saf') return KentuckySaf.delete({ treeUri: requireSaf(), path: toRel(path) })
    if (backend === 'cap') {
      const { Directory, Filesystem } = await import('@capacitor/filesystem')
      await Filesystem.rmdir({ path: capPath(path), directory: Directory.Documents, recursive: true })
        .catch(() => Filesystem.deleteFile({ path: capPath(path), directory: Directory.Documents }))
      return
    }
    if (!rootHandle) throw new Error('No workspace open')
    const parts = splitRel(toRel(path)); const name = parts.pop()
    if (name) await (parts.length ? await getDir(rootHandle, parts.join('/')) : rootHandle).removeEntry(name, { recursive: true })
  }

  const existsDisk = async (path: string): Promise<boolean> => {
    try {
      if (backend === 'saf') return (await KentuckySaf.exists({ treeUri: requireSaf(), path: toRel(path) })).exists
      if (backend === 'cap') {
        const { Directory, Filesystem } = await import('@capacitor/filesystem')
        await Filesystem.stat({ path: capPath(path), directory: Directory.Documents }); return true
      }
      if (!rootHandle) return false
      const parts = splitRel(toRel(path)); const name = parts.pop()
      if (!name) return true
      const parent = parts.length ? await getDir(rootHandle, parts.join('/')) : rootHandle
      try { await parent.getDirectoryHandle(name) } catch { await parent.getFileHandle(name) }
      return true
    } catch { return false }
  }

  const copyDisk = async (from: string, to: string): Promise<void> => {
    if (backend === 'saf') return KentuckySaf.copyFile({ treeUri: requireSaf(), from: toRel(from), to: toRel(to) })
    if (backend === 'cap') {
      const { Directory, Filesystem } = await import('@capacitor/filesystem')
      await Filesystem.copy({ from: capPath(from), to: capPath(to), directory: Directory.Documents, toDirectory: Directory.Documents })
      return
    }
    if (!rootHandle) throw new Error('No workspace open')
    const source = await (await getFile(rootHandle, toRel(from))).getFile()
    const writable = await (await getFile(rootHandle, toRel(to), true)).createWritable()
    await writable.write(await source.arrayBuffer())
    await writable.close()
  }

  const hub = createLocalDocHub(writeDisk)
  const ai = createAiApi({
    workspaceIo: {
      readFile: async (path) => { try { return await readDisk(path) } catch { return null } },
      writeFile: writeDisk,
      deleteFile: deleteDisk,
      exists: existsDisk,
      listDir: async (path) => {
        const entries: FileEntry[] = backend === 'saf'
          ? await readDirSaf(path)
          : backend === 'cap'
            ? await readDirCap(path)
            : !rootHandle
              ? []
              : await readDirRecursiveFsa(toRel(path) ? await getDir(rootHandle, toRel(path)) : rootHandle, path)
        return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }))
      },
      join: joinPath
    }
  })

  const restoreFsa = async (): Promise<void> => {
    try {
      const saved = await idbGet<{ name: string; handle: DirectoryHandle }>(RECENT_KEY)
      if (!saved?.handle || await saved.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return
      backend = 'fsa'; rootHandle = saved.handle; workspacePath = saved.name || saved.handle.name
    } catch { /* no FSA permission */ }
  }
  const restoreSaf = async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return
    try {
      const restored = await KentuckySaf.restoreTree()
      if (!restored) return
      backend = 'saf'; treeUri = restored.treeUri; workspacePath = restored.name || `saf:${restored.treeUri}`
      await Preferences.set({ key: WORKSPACE_ROOT_KEY, value: workspacePath })
      await Preferences.set({ key: WORKSPACE_TREE_URI_KEY, value: treeUri })
    } catch { /* SAF plugin unavailable */ }
  }
  const restoreCap = async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return
    const { value } = await Preferences.get({ key: WORKSPACE_ROOT_KEY })
    if (value) { backend = 'cap'; workspacePath = value; treeUri = null }
  }
  void (async () => {
    if (Capacitor.isNativePlatform()) {
      await restoreSaf()
      if (!workspacePath) await restoreCap()
      return
    }
    await restoreFsa()
  })()

  const importFsaFiles = async (folder: '_imports' | '_context', multiple: boolean, imageOnly: boolean): Promise<string[]> => {
    if (!rootHandle || !workspacePath || typeof window.showOpenFilePicker !== 'function') return []
    const handles = await window.showOpenFilePicker({
      ...(imageOnly ? { types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] } }] } : {}),
      multiple
    })
    const paths: string[] = []
    for (const handle of handles) {
      const file = await handle.getFile()
      const relative = joinPath(folder, file.name)
      const writable = await (await getFile(rootHandle, relative, true)).createWritable()
      await writable.write(await file.arrayBuffer())
      await writable.close()
      paths.push(joinPath(workspacePath, relative))
    }
    return paths
  }

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
    return String(error)
  }

  return {
    async openFolder() {
      // Android WebView may expose a stub showDirectoryPicker — always prefer SAF on native.
      if (Capacitor.isNativePlatform()) {
        try {
          const tree = await KentuckySaf.openTree()
          backend = 'saf'
          rootHandle = null
          treeUri = tree.treeUri
          workspacePath = tree.name || `saf:${tree.treeUri}`
          await Preferences.set({ key: WORKSPACE_ROOT_KEY, value: workspacePath })
          await Preferences.set({ key: WORKSPACE_TREE_URI_KEY, value: treeUri })
          return workspacePath
        } catch (error) {
          const msg = errorMessage(error)
          if (/cancel/i.test(msg)) return null
          console.error('KentuckySaf.openTree failed', error)
          showPlatformError(
            `无法打开系统文件夹选择器（SAF）：${msg}。请确认已用 Android Studio 重新编译安装。`
          )
          return null
        }
      }
      if (typeof window.showDirectoryPicker === 'function') {
        try {
          const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
          backend = 'fsa'
          rootHandle = handle
          treeUri = null
          workspacePath = handle.name
          await idbSet(RECENT_KEY, { name: handle.name, handle })
          return workspacePath
        } catch (error) {
          const msg = errorMessage(error)
          if (/abort|cancel/i.test(msg)) return null
          throw error
        }
      }
      showPlatformError('Open Folder needs Chrome/Edge or the Capacitor Android build.')
      return null
    },
    async openImage() {
      if (backend === 'saf') {
        if (!workspacePath) return null
        const paths = await KentuckySaf.pickImages({ treeUri: requireSaf(), multiple: false })
        return paths.paths[0] ? joinPath(workspacePath, paths.paths[0]) : null
      }
      return (await importFsaFiles('_imports', false, true))[0] ?? null
    },
    async openImages() {
      if (backend === 'saf') {
        if (!workspacePath) return []
        return (await KentuckySaf.pickImages({ treeUri: requireSaf(), multiple: true })).paths.map((path) => joinPath(workspacePath!, path))
      }
      return importFsaFiles('_imports', true, true)
    },
    async openContextFiles() {
      if (backend === 'saf') {
        if (!workspacePath) return []
        return (await KentuckySaf.pickFiles({ treeUri: requireSaf(), multiple: true })).paths.map((path) => joinPath(workspacePath!, path))
      }
      // Browser picker intentionally imports into the workspace: FSA exposes no source absolute path.
      return importFsaFiles('_context', true, false)
    },
    async readDir(path) {
      if (backend === 'saf') return readDirSaf(path)
      if (backend === 'cap') return readDirCap(path)
      if (!rootHandle) return []
      const relative = toRel(path)
      return readDirRecursiveFsa(relative ? await getDir(rootHandle, relative) : rootHandle, path)
    },
    readFile: readDisk,
    writeFile: writeDisk,
    async mkdir(path) {
      if (backend === 'saf') { await KentuckySaf.mkdir({ treeUri: requireSaf(), path: toRel(path) }); return }
      if (backend === 'cap') {
        const { Directory, Filesystem } = await import('@capacitor/filesystem')
        await Filesystem.mkdir({ path: capPath(path), directory: Directory.Documents, recursive: true }); return
      }
      if (!rootHandle) throw new Error('No workspace open')
      await getDir(rootHandle, toRel(path), true)
    },
    async rename(oldPath, newPath) { await copyDisk(oldPath, newPath); await deleteDisk(oldPath) },
    delete: deleteDisk,
    exists: existsDisk,
    copyFile: copyDisk,
    async toMediaUrl(path) {
      if (backend === 'saf') {
        const data = (await KentuckySaf.readFileBase64({ treeUri: requireSaf(), path: toRel(path) })).data
        return `data:${mediaMimeType(path)};base64,${data}`
      }
      if (backend === 'cap') {
        const { Directory, Filesystem } = await import('@capacitor/filesystem')
        return Capacitor.convertFileSrc((await Filesystem.getUri({ path: capPath(path), directory: Directory.Documents })).uri)
      }
      const previous = objectUrls.get(path)
      if (previous) URL.revokeObjectURL(previous)
      if (!rootHandle) return ''
      const url = URL.createObjectURL(await (await getFile(rootHandle, toRel(path))).getFile())
      objectUrls.set(path, url)
      return url
    },
    async showItemInFolder() { /* desktop-only */ },
    joinPath, basename, dirname, extname, relativeTo,
    async getOsPlatform() { return 'android' },
    async setMenuLocale() {},
    async persistTheme() {},
    async runMenuAction(action) {
      if (action === 'reload') window.location.reload()
      if (action === 'learnMore') window.open('https://github.com/CCFOX12/Kentucky-Article-Editor', '_blank', 'noopener,noreferrer')
    },
    onMenuOpenFolder: noopUnsub, onMenuSave: noopUnsub, onMenuNewWindow: noopUnsub, onMenuNewMainWindow: noopUnsub,
    async getWindowBootstrap() { return { role: 'main', workspacePath, filePath: null } },
    async reportWorkspace(path) { workspacePath = path },
    async newMainWindow() {},
    async newFloatWindow() {},
    docOpen: (path) => hub.docOpen(path, readDisk),
    docSubscribe: (path) => hub.docSubscribe(path),
    docUnsubscribe: (path) => hub.docUnsubscribe(path),
    docPatch: (path, content) => hub.docPatch(path, content),
    docSave: (path) => hub.docSave(path),
    docDiscard: (path) => hub.docDiscard(path),
    onDocApply: (callback) => hub.onDocApply(callback),
    async confirmWindowClose() {},
    onWindowCloseRequest: noopUnsub,
    ...(ai as unknown as AiPlatform)
  }
}

let platform: Platform | null = null
export function getPlatform(): Platform { return platform ??= createAndroidPlatform() }
export function setPlatform(value: Platform): void { platform = value }
