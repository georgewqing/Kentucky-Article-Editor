import { useAppStore } from '@/state/appStore'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { StatusBar } from './StatusBar'
import { WelcomePage } from './WelcomePage'
import { SettingsPage } from './SettingsPage'

export function Workbench() {
  const workspacePath = useAppStore((s) => s.workspacePath)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const activeView = useAppStore((s) => s.activeView)
  const toast = useAppStore((s) => s.toast)

  const showSettings = activeView === 'settings'
  const showSidebar = Boolean(workspacePath) && sidebarVisible && !showSettings

  return (
    <div className="app-root">
      <div className="workbench">
        <ActivityBar />
        {showSidebar ? <Sidebar /> : null}
        <div className="main-pane">
          {showSettings ? (
            <SettingsPage />
          ) : workspacePath ? (
            <EditorArea />
          ) : (
            <WelcomePage />
          )}
        </div>
      </div>
      <StatusBar />
      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  )
}
