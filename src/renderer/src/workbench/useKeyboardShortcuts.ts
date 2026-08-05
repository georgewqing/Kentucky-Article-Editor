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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.toLowerCase()

      if (key === ',') {
        e.preventDefault()
        setActiveView(activeView === 'settings' ? 'explorer' : 'settings')
        return
      }

      if (key === 's') {
        e.preventDefault()
        void saveTab()
        return
      }

      if (key === 'w' && activeTabId) {
        e.preventDefault()
        closeTab(activeTabId)
        return
      }

      if (key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      if (key === 'o') {
        e.preventDefault()
        void (async () => {
          const path = await getPlatform().openFolder()
          if (path) await openWorkspace(path)
        })()
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
    activeView
  ])
}
