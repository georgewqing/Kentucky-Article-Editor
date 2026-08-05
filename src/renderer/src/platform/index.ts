export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

/** Platform filesystem / dialog abstraction — UI must only use this. */
export interface Platform {
  openFolder(): Promise<string | null>
  readDir(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(targetPath: string): Promise<void>
  exists(targetPath: string): Promise<boolean>
  joinPath(...parts: string[]): string
  basename(filePath: string): string
  dirname(filePath: string): string
  extname(filePath: string): string
  setMenuLocale(locale: 'zh-CN' | 'en'): Promise<void>
  onMenuOpenFolder(cb: () => void): () => void
  onMenuSave(cb: () => void): () => void
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

export function createElectronPlatform(): Platform {
  const api = window.kentucky
  if (!api) {
    throw new Error('Electron bridge (window.kentucky) is not available')
  }

  return {
    openFolder: () => api.openDirectory(),
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
    joinPath,
    basename,
    dirname,
    extname,
    setMenuLocale: async (locale) => {
      await api.setMenuLocale(locale)
    },
    onMenuOpenFolder: (cb) => api.onMenuOpenFolder(cb),
    onMenuSave: (cb) => api.onMenuSave(cb)
  }
}

/** Browser stub for non-Electron preview / future Capacitor wiring. */
export function createBrowserStubPlatform(): Platform {
  return {
    openFolder: async () => null,
    readDir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rename: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    joinPath,
    basename,
    dirname,
    extname,
    setMenuLocale: async () => undefined,
    onMenuOpenFolder: () => () => undefined,
    onMenuSave: () => () => undefined
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
