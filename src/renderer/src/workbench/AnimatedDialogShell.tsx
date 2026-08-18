import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Must match `--duration-modal` in global.css */
export const DIALOG_LEAVE_MS = 220

type Props = {
  open: boolean
  onBackdropClick?: () => void
  children: (args: { leaving: boolean }) => ReactNode
}

/**
 * Keeps dialog mounted through leave animation after `open` becomes false.
 * Children render the panel; backdrop wraps them.
 */
export function AnimatedDialogShell({ open, onBackdropClick, children }: Props) {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<number | null>(null)
  const mountedRef = useRef(mounted)
  mountedRef.current = mounted

  useEffect(() => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (open) {
      setLeaving(false)
      setMounted(true)
      return
    }
    if (!mountedRef.current) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
      leaveTimer.current = null
    }, DIALOG_LEAVE_MS)
    return () => {
      if (leaveTimer.current != null) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
    }
  }, [open])

  if (!mounted) return null

  return (
    <div
      className={`app-dialog-backdrop${leaving ? ' is-leaving' : ''}`}
      role="presentation"
      onClick={onBackdropClick}
    >
      {children({ leaving })}
    </div>
  )
}
