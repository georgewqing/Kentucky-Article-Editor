import { create } from 'zustand'
import i18n from '@/i18n'

export type ConfirmChoice = 'confirm' | 'cancel'

interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: ((choice: ConfirmChoice) => void) | null
  ask: (opts: {
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }) => Promise<boolean>
  choose: (choice: ConfirmChoice) => void
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  danger: false,
  resolve: null,

  ask: (opts) => {
    const existing = get().resolve
    if (existing) existing('cancel')
    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title ?? i18n.t('dialog.confirmTitle'),
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? i18n.t('dialog.confirm'),
        cancelLabel: opts.cancelLabel ?? i18n.t('dialog.cancel'),
        danger: opts.danger === true,
        resolve: (choice) => resolve(choice === 'confirm')
      })
    })
  },

  choose: (choice) => {
    const { resolve } = get()
    set({
      open: false,
      title: '',
      message: '',
      confirmLabel: '',
      cancelLabel: '',
      danger: false,
      resolve: null
    })
    resolve?.(choice)
  }
}))

export function askConfirm(opts: {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return useConfirmDialogStore.getState().ask(opts)
}
