import { useMemo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** Last pointer type seen — trackpad usually reports `mouse`; finger is `touch`. */
let lastPointerType = 'mouse'

export function notePointerType(e: { pointerType?: string }): void {
  if (e.pointerType) lastPointerType = e.pointerType
}

export function getLastPointerType(): string {
  return lastPointerType
}

/** Ctrl/Cmd + primary button → Mac-style secondary click. */
export function isModifiedPrimaryClick(e: {
  button: number
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  return e.button === 0 && (e.ctrlKey || e.metaKey)
}

/**
 * Ignore synthetic long-press `contextmenu` from finger touches (no modifier).
 * Trackpad two-finger tap / right-click typically uses `pointerType === 'mouse'`.
 */
export function shouldSuppressTouchContextMenu(e: {
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  return lastPointerType === 'touch' && !e.ctrlKey && !e.metaKey
}

type SecondaryOpen = (clientX: number, clientY: number) => void

/**
 * Handlers for Mac-like secondary click: `contextmenu` + Ctrl/Meta+left click.
 * Set `suppressTouchLongPress` (default true) to avoid finger long-press opening menus.
 */
export function useSecondaryClick(
  onOpen: SecondaryOpen,
  opts?: { suppressTouchLongPress?: boolean }
): {
  onPointerDown: (e: ReactPointerEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
} {
  const suppressTouchLongPress = opts?.suppressTouchLongPress !== false

  return useMemo(
    () => ({
      onPointerDown: (e: ReactPointerEvent) => {
        notePointerType(e)
        if (!isModifiedPrimaryClick(e)) return
        e.preventDefault()
        e.stopPropagation()
        onOpen(e.clientX, e.clientY)
      },
      onContextMenu: (e: ReactMouseEvent) => {
        if (suppressTouchLongPress && shouldSuppressTouchContextMenu(e)) {
          e.preventDefault()
          return
        }
        e.preventDefault()
        e.stopPropagation()
        onOpen(e.clientX, e.clientY)
      }
    }),
    [onOpen, suppressTouchLongPress]
  )
}
