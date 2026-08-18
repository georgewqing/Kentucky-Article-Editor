import { useEffect, useRef, useState } from 'react'
import { useAppStore, type Toast } from '@/state/appStore'

/** Must match `--duration-toast` in global.css */
export const TOAST_LEAVE_MS = 180

export function ToastLayer() {
  const toast = useAppStore((s) => s.toast)
  const [visible, setVisible] = useState<Toast>(null)
  const [leaving, setLeaving] = useState(false)
  const visibleRef = useRef<Toast>(null)
  const leaveTimer = useRef<number | null>(null)
  visibleRef.current = visible

  useEffect(() => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (toast) {
      setLeaving(false)
      setVisible(toast)
      return
    }
    if (!visibleRef.current) return
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      setVisible(null)
      setLeaving(false)
      leaveTimer.current = null
    }, TOAST_LEAVE_MS)
    return () => {
      if (leaveTimer.current != null) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
    }
  }, [toast])

  if (!visible) return null
  return (
    <div className={`toast ${visible.type}${leaving ? ' is-leaving' : ''}`}>{visible.message}</div>
  )
}
