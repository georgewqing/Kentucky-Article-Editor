import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'

GlobalWorkerOptions.workerSrc = pdfWorker

const THUMB_MIN = 112
const THUMB_MAX = 280
const THUMB_DEFAULT = 156
const PAGE_PAD = 32

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function readThumbWidth(): number {
  try {
    const raw = localStorage.getItem('kentucky.pdfThumbWidth')
    const n = raw ? Number(raw) : THUMB_DEFAULT
    return Number.isFinite(n) ? clamp(n, THUMB_MIN, THUMB_MAX) : THUMB_DEFAULT
  } catch {
    return THUMB_DEFAULT
  }
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  width
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width < 8) return
    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const cssScale = width / base.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: cssScale * dpr })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(base.width * cssScale)}px`
      canvas.style.height = `${Math.floor(base.height * cssScale)}px`
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      task = page.render({ canvasContext: ctx, canvas, viewport })
      try {
        await task.promise
      } catch {
        /* cancelled */
      }
    })()
    return () => {
      cancelled = true
      try {
        task?.cancel()
      } catch {
        /* ignore */
      }
    }
  }, [pdf, pageNumber, width])

  return <canvas ref={canvasRef} className="pdf-page-canvas" />
}

export function PdfPreviewEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const platform = getPlatform()
  const pagesRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const pageEls = useRef<Map<number, HTMLElement>>(new Map())
  useOverlayScroll(pagesRef)
  useOverlayScroll(thumbsRef)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [pageWidth, setPageWidth] = useState(720)
  const [thumbWidth, setThumbWidth] = useState(readThumbWidth)
  const thumbWidthRef = useRef(thumbWidth)
  thumbWidthRef.current = thumbWidth

  useEffect(() => {
    if (!tab?.path) return
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    setError(null)
    setPdf(null)
    setPageCount(0)
    void (async () => {
      try {
        const media = await platform.toMediaUrl(tab.path)
        const res = await fetch(media)
        if (!res.ok) throw new Error('fetch')
        const data = new Uint8Array(await res.arrayBuffer())
        const loaded = await getDocument({ data }).promise
        if (cancelled) {
          void loaded.destroy()
          return
        }
        doc = loaded
        setPdf(loaded)
        setPageCount(loaded.numPages)
        setCurrentPage(1)
      } catch {
        if (!cancelled) {
          setPdf(null)
          setError(t('pdf.loadFailed'))
        }
      }
    })()
    return () => {
      cancelled = true
      if (doc) void doc.destroy()
    }
  }, [tab?.path, platform, t])

  const fitWidth = useCallback(() => {
    const el = pagesRef.current
    if (!el) return
    const w = el.clientWidth - PAGE_PAD
    if (w > 40) setPageWidth(w)
  }, [])

  useEffect(() => {
    if (!pdf) return
    const el = pagesRef.current
    if (!el) return
    fitWidth()
    const ro = new ResizeObserver(() => fitWidth())
    ro.observe(el)
    return () => ro.disconnect()
  }, [pdf, fitWidth])

  useEffect(() => {
    if (!pdf || pageCount < 1) return
    const root = pagesRef.current
    if (!root) return
    const ratios = new Map<number, number>()
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page)
          if (Number.isFinite(n)) ratios.set(n, e.intersectionRatio)
        }
        let best = 1
        let bestRatio = -1
        for (const [n, r] of Array.from(ratios)) {
          if (r > bestRatio) {
            bestRatio = r
            best = n
          }
        }
        if (bestRatio > 0) setCurrentPage(best)
      },
      { root, threshold: [0, 0.25, 0.5, 0.75] }
    )
    for (const node of Array.from(pageEls.current.values())) obs.observe(node)
    return () => obs.disconnect()
  }, [pdf, pageCount])

  const onSashDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = thumbWidthRef.current
    const onMove = (ev: MouseEvent) => {
      const next = clamp(startW + (ev.clientX - startX), THUMB_MIN, THUMB_MAX)
      setThumbWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      try {
        localStorage.setItem('kentucky.pdfThumbWidth', String(thumbWidthRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const scrollToPage = (n: number) => {
    pageEls.current.get(n)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setCurrentPage(n)
  }

  if (!tab) {
    return <div className="editor-empty">{t('editor.noEditor')}</div>
  }

  const pages = pageCount > 0 ? Array.from({ length: pageCount }, (_, i) => i + 1) : []
  const thumbInner = Math.max(72, thumbWidth - 24)

  return (
    <div className="image-preview-editor pdf-preview-editor">
      <div className="image-preview-toolbar">
        <span className="image-preview-meta">
          {t('pdf.preview')}
          {pageCount > 0 ? ` · ${t('pdf.pageOf', { page: currentPage, pages: pageCount })}` : ''}
        </span>
        <div className="image-preview-actions">
          <button
            type="button"
            className="btn btn-small"
            disabled={!pdf || pageWidth / 1.25 < 160}
            onClick={() => setPageWidth((w) => clamp(w / 1.25, 160, 2400))}
          >
            {t('image.zoomOut')}
          </button>
          <button type="button" className="btn btn-small" disabled={!pdf} onClick={fitWidth}>
            {t('pdf.fit')}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!pdf || pageWidth * 1.25 > 2400}
            onClick={() => setPageWidth((w) => clamp(w * 1.25, 160, 2400))}
          >
            {t('image.zoomIn')}
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void platform.showItemInFolder(tab.path)}
          >
            {t('explorer.revealInFolder')}
          </button>
        </div>
      </div>
      <div className="pdf-preview-body">
        {error ? (
          <p className="image-preview-error">{error}</p>
        ) : !pdf ? (
          <p className="image-preview-muted">{t('pdf.loading')}</p>
        ) : (
          <>
            <div
              ref={thumbsRef}
              className="pdf-thumbs kentucky-overlay-scroll"
              style={{ width: thumbWidth }}
            >
              {pages.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`pdf-thumb${n === currentPage ? ' is-active' : ''}`}
                  onClick={() => scrollToPage(n)}
                >
                  <PdfPageCanvas pdf={pdf} pageNumber={n} width={thumbInner} />
                  <span className="pdf-thumb-label">{n}</span>
                </button>
              ))}
            </div>
            <div className="sash" onMouseDown={onSashDown} />
            <div ref={pagesRef} className="pdf-pages kentucky-overlay-scroll">
              {pages.map((n) => (
                <div
                  key={n}
                  className="pdf-page-sheet"
                  data-page={n}
                  ref={(el) => {
                    if (el) pageEls.current.set(n, el)
                    else pageEls.current.delete(n)
                  }}
                >
                  <PdfPageCanvas pdf={pdf} pageNumber={n} width={pageWidth} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
