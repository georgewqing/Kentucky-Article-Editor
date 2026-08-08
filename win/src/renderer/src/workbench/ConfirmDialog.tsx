import { useEffect, useRef } from 'react'
import { useConfirmDialogStore } from '@/state/confirmDialogStore'

export function ConfirmDialog() {
  const open = useConfirmDialogStore((s) => s.open)
  const title = useConfirmDialogStore((s) => s.title)
  const message = useConfirmDialogStore((s) => s.message)
  const confirmLabel = useConfirmDialogStore((s) => s.confirmLabel)
  const cancelLabel = useConfirmDialogStore((s) => s.cancelLabel)
  const danger = useConfirmDialogStore((s) => s.danger)
  const choose = useConfirmDialogStore((s) => s.choose)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        choose('cancel')
      }
    }
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => confirmRef.current?.focus())
    return () => window.removeEventListener('keydown', onKey)
  }, [open, choose])

  if (!open) return null

  return (
    <div className="app-dialog-backdrop" role="presentation" onClick={() => choose('cancel')}>
      <div
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="app-dialog-title">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="app-dialog-body">
          {message}
        </p>
        <div className="app-dialog-actions">
          <button type="button" className="app-dialog-btn ghost" onClick={() => choose('cancel')}>
            {cancelLabel}
          </button>
          <div className="app-dialog-actions-end">
            <button
              ref={confirmRef}
              type="button"
              className={`app-dialog-btn primary ${danger ? 'danger' : ''}`}
              onClick={() => choose('confirm')}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
