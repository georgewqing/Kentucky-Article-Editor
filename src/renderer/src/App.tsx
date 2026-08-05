import { useEffect } from 'react'
import { Workbench } from '@/workbench/Workbench'
import { UnsavedChangesDialog } from '@/workbench/UnsavedChangesDialog'
import { useKeyboardShortcuts } from '@/workbench/useKeyboardShortcuts'
import { getPlatform } from '@/platform'
import { getStoredLocale } from '@/i18n'
import { useAppStore } from '@/state/appStore'
import i18n from '@/i18n'

export default function App() {
  useKeyboardShortcuts()

  useEffect(() => {
    const el = document.getElementById('boot-splash')
    if (!el) return
    const start = window.requestAnimationFrame(() => {
      el.classList.add('boot-splash-out')
    })
    const removeId = window.setTimeout(() => {
      el.remove()
    }, 480)
    return () => {
      window.cancelAnimationFrame(start)
      window.clearTimeout(removeId)
    }
  }, [])

  useEffect(() => {
    const platform = getPlatform()
    void platform.setMenuLocale(getStoredLocale())

    const offOpen = platform.onMenuOpenFolder(() => {
      if (useAppStore.getState().windowRole === 'float') return
      void (async () => {
        const path = await platform.openFolder()
        if (path) await useAppStore.getState().openWorkspace(path)
      })()
    })
    const offSave = platform.onMenuSave(() => {
      void useAppStore.getState().saveTab()
    })
    const offNewWin = platform.onMenuNewWindow(() => {
      void useAppStore.getState().spawnNewWindow()
    })
    const offNewMain = platform.onMenuNewMainWindow(() => {
      void useAppStore.getState().spawnNewMainWindow()
    })
    const offDoc = platform.onDocApply((snap) => {
      useAppStore.getState().applyDocSnapshot(snap)
    })
    const offClose = platform.onWindowCloseRequest(() => {
      void useAppStore.getState().handleWindowCloseRequest()
    })

    const onLang = (lng: string) => {
      void platform.setMenuLocale(lng.startsWith('zh') ? 'zh-CN' : 'en')
    }
    i18n.on('languageChanged', onLang)

    return () => {
      offOpen()
      offSave()
      offNewWin()
      offNewMain()
      offDoc()
      offClose()
      i18n.off('languageChanged', onLang)
    }
  }, [])

  return (
    <>
      <Workbench />
      <UnsavedChangesDialog />
    </>
  )
}
