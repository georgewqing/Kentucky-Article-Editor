import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/**
 * Workspace PNG preview — pan/zoom like the mind-map canvas:
 * wheel zooms toward cursor; left-drag pans.
 */
export function ImagePreviewEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const platform = getPlatform()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastPtrRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  useEffect(() => {
    if (!tab?.path) return
    let cancelled = false
    setError(null)
    setNatural(null)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    void (async () => {
      try {
        const media = await platform.toMediaUrl(tab.path)
        if (!cancelled) setUrl(media)
      } catch {
        if (!cancelled) {
          setUrl(null)
          setError(t('image.loadFailed'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab?.path, platform, t])

  const fitToView = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !natural) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const pad = 32
    const sw = stage.clientWidth - pad
    const sh = stage.clientHeight - pad
    if (sw <= 0 || sh <= 0 || natural.w <= 0 || natural.h <= 0) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const z = clampZoom(Math.min(sw / natural.w, sh / natural.h, 1))
    const x = (stage.clientWidth - natural.w * z) / 2
    const y = (stage.clientHeight - natural.h * z) / 2
    setZoom(z)
    setPan({ x, y })
  }, [natural])

  useEffect(() => {
    if (natural) fitToView()
  }, [natural, fitToView])

  // Non-passive wheel so preventDefault actually stops browser scroll/zoom chrome.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const prevZ = zoomRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const nextZ = clampZoom(prevZ * factor)
      if (nextZ === prevZ) return
      const worldX = (mx - panRef.current.x) / prevZ
      const worldY = (my - panRef.current.y) / prevZ
      setZoom(nextZ)
      setPan({
        x: mx - worldX * nextZ,
        y: my - worldY * nextZ
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    e.preventDefault()
    draggingRef.current = true
    lastPtrRef.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - lastPtrRef.current.x
    const dy = e.clientY - lastPtrRef.current.y
    lastPtrRef.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  if (!tab) {
    return <div className="editor-empty">{t('editor.noEditor')}</div>
  }

  return (
    <div className="image-preview-editor">
      <div className="image-preview-toolbar">
        <span className="image-preview-meta">
          {natural
            ? t('image.dimensions', { width: natural.w, height: natural.h })
            : t('image.preview')}
          {` · ${Math.round(zoom * 100)}%`}
          <span className="image-preview-hint"> · {t('image.panZoomHint')}</span>
        </span>
        <div className="image-preview-actions">
          <button
            type="button"
            className="btn btn-small"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => clampZoom(z / 1.25))}
          >
            {t('image.zoomOut')}
          </button>
          <button type="button" className="btn btn-small" onClick={fitToView}>
            {t('image.zoomFit')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setZoom(1)}>
            {t('image.zoomReset')}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => clampZoom(z * 1.25))}
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
      <div
        ref={stageRef}
        className="image-preview-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitToView}
      >
        {error ? (
          <p className="image-preview-error">{error}</p>
        ) : url ? (
          <img
            src={url}
            alt={tab.title}
            className="image-preview-img"
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: natural?.w,
              height: natural?.h
            }}
            onLoad={(e) => {
              const img = e.currentTarget
              setNatural({ w: img.naturalWidth, h: img.naturalHeight })
            }}
            onError={() => setError(t('image.loadFailed'))}
          />
        ) : (
          <p className="image-preview-muted">{t('image.loading')}</p>
        )}
      </div>
    </div>
  )
}
