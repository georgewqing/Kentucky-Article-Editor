import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'

export function ActivityBar() {
  const { t } = useTranslation()
  const activeView = useAppStore((s) => s.activeView)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible)

  const goHome = (): void => {
    setActiveView('home')
  }

  const toggleExplorer = (): void => {
    if (activeView !== 'explorer') {
      setActiveView('explorer')
      if (workspacePath) setSidebarVisible(true)
      return
    }
    if (workspacePath) {
      setSidebarVisible(!sidebarVisible)
    }
  }

  return (
    <nav className="activity-bar" aria-label="Activity Bar">
      <button
        type="button"
        className={`activity-btn ${activeView === 'home' || (!workspacePath && activeView !== 'settings') ? 'active' : ''}`}
        title={t('activity.home')}
        aria-label={t('activity.home')}
        onClick={goHome}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
        </svg>
      </button>
      {workspacePath ? (
        <button
          type="button"
          className={`activity-btn ${activeView === 'explorer' ? 'active' : ''}`}
          title={t('activity.explorer')}
          aria-label={t('activity.explorer')}
          onClick={toggleExplorer}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        </button>
      ) : null}
      <div className="spacer" />
      <button
        type="button"
        className={`activity-btn ${activeView === 'settings' ? 'active' : ''}`}
        title={t('activity.settings')}
        aria-label={t('activity.settings')}
        onClick={() =>
          setActiveView(
            activeView === 'settings' ? (workspacePath ? 'explorer' : 'home') : 'settings'
          )
        }
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.63 8.48a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.75 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.24.42.48.42h4c.24 0 .44-.18.48-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
        </svg>
      </button>
    </nav>
  )
}
