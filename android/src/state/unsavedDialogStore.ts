import { create } from 'zustand'
import i18n from '@/i18n'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

interface UnsavedDialogState {
  open: boolean
  title: string
  message: string
  resolve: ((choice: UnsavedChoice) => void) | null
  ask: (opts?: { fileName?: string }) => Promise<UnsavedChoice>
  choose: (choice: UnsavedChoice) => void
}

export const useUnsavedDialogStore = create<UnsavedDialogState>((set, get) => ({
  open: false,
  title: '',
  message: '',
  resolve: null,

  ask: (opts) => {
    const existing = get().resolve
    if (existing) {
      existing('cancel')
    }
    return new Promise<UnsavedChoice>((resolve) => {
      const fileName = opts?.fileName
      set({
        open: true,
        title: i18n.t('editor.unsavedTitle'),
        message: fileName
          ? i18n.t('editor.unsavedMessageNamed', { name: fileName })
          : i18n.t('editor.unsavedMessage'),
        resolve
      })
    })
  },

  choose: (choice) => {
    const { resolve } = get()
    set({ open: false, title: '', message: '', resolve: null })
    resolve?.(choice)
  }
}))

export function askUnsavedConfirm(opts?: { fileName?: string }): Promise<UnsavedChoice> {
  return useUnsavedDialogStore.getState().ask(opts)
}
