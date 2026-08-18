import { useLayoutEffect, type RefObject } from 'react'

/** Show overlay scrollbar only while scrolling; hide after idle (default 1s). */
export function useOverlayScroll(
  ref: RefObject<HTMLElement | null>,
  hideAfterMs = 1000,
  reconnectKey?: unknown
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = (): void => {
      el.classList.add('is-scrolling')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        el.classList.remove('is-scrolling')
      }, hideAfterMs)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (timer) clearTimeout(timer)
      el.classList.remove('is-scrolling')
    }
  }, [ref, hideAfterMs, reconnectKey])
}
