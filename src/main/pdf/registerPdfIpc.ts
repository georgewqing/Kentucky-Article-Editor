import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { basename, extname, join } from 'path'
import { requireSenderWorkspace, assertWritableLocalPath } from '../ipcSandbox'
import { rememberDialogWritePath, resolveWorkspacePath } from '../ai/workspacePath'
import { MAX_HTML_BYTES, printHtmlToPdf } from './printHtmlToPdf'

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

export function registerPdfIpc(): void {
  ipcMain.handle('dialog:savePdf', async (e, opts?: string | { defaultPath?: string }) => {
    const { dialog } = await import('electron')
    const defaultPath = saveDialogDefaultPath(e, opts, 'export.pdf')
    const r = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    return r.canceled || !r.filePath ? null : rememberDialogWritePath(r.filePath)
  })

  ipcMain.handle(
    'pdf:export',
    async (
      e,
      payload: { destAbs: string; html: string; landscape?: boolean }
    ): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
      const html = String(payload?.html || '')
      const destAbs = String(payload?.destAbs || '').trim()
      if (!destAbs) return { ok: false, error: 'NO_DEST' }
      if (!html) return { ok: false, error: 'EMPTY' }
      if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        return { ok: false, error: 'HTML_TOO_LARGE' }
      }
      try {
        const root = requireSenderWorkspace(e)
        assertWritableLocalPath(destAbs, root)
      } catch {
        return { ok: false, error: 'PATH_NOT_ALLOWED' }
      }
      if (extname(destAbs).toLowerCase() !== '.pdf') {
        return { ok: false, error: 'NOT_PDF' }
      }
      const r = await printHtmlToPdf({
        destAbs,
        html,
        landscape: Boolean(payload.landscape)
      })
      if (!r.ok) return r
      return { ok: true, path: r.path }
    }
  )
}
