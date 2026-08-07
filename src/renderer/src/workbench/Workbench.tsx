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

export function Workbench() {
  const windowRole = useAppStore((s) => s.windowRole)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const activeView = useAppStore((s) => s.activeView)
  const toast = useAppStore((s) => s.toast)
  const [customMenu, setCustomMenu] = useState(false)
  const [bootReady, setBootReady] = useState(false)

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
      if (!cancelled) setBootReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!bootReady) {
    return <div className="app-root" />
  }

  if (windowRole === 'float') {
    return <FloatWorkbench />
  }

  const showSettings = activeView === 'settings'
  const showHome = activeView === 'home' || !workspacePath
  // Welcome / settings: no explorer sidebar. Project stays open in memory.
  const showSidebar = Boolean(workspacePath) && sidebarVisible && !showSettings && !showHome

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
      </div>
      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  )
}
