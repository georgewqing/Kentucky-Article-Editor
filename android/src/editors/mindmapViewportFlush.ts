/** Active mind-map editor registers a sync flush so Save keeps the current camera. */
let flushViewport: (() => void) | null = null

export function setMindmapViewportFlush(fn: (() => void) | null): void {
  flushViewport = fn
}

export function flushActiveMindmapViewport(): void {
  flushViewport?.()
}
