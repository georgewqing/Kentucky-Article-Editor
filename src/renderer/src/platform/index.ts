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

function joinPath(...parts: string[]): string {
  if (parts.length === 0) return ''
  const isWin = parts[0].includes('\\') || /^[A-Za-z]:/.test(parts[0])
  const sep = isWin ? '\\' : '/'
  let result = parts[0].replace(/[/\\]+$/, '')
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
    if (p) result = result + sep + p
  }
  return result
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function dirname(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  if (idx <= 0) return filePath
  return filePath.slice(0, idx)
}

function extname(filePath: string): string {
  const name = basename(filePath)
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx).toLowerCase()
}

function relativeTo(workspaceRoot: string, absolutePath: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const abs = absolutePath.replace(/\\/g, '/')
  if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return abs.slice(root.length + 1)
  }
  if (abs.toLowerCase() === root.toLowerCase()) return ''
  return abs
}

export function createElectronPlatform(): Platform {
  const api = window.kentucky
  if (!api) {
    throw new Error('Electron bridge (window.kentucky) is not available')
  }

  return {
    openFolder: () => api.openDirectory(),
    openImage: () => api.openImage(),
    openImages: () => api.openImages(),
    readDir: (dirPath) => api.readDir(dirPath),
    readFile: (filePath) => api.readFile(filePath),
    writeFile: async (filePath, content) => {
      await api.writeFile(filePath, content)
    },
    mkdir: async (dirPath) => {
      await api.mkdir(dirPath)
    },
    rename: async (oldPath, newPath) => {
      await api.rename(oldPath, newPath)
    },
    delete: async (targetPath) => {
      await api.delete(targetPath)
    },
    exists: (targetPath) => api.exists(targetPath),
    copyFile: async (src, dest) => {
      await api.copyFile(src, dest)
    },
    toMediaUrl: (filePath) => api.toMediaUrl(filePath),
    showItemInFolder: async (targetPath) => {
      await api.showItemInFolder(targetPath)
    },
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    getOsPlatform: () => api.getOsPlatform(),
    setMenuLocale: async (locale) => {
      await api.setMenuLocale(locale)
    },
    runMenuAction: async (action) => {
      await api.runMenuAction(action)
    },
    onMenuOpenFolder: (cb) => api.onMenuOpenFolder(cb),
    onMenuSave: (cb) => api.onMenuSave(cb),
    onMenuNewWindow: (cb) => api.onMenuNewWindow(cb),
    onMenuNewMainWindow: (cb) => api.onMenuNewMainWindow(cb),

    getWindowBootstrap: () => api.getWindowBootstrap(),
    reportWorkspace: async (workspacePath) => {
      await api.reportWorkspace(workspacePath)
    },
    newMainWindow: async (workspacePath) => {
      await api.newMainWindow(workspacePath)
    },
    newFloatWindow: async (payload) => {
      await api.newFloatWindow(payload)
    },

    docOpen: (filePath) => api.docOpen(filePath),
    docSubscribe: (filePath) => api.docSubscribe(filePath),
    docUnsubscribe: async (filePath) => {
      await api.docUnsubscribe(filePath)
    },
    docPatch: (filePath, content) => api.docPatch(filePath, content),
    docSave: (filePath) => api.docSave(filePath),
    docDiscard: (filePath) => api.docDiscard(filePath),
    onDocApply: (cb) => api.onDocApply(cb),

    confirmWindowClose: async () => {
      await api.confirmWindowClose()
    },
    onWindowCloseRequest: (cb) => api.onWindowCloseRequest(cb)
  }
}

/** Browser stub for non-Electron preview / future Capacitor wiring. */
export function createBrowserStubPlatform(): Platform {
  const localDocs = new Map<string, DocSnapshot>()
  return {
    openFolder: async () => null,
    openImage: async () => null,
    openImages: async () => [],
    readDir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rename: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    copyFile: async () => undefined,
    toMediaUrl: async (filePath) => filePath,
    showItemInFolder: async () => undefined,
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    getOsPlatform: async () => 'browser',
    setMenuLocale: async () => undefined,
    runMenuAction: async () => undefined,
    onMenuOpenFolder: () => () => undefined,
    onMenuSave: () => () => undefined,
    onMenuNewWindow: () => () => undefined,
    onMenuNewMainWindow: () => () => undefined,
    getWindowBootstrap: async () => ({ role: 'main', workspacePath: null, filePath: null }),
    reportWorkspace: async () => undefined,
    newMainWindow: async () => undefined,
    newFloatWindow: async () => undefined,
    docOpen: async (filePath) => {
      const existing = localDocs.get(filePath)
      if (existing) return existing
      const snap: DocSnapshot = {
        path: filePath,
        content: '',
        originalContent: '',
        dirty: false,
        rev: 1
      }
      localDocs.set(filePath, snap)
      return snap
    },
    docSubscribe: async (filePath) => localDocs.get(filePath) ?? null,
    docUnsubscribe: async () => undefined,
    docPatch: async (filePath, content) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = {
        ...cur,
        content,
        dirty: content !== cur.originalContent,
        rev: cur.rev + 1
      }
      localDocs.set(filePath, next)
      return next
    },
    docSave: async (filePath) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = { ...cur, originalContent: cur.content, dirty: false, rev: cur.rev + 1 }
      localDocs.set(filePath, next)
      return next
    },
    docDiscard: async (filePath) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = { ...cur, content: cur.originalContent, dirty: false, rev: cur.rev + 1 }
      localDocs.set(filePath, next)
      return next
    },
    onDocApply: () => () => undefined,
    confirmWindowClose: async () => undefined,
    onWindowCloseRequest: () => () => undefined
  }
}

let platform: Platform | null = null

export function getPlatform(): Platform {
  if (!platform) {
    platform = window.kentucky ? createElectronPlatform() : createBrowserStubPlatform()
  }
  return platform
}

export function setPlatform(p: Platform): void {
  platform = p
}
