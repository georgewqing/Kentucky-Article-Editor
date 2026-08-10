import {
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { WelcomePage } from './WelcomePage'
import { SettingsPage } from './SettingsPage'
import { FloatWorkbench } from './FloatWorkbench'
import { ToastLayer } from './ToastLayer'
import { AiPanel } from '@/ai/AiPanel'
import { useAiStore } from '@/state/aiStore'
import { useSpatialWheelScroll } from '@/hooks/useSpatialWheelScroll'

export function Workbench() {
  const { t } = useTranslation()
  const windowRole = useAppStore((s) => s.windowRole)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const activeView = useAppStore((s) => s.activeView)
  const aiVisible = useAiStore((s) => s.panelVisible)
  const aiWidth = useAiStore((s) => s.panelWidth)
  const setAiWidth = useAiStore((s) => s.setPanelWidth)
  const setAiVisible = useAiStore((s) => s.setPanelVisible)
  const [bootReady, setBootReady] = useState(false)
  // Same spatial ownership model as React Flow: wheel goes to the panel under the
  // pointer (by geometry), not the focused TipTap node — so MD and AI can coexist.
  useSpatialWheelScroll()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const platform = getPlatform()
      const boot = await platform.getWindowBootstrap()
      if (cancelled) return
      useAppStore.getState().setWindowRole(boot.role)
      if (boot.role === 'float' && boot.filePath && boot.workspacePath) {
        useAppStore.setState({
          workspacePath: boot.workspacePath,
          fileTree: [],
          sidebarVisible: false,
          activeView: 'explorer'
        })
        await useAppStore.getState().openFile(boot.filePath)
      } else if (boot.role === 'main' && boot.workspacePath) {
        await useAppStore.getState().openWorkspace(boot.workspacePath)
      }
      if (!cancelled) {
        await useAiStore.getState().hydrate()
        setBootReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (windowRole === 'float') return
    return useAiStore.getState().bindEvents()
  }, [windowRole])

  const onAiSashPointerDown = (e: ReactPointerEvent): void => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent): void => {
      setAiWidth(window.innerWidth - ev.clientX)
    }
    const onUp = (ev: PointerEvent): void => {
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  if (!bootReady) {
    return <div className="app-root" />
  }

  if (windowRole === 'float') {
    return <FloatWorkbench />
  }

  const showSettings = activeView === 'settings'
  const showHome = activeView === 'home' || !workspacePath
  const showSidebar = Boolean(workspacePath) && sidebarVisible && !showSettings && !showHome

  return (
    <div className="app-root">
      <div className="workbench">
        <ActivityBar />
        {showSidebar ? <Sidebar /> : null}
        <div className="main-pane">
          {showSettings ? (
            <SettingsPage />
          ) : showHome ? (
            <WelcomePage />
          ) : (
            <EditorArea />
          )}
        </div>
        {aiVisible && !showHome ? (
          <>
            <button
              type="button"
              className="ai-drawer-backdrop"
              aria-label={t('ai.close')}
              onClick={() => setAiVisible(false)}
            />
            <div
              className="sash ai-sash"
              onPointerDown={onAiSashPointerDown}
              role="separator"
              aria-orientation="vertical"
            />
            <div
              className="ai-pane"
              style={{ '--ai-panel-width': `${aiWidth}px` } as CSSProperties}
            >
              <AiPanel />
            </div>
          </>
        ) : null}
      </div>
      <ToastLayer />
    </div>
  )
}
