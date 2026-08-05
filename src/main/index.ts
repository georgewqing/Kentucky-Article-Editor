import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile, readdir, mkdir, rename, rm, stat } from 'fs/promises'
import type { Dirent } from 'fs'
import { applyAppMenu, type MenuLocale } from './menu'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'KENTUCKY',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  applyAppMenu('zh-CN')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:setMenuLocale', (_e, locale: MenuLocale) => {
  applyAppMenu(locale === 'en' ? 'en' : 'zh-CN')
  return true
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
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
