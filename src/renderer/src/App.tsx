import { useEffect } from 'react'
import { Workbench } from '@/workbench/Workbench'
import { useKeyboardShortcuts } from '@/workbench/useKeyboardShortcuts'
import { getPlatform } from '@/platform'
import { getStoredLocale } from '@/i18n'
import { useAppStore } from '@/state/appStore'
import i18n from '@/i18n'

export default function App() {
  useKeyboardShortcuts()

  useEffect(() => {
    const platform = getPlatform()
    void platform.setMenuLocale(getStoredLocale())

    const offOpen = platform.onMenuOpenFolder(() => {
      void (async () => {
        const path = await platform.openFolder()
        if (path) await useAppStore.getState().openWorkspace(path)
      })()
    })
    const offSave = platform.onMenuSave(() => {
      void useAppStore.getState().saveTab()
    })

    const onLang = (lng: string) => {
      void platform.setMenuLocale(lng.startsWith('zh') ? 'zh-CN' : 'en')
    }
    i18n.on('languageChanged', onLang)

    return () => {
      offOpen()
      offSave()
      i18n.off('languageChanged', onLang)
    }
  }, [])

  return <Workbench />
}
