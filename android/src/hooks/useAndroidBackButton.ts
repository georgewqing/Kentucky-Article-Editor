import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useAiStore } from '@/state/aiStore'
import { useAppStore } from '@/state/appStore'
import { useConfirmDialogStore } from '@/state/confirmDialogStore'
import { useUnsavedDialogStore } from '@/state/unsavedDialogStore'

/** Map Android system Back onto the current in-app navigation layer. */
export function useAndroidBackButton(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let disposed = false
    let handle: PluginListenerHandle | null = null

    void CapacitorApp.addListener('backButton', () => {
      const confirm = useConfirmDialogStore.getState()
      if (confirm.open) {
        confirm.choose('cancel')
        return
      }

      const unsaved = useUnsavedDialogStore.getState()
      if (unsaved.open) {
        unsaved.choose('cancel')
        return
      }

      const ai = useAiStore.getState()
      if (ai.showHistory) {
        ai.setShowHistory(false)
        return
      }
      if (ai.panelVisible) {
        ai.setPanelVisible(false)
        return
      }

      const app = useAppStore.getState()
      if (app.activeView === 'settings') {
        app.setActiveView(app.workspacePath ? 'explorer' : 'home')
        return
      }
      if (app.activeView === 'explorer' && app.workspacePath) {
        app.setActiveView('home')
        return
      }

      // Minimize rather than terminating: dirty tabs remain available and Android
      // can reclaim the process using its normal lifecycle policy.
      void CapacitorApp.minimizeApp()
    }).then((listener) => {
      if (disposed) {
        void listener.remove()
      } else {
        handle = listener
      }
    })

    return () => {
      disposed = true
      if (handle) void handle.remove()
    }
  }, [])
}
