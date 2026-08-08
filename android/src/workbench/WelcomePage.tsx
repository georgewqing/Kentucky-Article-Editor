import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

function formatRelativeTime(ts: number, locale: string): string {
  const diff = Date.now() - ts
  const sec = Math.round(diff / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en', {
    numeric: 'auto'
  })
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second')
  const min = Math.round(sec / 60)
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
  const hr = Math.round(min / 60)
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
  const day = Math.round(hr / 24)
  if (Math.abs(day) < 30) return rtf.format(-day, 'day')
  return new Date(ts).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en')
}

export function WelcomePage() {
  const { t, i18n } = useTranslation()
  const recentFolders = useAppStore((s) => s.recentFolders)
  const loadRecent = useAppStore((s) => s.loadRecent)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const removeRecent = useAppStore((s) => s.removeRecent)

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  const onOpen = async () => {
    const path = await getPlatform().openFolder()
    if (path) await openWorkspace(path)
  }

  const cards = recentFolders.slice(0, 6)
  const platform = getPlatform()

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1 className="welcome-brand">{t('app.name')}</h1>
        <p className="welcome-tagline">{t('app.tagline')}</p>
        <div className="welcome-actions">
          <button type="button" className="btn-primary" onClick={() => void onOpen()}>
            {t('welcome.openFolder')}
          </button>
        </div>

        {cards.length > 0 ? (
          <>
            <h3 className="welcome-recent-title">{t('welcome.recentWorkspaces')}</h3>
            <div className="workspace-grid">
              {cards.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="workspace-card"
                  onClick={() => void openWorkspace(item.path)}
                  title={item.path}
                >
                  <div className="workspace-card-strip" />
                  <div className="workspace-card-body">
                    <div className="workspace-card-title">{platform.basename(item.path)}</div>
                    <div className="workspace-card-path">{item.path}</div>
                    <div className="workspace-card-time">
                      {formatRelativeTime(item.lastOpened, i18n.language)}
                    </div>
                  </div>
                  <span
                    className="workspace-card-remove"
                    role="button"
                    tabIndex={0}
                    title={t('welcome.removeRecent')}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecent(item.path)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        removeRecent(item.path)
                      }
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
