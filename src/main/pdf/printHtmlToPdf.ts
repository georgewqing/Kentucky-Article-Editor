import { BrowserWindow } from 'electron'
import { dirname, join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { bindNavigationGuard } from '../ipcSandbox'

export const MAX_HTML_BYTES = 2 * 1024 * 1024
export const MAX_PDF_BYTES = 50 * 1024 * 1024

export type PrintHtmlToPdfResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; error: string }

function printPageUrl(): { kind: 'url' | 'file'; path: string } {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) return { kind: 'url', path: `${dev.replace(/\/$/, '')}/pdf-print.html` }
  return { kind: 'file', path: join(__dirname, '../renderer/pdf-print.html') }
}

/** Hidden window + printToPDF. Caller must already sandbox destAbs. */
export async function printHtmlToPdf(opts: {
  destAbs: string
  html: string
  landscape?: boolean
}): Promise<PrintHtmlToPdfResult> {
  const html = String(opts.html || '')
  const destAbs = String(opts.destAbs || '').trim()
  if (!destAbs) return { ok: false, error: 'NO_DEST' }
  if (!html.trim()) return { ok: false, error: 'EMPTY' }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return { ok: false, error: 'HTML_TOO_LARGE' }
  }

  const win = new BrowserWindow({
    show: false,
    width: opts.landscape ? 1100 : 800,
    height: opts.landscape ? 800 : 1100,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  bindNavigationGuard(win.webContents)
  try {
    const page = printPageUrl()
    if (page.kind === 'url') await win.loadURL(page.path)
    else await win.loadFile(page.path)
    const landscapeCss = opts.landscape
      ? `document.documentElement.classList.add('print-landscape');
var _ps=document.createElement('style');
_ps.textContent='@page{size:A4 landscape;margin:8mm}';
document.head.appendChild(_ps);`
      : ''
    const inject = `document.getElementById('root').innerHTML = ${JSON.stringify(html)};
${landscapeCss}
Promise.all(Array.from(document.images).map(function (img) {
  return img.complete ? 0 : new Promise(function (r) { img.onload = img.onerror = r })
}))`
    await win.webContents.executeJavaScript(inject)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: Boolean(opts.landscape),
      printBackground: true,
      preferCSSPageSize: true
    })
    if (pdf.byteLength > MAX_PDF_BYTES) {
      return { ok: false, error: 'PDF_TOO_LARGE' }
    }
    await mkdir(dirname(destAbs), { recursive: true })
    await writeFile(destAbs, pdf)
    return { ok: true, path: destAbs, bytes: pdf.byteLength }
  } catch {
    return { ok: false, error: 'PRINT_FAILED' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
