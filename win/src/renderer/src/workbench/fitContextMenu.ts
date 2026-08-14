import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Keep a fixed menu inside the window; flip above the cursor when it would overflow below. */
export function clampMenuPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  pad = 8
): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxX = Math.max(pad, vw - w - pad)
  const maxY = Math.max(pad, vh - h - pad)
  const nx = Math.min(Math.max(x, pad), maxX)
  let ny = y
  if (y + h > vh - pad) ny = y - h
  ny = Math.min(Math.max(ny, pad), maxY)
  return { x: nx, y: ny }
}

/** Measure the menu after layout and clamp to the viewport. */
export function useFittedMenuPos(
  active: boolean,
  x: number,
  y: number
): {
  menuRef: RefObject<HTMLDivElement | null>
  menuPos: { x: number; y: number }
} {
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState(() => clampMenuPosition(x, y, 200, 280))
  useLayoutEffect(() => {
    if (!active) return
    const el = menuRef.current
    const w = el?.offsetWidth || 200
    const h = el?.offsetHeight || 280
    setMenuPos(clampMenuPosition(x, y, w, h))
  }, [active, x, y])
  return { menuRef, menuPos }
}
