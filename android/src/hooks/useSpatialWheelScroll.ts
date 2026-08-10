import { useEffect, type RefObject } from 'react'

const NATIVE_WHEEL_EVENT = 'kentucky:native-wheel'

type NativeWheelDetail = {
  xRatio: number
  yRatio: number
  deltaX: number
  deltaY: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

function wheelDeltaY(e: WheelEvent, el: HTMLElement): number {
  let dy = e.deltaY
  if (e.deltaMode === 1) dy *= 16
  else if (e.deltaMode === 2) dy *= el.clientHeight
  return dy
}

function pointInRect(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function applyScrollY(el: HTMLElement, dy: number): boolean {
  if (Math.abs(dy) < 0.01) return false
  if (el.scrollHeight <= el.clientHeight + 1) return false
  const max = el.scrollHeight - el.clientHeight
  const next = Math.min(max, Math.max(0, el.scrollTop + dy))
  if (next === el.scrollTop) return false
  el.scrollTop = next
  return true
}

function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let current = start
  while (current && current !== document.body && current !== document.documentElement) {
    const overflowY = getComputedStyle(current).overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current
    }
    current = current.parentElement
  }
  return null
}

/**
 * React Flow–style wheel ownership for overflow panels.
 *
 * RF works beside the AI panel because it handles wheel only when the pointer
 * is over the canvas rectangle — it does not rely on focus. TipTap contentEditable
 * steals focused wheel events on Android WebView, so MD ↔ AI fought each other.
 *
 * This hook: hit-test with event coordinates (not event.target / focus), scroll
 * the panel under the pointer, leave `.rf-host` alone for React Flow.
 */
export function useSpatialWheelScroll(): void {
  useEffect(() => {
    let lastX = 0
    let lastY = 0

    const onNativeWheel = (e: Event): void => {
      const detail = (e as CustomEvent<NativeWheelDetail>).detail
      if (
        !detail ||
        !Number.isFinite(detail.xRatio) ||
        !Number.isFinite(detail.yRatio) ||
        !Number.isFinite(detail.deltaX) ||
        !Number.isFinite(detail.deltaY)
      ) {
        return
      }

      const x = Math.min(
        Math.max(0, window.innerWidth - 0.01),
        Math.max(0, detail.xRatio * window.innerWidth)
      )
      const y = Math.min(
        Math.max(0, window.innerHeight - 0.01),
        Math.max(0, detail.yRatio * window.innerHeight)
      )
      lastX = x
      lastY = y

      // The native Activity consumed WebView's latched ACTION_SCROLL. Recreate a
      // regular wheel event at the real pointer position so this hook and React
      // Flow both keep their existing wheel semantics.
      const target = document.elementFromPoint(x, y)
      target?.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          deltaX: detail.deltaX,
          deltaY: detail.deltaY,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          ctrlKey: detail.ctrlKey,
          metaKey: detail.metaKey,
          shiftKey: detail.shiftKey,
          altKey: detail.altKey
        })
      )
    }

    const onMove = (e: PointerEvent | MouseEvent): void => {
      lastX = e.clientX
      lastY = e.clientY
    }

    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) return

      // Prefer live event coords; fall back to last pointer move (some drivers
      // leave clientXY at 0 during wheel).
      let x = e.clientX
      let y = e.clientY
      if ((x === 0 && y === 0) || Number.isNaN(x)) {
        x = lastX
        y = lastY
      } else {
        lastX = x
        lastY = y
      }

      const under = document.elementFromPoint(x, y) as HTMLElement | null
      if (under?.closest('.rf-host, .react-flow, .monaco-editor')) return

      const aiPanel = document.querySelector('.ai-panel') as HTMLElement | null
      const aiMessages = document.querySelector('.ai-messages') as HTMLElement | null
      const article =
        (under?.closest('.article-editor') as HTMLElement | null) ??
        Array.from(document.querySelectorAll<HTMLElement>('.article-editor')).find((el) =>
          pointInRect(x, y, el.getBoundingClientRect())
        ) ??
        null
      const sidebar = document.querySelector('.sidebar-body') as HTMLElement | null

      // Spatial ownership (same idea as RF pane bounds), not focus/target latching.
      if (aiMessages && aiPanel && pointInRect(x, y, aiPanel.getBoundingClientRect())) {
        const nested = under?.closest('textarea, .ai-history, .ai-plan-list') as HTMLElement | null
        const nestedCanScroll = nested && nested.scrollHeight > nested.clientHeight + 1
        const host = nestedCanScroll ? nested : aiMessages
        const dy = wheelDeltaY(e, host)
        const scrolledNested = nestedCanScroll ? applyScrollY(host, dy) : false
        if (!scrolledNested) applyScrollY(aiMessages, wheelDeltaY(e, aiMessages))
        if (document.activeElement instanceof HTMLElement) {
          // Drop TipTap focus so the next gesture does not stick to the editor.
          const active = document.activeElement
          if (active.closest('.article-host')) active.blur()
        }
        // Own the entire wheel sequence, including scroll boundaries, so WebView
        // cannot latch the gesture back to the previously focused overflow host.
        e.preventDefault()
        return
      }

      if (article && pointInRect(x, y, article.getBoundingClientRect())) {
        applyScrollY(article, wheelDeltaY(e, article))
        e.preventDefault()
        return
      }

      if (sidebar && pointInRect(x, y, sidebar.getBoundingClientRect())) {
        applyScrollY(sidebar, wheelDeltaY(e, sidebar))
        e.preventDefault()
        return
      }

      // Native ACTION_SCROLL is consumed before WebView can perform default
      // scrolling. Route every remaining overflow host (Settings, inspectors,
      // character lists, etc.) explicitly so adding the native bridge does not
      // disable ordinary panel scrolling.
      const overflowHost = findScrollableAncestor(under)
      if (overflowHost) {
        applyScrollY(overflowHost, wheelDeltaY(e, overflowHost))
        e.preventDefault()
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true, capture: true })
    window.addEventListener('mousemove', onMove, { passive: true, capture: true })
    window.addEventListener(NATIVE_WHEEL_EVENT, onNativeWheel)
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener(NATIVE_WHEEL_EVENT, onNativeWheel)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [])
}

/** Optional: RF-style local wheel on a single overflow host (capture on the node). */
export function useLocalWheelScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) return
      if (!applyScrollY(el, wheelDeltaY(e, el))) return
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, true)
  }, [ref])
}
