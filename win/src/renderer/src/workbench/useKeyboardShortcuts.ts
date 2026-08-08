import { useEffect } from 'react'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

export function useKeyboardShortcuts() {
  const saveTab = useAppStore((s) => s.saveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const activeView = useAppStore((s) => s.activeView)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const windowRole = useAppStore((s) => s.windowRole)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.toLowerCase()

      if (key === ',' && windowRole !== 'float') {
        e.preventDefault()
        setActiveView(activeView === 'settings' ? (workspacePath ? 'explorer' : 'home') : 'settings')
        return
      }

      if (key === 's') {
        e.preventDefault()
        void saveTab()
        return
      }

      if (key === 'w' && activeTabId) {
        e.preventDefault()
        void closeTab(activeTabId)
        return
      }

      if (key === 'b' && windowRole !== 'float') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      if (key === 'o' && windowRole !== 'float') {
        e.preventDefault()
        void (async () => {
          const path = await getPlatform().openFolder()
          if (path) await openWorkspace(path)
        })()
        return
      }

      if (key === 'l' && windowRole !== 'float') {
        e.preventDefault()
        if (!workspacePath) return
        void import('@/state/aiStore').then(({ useAiStore }) => {
          if (activeView === 'home') {
            setActiveView('explorer')
            useAppStore.getState().setSidebarVisible(true)
            useAiStore.getState().setPanelVisible(true)
            return
          }
          useAiStore.getState().togglePanel()
        })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    saveTab,
    closeTab,
    activeTabId,
    toggleSidebar,
    openWorkspace,
    setActiveView,
    activeView,
    workspacePath,
    windowRole
  ])
}
