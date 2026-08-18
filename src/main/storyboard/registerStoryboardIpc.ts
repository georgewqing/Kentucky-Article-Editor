import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { basename, join } from 'path'
import {
  generateBlankSheet,
  sliceSheet,
  importSheetFile,
  exportMp4
} from './storyboardService'
import { sheetPixelSize, type KyboardDoc, type KyboardLayout } from '../../shared/kyboardSchema'
import { rememberDialogReadPath, rememberDialogWritePath, resolveWorkspacePath } from '../ai/workspacePath'
import { requireSenderWorkspace } from '../ipcSandbox'

function saveDialogDefaultPath(
  e: IpcMainInvokeEvent,
  opts: string | { defaultPath?: string } | undefined,
  fallback: string
): string {
  const raw = typeof opts === 'string' ? opts : opts?.defaultPath || fallback
  try {
    const root = requireSenderWorkspace(e)
    try {
      return resolveWorkspacePath(root, raw)
    } catch {
      return join(root, basename(raw) || fallback)
    }
  } catch {
    return basename(raw) || fallback
  }
}

export function registerStoryboardIpc(): void {
  ipcMain.handle(
    'storyboard:generateBlank',
    async (
      e,
      payload: {
        workspaceRoot: string
        kyboardAbsPath: string
        layout: KyboardLayout
        fileName?: string
        targetDirAbs?: string
      }
    ) => {
      try {
        const workspaceRoot = requireSenderWorkspace(e, payload.workspaceRoot)
        return generateBlankSheet({ ...payload, workspaceRoot })
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'storyboard:importSheet',
    async (
      e,
      payload: { workspaceRoot: string; kyboardAbsPath: string; sourceAbs: string }
    ) => {
      try {
        const workspaceRoot = requireSenderWorkspace(e, payload.workspaceRoot)
        return importSheetFile({ ...payload, workspaceRoot })
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'storyboard:sliceSheet',
    async (
      e,
      payload: {
        workspaceRoot: string
        kyboardAbsPath: string
        sheetImageAbs: string
        layout: KyboardLayout
        sheetId: string
        nameStem?: string
        forceScale?: boolean
      }
    ) => {
      try {
        const workspaceRoot = requireSenderWorkspace(e, payload.workspaceRoot)
        return sliceSheet({ ...payload, workspaceRoot })
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('storyboard:sheetSize', (_e, layout: KyboardLayout) => sheetPixelSize(layout))

  ipcMain.handle(
    'storyboard:exportMp4',
    async (
      e,
      payload: { workspaceRoot: string; doc: KyboardDoc; outAbsPath: string }
    ) => {
      try {
        const workspaceRoot = requireSenderWorkspace(e, payload.workspaceRoot)
        const win = BrowserWindow.fromWebContents(e.sender)
        return exportMp4({
          ...payload,
          workspaceRoot,
          onProgress: (pct) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('storyboard:exportProgress', { pct })
            }
          }
        })
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('dialog:openPng', async () => {
    const { dialog } = await import('electron')
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    return r.canceled || !r.filePaths[0] ? null : rememberDialogReadPath(r.filePaths[0])
  })

  ipcMain.handle('dialog:openMp3', async () => {
    const { dialog } = await import('electron')
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'MP3', extensions: ['mp3'] }]
    })
    return r.canceled || !r.filePaths[0] ? null : rememberDialogReadPath(r.filePaths[0])
  })

  ipcMain.handle('dialog:saveMp4', async (e, opts?: string | { defaultPath?: string }) => {
    const { dialog } = await import('electron')
    const defaultPath = saveDialogDefaultPath(e, opts, 'storyboard.mp4')
    const r = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'MP4', extensions: ['mp4'] }]
    })
    return r.canceled || !r.filePath ? null : rememberDialogWritePath(r.filePath)
  })

  ipcMain.handle('dialog:savePng', async (e, opts?: string | { defaultPath?: string }) => {
    const { dialog } = await import('electron')
    const defaultPath = saveDialogDefaultPath(e, opts, 'storyboard.png')
    const r = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    return r.canceled || !r.filePath ? null : rememberDialogWritePath(r.filePath)
  })
}
