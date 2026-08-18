import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Workspace MP4 preview — native controls over kentucky-file:// (Range/206).
 * Read-only; not DocumentHub.
 */
export function VideoPreviewEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const platform = getPlatform()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!tab?.path) return
    let cancelled = false
    setError(null)
    setDuration(null)
    void (async () => {
      try {
        const media = await platform.toMediaUrl(tab.path)
        if (!cancelled) setUrl(media)
      } catch {
        if (!cancelled) {
          setUrl(null)
          setError(t('video.loadFailed'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab?.path, platform, t])

  if (!tab) {
    return <div className="editor-empty">{t('editor.noEditor')}</div>
  }

  return (
    <div className="image-preview-editor video-preview-editor">
      <div className="image-preview-toolbar">
        <span className="image-preview-meta">
          {t('video.preview')}
          {duration != null ? ` · ${formatClock(duration)}` : ''}
        </span>
        <div className="image-preview-actions">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void platform.showItemInFolder(tab.path)}
          >
            {t('explorer.revealInFolder')}
          </button>
        </div>
      </div>
      <div className="image-preview-stage video-preview-stage">
        {error ? (
          <p className="image-preview-error">{error}</p>
        ) : url ? (
          <video
            key={url}
            ref={videoRef}
            className="video-preview-player"
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration
              setDuration(Number.isFinite(d) ? d : null)
            }}
            onError={() => setError(t('video.loadFailed'))}
          />
        ) : (
          <p className="image-preview-muted">{t('video.loading')}</p>
        )}
      </div>
    </div>
  )
}
