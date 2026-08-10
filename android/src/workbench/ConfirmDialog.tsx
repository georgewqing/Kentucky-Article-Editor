import { useEffect, useRef, useState } from 'react'
import { useConfirmDialogStore } from '@/state/confirmDialogStore'
import { AnimatedDialogShell } from './AnimatedDialogShell'

export function ConfirmDialog() {
  const open = useConfirmDialogStore((s) => s.open)
  const title = useConfirmDialogStore((s) => s.title)
  const message = useConfirmDialogStore((s) => s.message)
  const confirmLabel = useConfirmDialogStore((s) => s.confirmLabel)
  const cancelLabel = useConfirmDialogStore((s) => s.cancelLabel)
  const danger = useConfirmDialogStore((s) => s.danger)
  const choose = useConfirmDialogStore((s) => s.choose)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [snap, setSnap] = useState({
    title,
    message,
    confirmLabel,
    cancelLabel,
    danger
  })

  useEffect(() => {
    if (!open) return
    setSnap({ title, message, confirmLabel, cancelLabel, danger })
  }, [open, title, message, confirmLabel, cancelLabel, danger])

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

  return (
    <AnimatedDialogShell open={open} onBackdropClick={() => choose('cancel')}>
      {({ leaving }) => (
        <div
          className={`app-dialog${leaving ? ' is-leaving' : ''}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="confirm-dialog-title" className="app-dialog-title">
            {snap.title}
          </h2>
          <p id="confirm-dialog-desc" className="app-dialog-body">
            {snap.message}
          </p>
          <div className="app-dialog-actions">
            <button type="button" className="app-dialog-btn ghost" onClick={() => choose('cancel')}>
              {snap.cancelLabel}
            </button>
            <div className="app-dialog-actions-end">
              <button
                ref={confirmRef}
                type="button"
                className={`app-dialog-btn primary ${snap.danger ? 'danger' : ''}`}
                onClick={() => choose('confirm')}
              >
                {snap.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedDialogShell>
  )
}
