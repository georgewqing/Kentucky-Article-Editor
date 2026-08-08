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
  readDir(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(targetPath: string): Promise<void>
  exists(targetPath: string): Promise<boolean>
  copyFile(src: string, dest: string): Promise<void>
  toMediaUrl(filePath: string): Promise<string>
  showItemInFolder(targetPath: string): Promise<void>
  joinPath(...parts: string[]): string
  basename(filePath: string): string
  dirname(filePath: string): string
  extname(filePath: string): string
  relativeTo(workspaceRoot: string, absolutePath: string): string
  getOsPlatform(): Promise<string>
  setMenuLocale(locale: 'zh-CN' | 'en'): Promise<void>
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
}

export function joinPath(...parts: string[]): string {
  if (parts.length === 0) return ''
  const cleaned = parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[/\\]+$/, '') : p.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')))
  return cleaned.join('/')
}

export function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return filePath
  return normalized.slice(0, idx)
}

export function extname(filePath: string): string {
  const name = basename(filePath)
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx).toLowerCase()
}

export function relativeTo(workspaceRoot: string, absolutePath: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const abs = absolutePath.replace(/\\/g, '/')
  if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return abs.slice(root.length + 1)
  }
  if (abs.toLowerCase() === root.toLowerCase()) return ''
  return abs
}

type DirectoryHandle = FileSystemDirectoryHandle
type FileHandle = FileSystemFileHandle

const IDB_NAME = 'kentucky-android-fs'
const IDB_STORE = 'handles'
const RECENT_KEY = 'workspace'
const CAP_ROOT = 'kentucky-workspace'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
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
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

function splitRel(rel: string): string[] {
  return rel.replace(/\\/g, '/').split('/').filter(Boolean)
}

async function getDir(
  root: DirectoryHandle,
  rel: string,
  create = false
): Promise<DirectoryHandle> {
  const parts = splitRel(rel)
  let cur = root
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create })
  }
  return cur
}

async function getFile(
  root: DirectoryHandle,
  rel: string,
  create = false
): Promise<FileHandle> {
  const parts = splitRel(rel)
  const name = parts.pop()
  if (!name) throw new Error('Invalid file path')
  const dir = parts.length ? await getDir(root, parts.join('/'), create) : root
  return dir.getFileHandle(name, { create })
}

async function readDirRecursiveFsa(
  dir: DirectoryHandle,
  basePath: string
): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  for await (const [name, handle] of dir.entries()) {
    const path = joinPath(basePath, name)
    if (handle.kind === 'directory') {
      const children = await readDirRecursiveFsa(handle as DirectoryHandle, path)
      entries.push({ name, path, isDirectory: true, children })
    } else {
      entries.push({ name, path, isDirectory: false })
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

function createLocalDocHub(writeDisk: (path: string, content: string) => Promise<void>) {
  const docs = new Map<string, DocSnapshot>()
  const listeners = new Set<(snap: DocSnapshot) => void>()

  const emit = (snap: DocSnapshot): void => {
    for (const cb of listeners) cb(snap)
  }

  return {
    async docOpen(filePath: string, readDisk: (p: string) => Promise<string>): Promise<DocSnapshot | null> {
      const existing = docs.get(filePath)
      if (existing) return existing
      let content = ''
      try {
        content = await readDisk(filePath)
      } catch {
        content = ''
      }
      const snap: DocSnapshot = {
        path: filePath,
        content,
        originalContent: content,
        dirty: false,
        rev: 1
      }
      docs.set(filePath, snap)
      return snap
    },
    async docSubscribe(filePath: string): Promise<DocSnapshot | null> {
      return docs.get(filePath) ?? null
    },
    async docUnsubscribe(filePath: string): Promise<void> {
      docs.delete(filePath)
    },
    async docPatch(filePath: string, content: string): Promise<DocSnapshot | null> {
      const cur = docs.get(filePath)
      if (!cur) return null
      const next = {
        ...cur,
        content,
        dirty: content !== cur.originalContent,
        rev: cur.rev + 1
      }
      docs.set(filePath, next)
      emit(next)
      return next
    },
    async docSave(filePath: string): Promise<DocSnapshot | null> {
      const cur = docs.get(filePath)
      if (!cur) return null
      await writeDisk(filePath, cur.content)
      const next = { ...cur, originalContent: cur.content, dirty: false, rev: cur.rev + 1 }
      docs.set(filePath, next)
      emit(next)
      return next
    },
    async docDiscard(filePath: string): Promise<DocSnapshot | null> {
      const cur = docs.get(filePath)
      if (!cur) return null
      const next = { ...cur, content: cur.originalContent, dirty: false, rev: cur.rev + 1 }
      docs.set(filePath, next)
      emit(next)
      return next
    },
    onDocApply(cb: (snap: DocSnapshot) => void): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}

function noopUnsub(): () => void {
  return () => undefined
}

type Backend = 'fsa' | 'cap'

/**
 * Android / tablet Platform.
 * - Chrome/Edge: File System Access API (user-granted folder = SAF-like).
 * - Capacitor native: Documents/kentucky-workspace (persistable app folder).
 * - Multi-window APIs are no-ops (desktop-only in win/).
 */
export function createAndroidPlatform(): Platform {
  let backend: Backend = 'fsa'
  let rootHandle: DirectoryHandle | null = null
  let workspacePath: string | null = null
  const objectUrls = new Map<string, string>()

  const toRel = (absolutePath: string): string => {
    if (!workspacePath) return absolutePath
    return relativeTo(workspacePath, absolutePath)
  }

  const capPath = (absolutePath: string): string => {
    const rel = toRel(absolutePath)
    return rel ? `${CAP_ROOT}/${rel}` : CAP_ROOT
  }

  const writeDisk = async (filePath: string, content: string): Promise<void> => {
    if (backend === 'cap') {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const path = capPath(filePath)
      const parent = dirname(path)
      if (parent && parent !== '.') {
        try {
          await Filesystem.mkdir({ path: parent, directory: Directory.Documents, recursive: true })
        } catch {
          /* exists */
        }
      }
      await Filesystem.writeFile({
        path,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      })
      return
    }
    if (!rootHandle || !workspacePath) throw new Error('No workspace open')
    const fh = await getFile(rootHandle, toRel(filePath), true)
    const writable = await fh.createWritable()
    await writable.write(content)
    await writable.close()
  }

  const readDisk = async (filePath: string): Promise<string> => {
    if (backend === 'cap') {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const res = await Filesystem.readFile({
        path: capPath(filePath),
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })
      return typeof res.data === 'string' ? res.data : ''
    }
    if (!rootHandle || !workspacePath) throw new Error('No workspace open')
    const fh = await getFile(rootHandle, toRel(filePath), false)
    const file = await fh.getFile()
    return file.text()
  }

  const hub = createLocalDocHub(writeDisk)

  const readDirCap = async (dirPath: string): Promise<FileEntry[]> => {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const path = capPath(dirPath)
    const listed = await Filesystem.readdir({ path, directory: Directory.Documents })
    const entries: FileEntry[] = []
    for (const item of listed.files) {
      const name = item.name
      const childPath = joinPath(dirPath, name)
      const isDirectory = item.type === 'directory'
      if (isDirectory) {
        const children = await readDirCap(childPath)
        entries.push({ name, path: childPath, isDirectory: true, children })
      } else {
        entries.push({ name, path: childPath, isDirectory: false })
      }
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return entries
  }

  const restoreFsa = async (): Promise<void> => {
    try {
      const saved = await idbGet<{ name: string; handle: DirectoryHandle }>(RECENT_KEY)
      if (!saved?.handle) return
      const handle = saved.handle
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') return
      backend = 'fsa'
      rootHandle = handle
      workspacePath = saved.name || handle.name
    } catch {
      /* ignore */
    }
  }

  const restoreCap = async (): Promise<void> => {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key: 'workspaceRoot' })
      if (!value) return
      backend = 'cap'
      rootHandle = null
      workspacePath = value
    } catch {
      /* ignore */
    }
  }

  void (async () => {
    await restoreFsa()
    if (!workspacePath) await restoreCap()
  })()

  return {
    async openFolder() {
      if (typeof window.showDirectoryPicker === 'function') {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
        backend = 'fsa'
        rootHandle = handle
        workspacePath = handle.name
        await idbSet(RECENT_KEY, { name: handle.name, handle })
        return workspacePath
      }

      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) {
          window.alert('Open Folder needs Chrome/Edge (File System Access) or the Capacitor Android build.')
          return null
        }
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Preferences } = await import('@capacitor/preferences')
        try {
          await Filesystem.mkdir({ path: CAP_ROOT, directory: Directory.Documents, recursive: true })
        } catch {
          /* exists */
        }
        backend = 'cap'
        rootHandle = null
        workspacePath = CAP_ROOT
        await Preferences.set({ key: 'workspaceRoot', value: CAP_ROOT })
        return workspacePath
      } catch (err) {
        console.error(err)
        window.alert('Could not open Documents workspace on this device.')
        return null
      }
    },
    async openImage() {
      if (backend !== 'fsa' || typeof window.showOpenFilePicker !== 'function') return null
      if (!rootHandle || !workspacePath) return null
      const [fh] = await window.showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] } }],
        multiple: false
      })
      if (!fh) return null
      const file = await fh.getFile()
      const destRel = `_imports/${file.name}`
      await getDir(rootHandle, '_imports', true)
      const dest = await getFile(rootHandle, destRel, true)
      const writable = await dest.createWritable()
      await writable.write(await file.arrayBuffer())
      await writable.close()
      return joinPath(workspacePath, destRel)
    },
    async openImages() {
      if (backend !== 'fsa' || typeof window.showOpenFilePicker !== 'function') return []
      if (!rootHandle || !workspacePath) return []
      const handles = await window.showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] } }],
        multiple: true
      })
      const out: string[] = []
      for (const fh of handles) {
        const file = await fh.getFile()
        const destRel = `_imports/${file.name}`
        await getDir(rootHandle, '_imports', true)
        const dest = await getFile(rootHandle, destRel, true)
        const writable = await dest.createWritable()
        await writable.write(await file.arrayBuffer())
        await writable.close()
        out.push(joinPath(workspacePath, destRel))
      }
      return out
    },
    async readDir(dirPath) {
      if (backend === 'cap') return readDirCap(dirPath)
      if (!rootHandle || !workspacePath) return []
      const rel = toRel(dirPath)
      const dir = rel ? await getDir(rootHandle, rel, false) : rootHandle
      return readDirRecursiveFsa(dir, dirPath)
    },
    readFile: readDisk,
    writeFile: writeDisk,
    async mkdir(dirPath) {
      if (backend === 'cap') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.mkdir({ path: capPath(dirPath), directory: Directory.Documents, recursive: true })
        return
      }
      if (!rootHandle || !workspacePath) throw new Error('No workspace open')
      await getDir(rootHandle, toRel(dirPath), true)
    },
    async rename(oldPath, newPath) {
      const content = await readDisk(oldPath)
      await writeDisk(newPath, content)
      if (backend === 'cap') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.rmdir({
          path: capPath(oldPath),
          directory: Directory.Documents,
          recursive: true
        }).catch(async () => {
          await Filesystem.deleteFile({ path: capPath(oldPath), directory: Directory.Documents })
        })
        return
      }
      if (!rootHandle || !workspacePath) return
      const rel = toRel(oldPath)
      const parts = splitRel(rel)
      const name = parts.pop()
      if (!name) return
      const parent = parts.length ? await getDir(rootHandle, parts.join('/'), false) : rootHandle
      await parent.removeEntry(name, { recursive: true })
    },
    async delete(targetPath) {
      if (backend === 'cap') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.rmdir({
          path: capPath(targetPath),
          directory: Directory.Documents,
          recursive: true
        }).catch(async () => {
          await Filesystem.deleteFile({ path: capPath(targetPath), directory: Directory.Documents })
        })
        return
      }
      if (!rootHandle || !workspacePath) return
      const rel = toRel(targetPath)
      const parts = splitRel(rel)
      const name = parts.pop()
      if (!name) return
      const parent = parts.length ? await getDir(rootHandle, parts.join('/'), false) : rootHandle
      await parent.removeEntry(name, { recursive: true })
    },
    async exists(targetPath) {
      try {
        if (backend === 'cap') {
          const { Filesystem, Directory } = await import('@capacitor/filesystem')
          await Filesystem.stat({ path: capPath(targetPath), directory: Directory.Documents })
          return true
        }
        if (!rootHandle || !workspacePath) return false
        const rel = toRel(targetPath)
        const parts = splitRel(rel)
        const name = parts.pop()
        if (!name) return true
        const parent = parts.length ? await getDir(rootHandle, parts.join('/'), false) : rootHandle
        try {
          await parent.getDirectoryHandle(name)
          return true
        } catch {
          await parent.getFileHandle(name)
          return true
        }
      } catch {
        return false
      }
    },
    async copyFile(src, dest) {
      if (backend === 'cap') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.copy({
          from: capPath(src),
          to: capPath(dest),
          directory: Directory.Documents,
          toDirectory: Directory.Documents
        })
        return
      }
      if (!rootHandle || !workspacePath) throw new Error('No workspace open')
      const fh = await getFile(rootHandle, toRel(src), false)
      const file = await fh.getFile()
      const destFh = await getFile(rootHandle, toRel(dest), true)
      const writable = await destFh.createWritable()
      await writable.write(await file.arrayBuffer())
      await writable.close()
    },
    async toMediaUrl(filePath) {
      if (backend === 'cap') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Capacitor } = await import('@capacitor/core')
        const uri = await Filesystem.getUri({ path: capPath(filePath), directory: Directory.Documents })
        return Capacitor.convertFileSrc(uri.uri)
      }
      const prev = objectUrls.get(filePath)
      if (prev) URL.revokeObjectURL(prev)
      if (!rootHandle || !workspacePath) return ''
      const fh = await getFile(rootHandle, toRel(filePath), false)
      const file = await fh.getFile()
      const url = URL.createObjectURL(file)
      objectUrls.set(filePath, url)
      return url
    },
    async showItemInFolder() {
      /* desktop-only */
    },
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    async getOsPlatform() {
      return 'android'
    },
    async setMenuLocale() {},
    async persistTheme() {},
    async runMenuAction(action) {
      if (action === 'reload') window.location.reload()
      if (action === 'learnMore') {
        window.open('https://github.com/CCFOX12/Kentucky-Article-Editor', '_blank', 'noopener,noreferrer')
      }
    },
    onMenuOpenFolder: noopUnsub,
    onMenuSave: noopUnsub,
    onMenuNewWindow: noopUnsub,
    onMenuNewMainWindow: noopUnsub,
    async getWindowBootstrap() {
      return { role: 'main', workspacePath, filePath: null }
    },
    async reportWorkspace(path) {
      workspacePath = path
    },
    async newMainWindow() {
      console.info('[kentucky-android] Multi-window is desktop-only (win/).')
    },
    async newFloatWindow() {
      console.info('[kentucky-android] Multi-window is desktop-only (win/).')
    },
    docOpen: (filePath) => hub.docOpen(filePath, readDisk),
    docSubscribe: (filePath) => hub.docSubscribe(filePath),
    docUnsubscribe: (filePath) => hub.docUnsubscribe(filePath),
    docPatch: (filePath, content) => hub.docPatch(filePath, content),
    docSave: (filePath) => hub.docSave(filePath),
    docDiscard: (filePath) => hub.docDiscard(filePath),
    onDocApply: (cb) => hub.onDocApply(cb),
    async confirmWindowClose() {},
    onWindowCloseRequest: noopUnsub
  }
}

let platform: Platform | null = null

export function getPlatform(): Platform {
  if (!platform) {
    platform = createAndroidPlatform()
  }
  return platform
}

export function setPlatform(p: Platform): void {
  platform = p
}
