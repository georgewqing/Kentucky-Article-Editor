import { contextBridge, ipcRenderer } from 'electron'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface WindowBootstrap {
  role: 'main' | 'float'
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

const api = {
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  openImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  openImages: (): Promise<string[]> => ipcRenderer.invoke('dialog:openImages'),
  readDir: (dirPath: string): Promise<FileEntry[]> => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  mkdir: (dirPath: string): Promise<boolean> => ipcRenderer.invoke('fs:mkdir', dirPath),
  rename: (oldPath: string, newPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  delete: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:delete', targetPath),
  exists: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', targetPath),
  copyFile: (src: string, dest: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:copyFile', src, dest),
  toMediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:toMediaUrl', filePath),
  showItemInFolder: (targetPath: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  setMenuLocale: (locale: 'zh-CN' | 'en'): Promise<boolean> =>
    ipcRenderer.invoke('app:setMenuLocale', locale),
  getOsPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getOsPlatform'),
  persistTheme: (payload: { themeMode?: 'dark' | 'light'; accent?: string }): Promise<boolean> =>
    ipcRenderer.invoke('theme:persist', payload),
  runMenuAction: (action: string): Promise<boolean> => ipcRenderer.invoke('menu:runAction', action),

  getWindowBootstrap: (): Promise<WindowBootstrap> => ipcRenderer.invoke('window:getBootstrap'),
  reportWorkspace: (workspacePath: string | null): Promise<boolean> =>
    ipcRenderer.invoke('window:reportWorkspace', workspacePath),
  newMainWindow: (workspacePath?: string | null): Promise<boolean> =>
    ipcRenderer.invoke('window:newMain', { workspacePath }),
  newFloatWindow: (payload: {
    filePath: string
    workspacePath: string
    content: string
    originalContent: string
    dirty: boolean
  }): Promise<boolean> => ipcRenderer.invoke('window:newFloat', payload),

  docOpen: (filePath: string): Promise<DocSnapshot | null> => ipcRenderer.invoke('doc:open', filePath),
  docSubscribe: (filePath: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:subscribe', filePath),
  docUnsubscribe: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('doc:unsubscribe', filePath),
  docPatch: (filePath: string, content: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:patch', filePath, content),
  docSave: (filePath: string): Promise<DocSnapshot | null> => ipcRenderer.invoke('doc:save', filePath),
  docDiscard: (filePath: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:discard', filePath),

  confirmWindowClose: (): Promise<boolean> => ipcRenderer.invoke('window:confirmClose'),
  onWindowCloseRequest: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('window:close-request', handler)
    return () => ipcRenderer.removeListener('window:close-request', handler)
  },

  onMenuOpenFolder: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:openFolder', handler)
    return () => ipcRenderer.removeListener('menu:openFolder', handler)
  },
  onMenuSave: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  },
  onMenuNewWindow: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:newWindow', handler)
    return () => ipcRenderer.removeListener('menu:newWindow', handler)
  },
  onMenuNewMainWindow: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:newMainWindow', handler)
    return () => ipcRenderer.removeListener('menu:newMainWindow', handler)
  },
  onDocApply: (cb: (snap: DocSnapshot) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, snap: DocSnapshot): void => cb(snap)
    ipcRenderer.on('doc:apply', handler)
    return () => ipcRenderer.removeListener('doc:apply', handler)
  }
}

contextBridge.exposeInMainWorld('kentucky', api)

export type KentuckyAPI = typeof api
