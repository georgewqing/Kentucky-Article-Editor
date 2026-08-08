import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUnsavedDialogStore } from '@/state/unsavedDialogStore'

export function UnsavedChangesDialog() {
  const { t } = useTranslation()
  const open = useUnsavedDialogStore((s) => s.open)
  const title = useUnsavedDialogStore((s) => s.title)
  const message = useUnsavedDialogStore((s) => s.message)
  const choose = useUnsavedDialogStore((s) => s.choose)
  const saveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    saveRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        choose('cancel')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, choose])

  if (!open) return null

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <div
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-desc"
      >
        <h2 id="unsaved-dialog-title" className="app-dialog-title">
          {title}
        </h2>
        <p id="unsaved-dialog-desc" className="app-dialog-body">
          {message}
        </p>
        <div className="app-dialog-actions">
          <button type="button" className="app-dialog-btn ghost" onClick={() => choose('discard')}>
            {t('editor.dontSave')}
          </button>
          <div className="app-dialog-actions-end">
            <button type="button" className="app-dialog-btn" onClick={() => choose('cancel')}>
              {t('editor.cancel')}
            </button>
            <button
              ref={saveRef}
              type="button"
              className="app-dialog-btn primary"
              onClick={() => choose('save')}
            >
              {t('editor.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
