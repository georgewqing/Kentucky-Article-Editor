/** Active dialogue graph editor registers flush so Save writes choices + layout. */
let flushSidecars: (() => Promise<void>) | null = null

export function setDialogueSidecarFlush(fn: (() => Promise<void>) | null): void {
  flushSidecars = fn
}

export async function flushActiveDialogueSidecars(): Promise<void> {
  if (flushSidecars) await flushSidecars()
}
