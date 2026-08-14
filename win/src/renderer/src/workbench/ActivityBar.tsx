import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useAiStore } from '@/state/aiStore'
import { getPlatform } from '@/platform'
import { useFittedMenuPos } from './fitContextMenu'

function workspaceBadge(path: string): string {
  const name = getPlatform().basename(path) || '?'
  const ch = Array.from(name)[0]
  return ch ? ch.toUpperCase() : '?'
}

export function ActivityBar() {
  const { t } = useTranslation()
  const activeView = useAppStore((s) => s.activeView)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const openWorkspaces = useAppStore((s) => s.openWorkspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible)
  const switchWorkspace = useAppStore((s) => s.switchWorkspace)
  const addWorkspaceViaDialog = useAppStore((s) => s.addWorkspaceViaDialog)
  const closeWorkspaceById = useAppStore((s) => s.closeWorkspaceById)
  const goHome = useAppStore((s) => s.goHome)
  const aiVisible = useAiStore((s) => s.panelVisible)
  const setPanelVisible = useAiStore((s) => s.setPanelVisible)
  const togglePanel = useAiStore((s) => s.togglePanel)
  const onHome = activeView === 'home' || !workspacePath
  const aiActive = aiVisible && !onHome

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const { menuRef, menuPos } = useFittedMenuPos(Boolean(menu), menu?.x ?? 0, menu?.y ?? 0)
  const barRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState({ y: 0, ready: false, slide: false })

  const syncIndicator = useCallback((): void => {
    const bar = barRef.current
    if (!bar) return
    const btn = bar.querySelector<HTMLElement>('[data-activity-view-active="true"]')
    if (!btn) {
      setIndicator((prev) => (prev.ready ? { ...prev, ready: false } : prev))
      return
    }
    const y = btn.getBoundingClientRect().top - bar.getBoundingClientRect().top
    setIndicator((prev) => {
      const next = { y, ready: true, slide: prev.ready }
      return prev.y === next.y && prev.ready === next.ready && prev.slide === next.slide ? prev : next
    })
  }, [])

  useLayoutEffect(() => {
    syncIndicator()
  }, [syncIndicator, activeView, activeWorkspaceId, onHome, openWorkspaces, sidebarVisible])

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncIndicator()) : null
    ro?.observe(bar)
    const scroll = bar.querySelector('.activity-workspaces-scroll')
    scroll?.addEventListener('scroll', syncIndicator, { passive: true })
    return () => {
      ro?.disconnect()
      scroll?.removeEventListener('scroll', syncIndicator)
    }
  }, [syncIndicator])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const onAiClick = (): void => {
    if (!workspacePath) return
    if (activeView === 'home') {
      setActiveView('explorer')
      setSidebarVisible(true)
      setPanelVisible(true)
      return
    }
    togglePanel()
  }

  const onProjectClick = (id: string): void => {
    if (id === activeWorkspaceId && activeView === 'explorer') {
      setSidebarVisible(!sidebarVisible)
      return
    }
    void switchWorkspace(id)
  }

  return (
    <nav ref={barRef} className="activity-bar" aria-label="Activity Bar">
      <div
        className="activity-indicator"
        aria-hidden
        data-ready={indicator.ready ? 'true' : undefined}
        data-slide={indicator.slide ? 'true' : undefined}
        style={{ transform: `translateY(${indicator.y}px)` }}
      />
      <button
        type="button"
        className={`activity-btn ${activeView === 'home' || (!workspacePath && activeView !== 'settings') ? 'active' : ''}`}
        data-activity-view-active={
          activeView === 'home' || (!workspacePath && activeView !== 'settings') ? 'true' : undefined
        }
        title={t('activity.home')}
        aria-label={t('activity.home')}
        onClick={goHome}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
        </svg>
      </button>
      <button
        type="button"
        className={`activity-btn activity-ai ${aiActive ? 'active' : ''}`}
        title={t('activity.ai')}
        aria-label={t('activity.ai')}
        disabled={!workspacePath}
        onClick={onAiClick}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      </button>

      <div className="activity-workspaces">
        <div className="activity-workspaces-scroll">
          {openWorkspaces.map((ws) => {
            const active =
              ws.id === activeWorkspaceId && activeView === 'explorer' && !onHome
            const label = getPlatform().basename(ws.path)
            return (
              <button
                key={ws.id}
                type="button"
                className={`activity-btn activity-ws-btn ${active ? 'active' : ''}`}
                data-activity-view-active={active ? 'true' : undefined}
                title={ws.path}
                aria-label={label}
                onClick={() => onProjectClick(ws.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ id: ws.id, x: e.clientX, y: e.clientY })
                }}
              >
                <span className="activity-ws-badge">{workspaceBadge(ws.path)}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="activity-btn activity-add-ws"
          title={t('activity.addWorkspace')}
          aria-label={t('activity.addWorkspace')}
          onClick={() => void addWorkspaceViaDialog()}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>

      <div className="spacer" />
      <button
        type="button"
        className={`activity-btn ${activeView === 'scm' && !onHome ? 'active' : ''}`}
        data-activity-view-active={activeView === 'scm' && !onHome ? 'true' : undefined}
        title={t('scm.title')}
        aria-label={t('scm.title')}
        disabled={onHome}
        onClick={() => {
          if (onHome) return
          if (activeView === 'scm') {
            setActiveView('explorer')
            setSidebarVisible(true)
          } else {
            setActiveView('scm')
            setSidebarVisible(true)
          }
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6 3a3 3 0 0 1 2.83 4H11a1 1 0 0 1 1 1v5.17a3.001 3.001 0 1 1-2 0V9H8.83A3.001 3.001 0 1 1 6 3zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm9 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
        </svg>
      </button>
      <button
        type="button"
        className={`activity-btn ${activeView === 'settings' ? 'active' : ''}`}
        data-activity-view-active={activeView === 'settings' ? 'true' : undefined}
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

      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="ctx-menu"
              style={{ left: menuPos.x, top: menuPos.y }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const id = menu.id
                  setMenu(null)
                  void closeWorkspaceById(id)
                }}
              >
                {t('activity.closeWorkspace')}
              </button>
            </div>,
            document.body
          )
        : null}
    </nav>
  )
}
