import { EXPORT_FPS } from '@shared/kyboardSchema'

export const TIMELINE_SPLIT_KEY = 'kentucky.storyboard.timelineSplit'
export const TIMELINE_PX_MIN = 20
export const TIMELINE_PX_MAX = 200
export const FRAME_SEC = 1 / EXPORT_FPS
export const SNAP_PX = 8

export function formatTimecode(sec: number, fps = EXPORT_FPS): string {
  const s = Math.max(0, sec)
  const totalFrames = Math.round(s * fps)
  const ff = totalFrames % fps
  const totalSec = Math.floor(totalFrames / fps)
  const ss = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const mm = totalMin % 60
  const hh = Math.floor(totalMin / 60)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`
}

export function loadMonitorSplit(): number {
  try {
    const raw = localStorage.getItem(TIMELINE_SPLIT_KEY)
    const n = raw ? Number(raw) : 0.52
    if (!Number.isFinite(n)) return 0.52
    return Math.min(0.75, Math.max(0.28, n))
  } catch {
    return 0.52
  }
}

export function saveMonitorSplit(ratio: number): void {
  try {
    localStorage.setItem(TIMELINE_SPLIT_KEY, String(ratio))
  } catch {
    /* ignore */
  }
}

/** Build ruler tick marks for [0, laneSec]. */
export function buildRulerTicks(
  laneSec: number,
  pxPerSec: number
): Array<{ t: number; major: boolean; label?: string }> {
  const px = Math.max(pxPerSec, 1)
  // Aim ~80px between major ticks
  const majorCandidates = [0.5, 1, 2, 5, 10, 15, 30, 60]
  let major = 1
  for (const c of majorCandidates) {
    if (c * px >= 64) {
      major = c
      break
    }
    major = c
  }
  const minor = major >= 2 ? major / 2 : major / 2
  const ticks: Array<{ t: number; major: boolean; label?: string }> = []
  const end = Math.ceil(laneSec / minor) * minor + 1e-6
  for (let t = 0; t <= end; t += minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
    ticks.push({
      t,
      major: isMajor,
      label: isMajor ? (t >= 60 ? formatTimecode(t) : `${t.toFixed(t % 1 === 0 ? 0 : 1)}s`) : undefined
    })
  }
  return ticks
}
