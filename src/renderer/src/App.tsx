import { useEffect } from 'react'
import { Workbench } from '@/workbench/Workbench'
import { SelectionContextMenu } from '@/workbench/SelectionContextMenu'
import { UnsavedChangesDialog } from '@/workbench/UnsavedChangesDialog'
import { ConfirmDialog } from '@/workbench/ConfirmDialog'
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
      if (useAppStore.getState().windowRole === 'float') return
      void (async () => {
        const path = await platform.openFolder()
        if (path) await useAppStore.getState().openWorkspace(path)
      })()
    })
    const offSave = platform.onMenuSave(() => {
      void useAppStore.getState().saveTab()
    })
    const offExportPdf = platform.onMenuExportPdf(() => {
      void import('@/export/exportPdf').then((m) => m.exportActiveTabToPdf())
    })
    const offNewWin = platform.onMenuNewWindow(() => {
      void useAppStore.getState().spawnNewWindow()
    })
    const offNewMain = platform.onMenuNewMainWindow(() => {
      void useAppStore.getState().spawnNewMainWindow()
    })
    const offOpenDoc = platform.onOpenDocument((payload) => {
      if (useAppStore.getState().windowRole === 'float') return
      void (async () => {
        await useAppStore.getState().openWorkspace(payload.workspacePath)
        await useAppStore.getState().openFile(payload.filePath)
      })()
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
      offExportPdf()
      offNewWin()
      offNewMain()
      offOpenDoc()
      offDoc()
      offClose()
      i18n.off('languageChanged', onLang)
    }
  }, [])

  return (
    <>
      <Workbench />
      <SelectionContextMenu />
      <UnsavedChangesDialog />
      <ConfirmDialog />
    </>
  )
}
