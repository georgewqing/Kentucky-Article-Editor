import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import i18n from '@/i18n'
import { markdownToPrintHtml } from './markdownToPrintHtml'

const mdHtmlGetters = new Map<string, () => string>()
const kmindCapturers = new Map<string, () => Promise<string>>()

export function registerMdHtmlGetter(path: string, getter: () => string): () => void {
  mdHtmlGetters.set(path, getter)
  return () => {
    if (mdHtmlGetters.get(path) === getter) mdHtmlGetters.delete(path)
  }
}

export function registerKmindCapture(path: string, capture: () => Promise<string>): () => void {
  kmindCapturers.set(path, capture)
  return () => {
    if (kmindCapturers.get(path) === capture) kmindCapturers.delete(path)
  }
}

function siblingPdfPath(sourceAbs: string): string {
  const p = getPlatform()
  const ext = p.extname(sourceAbs)
  const stem = ext ? p.basename(sourceAbs).slice(0, -ext.length) : p.basename(sourceAbs)
  return p.joinPath(p.dirname(sourceAbs), `${stem}.pdf`)
}

function toastPdfError(code: string): void {
  const keys: Record<string, string> = {
    HTML_TOO_LARGE: 'pdf.htmlTooLarge',
    PDF_TOO_LARGE: 'pdf.fileTooLarge',
    PATH_NOT_ALLOWED: 'pdf.pathDenied',
    PRINT_FAILED: 'pdf.exportFailed',
    EMPTY: 'pdf.empty',
    NO_DEST: 'pdf.cancelled',
    NOT_PDF: 'pdf.exportFailed',
    UNSUPPORTED: 'pdf.unsupported'
  }
  useAppStore.getState().showToast(i18n.t(keys[code] || 'pdf.exportFailed'), 'error')
}

async function writePdf(html: string, destAbs: string, landscape: boolean): Promise<boolean> {
  const platform = getPlatform()
  const result = await platform.exportPdf({ destAbs, html, landscape })
  if (!result.ok) {
    toastPdfError(result.error || 'PRINT_FAILED')
    return false
  }
  useAppStore.getState().showToast(i18n.t('pdf.exported', { path: destAbs }), 'info')
  return true
}

async function pickDest(sourceAbs: string): Promise<string | null> {
  return getPlatform().savePdfDialog({ defaultPath: siblingPdfPath(sourceAbs) })
}

export function canExportPathToPdf(path: string): boolean {
  const ext = getPlatform().extname(path).toLowerCase()
  return ext === '.md' || ext === '.kmind'
}

export async function exportPathToPdf(path: string): Promise<void> {
  const ext = getPlatform().extname(path).toLowerCase()
  if (ext === '.md') {
    const getter = mdHtmlGetters.get(path)
    let inner = ''
    if (getter) {
      inner = getter()
    } else {
      const tab = useAppStore.getState().tabs.find((t) => t.path === path)
      const md = tab?.content ?? (await getPlatform().readFile(path))
      inner = markdownToPrintHtml(md)
    }
    const dest = await pickDest(path)
    if (!dest) return
    await writePdf(`<article class="print-article">${inner}</article>`, dest, false)
    return
  }
  if (ext === '.kmind') {
    let capture = kmindCapturers.get(path)
    if (!capture) {
      await useAppStore.getState().openFile(path)
      const deadline = Date.now() + 4000
      while (!capture && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 80))
        capture = kmindCapturers.get(path)
      }
    }
    if (!capture) {
      toastPdfError('UNSUPPORTED')
      return
    }
    let dataUrl: string
    try {
      dataUrl = await capture()
    } catch (err) {
      toastPdfError(err instanceof Error && err.message === 'EMPTY' ? 'EMPTY' : 'PRINT_FAILED')
      return
    }
    const dest = await pickDest(path)
    if (!dest) return
    await writePdf(
      `<div class="print-board"><img src="${dataUrl}" alt="" /></div>`,
      dest,
      true
    )
    return
  }
  toastPdfError('UNSUPPORTED')
}

export async function exportActiveTabToPdf(): Promise<void> {
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab || !canExportPathToPdf(tab.path)) {
    toastPdfError('UNSUPPORTED')
    return
  }
  await exportPathToPdf(tab.path)
}
