import { useEffect, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { WelcomePage } from './WelcomePage'
import { SettingsPage } from './SettingsPage'
import { AppMenuBar } from './AppMenuBar'
import { FloatWorkbench } from './FloatWorkbench'
import { ToastLayer } from './ToastLayer'
import { AiPanel } from '@/ai/AiPanel'
import { useAiStore } from '@/state/aiStore'

export function Workbench() {
  const windowRole = useAppStore((s) => s.windowRole)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const activeView = useAppStore((s) => s.activeView)
  const aiVisible = useAiStore((s) => s.panelVisible)
  const aiWidth = useAiStore((s) => s.panelWidth)
  const setAiWidth = useAiStore((s) => s.setPanelWidth)
  const aiStreaming = useAiStore((s) => s.streaming)
  const [customMenu, setCustomMenu] = useState(false)
  const [bootReady, setBootReady] = useState(false)
  const [aiDragging, setAiDragging] = useState(false)

  useEffect(() => {
    void getPlatform()
      .getOsPlatform()
      .then((os) => setCustomMenu(os !== 'darwin'))
  }, [])

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

  useEffect(() => {
    if (!aiDragging) return
    const onMove = (e: MouseEvent): void => {
      const fromRight = window.innerWidth - e.clientX
      setAiWidth(fromRight)
    }
    const onUp = (): void => setAiDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [aiDragging, setAiWidth])

  // Keep layout filling the Electron client area after maximize / DPI / fullscreen.
  // Also re-kick when agent streaming starts/stops — heavy IPC can leave a letterboxed frame.
  useEffect(() => {
    const kick = (): void => {
      const root = document.documentElement
      root.style.width = '100%'
      root.style.height = '100%'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      // Force a layout pass so flex children re-measure against the real viewport.
      void document.body.offsetHeight
    }
    kick()
    window.addEventListener('resize', kick)
    window.visualViewport?.addEventListener('resize', kick)
    return () => {
      window.removeEventListener('resize', kick)
      window.visualViewport?.removeEventListener('resize', kick)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.width = '100%'
    root.style.height = '100%'
    document.body.style.width = '100%'
    document.body.style.height = '100%'
    void document.body.offsetHeight
  }, [aiStreaming])

  if (!bootReady) {
    return <div className="app-root" />
  }

  if (windowRole === 'float') {
    return <FloatWorkbench />
  }

  const showSettings = activeView === 'settings'
  const showHome = activeView === 'home' || !workspacePath
  const showSidebar =
    Boolean(workspacePath) &&
    sidebarVisible &&
    !showSettings &&
    !showHome &&
    (activeView === 'explorer' || activeView === 'scm')

  return (
    <div className="app-root">
      {customMenu ? <AppMenuBar /> : null}
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
            <div
              className="sash ai-sash"
              onMouseDown={(e) => {
                e.preventDefault()
                setAiDragging(true)
              }}
            />
            <div className="ai-pane" style={{ width: aiWidth }}>
              <AiPanel />
            </div>
          </>
        ) : null}
      </div>
      <ToastLayer />
    </div>
  )
}
