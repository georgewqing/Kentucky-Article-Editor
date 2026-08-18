import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'fs'
import { dirname, join, basename, resolve } from 'path'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveWorkspacePath, toWorkspaceRel, WorkspacePathError, isDialogReadAllowed, isDialogWriteAllowed } from '../ai/workspacePath'
import {
  type KyboardDoc,
  type KyboardLayout,
  type KyboardPanel,
  sheetPixelSize,
  panelContentRect,
  assetsDirForKyboard,
  clampLayout,
  PANEL_W,
  PANEL_H,
  EXPORT_FPS,
  MAX_EXPORT_DURATION_SEC,
  defaultCamera,
  cameraAtClip,
  listAudioClips
} from '../../shared/kyboardSchema'
import {
  createRgba,
  fillRect,
  strokeRect,
  drawTextLabel,
  encodePng,
  decodePng,
  extractRect,
  scaleNearest
} from './pngUtil'

const execFileAsync = promisify(execFile)

function finiteNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function resolveExportOut(workspaceRoot: string, outAbsPath: string): string {
  try {
    return resolveWorkspacePath(workspaceRoot, outAbsPath)
  } catch {
    if (isDialogWriteAllowed(outAbsPath)) return resolve(outAbsPath)
    throw new WorkspacePathError('Export path not allowed')
  }
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

/** Build blank storyboard sheet RGBA. */
export function renderBlankSheet(layout: KyboardLayout): Buffer {
  const safe = clampLayout(layout)
  const { width, height } = sheetPixelSize(safe)
  const img = createRgba(width, height, [32, 32, 36, 255])
  const { cols, rows, gutterPx, labelBandPx, panelW, panelH } = safe
  let index = 1
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const content = panelContentRect(safe, col, row)
      const labelY = content.y - labelBandPx
      fillRect(img, content.x, labelY, panelW, labelBandPx, [48, 48, 54, 255])
      drawTextLabel(img, `#${index}`, content.x + 8, labelY + Math.max(4, (labelBandPx - 21) / 2), [200, 200, 210, 255], 3)
      fillRect(img, content.x, content.y, panelW, panelH, [228, 228, 232, 255])
      // safe frames ~10% / 5%
      const m10x = panelW * 0.1
      const m10y = panelH * 0.1
      const m5x = panelW * 0.05
      const m5y = panelH * 0.05
      strokeRect(img, content.x + m10x, content.y + m10y, panelW - 2 * m10x, panelH - 2 * m10y, [160, 160, 170, 255], 2)
      strokeRect(img, content.x + m5x, content.y + m5y, panelW - 2 * m5x, panelH - 2 * m5y, [120, 120, 130, 180], 1)
      strokeRect(img, content.x, content.y, panelW, panelH, [90, 90, 100, 255], 2)
      index++
    }
  }
  // draw gutters already as background
  void gutterPx
  return encodePng(img)
}

export async function generateBlankSheet(opts: {
  workspaceRoot: string
  kyboardAbsPath: string
  layout: KyboardLayout
  fileName?: string
  /** Absolute dir inside workspace; default = *.kyboard.assets */
  targetDirAbs?: string
}): Promise<{ ok: true; absPath: string; relPath: string } | { ok: false; error: string }> {
  try {
    const kyboardAbs = resolveWorkspacePath(opts.workspaceRoot, opts.kyboardAbsPath)
    const assets = assetsDirForKyboard(kyboardAbs)
    const dirRaw = (opts.targetDirAbs || '').trim() || assets
    const dir = resolveWorkspacePath(opts.workspaceRoot, dirRaw)
    ensureDir(dir)
    const fallback = `blank_${opts.layout.cols}x${opts.layout.rows}.png`
    let name = (opts.fileName || fallback).trim() || fallback
    name = name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    if (!name.toLowerCase().endsWith('.png')) name += '.png'
    const abs = join(dir, name)
    resolveWorkspacePath(opts.workspaceRoot, abs)
    const png = renderBlankSheet(opts.layout)
    writeFileSync(abs, png)
    return { ok: true, absPath: abs, relPath: toWorkspaceRel(opts.workspaceRoot, abs) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function sanitizePanelStem(raw: string | undefined): string {
  const withoutExt = String(raw || '')
    .trim()
    .replace(/\.[^.\\/]+$/, '')
  const s = withoutExt
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return s.slice(0, 60) || 'sheet'
}

function uniqueNameInDir(dir: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = fileName
  let n = 2
  while (existsSync(join(dir, candidate))) {
    candidate = `${stem}_${n}${ext}`
    n++
  }
  return candidate
}

export async function sliceSheet(opts: {
  workspaceRoot: string
  kyboardAbsPath: string
  sheetImageAbs: string
  layout: KyboardLayout
  sheetId: string
  /** Explorer-facing prefix from the sheet file name, e.g. `blank_3x2` → `blank_3x2_01.png`. */
  nameStem?: string
  forceScale?: boolean
}): Promise<
  | { ok: true; panels: Array<{ id: string; col: number; row: number; index: number; absPath: string; relPath: string }> }
  | { ok: false; error: string; expected?: { width: number; height: number }; actual?: { width: number; height: number } }
> {
  try {
    const workspaceRoot = opts.workspaceRoot
    const sheetAbs = resolveWorkspacePath(workspaceRoot, opts.sheetImageAbs)
    const kyboardAbs = resolveWorkspacePath(workspaceRoot, opts.kyboardAbsPath)
    const assets = assetsDirForKyboard(kyboardAbs)
    ensureDir(assets)
    const layout = clampLayout(opts.layout)
    const expected = sheetPixelSize(layout)
    let img = decodePng(readFileSync(sheetAbs))
    if (img.width !== expected.width || img.height !== expected.height) {
      if (!opts.forceScale) {
        return {
          ok: false,
          error: `Sheet size mismatch: expected ${expected.width}×${expected.height}, got ${img.width}×${img.height}`,
          expected,
          actual: { width: img.width, height: img.height }
        }
      }
      img = scaleNearest(img, expected.width, expected.height)
    }
    const panels: Array<{ id: string; col: number; row: number; index: number; absPath: string; relPath: string }> = []
    const stem = sanitizePanelStem(opts.nameStem || basename(sheetAbs))
    let index = 0
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const rect = panelContentRect(layout, col, row)
        const tile = extractRect(img, rect.x, rect.y, rect.w, rect.h)
        const id = randomUUID()
        const file = uniqueNameInDir(assets, `${stem}_${String(index + 1).padStart(2, '0')}.png`)
        const abs = join(assets, file)
        writeFileSync(abs, encodePng(tile))
        panels.push({
          id,
          col,
          row,
          index,
          absPath: abs,
          relPath: toWorkspaceRel(workspaceRoot, abs)
        })
        index++
      }
    }
    return { ok: true, panels }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function importSheetFile(opts: {
  workspaceRoot: string
  kyboardAbsPath: string
  sourceAbs: string
}): Promise<{ ok: true; absPath: string; relPath: string } | { ok: false; error: string }> {
  try {
    const workspaceRoot = opts.workspaceRoot
    // Source may be outside the workspace (system open dialog).
    const src = resolve(opts.sourceAbs)
    if (!existsSync(src)) return { ok: false, error: 'Source PNG not found' }
    const fromDialog = isDialogReadAllowed(src)
    if (!fromDialog) {
      try {
        resolveWorkspacePath(workspaceRoot, src)
      } catch {
        return { ok: false, error: 'Source PNG not allowed' }
      }
    }
    const kyboardAbs = resolveWorkspacePath(workspaceRoot, opts.kyboardAbsPath)
    const assets = assetsDirForKyboard(kyboardAbs)
    ensureDir(assets)
    const dest = join(assets, `import_${Date.now()}_${basename(src)}`)
    resolveWorkspacePath(workspaceRoot, dest)
    copyFileSync(src, dest)
    return { ok: true, absPath: dest, relPath: toWorkspaceRel(workspaceRoot, dest) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function isRunnableFfmpeg(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ['-version'], { windowsHide: true, timeout: 8000 })
    return true
  } catch {
    return false
  }
}

/**
 * Resolve ffmpeg: KENTUCKY_FFMPEG → packaged extraResources → resources/ffmpeg → common Win paths → PATH.
 */
async function resolveFfmpeg(): Promise<string | null> {
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const local = process.env.LOCALAPPDATA || ''
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || ''
  const candidates: string[] = []
  const envPath = process.env.KENTUCKY_FFMPEG?.trim()
  if (envPath) candidates.push(envPath)
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, 'ffmpeg', binName))
  // electron-vite main bundle lives in out/main → ../../resources/ffmpeg
  candidates.push(join(__dirname, '../../resources/ffmpeg', binName))
  if (process.platform === 'win32') {
    candidates.push(
      join(pf, 'ffmpeg', 'bin', binName),
      join(pf, 'ffmpeg', binName),
      'C:\\ffmpeg\\bin\\' + binName,
      join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', binName),
      join(local, 'Microsoft', 'WinGet', 'Links', binName)
    )
    if (pf86) candidates.push(join(pf86, 'ffmpeg', 'bin', binName))
  }
  const seen = new Set<string>()
  for (const raw of candidates) {
    const p = raw.trim()
    if (!p) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!existsSync(p)) continue
    if (await isRunnableFfmpeg(p)) return p
  }
  if (await isRunnableFfmpeg('ffmpeg')) return 'ffmpeg'
  return null
}

/**
 * Export timeline to MP4 via ffmpeg (PATH / KENTUCKY_FFMPEG / optional ffmpeg-static).
 * Renders frames as PNGs then encodes with optional audio.
 */
export async function exportMp4(opts: {
  workspaceRoot: string
  doc: KyboardDoc
  outAbsPath: string
  onProgress?: (pct: number) => void
}): Promise<{ ok: true; absPath: string } | { ok: false; error: string }> {
  const ffmpeg = await resolveFfmpeg()
  if (!ffmpeg) {
    return { ok: false, error: 'FFMPEG_NOT_FOUND' }
  }
  try {
    const workspaceRoot = opts.workspaceRoot
    const outAbs = resolveExportOut(workspaceRoot, opts.outAbsPath)
    ensureDir(dirname(outAbs))
    const doc = opts.doc
    const clips = [...doc.timeline.videoClips].sort((a, b) => a.start - b.start)
    if (!clips.length) return { ok: false, error: 'No video clips on the timeline' }

    const panelMap = new Map(doc.panels.map((p) => [p.id, p]))
    const tmp = resolveWorkspacePath(workspaceRoot, join('.kentucky', 'storyboard-export', String(Date.now())))
    ensureDir(tmp)

    const duration = Math.max(
      ...clips.map((c) => finiteNum(c.start, 0, 0, MAX_EXPORT_DURATION_SEC) + finiteNum(c.duration, 0.1, 0.01, MAX_EXPORT_DURATION_SEC)),
      0.1
    )
    if (duration > MAX_EXPORT_DURATION_SEC) {
      return { ok: false, error: 'EXPORT_TOO_LONG' }
    }
    const totalFrames = Math.max(1, Math.ceil(duration * EXPORT_FPS))
    opts.onProgress?.(2)

    const panelImg = new Map<string, ReturnType<typeof decodePng>>()
    for (const p of doc.panels) {
      const abs = resolveWorkspacePath(workspaceRoot, p.imageRel)
      if (existsSync(abs)) panelImg.set(p.id, decodePng(readFileSync(abs)))
    }

    try {
      for (let f = 0; f < totalFrames; f++) {
        const t = f / EXPORT_FPS
        const clip = clips.find((c) => t >= c.start && t < c.start + c.duration) || null
        const frame = createRgba(PANEL_W, PANEL_H, [0, 0, 0, 255])
        if (clip) {
          const panel = panelMap.get(clip.panelId)
          const src = panel ? panelImg.get(panel.id) : undefined
          if (src) {
            const localT = clip.duration > 0 ? (t - clip.start) / clip.duration : 0
            const cam = cameraAtClip(clip, localT)
            blitCamera(src, frame, cam.x, cam.y, cam.scale)
          }
        }
        const framePath = join(tmp, `f_${String(f).padStart(6, '0')}.png`)
        writeFileSync(framePath, encodePng(frame))
        if (f % 10 === 0) opts.onProgress?.(2 + Math.floor((f / totalFrames) * 70))
      }

      const pattern = join(tmp, 'f_%06d.png')
      const args = ['-y', '-framerate', String(EXPORT_FPS), '-i', pattern]
      const audios = listAudioClips(doc)
      if (audios.length) {
        const filters: string[] = []
        for (let i = 0; i < audios.length; i++) {
          const audio = audios[i]
          const audioAbs = resolveWorkspacePath(workspaceRoot, audio.audioRel)
          const inSec = finiteNum(audio.inSec, 0, 0, 86400)
          const outSec = finiteNum(audio.outSec, inSec + 0.01, inSec + 0.01, 86400)
          const audioDur = Math.max(0.01, outSec - inSec)
          const fadeIn = finiteNum(audio.fadeInSec, 0, 0, audioDur)
          const fadeOut = finiteNum(audio.fadeOutSec, 0, 0, audioDur)
          const fadeOutStart = Math.max(0, audioDur - fadeOut)
          const delayMs = Math.max(0, Math.round(finiteNum(audio.start, 0, 0, MAX_EXPORT_DURATION_SEC) * 1000))
          args.push('-ss', String(inSec), '-t', String(audioDur), '-i', audioAbs)
          const vol = finiteNum(audio.volume, 1, 0, 2)
          filters.push(
            `[${i + 1}:a]volume=${vol},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut},adelay=${delayMs}|${delayMs}[a${i}]`
          )
        }
        const mixIn = audios.map((_, i) => `[a${i}]`).join('')
        if (audios.length === 1) {
          filters.push('[a0]anull[a]')
        } else {
          filters.push(`${mixIn}amix=inputs=${audios.length}:duration=longest:dropout_transition=0[a]`)
        }
        args.push('-filter_complex', filters.join(';'))
        args.push('-map', '0:v', '-map', '[a]', '-shortest')
      }
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(EXPORT_FPS))
      if (audios.length) args.push('-c:a', 'aac')
      args.push(outAbs)

      await execFileAsync(ffmpeg, args, {
        windowsHide: true,
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024
      })
      opts.onProgress?.(100)
      return { ok: true, absPath: outAbs }
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function blitCamera(
  src: { width: number; height: number; data: Buffer },
  dest: { width: number; height: number; data: Buffer },
  panX: number,
  panY: number,
  scale: number
): void {
  const s = Math.max(0.05, scale)
  // panX/panY in pixels of dest; scale zooms source
  for (let y = 0; y < dest.height; y++) {
    for (let x = 0; x < dest.width; x++) {
      const sx = Math.floor((x - dest.width / 2) / s + src.width / 2 - panX)
      const sy = Math.floor((y - dest.height / 2) / s + src.height / 2 - panY)
      const di = (y * dest.width + x) * 4
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
        dest.data[di] = 0
        dest.data[di + 1] = 0
        dest.data[di + 2] = 0
        dest.data[di + 3] = 255
        continue
      }
      const si = (sy * src.width + sx) * 4
      dest.data[di] = src.data[si]
      dest.data[di + 1] = src.data[si + 1]
      dest.data[di + 2] = src.data[si + 2]
      dest.data[di + 3] = 255
    }
  }
}

export function buildPanelsFromSliceResult(
  sheetId: string,
  panels: Array<{ id: string; col: number; row: number; index: number; relPath: string }>
): KyboardPanel[] {
  return panels.map((p) => ({
    id: p.id,
    sheetId,
    index: p.index,
    col: p.col,
    row: p.row,
    imageRel: p.relPath
  }))
}

export { defaultCamera, WorkspacePathError }
