import { useEffect } from 'react'
import { Workbench } from '@/workbench/Workbench'
import { UnsavedChangesDialog } from '@/workbench/UnsavedChangesDialog'
import { ConfirmDialog } from '@/workbench/ConfirmDialog'
import { useKeyboardShortcuts } from '@/workbench/useKeyboardShortcuts'
import { useAndroidBackButton } from '@/hooks/useAndroidBackButton'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

export default function App() {
  useKeyboardShortcuts()
  useAndroidBackButton()

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
    const offDoc = platform.onDocApply((snap) => {
      useAppStore.getState().applyDocSnapshot(snap)
    })

    return () => {
      offDoc()
    }
  }, [])

  return (
    <>
      <Workbench />
      <UnsavedChangesDialog />
      <ConfirmDialog />
    </>
  )
}
