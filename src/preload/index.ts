import { contextBridge, ipcRenderer } from 'electron'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

const api = {
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  readDir: (dirPath: string): Promise<FileEntry[]> => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  mkdir: (dirPath: string): Promise<boolean> => ipcRenderer.invoke('fs:mkdir', dirPath),
  rename: (oldPath: string, newPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  delete: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:delete', targetPath),
  exists: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', targetPath),
  setMenuLocale: (locale: 'zh-CN' | 'en'): Promise<boolean> =>
    ipcRenderer.invoke('app:setMenuLocale', locale),
  onMenuOpenFolder: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:openFolder', handler)
    return () => ipcRenderer.removeListener('menu:openFolder', handler)
  },
  onMenuSave: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  }
}

contextBridge.exposeInMainWorld('kentucky', api)

export type KentuckyAPI = typeof api
