/** Kyboard project schema v1 — storyboard + simplified timeline (Win 0.3). */

export const KYBOARD_EXT = '.kyboard'
export const PANEL_W = 1920
export const PANEL_H = 1080
export const DEFAULT_GUTTER = 24
export const DEFAULT_LABEL_BAND = 48
export const DEFAULT_PANEL_DURATION_SEC = 2
export const EXPORT_FPS = 24
/** Storyboard animatic: A1–A4, one MP3 clip per track. */
export const MAX_AUDIO_TRACKS = 4
/** Simple Ken Burns keys along a clip (t in 0..1), including in/out. */
export const MAX_CAMERA_KEYS = 6
export const MAX_SHEET_COLS = 8
export const MAX_SHEET_ROWS = 8
/** Cap MP4 export so a crafted .kyboard cannot fill the disk. */
export const MAX_EXPORT_DURATION_SEC = 15 * 60

export type LayoutPrefer = 'landscape' | 'portrait'

export type KyboardLayout = {
  cols: number
  rows: number
  panelW: number
  panelH: number
  gutterPx: number
  labelBandPx: number
}

export type CameraKeyframe = { x: number; y: number; scale: number }

/** Optional in-clip camera pose. `t` is 0..1 along the clip. */
export type CameraKey = CameraKeyframe & { t: number }

export type KyboardSheet = {
  id: string
  /** Workspace-relative path to the stitched PNG */
  imageRel: string
  blank: boolean
}

export type KyboardPanel = {
  id: string
  sheetId: string
  index: number
  col: number
  row: number
  /** Workspace-relative path to 1920×1080 panel PNG */
  imageRel: string
}

export type VideoClip = {
  id: string
  panelId: string
  /** Timeline start in seconds */
  start: number
  duration: number
  camera: {
    from: CameraKeyframe
    to: CameraKeyframe
    /** Optional extra poses; if ≥2, playback/export interpolate these (from/to stay in sync). */
    keys?: CameraKey[]
  }
}

export type AudioClip = {
  id: string
  /** Workspace-relative mp3 */
  audioRel: string
  /** Timeline start */
  start: number
  /** Source in/out in seconds */
  inSec: number
  outSec: number
  /** Probed file length (trim ceiling); optional for older docs */
  mediaDurationSec?: number
  volume: number
  fadeInSec: number
  fadeOutSec: number
  /** 0-based track index (A1=0). Omitted → 0. */
  track?: number
}

/** Max source time available for A1 trim (falls back to current out). */
export function audioMediaDurationSec(a: AudioClip): number {
  const hinted = a.mediaDurationSec
  if (typeof hinted === 'number' && Number.isFinite(hinted) && hinted > 0) {
    return Math.max(hinted, a.outSec, a.inSec + 0.1)
  }
  return Math.max(a.outSec, a.inSec + 0.1)
}

/** Trim A1 head: move timeline start with inSec (outSec fixed). */
export function trimAudioClipInMut(a: AudioClip, nextInSec: number): void {
  const media = audioMediaDurationSec(a)
  const maxIn = Math.max(0, a.outSec - 0.1)
  const inSec = Math.min(maxIn, Math.max(0, Math.round(nextInSec * 10) / 10))
  const delta = inSec - a.inSec
  a.inSec = inSec
  a.start = Math.max(0, Math.round((a.start + delta) * 10) / 10)
  a.mediaDurationSec = media
}

/** Trim A1 tail: change outSec only (inSec / start fixed). */
export function trimAudioClipOutMut(a: AudioClip, nextOutSec: number): void {
  const media = audioMediaDurationSec(a)
  const minOut = a.inSec + 0.1
  a.outSec = Math.min(media, Math.max(minOut, Math.round(nextOutSec * 10) / 10))
  a.mediaDurationSec = media
}

function clampTrack(n: number | undefined): number {
  const t = Math.floor(Number(n) || 0)
  return Math.min(MAX_AUDIO_TRACKS - 1, Math.max(0, t))
}

/** Canonical audio list; migrates legacy `audioClip` when `audioClips` is empty. */
export function listAudioClips(doc: KyboardDoc): AudioClip[] {
  const extra = doc.timeline.audioClips
  if (Array.isArray(extra) && extra.length) {
    return extra.map((c) => ({ ...c, track: clampTrack(c.track) }))
  }
  if (doc.timeline.audioClip) {
    return [{ ...doc.timeline.audioClip, track: clampTrack(doc.timeline.audioClip.track) }]
  }
  return []
}

/** Keep `audioClip` = first clip so older code/docs still read A1. */
export function syncLegacyAudioClip(doc: KyboardDoc): void {
  const clips = Array.isArray(doc.timeline.audioClips) ? doc.timeline.audioClips : []
  doc.timeline.audioClips = clips
  doc.timeline.audioClip = clips[0] ?? null
}

export function audioClipById(doc: KyboardDoc, id: string): AudioClip | undefined {
  return listAudioClips(doc).find((c) => c.id === id)
}

export function firstEmptyAudioTrack(doc: KyboardDoc): number | null {
  const used = new Set(listAudioClips(doc).map((c) => clampTrack(c.track)))
  for (let i = 0; i < MAX_AUDIO_TRACKS; i++) {
    if (!used.has(i)) return i
  }
  return null
}

export function audioOnTrack(doc: KyboardDoc, track: number): AudioClip | undefined {
  return listAudioClips(doc).find((c) => clampTrack(c.track) === track)
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function poseOf(k: CameraKeyframe): CameraKeyframe {
  return {
    x: Number(k.x) || 0,
    y: Number(k.y) || 0,
    scale: Math.max(0.05, Number(k.scale) || 1)
  }
}

function isIdentityPose(k: CameraKeyframe): boolean {
  return Math.abs(k.x) < 0.5 && Math.abs(k.y) < 0.5 && Math.abs(k.scale - 1) < 0.02
}

function sortCameraKeys(raw: CameraKey[]): CameraKey[] {
  const sorted = raw
    .map((k) => ({ t: Math.round(clamp01(k.t) * 100) / 100, ...poseOf(k) }))
    .sort((a, b) => a.t - b.t)
  const dedup: CameraKey[] = []
  for (const k of sorted) {
    const prev = dedup[dedup.length - 1]
    if (prev && Math.abs(prev.t - k.t) < 0.009) dedup[dedup.length - 1] = k
    else dedup.push(k)
  }
  return dedup
}

/**
 * Drop auto-injected identity bookends (t=0 / t=1 at rest).
 * Those made every clip show two diamonds and pulled manual keys back to rest.
 */
function pruneIdentityBookends(keys: CameraKey[]): CameraKey[] {
  let out = keys
  const hasInterior = out.some((k) => k.t > 0.02 && k.t < 0.98)
  if (out.length >= 3 && hasInterior && out[0].t <= 0.005 && isIdentityPose(out[0])) {
    out = out.slice(1)
  }
  if (
    out.length >= 3 &&
    out.some((k) => k.t > 0.02 && k.t < 0.98) &&
    out[out.length - 1].t >= 0.995 &&
    isIdentityPose(out[out.length - 1])
  ) {
    out = out.slice(0, -1)
  }
  if (
    out.length === 2 &&
    out[0].t <= 0.005 &&
    out[1].t >= 0.995 &&
    isIdentityPose(out[0]) &&
    isIdentityPose(out[1])
  ) {
    return []
  }
  return out
}

/** Keys actually stored on the clip. Empty = no diamonds, playback uses from→to. */
export function storedCameraKeys(clip: VideoClip): CameraKey[] {
  const raw = clip.camera.keys
  if (!Array.isArray(raw) || !raw.length) return []
  return pruneIdentityBookends(sortCameraKeys(raw))
}

/** Playback keys: stored keys, or from→to when none. */
export function cameraKeysOf(clip: VideoClip): CameraKey[] {
  const stored = storedCameraKeys(clip)
  if (stored.length) return stored
  return [
    { t: 0, ...poseOf(clip.camera.from) },
    { t: 1, ...poseOf(clip.camera.to) }
  ]
}

export function interpolateCameraKeys(keys: CameraKey[], t: number): CameraKeyframe {
  const u = clamp01(t)
  if (!keys.length) return { x: 0, y: 0, scale: 1 }
  if (keys.length === 1) return poseOf(keys[0])
  if (u <= keys[0].t) return poseOf(keys[0])
  const last = keys[keys.length - 1]
  if (u >= last.t) return poseOf(last)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (u >= a.t && u <= b.t) {
      const span = Math.max(1e-6, b.t - a.t)
      return interpolateCamera(a, b, (u - a.t) / span)
    }
  }
  return poseOf(last)
}

export function cameraAtClip(clip: VideoClip, localT: number): CameraKeyframe {
  const stored = storedCameraKeys(clip)
  if (stored.length) return interpolateCameraKeys(stored, localT)
  return interpolateCamera(clip.camera.from, clip.camera.to, localT)
}

function writeCameraKeys(clip: VideoClip, keys: CameraKey[]): void {
  const trimmed = pruneIdentityBookends(sortCameraKeys(keys)).slice(0, MAX_CAMERA_KEYS)
  if (!trimmed.length) {
    clip.camera.keys = undefined
    return
  }
  clip.camera.keys = trimmed
  clip.camera.from = poseOf(trimmed[0])
  clip.camera.to = poseOf(trimmed[trimmed.length - 1])
}

/** Write pose onto the nearest existing key (in/out if only two). */
export function nudgeNearestCameraKeyMut(clip: VideoClip, localT: number, pose: CameraKeyframe): void {
  const keys = storedCameraKeys(clip)
  if (!keys.length) {
    upsertCameraKeyMut(clip, localT, pose)
    return
  }
  const u = clamp01(localT)
  let best = 0
  let bestD = 99
  for (let i = 0; i < keys.length; i++) {
    const d = Math.abs(keys[i].t - u)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  keys[best] = { ...keys[best], ...poseOf(pose) }
  writeCameraKeys(clip, keys)
}

/** Insert or replace a key at localT (rounded 0.01). Returns false if at cap. */
export function upsertCameraKeyMut(clip: VideoClip, localT: number, pose: CameraKeyframe): boolean {
  const u = Math.round(clamp01(localT) * 100) / 100
  const keys = storedCameraKeys(clip)
  const idx = keys.findIndex((k) => Math.abs(k.t - u) < 0.015)
  if (idx >= 0) {
    keys[idx] = { t: keys[idx].t, ...poseOf(pose) }
    writeCameraKeys(clip, keys)
    return true
  }
  if (keys.length >= MAX_CAMERA_KEYS) return false
  keys.push({ t: u, ...poseOf(pose) })
  writeCameraKeys(clip, keys)
  return true
}

export function removeCameraKeyMut(clip: VideoClip, t: number): void {
  const u = clamp01(t)
  writeCameraKeys(
    clip,
    storedCameraKeys(clip).filter((k) => Math.abs(k.t - u) > 0.02)
  )
}

export function nearestCameraKey(clip: VideoClip, localT: number): CameraKey {
  const keys = cameraKeysOf(clip)
  const u = clamp01(localT)
  let best = keys[0]
  let bestD = 99
  for (const k of keys) {
    const d = Math.abs(k.t - u)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

/** Key on this clip time, if any (only manually stored keys). */
export function cameraKeyAt(clip: VideoClip, localT: number, eps = 0.015): CameraKey | undefined {
  const u = clamp01(localT)
  return storedCameraKeys(clip).find((k) => Math.abs(k.t - u) < eps)
}

/** Edit from/to; if extra keys exist, keep them in sync. */
export function patchCameraEndpointMut(
  clip: VideoClip,
  which: 'from' | 'to',
  patch: Partial<CameraKeyframe>
): void {
  if (!clip.camera.keys || clip.camera.keys.length < 2) {
    const pose = which === 'from' ? clip.camera.from : clip.camera.to
    const next = poseOf({ ...pose, ...patch })
    if (which === 'from') clip.camera.from = next
    else clip.camera.to = next
    return
  }
  const keys = cameraKeysOf(clip)
  const i = which === 'from' ? 0 : keys.length - 1
  keys[i] = { ...keys[i], ...poseOf({ ...keys[i], ...patch }), t: which === 'from' ? 0 : 1 }
  writeCameraKeys(clip, keys)
}

export function ensureAudioClipsMut(doc: KyboardDoc): AudioClip[] {
  if (!Array.isArray(doc.timeline.audioClips) || doc.timeline.audioClips.length === 0) {
    doc.timeline.audioClips = listAudioClips(doc)
  }
  for (const a of doc.timeline.audioClips) a.track = clampTrack(a.track)
  syncLegacyAudioClip(doc)
  return doc.timeline.audioClips
}

export function removeAudioClipMut(doc: KyboardDoc, id: string): boolean {
  const clips = ensureAudioClipsMut(doc)
  const idx = clips.findIndex((c) => c.id === id)
  if (idx < 0) return false
  clips.splice(idx, 1)
  syncLegacyAudioClip(doc)
  return true
}

export type KyboardDoc = {
  version: 1
  layout: KyboardLayout
  defaults: { panelDurationSec: number }
  sheets: KyboardSheet[]
  panels: KyboardPanel[]
  timeline: {
    videoClips: VideoClip[]
    /** @deprecated kept in sync with audioClips[0] for older readers */
    audioClip: AudioClip | null
    /** A1–A4; one clip per track. Additive vs audioClip. */
    audioClips?: AudioClip[]
  }
}

export function defaultCamera(): { from: CameraKeyframe; to: CameraKeyframe } {
  return {
    from: { x: 0, y: 0, scale: 1 },
    to: { x: 0, y: 0, scale: 1 }
  }
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

export function clampLayout(layout: Partial<KyboardLayout> | null | undefined): KyboardLayout {
  return {
    cols: clampInt(layout?.cols, 1, MAX_SHEET_COLS, 3),
    rows: clampInt(layout?.rows, 1, MAX_SHEET_ROWS, 2),
    panelW: PANEL_W,
    panelH: PANEL_H,
    gutterPx: clampInt(layout?.gutterPx, 0, 200, DEFAULT_GUTTER),
    labelBandPx: clampInt(layout?.labelBandPx, 0, 200, DEFAULT_LABEL_BAND)
  }
}

export function createEmptyKyboard(layout?: Partial<KyboardLayout>): KyboardDoc {
  return {
    version: 1,
    layout: clampLayout(layout),
    defaults: { panelDurationSec: DEFAULT_PANEL_DURATION_SEC },
    sheets: [],
    panels: [],
    timeline: { videoClips: [], audioClip: null, audioClips: [] }
  }
}

export function suggestLayout(count: number, prefer: LayoutPrefer): { cols: number; rows: number } {
  const n = Math.max(1, Math.floor(count))
  let best = { cols: n, rows: 1, score: Number.POSITIVE_INFINITY }
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue
    const rows = n / cols
    const ratio = cols / rows
    const target = prefer === 'landscape' ? 1.5 : 2 / 3
    let score = Math.abs(Math.log(ratio / target))
    if (prefer === 'landscape' && cols < rows) score += 2
    if (prefer === 'portrait' && rows < cols) score += 2
    if (score < best.score) best = { cols, rows, score }
  }
  return { cols: best.cols, rows: best.rows }
}

/** Full stitched sheet pixel size (includes gutters + label bands). */
export function sheetPixelSize(layout: KyboardLayout): { width: number; height: number } {
  const safe = clampLayout(layout)
  const { cols, rows, panelW, panelH, gutterPx, labelBandPx } = safe
  const width = cols * panelW + (cols + 1) * gutterPx
  const height = rows * (labelBandPx + panelH) + (rows + 1) * gutterPx
  return { width, height }
}

/** Content rect for panel at (col,row) zero-based, within the sheet. */
export function panelContentRect(
  layout: KyboardLayout,
  col: number,
  row: number
): { x: number; y: number; w: number; h: number } {
  const { panelW, panelH, gutterPx, labelBandPx } = layout
  const x = gutterPx + col * (panelW + gutterPx)
  const y = gutterPx + row * (labelBandPx + panelH + gutterPx) + labelBandPx
  return { x, y, w: panelW, h: panelH }
}

export function assetsDirForKyboard(kyboardAbsPath: string): string {
  const p = kyboardAbsPath.replace(/\\/g, '/')
  if (p.toLowerCase().endsWith(KYBOARD_EXT)) {
    return kyboardAbsPath.slice(0, -KYBOARD_EXT.length) + '.kyboard.assets'
  }
  return kyboardAbsPath + '.kyboard.assets'
}

export function isKyboardPath(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').toLowerCase().endsWith(KYBOARD_EXT)
}

export function parseKyboard(raw: string): KyboardDoc {
  const data = JSON.parse(raw) as KyboardDoc
  if (!data || data.version !== 1) throw new Error('Unsupported kyboard version')
  if (!data.layout || !data.timeline) throw new Error('Invalid kyboard document')
  const fromArr = Array.isArray(data.timeline.audioClips) ? data.timeline.audioClips : []
  const legacy = data.timeline.audioClip ?? null
  const audioClips = fromArr.length ? fromArr : legacy ? [legacy] : []
  for (const a of audioClips) {
    a.track = clampTrack(a.track)
  }
  return {
    ...createEmptyKyboard(data.layout),
    ...data,
    layout: clampLayout({ ...createEmptyKyboard().layout, ...data.layout }),
    defaults: {
      panelDurationSec: data.defaults?.panelDurationSec ?? DEFAULT_PANEL_DURATION_SEC
    },
    sheets: Array.isArray(data.sheets) ? data.sheets : [],
    panels: Array.isArray(data.panels) ? data.panels : [],
    timeline: {
      videoClips: Array.isArray(data.timeline.videoClips) ? data.timeline.videoClips : [],
      audioClips,
      audioClip: audioClips[0] ?? null
    }
  }
}

export function serializeKyboard(doc: KyboardDoc): string {
  const copy = structuredClone(doc)
  syncLegacyAudioClip(copy)
  return JSON.stringify(copy, null, 2) + '\n'
}

export function interpolateCamera(
  from: CameraKeyframe,
  to: CameraKeyframe,
  t: number
): CameraKeyframe {
  const u = Math.min(1, Math.max(0, t))
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u,
    scale: from.scale + (to.scale - from.scale) * u
  }
}

export function videoTimelineDurationSec(doc: KyboardDoc): number {
  let max = 0
  for (const c of doc.timeline.videoClips) {
    max = Math.max(max, c.start + c.duration)
  }
  return max
}

export function timelineDurationSec(doc: KyboardDoc): number {
  let max = videoTimelineDurationSec(doc)
  for (const a of listAudioClips(doc)) {
    const audioLen = Math.max(0, a.outSec - a.inSec)
    max = Math.max(max, a.start + audioLen)
  }
  return max
}

/** Clip under playhead; at/past the end holds the last clip (no black gap). */
export function findVideoClipAt(clips: VideoClip[], at: number): VideoClip | null {
  if (!clips.length) return null
  const t = Math.max(0, at)
  const sorted = [...clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  for (const c of sorted) {
    if (t >= c.start && t < c.start + c.duration) return c
  }
  const last = sorted[sorted.length - 1]
  if (t >= last.start) return last
  return sorted[0]
}

/**
 * Rewrite starts from the current array order. Does not sort — reorder/insert
 * already put clips in playback order; sorting by the old start would undo that.
 */
export function repackVideoClipStartsMut(clips: VideoClip[]): void {
  let t = 0
  for (const c of clips) {
    c.duration = Math.max(0.1, Number(c.duration) || 0.1)
    c.start = t
    t += c.duration
  }
}

/**
 * Ripple-pack V1 clips: sort by start, clamp duration, recompute contiguous starts.
 * Keeps storyboard clips gapless like a simple NLE ripple edit.
 */
export function packVideoClipsMut(clips: VideoClip[]): void {
  clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  repackVideoClipStartsMut(clips)
}

/**
 * Move a V1 clip to `toIndex` in packed order (0 = first). Durations and camera
 * keys stay on the clip; starts ripple. No-op if index unchanged or clip missing.
 */
export function reorderVideoClipMut(clips: VideoClip[], clipId: string, toIndex: number): boolean {
  packVideoClipsMut(clips)
  const from = clips.findIndex((c) => c.id === clipId)
  if (from < 0 || clips.length < 2) return false
  const before = clips.map((c) => c.id).join('\0')
  const [clip] = clips.splice(from, 1)
  // `toIndex` is the insert index among remaining clips (see videoClipReorderIndex).
  const next = Math.max(0, Math.min(clips.length, Math.floor(toIndex)))
  clips.splice(next, 0, clip)
  repackVideoClipStartsMut(clips)
  return clips.map((c) => c.id).join('\0') !== before
}

/** Insert index among remaining clips from a pointer time on the original V1 layout. */
export function videoClipReorderIndex(
  originClips: VideoClip[],
  clipId: string,
  timeSec: number
): number {
  const sorted = [...originClips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  const from = sorted.findIndex((c) => c.id === clipId)
  if (from < 0) return 0
  const remaining = sorted.filter((c) => c.id !== clipId)
  const t = Math.max(0, timeSec)
  for (let i = 0; i < remaining.length; i++) {
    const c = remaining[i]
    if (t < c.start) return i
    if (t < c.start + c.duration) {
      const before = i
      const after = i + 1
      const leftHalf = t < c.start + c.duration / 2
      // Over a *different* clip: never stay. Adjacent near-edge would otherwise no-op.
      if (leftHalf) return before === from ? after : before
      return after === from ? before : after
    }
  }
  return remaining.length
}

/** Snap a pointer time to the nearest remaining-clip cut (the visible 吸附条). */
export function snapReorderTime(
  originClips: VideoClip[],
  clipId: string,
  timeSec: number,
  threshSec: number
): number {
  const remaining = [...originClips]
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    .filter((c) => c.id !== clipId)
  let best = Math.max(0, timeSec)
  let bestD = Math.max(0, threshSec)
  const consider = (cut: number) => {
    const d = Math.abs(timeSec - cut)
    if (d <= bestD) {
      bestD = d
      best = cut
    }
  }
  consider(0)
  for (const c of remaining) {
    consider(c.start)
    consider(c.start + c.duration)
  }
  return best
}

/** Drop-caret time on the original layout (other clips do not slide during drag). */
export function videoClipReorderCaretSec(
  originClips: VideoClip[],
  clipId: string,
  toIndex: number
): number {
  const remaining = [...originClips]
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    .filter((c) => c.id !== clipId)
  if (remaining.length === 0) return 0
  if (toIndex <= 0) return 0
  if (toIndex >= remaining.length) {
    const last = remaining[remaining.length - 1]
    return last.start + last.duration
  }
  return remaining[toIndex].start
}

/** Insert index among packed clips from a pointer time (midpoint rule). */
export function insertIndexFromTime(clips: VideoClip[], timeSec: number): number {
  const sorted = [...clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  const t = Math.max(0, timeSec)
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]
    if (t < c.start + c.duration / 2) return i
  }
  return sorted.length
}

/** Insert a clip at `atSec` and ripple-pack. Same panelId may appear more than once. */
export function insertVideoClipAtMut(clips: VideoClip[], clip: VideoClip, atSec: number): void {
  packVideoClipsMut(clips)
  const idx = insertIndexFromTime(clips, atSec)
  clips.splice(idx, 0, clip)
  repackVideoClipStartsMut(clips)
}

/** Out-point trim: change duration only; pack ripples later clips. This clip’s start stays put. */
export function trimVideoClipOutMut(clips: VideoClip[], clipId: string, durationSec: number): void {
  const c = clips.find((x) => x.id === clipId)
  if (!c) return
  c.duration = Math.max(0.1, durationSec)
  packVideoClipsMut(clips)
}

/**
 * In-point trim (rolling): move the shared boundary with the previous clip.
 * Keeps this clip’s out-point fixed in time; previous clip absorbs the delta.
 * First clip: only shortens/lengthens duration from the left by changing duration
 * while start remains 0 after pack (out-point moves) — prefer out-handle for first clip.
 */
export function trimVideoClipInMut(clips: VideoClip[], clipId: string, newStartSec: number): void {
  packVideoClipsMut(clips)
  const idx = clips.findIndex((x) => x.id === clipId)
  if (idx < 0) return
  const clip = clips[idx]
  const end = clip.start + clip.duration
  if (idx === 0) {
    // No previous clip: keep start at 0; in-trim ≡ out-trim from the right.
    clip.duration = Math.max(0.1, end - Math.max(0, newStartSec))
    packVideoClipsMut(clips)
    return
  }
  const prev = clips[idx - 1]
  const minStart = prev.start + 0.1
  const maxStart = end - 0.1
  const start = Math.min(maxStart, Math.max(minStart, newStartSec))
  const delta = start - clip.start
  prev.duration = Math.max(0.1, prev.duration + delta)
  clip.duration = Math.max(0.1, end - start)
  packVideoClipsMut(clips)
}

/** Lane display length — content duration + slack so the last clip’s right edge can be dragged. */
export function timelineLaneSec(doc: KyboardDoc, slackSec = 2): number {
  return Math.max(timelineDurationSec(doc) + Math.max(0, slackSec), 0.1)
}

/** Remove a clip and ripple-pack the rest. */
export function removeVideoClipMut(clips: VideoClip[], clipId: string): boolean {
  const idx = clips.findIndex((c) => c.id === clipId)
  if (idx < 0) return false
  clips.splice(idx, 1)
  packVideoClipsMut(clips)
  return true
}

/**
 * Split the clip under `atSec` into two contiguous clips (same panelId + camera).
 * Returns the new right-hand clip id, or null if split is invalid.
 */
export function splitVideoClipAt(
  clips: VideoClip[],
  atSec: number,
  newId: () => string
): string | null {
  packVideoClipsMut(clips)
  const clip = findVideoClipAt(clips, atSec)
  if (!clip) return null
  const local = atSec - clip.start
  if (local < 0.1 || local > clip.duration - 0.1) return null
  const rightDur = clip.duration - local
  const u = clip.duration > 0 ? local / clip.duration : 0
  const mid = cameraAtClip(clip, u)
  const keys = storedCameraKeys(clip)
  const leftKeys = keys
    .filter((k) => k.t <= u + 1e-6)
    .map((k) => ({ ...k, t: u > 1e-6 ? k.t / u : 0 }))
  const rightKeys = keys
    .filter((k) => k.t >= u - 1e-6)
    .map((k) => ({ ...k, t: 1 - u > 1e-6 ? (k.t - u) / (1 - u) : 1 }))
  const origTo = { ...clip.camera.to }
  clip.duration = local
  clip.camera.to = { ...mid }
  clip.camera.keys = undefined
  if (leftKeys.length) writeCameraKeys(clip, leftKeys)
  const right: VideoClip = {
    id: newId(),
    panelId: clip.panelId,
    start: clip.start + local,
    duration: rightDur,
    camera: {
      from: { ...mid },
      to: origTo
    }
  }
  if (rightKeys.length) writeCameraKeys(right, rightKeys)
  const idx = clips.findIndex((c) => c.id === clip.id)
  clips.splice(idx + 1, 0, right)
  packVideoClipsMut(clips)
  return right.id
}

/**
 * Append V1 clips for panels not already on the timeline, in `index` order,
 * after the current program end. Existing clip timing / camera keys are kept.
 */
export function appendPanelClipsMut(
  doc: KyboardDoc,
  panels: KyboardPanel[],
  newId: () => string
): VideoClip[] {
  const have = new Set(doc.timeline.videoClips.map((c) => c.panelId))
  const dur = Math.max(0.1, Number(doc.defaults.panelDurationSec) || DEFAULT_PANEL_DURATION_SEC)
  const sorted = [...panels].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
  const added: VideoClip[] = []
  let t = videoTimelineDurationSec(doc)
  for (const p of sorted) {
    if (have.has(p.id)) continue
    const clip: VideoClip = {
      id: newId(),
      panelId: p.id,
      start: t,
      duration: dur,
      camera: defaultCamera()
    }
    doc.timeline.videoClips.push(clip)
    added.push(clip)
    have.add(p.id)
    t += dur
  }
  return added
}

/** Snap `t` to nearest cut (clip starts/ends) if within thresholdSec. */
export function snapTimeToCuts(
  clips: VideoClip[],
  t: number,
  thresholdSec: number,
  extras: number[] = []
): number {
  const points = new Set<number>([0, ...extras])
  for (const c of clips) {
    points.add(c.start)
    points.add(c.start + c.duration)
  }
  let best = t
  let bestDist = thresholdSec
  points.forEach((p) => {
    const d = Math.abs(p - t)
    if (d <= bestDist) {
      bestDist = d
      best = p
    }
  })
  return best
}
