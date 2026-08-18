import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MousePointer2, Scissors } from 'lucide-react'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { SegmentedControl } from '@/workbench/SegmentedControl'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import {
  type AudioClip,
  type CameraKeyframe,
  type KyboardDoc,
  type LayoutPrefer,
  type VideoClip,
  createEmptyKyboard,
  parseKyboard,
  serializeKyboard,
  suggestLayout,
  sheetPixelSize,
  defaultCamera,
  videoTimelineDurationSec,
  timelineLaneSec,
  findVideoClipAt,
  trimVideoClipInMut,
  trimVideoClipOutMut,
  reorderVideoClipMut,
  videoClipReorderIndex,
  videoClipReorderCaretSec,
  snapReorderTime,
  insertVideoClipAtMut,
  trimAudioClipInMut,
  trimAudioClipOutMut,
  audioMediaDurationSec,
  removeVideoClipMut,
  removeAudioClipMut,
  splitVideoClipAt,
  snapTimeToCuts,
  cameraAtClip,
  storedCameraKeys,
  upsertCameraKeyMut,
  removeCameraKeyMut,
  cameraKeyAt,
  listAudioClips,
  audioOnTrack,
  firstEmptyAudioTrack,
  ensureAudioClipsMut,
  syncLegacyAudioClip,
  MAX_AUDIO_TRACKS,
  PANEL_W,
  PANEL_H
} from '@shared/kyboardSchema'
import {
  FRAME_SEC,
  SNAP_PX,
  TIMELINE_PX_MAX,
  TIMELINE_PX_MIN,
  buildRulerTicks,
  formatTimecode,
  loadMonitorSplit,
  saveMonitorSplit
} from './storyboardTimelineHelpers'
import {
  peekStoryboardJson,
  rememberStoryboardJson,
  setStoryboardLiveFlush
} from './storyboardDocFlush'

const PANEL_DND = 'application/x-kentucky-panel'
const CLIP_REORDER_PX = 8

function panelFileLabel(imageRel: string, fallbackIndex: number): string {
  const base = imageRel.replace(/\\/g, '/').split('/').pop() || ''
  const stem = base.replace(/\.png$/i, '')
  return stem || `#${fallbackIndex + 1}`
}

type Mode = 'sheets' | 'timeline' | 'export'

function kyboardStem(filePath: string, basenameFn: (p: string) => string): string {
  const base = basenameFn(filePath)
  return base.replace(/\.kyboard$/i, '') || 'storyboard'
}

function ensureExt(name: string, ext: '.png' | '.mp4'): string {
  const trimmed = name.trim().replace(/[/\\]/g, '')
  if (!trimmed) return ext === '.png' ? 'storyboard-sheet.png' : 'storyboard.mp4'
  const lower = trimmed.toLowerCase()
  if (lower.endsWith(ext)) return trimmed
  const stripped = trimmed.replace(/\.(png|mp4|jpg|jpeg|webp)$/i, '')
  return `${stripped || 'storyboard'}${ext}`
}

function canvasDeltaToCamera(
  canvas: HTMLCanvasElement,
  dxClient: number,
  dyClient: number,
  scale: number
): CameraKeyframe {
  const rect = canvas.getBoundingClientRect()
  const br = canvas.width / Math.max(1, canvas.height)
  const er = rect.width / Math.max(1, rect.height)
  let dispW = rect.width
  let dispH = rect.height
  if (er > br) {
    dispH = rect.height
    dispW = dispH * br
  } else {
    dispW = rect.width
    dispH = dispW / br
  }
  const dCanvasX = dxClient * (canvas.width / Math.max(1, dispW))
  const dCanvasY = dyClient * (canvas.height / Math.max(1, dispH))
  const s = Math.max(0.05, scale)
  return { x: (-dCanvasX * 2) / s, y: (-dCanvasY * 2) / s, scale: s }
}

function clipLocalT(clip: VideoClip, at: number): number {
  if (clip.duration <= 0) return 0
  return Math.min(1, Math.max(0, (at - clip.start) / clip.duration))
}

function pauseAllAudio(els: Map<string, HTMLAudioElement>): void {
  els.forEach((el) => {
    if (!el.paused) el.pause()
  })
}

function syncAudioClock(
  els: Map<string, HTMLAudioElement>,
  clips: AudioClip[],
  t: number,
  playing: boolean
): void {
  const live = new Set(clips.map((c) => c.id))
  els.forEach((el, id) => {
    if (!live.has(id) && !el.paused) el.pause()
  })
  for (const a of clips) {
    const el = els.get(a.id)
    if (!el?.src) continue
    const audioLen = Math.max(0.01, a.outSec - a.inSec)
    const inRange = playing && t >= a.start && t < a.start + audioLen
    if (!inRange) {
      if (!el.paused) el.pause()
      continue
    }
    const mediaTime = a.inSec + (t - a.start)
    if (el.paused) {
      if (Math.abs(el.currentTime - mediaTime) > 0.35) {
        try {
          el.currentTime = mediaTime
        } catch {
          /* not seekable yet */
        }
      }
      void el.play().catch(() => undefined)
    }
  }
}

export function StoryboardEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const workspacePath = useAppStore((s) => s.workspacePath)
  const showToast = useAppStore((s) => s.showToast)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const saveTab = useAppStore((s) => s.saveTab)
  const platform = getPlatform()

  const [mode, setMode] = useState<Mode>('sheets')
  const [doc, setDoc] = useState<KyboardDoc | null>(null)
  const [panelCount, setPanelCount] = useState(6)
  const [prefer, setPrefer] = useState<LayoutPrefer>('landscape')
  const [busy, setBusy] = useState(false)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [exportPct, setExportPct] = useState<number | null>(null)
  const [exportDir, setExportDir] = useState('')
  const [exportPngName, setExportPngName] = useState('storyboard-sheet.png')
  const [exportMp4Name, setExportMp4Name] = useState('storyboard.mp4')
  const [blankDir, setBlankDir] = useState('')
  const [blankFileName, setBlankFileName] = useState('blank_3x2.png')
  const blankFileNameTouchedRef = useRef(false)
  const blankDirTouchedRef = useRef(false)
  const [bladeMode, setBladeMode] = useState(false)
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null)
  const [clipGhost, setClipGhost] = useState<{
    x: number
    y: number
    w: number
    h: number
    label: string
    thumb?: string
  } | null>(null)
  const [monitorSplit, setMonitorSplit] = useState(loadMonitorSplit)
  const [panelThumbUrls, setPanelThumbUrls] = useState<Record<string, string>>({})
  const [binDropAt, setBinDropAt] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioRelByIdRef = useRef<Map<string, string>>(new Map())
  const camDragRef = useRef<{
    pointerId: number
    lastX: number
    lastY: number
    clipId: string
  } | null>(null)
  const panelUrlCache = useRef<Map<string, string>>(new Map())
  const panelImageCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const playheadRef = useRef(0)
  const monitorHasFrameRef = useRef(false)
  const v1LaneRef = useRef<HTMLDivElement>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const formScrollRef = useRef<HTMLDivElement>(null)
  const userZoomedRef = useRef(false)
  const splitDragRef = useRef<{ startY: number; startRatio: number } | null>(null)
  const playheadDragRef = useRef(false)
  const clipDragRef = useRef<{
    clipId: string
    pointerId: number
    lastIndex: number
    fromIndex: number
    startX: number
    startY: number
    active: boolean
    committed: boolean
    ghostW: number
    ghostH: number
    label: string
    thumb?: string
  } | null>(null)
  const clipDragWinRef = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    key: (e: KeyboardEvent) => void
  } | null>(null)
  const docRef = useRef<KyboardDoc | null>(null)
  const timelinePxPerSecRef = useRef(48)
  const [timelinePxPerSec, setTimelinePxPerSec] = useState(48)
  const edgeDragRef = useRef<{
    kind: 'video' | 'audio'
    clipId: string
    edge: 'in' | 'out'
    originDur: number
    originStart: number
    originIn: number
    originOut: number
    mediaDur: number
    pxPerSec: number
    startX: number
  } | null>(null)
  const reorderMovedRef = useRef(false)

  const path = tab?.path
  docRef.current = doc
  timelinePxPerSecRef.current = timelinePxPerSec
  useOverlayScroll(formScrollRef, 1000, doc ? mode : 'idle')

  useLayoutEffect(() => {
    // Initial fit only when entering timeline without a user zoom preference.
    if (mode !== 'timeline' || edgeDragRef.current || userZoomedRef.current) return
    const lane = timelineScrollRef.current
    if (!lane || !doc) return
    const sec = Math.max(videoTimelineDurationSec(doc), 0.1)
    const fit = (lane.clientWidth - 8) / sec
    const next = Math.max(TIMELINE_PX_MIN, Math.min(TIMELINE_PX_MAX, fit))
    setTimelinePxPerSec(next)
    timelinePxPerSecRef.current = next
  }, [mode, doc?.timeline.videoClips.length])

  // Hide scrollbar: pan timeline with wheel / trackpad (non-passive so preventDefault works).
  useEffect(() => {
    if (mode !== 'timeline') return
    const sc = timelineScrollRef.current
    if (!sc) return
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (dx === 0) return
      e.preventDefault()
      sc.scrollLeft += dx
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => sc.removeEventListener('wheel', onWheel)
  }, [mode, doc?.timeline.audioClips?.length, doc?.timeline.audioClip?.id, doc?.timeline.videoClips.length])

  useEffect(() => {
    if (!path) return
    const stem = kyboardStem(path, platform.basename)
    setExportPngName(`${stem}-sheet.png`)
    setExportMp4Name(`${stem}.mp4`)
    const parent = platform.dirname(path)
    setExportDir((prev) => prev || parent || workspacePath || '')
    const assets = path.replace(/\.kyboard$/i, '.kyboard.assets')
    blankDirTouchedRef.current = false
    blankFileNameTouchedRef.current = false
    setBlankDir(assets)
    setBlankFileName('blank_3x2.png')
    setTimelinePxPerSec(48)
    timelinePxPerSecRef.current = 48
  }, [path, workspacePath, platform])
  useEffect(() => {
    if (!doc || blankFileNameTouchedRef.current) return
    setBlankFileName(`blank_${doc.layout.cols}x${doc.layout.rows}.png`)
  }, [doc?.layout.cols, doc?.layout.rows])

  const markTabDirty = useCallback(() => {
    useAppStore.setState((s) => ({
      tabs: s.tabs.map((tb) => (tb.id === tabId ? { ...tb, dirty: true } : tb))
    }))
  }, [tabId])

  const clearTabDirty = useCallback(() => {
    useAppStore.setState((s) => ({
      tabs: s.tabs.map((tb) => (tb.id === tabId ? { ...tb, dirty: false } : tb))
    }))
  }, [tabId])

  const persistDoc = useCallback(
    (next: KyboardDoc): Promise<void> => {
      if (!path) return Promise.resolve()
      const json = serializeKyboard(next)
      rememberStoryboardJson(tabId, json)
      useAppStore.getState().updateTabContent(tabId, json)
      return platform.writeFile(path, json)
    },
    [path, tabId, platform]
  )

  const load = useCallback(async () => {
    if (!path) return
    try {
      const tabState = useAppStore.getState().tabs.find((x) => x.id === tabId)
      const cached = peekStoryboardJson(tabId)
      const fromDirtyTab =
        tabState?.dirty && tabState.content.trim() ? tabState.content : ''
      const raw = cached || fromDirtyTab || (await platform.readFile(path))
      const parsed = parseKyboard(raw || serializeKyboard(createEmptyKyboard()))
      setDoc(parsed)
      rememberStoryboardJson(tabId, serializeKyboard(parsed))
      setPanelCount(parsed.layout.cols * parsed.layout.rows)
      if (!tabState?.dirty) clearTabDirty()
    } catch {
      const empty = createEmptyKyboard(suggestLayout(6, 'landscape'))
      setDoc(empty)
    }
  }, [path, tabId, platform, clearTabDirty])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setStoryboardLiveFlush(tabId, () => {
      const d = docRef.current
      if (!d) return peekStoryboardJson(tabId)
      const json = serializeKyboard(d)
      rememberStoryboardJson(tabId, json)
      return json
    })
    return () => {
      const stillOpen = useAppStore.getState().tabs.some((x) => x.id === tabId)
      const d = docRef.current
      if (stillOpen && d) void persistDoc(d)
      setStoryboardLiveFlush(tabId, null)
    }
  }, [tabId, path, platform, persistDoc])

  useEffect(() => {
    return () => {
      const L = clipDragWinRef.current
      if (!L) return
      window.removeEventListener('pointermove', L.move, true)
      window.removeEventListener('pointerup', L.up, true)
      window.removeEventListener('pointercancel', L.up, true)
      window.removeEventListener('keydown', L.key, true)
      clipDragWinRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mode === 'timeline') return
    const L = clipDragWinRef.current
    if (L) {
      window.removeEventListener('pointermove', L.move, true)
      window.removeEventListener('pointerup', L.up, true)
      window.removeEventListener('pointercancel', L.up, true)
      window.removeEventListener('keydown', L.key, true)
      clipDragWinRef.current = null
    }
    clipDragRef.current = null
    setDraggingClipId(null)
    setBinDropAt(null)
    setClipGhost(null)
  }, [mode])

  const updateDoc = useCallback(
    (mutator: (d: KyboardDoc) => KyboardDoc, opts?: { persist?: boolean }) => {
      if (!doc || !path) return
      const next = mutator(structuredClone(doc))
      setDoc(next)
      if (opts?.persist === false) {
        markTabDirty()
        return
      }
      persistDoc(next)
    },
    [doc, path, persistDoc, markTabDirty]
  )

  const setClipDuration = useCallback(
    (clipId: string, durationSec: number, persist = true) => {
      if (!path) return
      let committed: KyboardDoc | null = null
      setDoc((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        trimVideoClipOutMut(next.timeline.videoClips, clipId, durationSec)
        docRef.current = next
        committed = next
        return next
      })
      if (!committed) return
      if (persist) persistDoc(committed)
      else markTabDirty()
    },
    [path, persistDoc, markTabDirty]
  )

  const applyClipEdgeTrim = useCallback(
    (
      clipId: string,
      edge: 'in' | 'out',
      originStart: number,
      originDur: number,
      dxPx: number,
      pxPerSec: number,
      persist: boolean
    ) => {
      if (!path) return
      const deltaSec = dxPx / Math.max(pxPerSec, 1)
      let committed: KyboardDoc | null = null
      setDoc((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        if (edge === 'out') {
          let end = originStart + originDur + deltaSec
          const thresh = SNAP_PX / Math.max(pxPerSec, 1)
          end = snapTimeToCuts(
            next.timeline.videoClips.filter((c) => c.id !== clipId),
            end,
            thresh,
            [videoTimelineDurationSec(next)]
          )
          const dur = Math.max(0.1, Math.round((end - originStart) * 10) / 10)
          trimVideoClipOutMut(next.timeline.videoClips, clipId, dur)
        } else {
          let start = originStart + deltaSec
          const thresh = SNAP_PX / Math.max(pxPerSec, 1)
          start = snapTimeToCuts(
            next.timeline.videoClips.filter((c) => c.id !== clipId),
            start,
            thresh
          )
          start = Math.round(start * 10) / 10
          trimVideoClipInMut(next.timeline.videoClips, clipId, start)
        }
        docRef.current = next
        committed = next
        return next
      })
      if (!committed) return
      if (persist) persistDoc(committed)
      else markTabDirty()
    },
    [path, persistDoc, markTabDirty]
  )

  const applyAudioEdgeTrim = useCallback(
    (
      clipId: string,
      edge: 'in' | 'out',
      originStart: number,
      originIn: number,
      originOut: number,
      mediaDur: number,
      dxPx: number,
      pxPerSec: number,
      persist: boolean
    ) => {
      if (!path) return
      const deltaSec = dxPx / Math.max(pxPerSec, 1)
      let committed: KyboardDoc | null = null
      setDoc((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        const clips = ensureAudioClipsMut(next)
        const a = clips.find((c) => c.id === clipId)
        if (!a) return prev
        a.mediaDurationSec = Math.max(mediaDur, a.mediaDurationSec ?? 0, a.outSec)
        a.start = originStart
        a.inSec = originIn
        a.outSec = originOut
        const thresh = SNAP_PX / Math.max(pxPerSec, 1)
        if (edge === 'out') {
          let end = originStart + (originOut - originIn) + deltaSec
          const program = videoTimelineDurationSec(next)
          end = snapTimeToCuts(next.timeline.videoClips, end, thresh, [program])
          trimAudioClipOutMut(a, originIn + (end - originStart))
        } else {
          let start = originStart + deltaSec
          start = snapTimeToCuts(next.timeline.videoClips, start, thresh, [0])
          trimAudioClipInMut(a, originIn + (start - originStart))
        }
        syncLegacyAudioClip(next)
        docRef.current = next
        committed = next
        return next
      })
      if (!committed) return
      if (persist) persistDoc(committed)
      else markTabDirty()
    },
    [path, persistDoc, markTabDirty]
  )

  const seekPlayhead = useCallback(
    (t: number, opts?: { snap?: boolean }) => {
      const d = docRef.current
      const program = d ? Math.max(0.1, videoTimelineDurationSec(d)) : 0.1
      let next = Math.min(program, Math.max(0, t))
      if (opts?.snap && d) {
        const thresh = SNAP_PX / Math.max(timelinePxPerSecRef.current, 1)
        next = snapTimeToCuts(d.timeline.videoClips, next, thresh, [0, program])
      }
      playheadRef.current = next
      setPlayhead(next)
      setPlaying(false)
    },
    []
  )

  const setTimelineZoom = useCallback((next: number, fromUser = true) => {
    const v = Math.max(TIMELINE_PX_MIN, Math.min(TIMELINE_PX_MAX, next))
    timelinePxPerSecRef.current = v
    setTimelinePxPerSec(v)
    if (fromUser) userZoomedRef.current = true
  }, [])

  const fitTimelineZoom = useCallback(() => {
    const lane = timelineScrollRef.current
    const d = docRef.current
    if (!lane || !d) return
    const sec = Math.max(videoTimelineDurationSec(d), 0.1)
    const fit = (lane.clientWidth - 8) / sec
    userZoomedRef.current = false
    setTimelineZoom(fit, false)
  }, [setTimelineZoom])

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId || !path) return
    let committed: KyboardDoc | null = null
    setDoc((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const removedVideo = removeVideoClipMut(next.timeline.videoClips, selectedClipId)
      const removedAudio = removedVideo ? false : removeAudioClipMut(next, selectedClipId)
      if (!removedVideo && !removedAudio) return prev
      docRef.current = next
      committed = next
      return next
    })
    if (committed) persistDoc(committed)
    setSelectedClipId(null)
  }, [selectedClipId, path, persistDoc])

  const splitAtPlayhead = useCallback(() => {
    if (!path) return
    const at = playheadRef.current
    let newId: string | null = null
    let committed: KyboardDoc | null = null
    setDoc((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      newId = splitVideoClipAt(next.timeline.videoClips, at, () => crypto.randomUUID())
      if (!newId) return prev
      docRef.current = next
      committed = next
      return next
    })
    if (committed) persistDoc(committed)
    if (newId) {
      setSelectedClipId(newId)
      setBladeMode(false)
    }
  }, [path, persistDoc])

  const applySuggestedLayout = () => {
    const { cols, rows } = suggestLayout(panelCount, prefer)
    updateDoc((d) => {
      d.layout.cols = cols
      d.layout.rows = rows
      return d
    })
  }

  const sheetSize = useMemo(
    () => (doc ? sheetPixelSize(doc.layout) : { width: 0, height: 0 }),
    [doc]
  )

  const onPickBlankDir = async () => {
    const dir = await platform.openFolder()
    if (!dir) return
    if (
      workspacePath &&
      !dir.replace(/\\/g, '/').toLowerCase().startsWith(workspacePath.replace(/\\/g, '/').toLowerCase())
    ) {
      showToast(t('storyboard.blankDirMustBeInside'))
      return
    }
    setBlankDir(dir)
    blankDirTouchedRef.current = true
  }

  const onGenerateBlank = async () => {
    if (!doc || !path || !workspacePath) return
    const name = ensureExt(blankFileName || `blank_${doc.layout.cols}x${doc.layout.rows}.png`, '.png')
    const dir = blankDir.trim() || path.replace(/\.kyboard$/i, '.kyboard.assets')
    if (
      !dir.replace(/\\/g, '/').toLowerCase().startsWith(workspacePath.replace(/\\/g, '/').toLowerCase())
    ) {
      showToast(t('storyboard.blankDirMustBeInside'))
      return
    }
    setBusy(true)
    try {
      await platform.mkdir(dir)
      const r = (await platform.storyboardGenerateBlank({
        workspaceRoot: workspacePath,
        kyboardAbsPath: path,
        layout: doc.layout,
        fileName: name,
        targetDirAbs: dir
      })) as { ok: boolean; relPath?: string; absPath?: string; error?: string }
      if (!r.ok) {
        showToast(r.error || t('storyboard.failed'))
        return
      }
      setBlankFileName(name)
      setBlankDir(dir)
      blankFileNameTouchedRef.current = true
      blankDirTouchedRef.current = true
      const sheetId = crypto.randomUUID()
      updateDoc((d) => {
        d.sheets.push({ id: sheetId, imageRel: r.relPath!, blank: true })
        return d
      })
      await refreshTree()
      showToast(t('storyboard.blankGeneratedTo', { path: r.absPath || name }))
    } finally {
      setBusy(false)
    }
  }

  const onImportAndSlice = async () => {
    if (!doc || !path || !workspacePath) return
    const src = await platform.openPngDialog()
    if (!src) return
    setBusy(true)
    try {
      const imported = (await platform.storyboardImportSheet({
        workspaceRoot: workspacePath,
        kyboardAbsPath: path,
        sourceAbs: src
      })) as { ok: boolean; absPath?: string; relPath?: string; error?: string }
      if (!imported.ok || !imported.absPath || !imported.relPath) {
        showToast(imported.error || t('storyboard.failed'))
        return
      }
      const sheetId = crypto.randomUUID()
      const runSlice = async (forceScale: boolean) =>
        (await platform.storyboardSliceSheet({
          workspaceRoot: workspacePath,
          kyboardAbsPath: path,
          sheetImageAbs: imported.absPath,
          layout: doc.layout,
          sheetId,
          nameStem: platform.basename(src).replace(/\.[^.]+$/, '') || 'sheet',
          forceScale
        })) as {
          ok: boolean
          error?: string
          expected?: { width: number; height: number }
          actual?: { width: number; height: number }
          panels?: Array<{ id: string; col: number; row: number; index: number; relPath: string }>
        }

      let sliced = await runSlice(false)
      if (!sliced.ok && sliced.expected && sliced.actual) {
        const okForce = window.confirm(
          t('storyboard.forceScaleConfirm', {
            expected: `${sliced.expected.width}×${sliced.expected.height}`,
            actual: `${sliced.actual.width}×${sliced.actual.height}`
          })
        )
        if (!okForce) {
          showToast(sliced.error || t('storyboard.failed'))
          return
        }
        sliced = await runSlice(true)
      }
      if (!sliced.ok) {
        showToast(sliced.error || t('storyboard.failed'))
        return
      }
      updateDoc((d) => {
        d.sheets.push({ id: sheetId, imageRel: imported.relPath!, blank: false })
        for (const p of sliced.panels || []) {
          d.panels.push({
            id: p.id,
            sheetId,
            index: p.index,
            col: p.col,
            row: p.row,
            imageRel: p.relPath
          })
        }
        return d
      })
      showToast(t('storyboard.slicedReady', { count: sliced.panels?.length ?? 0 }))
      setMode('timeline')
    } finally {
      setBusy(false)
    }
  }

  const insertPanelOnTimeline = (panelId: string, atSec: number) => {
    if (!doc) return
    const panel = doc.panels.find((p) => p.id === panelId)
    if (!panel) return
    const dur = Math.max(0.1, Number(doc.defaults.panelDurationSec) || 2)
    const newId = crypto.randomUUID()
    let placedStart = 0
    updateDoc((d) => {
      insertVideoClipAtMut(
        d.timeline.videoClips,
        {
          id: newId,
          panelId,
          start: 0,
          duration: dur,
          camera: defaultCamera()
        },
        atSec
      )
      const placed = d.timeline.videoClips.find((c) => c.id === newId)
      placedStart = placed?.start ?? 0
      docRef.current = d
      return d
    })
    setSelectedClipId(newId)
    playheadRef.current = placedStart
    setPlayhead(placedStart)
  }

  const commitClipReorder = (clipId: string, toIndex: number) => {
    if (!path) return false
    const d = docRef.current
    if (!d || d.timeline.videoClips.length < 2) return false
    const origin = structuredClone(d.timeline.videoClips)
    if (!reorderVideoClipMut(origin, clipId, toIndex)) return false
    let committed: KyboardDoc | null = null
    setDoc((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      next.timeline.videoClips = origin
      docRef.current = next
      committed = next
      return next
    })
    if (committed) persistDoc(committed)
    const placed = origin.find((c) => c.id === clipId)
    if (placed) {
      playheadRef.current = placed.start
      setPlayhead(placed.start)
      setSelectedClipId(clipId)
    }
    return true
  }

  const canvasTimeFromDrag = (clientX: number): number => {
    const canvas = v1LaneRef.current?.querySelector('.storyboard-track-canvas')
    const pps = Math.max(timelinePxPerSecRef.current, 1)
    if (!(canvas instanceof HTMLElement)) return 0
    return (clientX - canvas.getBoundingClientRect().left) / pps
  }

  const updateClipDragIndex = (clientX: number) => {
    const drag = clipDragRef.current
    const d = docRef.current
    if (!drag || !d) return
    const at = canvasTimeFromDrag(clientX)
    const t = snapReorderTime(
      d.timeline.videoClips,
      drag.clipId,
      at,
      SNAP_PX / Math.max(timelinePxPerSecRef.current, 1)
    )
    drag.lastIndex = videoClipReorderIndex(d.timeline.videoClips, drag.clipId, t)
    setBinDropAt(videoClipReorderCaretSec(d.timeline.videoClips, drag.clipId, drag.lastIndex))
    const sc = timelineScrollRef.current
    if (sc) {
      const rect = sc.getBoundingClientRect()
      if (clientX > rect.right - 40) sc.scrollLeft += 18
      else if (clientX < rect.left + 40) sc.scrollLeft -= 18
    }
  }

  const detachClipReorderWin = () => {
    const L = clipDragWinRef.current
    if (!L) return
    window.removeEventListener('pointermove', L.move, true)
    window.removeEventListener('pointerup', L.up, true)
    window.removeEventListener('pointercancel', L.up, true)
    window.removeEventListener('keydown', L.key, true)
    clipDragWinRef.current = null
  }

  const endClipReorder = (commit: boolean) => {
    const drag = clipDragRef.current
    if (!drag || drag.committed) return
    drag.committed = true
    detachClipReorderWin()
    const { clipId, lastIndex, active } = drag
    clipDragRef.current = null
    setDraggingClipId(null)
    setBinDropAt(null)
    setClipGhost(null)
    if (commit && active) commitClipReorder(clipId, lastIndex)
    window.setTimeout(() => {
      reorderMovedRef.current = false
    }, 0)
  }

  const attachClipReorderWin = () => {
    detachClipReorderWin()
    const move = (ev: PointerEvent) => {
      const drag = clipDragRef.current
      if (!drag || drag.committed || ev.pointerId !== drag.pointerId) return
      if (!drag.active) {
        if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < CLIP_REORDER_PX) return
        drag.active = true
        reorderMovedRef.current = true
        setPlaying(false)
        setSelectedClipId(drag.clipId)
        setDraggingClipId(drag.clipId)
      }
      ev.preventDefault()
      updateClipDragIndex(ev.clientX)
      setClipGhost({
        x: ev.clientX - 16,
        y: ev.clientY - 12,
        w: drag.ghostW,
        h: drag.ghostH,
        label: drag.label,
        thumb: drag.thumb
      })
    }
    const up = (ev: PointerEvent) => {
      const drag = clipDragRef.current
      if (!drag || drag.committed || ev.pointerId !== drag.pointerId) return
      if (ev.type === 'pointercancel' && drag.lastIndex === drag.fromIndex) {
        endClipReorder(false)
        return
      }
      if (drag.active) updateClipDragIndex(ev.clientX)
      endClipReorder(true)
    }
    const key = (ev: KeyboardEvent) => {
      const drag = clipDragRef.current
      if (!drag) return
      if (ev.key === 'Escape') {
        ev.preventDefault()
        ev.stopPropagation()
        endClipReorder(false)
        return
      }
      if (!drag.active) return
      if (ev.key === 'Delete' || ev.key === 'Backspace' || ev.code === 'Space') {
        ev.preventDefault()
        ev.stopPropagation()
      }
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('keydown', key, true)
    clipDragWinRef.current = { move, up, key }
  }

  const onV1PanelDragOver = (e: ReactDragEvent<HTMLElement>) => {
    if (clipDragRef.current?.active) return
    const types = [...e.dataTransfer.types]
    if (!types.includes(PANEL_DND)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const at = canvasTimeFromDrag(e.clientX)
    const sc = timelineScrollRef.current
    if (sc) {
      const rect = sc.getBoundingClientRect()
      if (e.clientX > rect.right - 40) sc.scrollLeft += 18
      else if (e.clientX < rect.left + 40) sc.scrollLeft -= 18
    }
    setBinDropAt(at)
  }

  const onV1PanelDrop = (e: ReactDragEvent<HTMLElement>) => {
    if (clipDragRef.current?.active) return
    const types = [...e.dataTransfer.types]
    if (!types.includes(PANEL_DND)) return
    e.preventDefault()
    e.stopPropagation()
    const at = canvasTimeFromDrag(e.clientX)
    setBinDropAt(null)
    const panelId = e.dataTransfer.getData(PANEL_DND)
    if (panelId) insertPanelOnTimeline(panelId, at)
  }

  const onClipReorderPointerDown = (e: ReactPointerEvent<HTMLElement>, clipId: string) => {
    if (e.button !== 0 || bladeMode || e.altKey) return
    const d = docRef.current
    if (!d || d.timeline.videoClips.length < 2) return
    const origin = [...d.timeline.videoClips].sort(
      (a, b) => a.start - b.start || a.id.localeCompare(b.id)
    )
    const from = origin.findIndex((c) => c.id === clipId)
    if (from < 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const panel = d.panels.find((p) => p.id === origin[from]?.panelId)
    clipDragRef.current = {
      clipId,
      pointerId: e.pointerId,
      lastIndex: from,
      fromIndex: from,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      committed: false,
      ghostW: Math.max(48, rect.width),
      ghostH: Math.max(24, rect.height),
      label: panelFileLabel(panel?.imageRel || '', panel?.index ?? 0),
      thumb: panel ? panelThumbUrls[panel.id] : undefined
    }
    attachClipReorderWin()
  }

  const selectedClip = doc?.timeline.videoClips.find((c) => c.id === selectedClipId) || null
  const audioClips = useMemo(() => (doc ? listAudioClips(doc) : []), [doc])
  const selectedAudio = audioClips.find((c) => c.id === selectedClipId) || null
  const audioLoadKey = audioClips.map((a) => `${a.id}:${a.audioRel}`).join('|')
  const audioVolKey = audioClips.map((a) => `${a.id}:${a.volume}`).join('|')
  playheadRef.current = playhead

  const ensurePanelImage = useCallback(
    async (imageRel: string): Promise<HTMLImageElement | null> => {
      const hit = panelImageCache.current.get(imageRel)
      if (hit?.complete && hit.naturalWidth > 0) return hit
      if (!workspacePath) return null
      let url = panelUrlCache.current.get(imageRel)
      if (!url) {
        const abs = platform.joinPath(workspacePath, ...imageRel.split('/'))
        url = await platform.toMediaUrl(abs)
        panelUrlCache.current.set(imageRel, url)
      }
      return await new Promise((resolve) => {
        const existing = panelImageCache.current.get(imageRel)
        if (existing?.complete && existing.naturalWidth > 0) {
          resolve(existing)
          return
        }
        const img = new Image()
        img.onload = () => {
          panelImageCache.current.set(imageRel, img)
          resolve(img)
        }
        img.onerror = () => resolve(null)
        img.src = url!
      })
    },
    [workspacePath, platform]
  )

  const drawMonitor = useCallback(
    (at: number) => {
      const canvas = canvasRef.current
      const d = docRef.current
      if (!canvas || !d) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = PANEL_W / 2
      const h = PANEL_H / 2
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        monitorHasFrameRef.current = false
      }

      const clip = findVideoClipAt(d.timeline.videoClips, at)
      if (!clip) {
        if (!monitorHasFrameRef.current) {
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, w, h)
        }
        return
      }
      const panel = d.panels.find((p) => p.id === clip.panelId)
      if (!panel) return

      const paint = (img: HTMLImageElement) => {
        const localT = clipLocalT(clip, at)
        const cam = cameraAtClip(clip, localT)
        const scale = Math.max(0.05, cam.scale)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, w, h)
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.scale(scale, scale)
        ctx.translate(-cam.x / 2, -cam.y / 2)
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
        ctx.restore()
        monitorHasFrameRef.current = true
      }

      const cached = panelImageCache.current.get(panel.imageRel)
      if (cached?.complete && cached.naturalWidth > 0) {
        paint(cached)
        const sorted = [...d.timeline.videoClips].sort((a, b) => a.start - b.start)
        const idx = sorted.findIndex((c) => c.id === clip.id)
        for (const j of [idx - 1, idx + 1]) {
          const n = sorted[j]
          if (!n) continue
          const p = d.panels.find((x) => x.id === n.panelId)
          if (p) void ensurePanelImage(p.imageRel)
        }
        return
      }
      // Keep last frame while loading — do not clear to black (cut-point flash).
      void ensurePanelImage(panel.imageRel).then((img) => {
        if (!img) return
        if (Math.abs(playheadRef.current - at) < 0.5) drawMonitor(playheadRef.current)
      })
    },
    [ensurePanelImage]
  )

  const camPersistTimerRef = useRef(0)
  const camFullToastAtRef = useRef(0)
  const scheduleCamPersist = useCallback(() => {
    if (!path) return
    window.clearTimeout(camPersistTimerRef.current)
    camPersistTimerRef.current = window.setTimeout(() => {
      const d = docRef.current
      if (!d || !path) return
      persistDoc(d)
    }, 400)
  }, [path, persistDoc])

  const applyLiveCamera = useCallback(
    (mut: (clip: VideoClip, localT: number) => void, persist: 'now' | 'soon') => {
      if (!path) return
      let committed: KyboardDoc | null = null
      setDoc((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        const at = playheadRef.current
        const clip = findVideoClipAt(next.timeline.videoClips, at)
        if (!clip) return prev
        mut(clip, clipLocalT(clip, at))
        docRef.current = next
        committed = next
        return next
      })
      if (!committed) return
      markTabDirty()
      if (persist === 'now') {
        window.clearTimeout(camPersistTimerRef.current)
        persistDoc(committed)
      } else {
        scheduleCamPersist()
      }
      requestAnimationFrame(() => drawMonitor(playheadRef.current))
    },
    [path, persistDoc, markTabDirty, drawMonitor, scheduleCamPersist]
  )

  const warnCamKeysFull = useCallback(() => {
    const now = Date.now()
    if (now - camFullToastAtRef.current < 2000) return
    camFullToastAtRef.current = now
    showToast(t('storyboard.camKeysFull'))
  }, [showToast, t])

  const insertCameraKeyAtPlayhead = useCallback(() => {
    setPlaying(false)
    applyLiveCamera((clip, localT) => {
      const pose = cameraAtClip(clip, localT)
      if (!upsertCameraKeyMut(clip, localT, pose)) warnCamKeysFull()
    }, 'now')
    const d = docRef.current
    if (!d) return
    const clip = findVideoClipAt(d.timeline.videoClips, playheadRef.current)
    if (clip) setSelectedClipId(clip.id)
  }, [applyLiveCamera, warnCamKeysFull])

  const deleteCameraKeyAtPlayhead = useCallback(() => {
    applyLiveCamera((clip, localT) => {
      const hit = cameraKeyAt(clip, localT)
      if (hit) removeCameraKeyMut(clip, hit.t)
    }, 'now')
  }, [applyLiveCamera])

  useEffect(() => {
    if (mode !== 'timeline') return
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      applyLiveCamera((clip, localT) => {
        const cam = cameraAtClip(clip, localT)
        const scale = Math.min(8, Math.max(0.2, cam.scale * Math.exp(-e.deltaY * 0.0015)))
        if (!upsertCameraKeyMut(clip, localT, { ...cam, scale })) warnCamKeysFull()
      }, 'soon')
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [mode, applyLiveCamera, warnCamKeysFull, doc?.timeline.videoClips.length])

  // Clamp playhead when V1 program length shrinks (edge-trim).
  useEffect(() => {
    if (!doc) return
    const program = videoTimelineDurationSec(doc)
    if (program <= 0) return
    if (playheadRef.current > program) {
      playheadRef.current = program
      setPlayhead(program)
    }
  }, [doc])

  // Playback clock — UI playhead throttled; canvas paints every RAF from refs
  useEffect(() => {
    if (!playing || !docRef.current) return
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const tick = (now: number) => {
      const d = docRef.current
      if (!d) {
        setPlaying(false)
        return
      }
      const total = Math.max(0.1, videoTimelineDurationSec(d))
      const dt = (now - last) / 1000
      last = now
      let next = playheadRef.current + dt
      if (next >= total) {
        next = total
        playheadRef.current = next
        setPlayhead(next)
        setPlaying(false)
        drawMonitor(next)
        pauseAllAudio(audioElsRef.current)
        return
      }
      playheadRef.current = next
      drawMonitor(next)
      if (now - lastUi >= 50) {
        lastUi = now
        setPlayhead(next)
      }
      syncAudioClock(audioElsRef.current, listAudioClips(d), next, true)
      raf = requestAnimationFrame(tick)
    }
    for (const c of docRef.current.timeline.videoClips) {
      const p = docRef.current.panels.find((x) => x.id === c.panelId)
      if (p) void ensurePanelImage(p.imageRel)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, drawMonitor, ensurePanelImage])

  // Scrub / pause: paint once per playhead change (not while RAF owns the clock)
  useEffect(() => {
    if (playing) return
    drawMonitor(playhead)
  }, [playing, playhead, doc, drawMonitor])

  // Audio sync — one HTMLAudioElement per clip id; load when audioRel changes
  useEffect(() => {
    const clips = doc ? listAudioClips(doc) : []
    const els = audioElsRef.current
    const rels = audioRelByIdRef.current
    if (!workspacePath || !clips.length) {
      pauseAllAudio(els)
      return
    }
    let cancelled = false
    const liveIds = new Set(clips.map((c) => c.id))
    const stale: string[] = []
    els.forEach((_el, id) => {
      if (!liveIds.has(id)) stale.push(id)
    })
    stale.forEach((id) => {
      const el = els.get(id)
      if (!el) return
      el.pause()
      el.removeAttribute('src')
      el.load()
      els.delete(id)
      rels.delete(id)
    })
    void (async () => {
      for (const a of clips) {
        if (cancelled) return
        let el = els.get(a.id)
        if (!el) {
          el = new Audio()
          el.preload = 'auto'
          els.set(a.id, el)
        }
        el.volume = Math.min(1, Math.max(0, a.volume))
        try {
          if (rels.get(a.id) !== a.audioRel || !el.src) {
            const abs = platform.joinPath(workspacePath, ...a.audioRel.split('/'))
            const url = await platform.toMediaUrl(abs)
            if (cancelled) return
            await new Promise<void>((resolve, reject) => {
              const onReady = () => {
                cleanup()
                resolve()
              }
              const onErr = () => {
                cleanup()
                reject(new Error('audio load failed'))
              }
              const cleanup = () => {
                el!.removeEventListener('canplay', onReady)
                el!.removeEventListener('error', onErr)
              }
              el!.addEventListener('canplay', onReady, { once: true })
              el!.addEventListener('error', onErr, { once: true })
              el!.src = url
              el!.load()
            })
            if (cancelled) return
            rels.set(a.id, a.audioRel)
          }
        } catch {
          rels.delete(a.id)
        }
      }
      if (cancelled) return
      const t = playheadRef.current
      if (playing) syncAudioClock(els, clips, t, true)
      else pauseAllAudio(els)
    })()
    return () => {
      cancelled = true
    }
  }, [playing, workspacePath, platform, audioLoadKey, audioVolKey])

  useEffect(() => {
    if (playing) return
    const clips = doc ? listAudioClips(doc) : []
    const els = audioElsRef.current
    for (const a of clips) {
      const el = els.get(a.id)
      if (!el?.src) continue
      const audioLen = Math.max(0.01, a.outSec - a.inSec)
      const mediaTime = a.inSec + Math.max(0, Math.min(audioLen - 0.05, playhead - a.start))
      if (Math.abs(el.currentTime - mediaTime) > 0.05) {
        try {
          el.currentTime = mediaTime
        } catch {
          /* ignore */
        }
      }
    }
  }, [playhead, playing, audioLoadKey, doc])

  const onPickExportDir = async () => {
    const dir = await platform.openFolder()
    if (dir) setExportDir(dir)
  }

  const resolveExportTarget = async (
    kind: 'png' | 'mp4',
    useSaveAs: boolean
  ): Promise<string | null> => {
    const name = ensureExt(kind === 'png' ? exportPngName : exportMp4Name, kind === 'png' ? '.png' : '.mp4')
    const dir = exportDir.trim() || workspacePath || ''
    const suggested = dir ? platform.joinPath(dir, name) : name
    if (!useSaveAs && dir) {
      if (kind === 'png') setExportPngName(name)
      else setExportMp4Name(name)
      return suggested
    }
    const picked =
      kind === 'png'
        ? await platform.savePngDialog({ defaultPath: suggested })
        : await platform.saveMp4Dialog({ defaultPath: suggested })
    if (!picked) return null
    setExportDir(platform.dirname(picked))
    const base = platform.basename(picked)
    if (kind === 'png') setExportPngName(ensureExt(base, '.png'))
    else setExportMp4Name(ensureExt(base, '.mp4'))
    return picked
  }

  const onExportPngLastBlank = async (useSaveAs = false) => {
    if (!doc || !workspacePath) return
    const sheet = [...doc.sheets].reverse().find((s) => s.blank) || doc.sheets[doc.sheets.length - 1]
    if (!sheet) {
      showToast(t('storyboard.noSheet'))
      return
    }
    const dest = await resolveExportTarget('png', useSaveAs)
    if (!dest) return
    const src = platform.joinPath(workspacePath, ...sheet.imageRel.split('/'))
    try {
      await platform.copyFile(src, dest)
      showToast(t('storyboard.pngExportedTo', { path: dest }))
    } catch {
      showToast(t('storyboard.failed'))
    }
  }

  const onExportMp4 = async (useSaveAs = false) => {
    if (!doc || !path || !workspacePath) return
    const dest = await resolveExportTarget('mp4', useSaveAs)
    if (!dest) return
    let outAbs = dest
    try {
      const assetsGuess = path.replace(/\.kyboard$/i, '.kyboard.assets')
      if (
        !dest.replace(/\\/g, '/').toLowerCase().startsWith(workspacePath.replace(/\\/g, '/').toLowerCase())
      ) {
        const safeName = ensureExt(exportMp4Name, '.mp4').replace(/[^\w.\-]+/g, '_')
        outAbs = platform.joinPath(assetsGuess, `export_${Date.now()}_${safeName}`)
        showToast(t('storyboard.exportInsideWorkspace'))
      }
    } catch {
      /* ignore */
    }
    setExportPct(0)
    const off = platform.onStoryboardExportProgress(({ pct }) => setExportPct(pct))
    setBusy(true)
    try {
      await persistDoc(doc)
      const r = (await platform.storyboardExportMp4({
        workspaceRoot: workspacePath,
        doc,
        outAbsPath: outAbs
      })) as { ok: boolean; error?: string; absPath?: string }
      if (!r.ok) {
        showToast(
          r.error === 'FFMPEG_NOT_FOUND'
            ? t('storyboard.ffmpegNotFound')
            : r.error === 'EXPORT_TOO_LONG'
              ? t('storyboard.exportTooLong')
              : r.error || t('storyboard.failed')
        )
      } else {
        if (outAbs !== dest) {
          try {
            await platform.copyFile(outAbs, dest)
          } catch {
            showToast(t('storyboard.mp4ExportedAssetsOnly', { path: outAbs }))
            return
          }
        }
        showToast(t('storyboard.mp4ExportedTo', { path: dest }))
      }
    } finally {
      off()
      setBusy(false)
      setExportPct(null)
    }
  }

  const onAddBgm = async () => {
    if (!doc || !path || !workspacePath) return
    const track = firstEmptyAudioTrack(doc)
    if (track == null) {
      showToast(t('storyboard.audioTracksFull'))
      return
    }
    const src = await platform.openMp3Dialog()
    if (!src) return
    const assets = path.replace(/\.kyboard$/i, '.kyboard.assets')
    await platform.mkdir(assets)
    const dest = platform.joinPath(assets, `a${track + 1}_${Date.now()}.mp3`)
    await platform.copyFile(src, dest)
    const rel = platform.relativeTo(workspacePath, dest)
    const videoDur = Math.max(0.1, videoTimelineDurationSec(doc))
    let outSec = videoDur
    try {
      const url = await platform.toMediaUrl(dest)
      outSec = await new Promise<number>((resolve) => {
        const probe = new Audio()
        const finish = (v: number) => {
          probe.removeAttribute('src')
          probe.load()
          resolve(v)
        }
        probe.onloadedmetadata = () => {
          const d = Number(probe.duration)
          finish(Number.isFinite(d) && d > 0 ? d : videoDur)
        }
        probe.onerror = () => finish(videoDur)
        probe.src = url
      })
    } catch {
      outSec = videoDur
    }
    const newId = crypto.randomUUID()
    updateDoc((d) => {
      const clips = ensureAudioClipsMut(d)
      clips.push({
        id: newId,
        audioRel: rel,
        start: 0,
        inSec: 0,
        outSec: Math.max(0.1, outSec),
        mediaDurationSec: Math.max(0.1, outSec),
        volume: 1,
        fadeInSec: 0.5,
        fadeOutSec: 0.5,
        track
      })
      syncLegacyAudioClip(d)
      return d
    })
    setSelectedClipId(newId)
    showToast(t('storyboard.bgmAdded'))
  }

  // Panel thumbnails: sheet grid + timeline clips
  useEffect(() => {
    if (!doc || !workspacePath) return
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const p of doc.panels) {
        try {
          let url = panelUrlCache.current.get(p.imageRel)
          if (!url) {
            const abs = platform.joinPath(workspacePath, ...p.imageRel.split('/'))
            url = await platform.toMediaUrl(abs)
            panelUrlCache.current.set(p.imageRel, url)
          }
          next[p.id] = url
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setPanelThumbUrls(next)
    })()
    return () => {
      cancelled = true
    }
  }, [doc?.panels, workspacePath, platform])

  // Fix classic placeholder outSec=60. Fill mediaDurationSec without re-probing long BGM
  // (competing kentucky-file Audio() loads were silencing timeline playback).
  useEffect(() => {
    if (mode !== 'timeline' || !doc || !workspacePath || !path) return
    const clips = listAudioClips(doc)
    if (!clips.length) return
    const classic = clips.filter((a) => a.outSec === 60)
    const missingHint = clips.filter(
      (a) => !(typeof a.mediaDurationSec === 'number' && a.mediaDurationSec > 0) && a.outSec !== 60
    )
    if (!classic.length && !missingHint.length) return

    if (!classic.length && missingHint.length) {
      updateDoc((d) => {
        for (const a of ensureAudioClipsMut(d)) {
          if (!(typeof a.mediaDurationSec === 'number' && a.mediaDurationSec > 0)) {
            a.mediaDurationSec = Math.max(0.1, a.outSec)
          }
        }
        return d
      })
      return
    }

    let cancelled = false
    void (async () => {
      for (const a of classic) {
        if (cancelled) return
        try {
          const abs = platform.joinPath(workspacePath, ...a.audioRel.split('/'))
          const url = await platform.toMediaUrl(abs)
          const probed = await new Promise<number>((resolve) => {
            const probe = new Audio()
            const finish = (v: number) => {
              probe.removeAttribute('src')
              probe.load()
              resolve(v)
            }
            probe.onloadedmetadata = () => {
              const d = Number(probe.duration)
              finish(Number.isFinite(d) && d > 0 ? d : Math.max(a.outSec, 0.1))
            }
            probe.onerror = () => finish(Math.max(a.outSec, 0.1))
            probe.src = url
          })
          if (cancelled) return
          const fixed = Math.max(0.1, probed)
          updateDoc((d) => {
            const clip = ensureAudioClipsMut(d).find((c) => c.id === a.id)
            if (!clip) return d
            clip.mediaDurationSec = Math.max(fixed, clip.outSec)
            if (clip.outSec === 60) clip.outSec = fixed
            syncLegacyAudioClip(d)
            return d
          })
        } catch {
          /* ignore */
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Only when entering timeline / audio id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, audioLoadKey, workspacePath, path])

  // Keyboard: space / arrows / home-end / delete / C blade
  useEffect(() => {
    if (mode !== 'timeline') return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (clipDragRef.current?.active) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelectedClip()
        return
      }
      if ((e.key === 'i' || e.key === 'I' || e.code === 'KeyI') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (e.altKey) deleteCameraKeyAtPlayhead()
        else insertCameraKeyAtPlayhead()
        return
      }
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        setBladeMode(false)
        return
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        if (bladeMode) splitAtPlayhead()
        else setBladeMode(true)
        return
      }
      if (e.key === 'Escape') {
        setBladeMode(false)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        seekPlayhead(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        const d = docRef.current
        seekPlayhead(d ? videoTimelineDurationSec(d) : 0)
        return
      }
      if (e.key === 'ArrowLeft' && !playing) {
        e.preventDefault()
        seekPlayhead(playheadRef.current - FRAME_SEC)
        return
      }
      if (e.key === 'ArrowRight' && !playing) {
        e.preventDefault()
        seekPlayhead(playheadRef.current + FRAME_SEC)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, bladeMode, playing, deleteSelectedClip, splitAtPlayhead, seekPlayhead, insertCameraKeyAtPlayhead, deleteCameraKeyAtPlayhead])

  // Keep playhead visible while playing
  useEffect(() => {
    if (!playing) return
    const sc = timelineScrollRef.current
    if (!sc) return
    const x = playhead * timelinePxPerSec
    const left = sc.scrollLeft
    const right = left + sc.clientWidth
    if (x < left + 40 || x > right - 40) {
      sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.35)
    }
  }, [playing, playhead, timelinePxPerSec])

  if (!tab || !doc) {
    return <div className="editor-empty">{t('editor.noEditor')}</div>
  }

  const programDur = Math.max(0.1, videoTimelineDurationSec(doc))
  const laneSec = timelineLaneSec(doc)
  const sortedClips = [...doc.timeline.videoClips].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id)
  )
  const canvasWidthPx = Math.max(laneSec * timelinePxPerSec, 1)
  const selectedCamLocalT = selectedClip ? clipLocalT(selectedClip, playhead) : 0
  const selectedCamKeys = selectedClip ? storedCameraKeys(selectedClip) : []
  const selectedLiveCam = selectedClip ? cameraAtClip(selectedClip, selectedCamLocalT) : null
  const keyAtPlayhead = selectedClip ? cameraKeyAt(selectedClip, selectedCamLocalT) : undefined
  const canDeleteCamKey = Boolean(keyAtPlayhead)
  const emptyAudioTrack = firstEmptyAudioTrack(doc)
  const sortedPanels = [...doc.panels].sort((a, b) => {
    const sa = doc.sheets.findIndex((s) => s.id === a.sheetId)
    const sb = doc.sheets.findIndex((s) => s.id === b.sheetId)
    if (sa !== sb) return sa - sb
    return a.index - b.index
  })

  const onClipEdgePointerDown = (
    e: ReactPointerEvent<HTMLSpanElement>,
    clipId: string,
    edge: 'in' | 'out'
  ) => {
    if (e.button !== 0) return
    if (!e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    const clip = doc.timeline.videoClips.find((c) => c.id === clipId)
    if (!clip) return
    setSelectedClipId(clipId)
    setPlaying(false)
    const mid = clip.start + Math.max(0, Math.min(clip.duration - 0.01, clip.duration * 0.5))
    playheadRef.current = mid
    setPlayhead(mid)
    const pps = timelinePxPerSecRef.current
    edgeDragRef.current = {
      kind: 'video',
      clipId,
      edge,
      originDur: clip.duration,
      originStart: clip.start,
      originIn: 0,
      originOut: clip.duration,
      mediaDur: clip.duration,
      pxPerSec: pps,
      startX: e.clientX
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.classList.add('is-dragging')
  }

  const onAudioEdgePointerDown = (
    e: ReactPointerEvent<HTMLSpanElement>,
    clipId: string,
    edge: 'in' | 'out'
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const a = listAudioClips(doc).find((c) => c.id === clipId)
    if (!a) return
    setSelectedClipId(a.id)
    setPlaying(false)
    const len = Math.max(0.1, a.outSec - a.inSec)
    const mid = a.start + Math.max(0, Math.min(len - 0.01, len * 0.5))
    playheadRef.current = mid
    setPlayhead(mid)
    const pps = timelinePxPerSecRef.current
    edgeDragRef.current = {
      kind: 'audio',
      clipId: a.id,
      edge,
      originDur: len,
      originStart: a.start,
      originIn: a.inSec,
      originOut: a.outSec,
      mediaDur: audioMediaDurationSec(a),
      pxPerSec: pps,
      startX: e.clientX
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.classList.add('is-dragging')
  }

  const onClipEdgePointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = edgeDragRef.current
    if (!drag) return
    if (e.currentTarget.dataset.clipId !== drag.clipId) return
    if (e.currentTarget.dataset.edge !== drag.edge) return
    const dx = e.clientX - drag.startX
    if (drag.kind === 'audio') {
      applyAudioEdgeTrim(
        drag.clipId,
        drag.edge,
        drag.originStart,
        drag.originIn,
        drag.originOut,
        drag.mediaDur,
        dx,
        drag.pxPerSec,
        false
      )
      return
    }
    applyClipEdgeTrim(
      drag.clipId,
      drag.edge,
      drag.originStart,
      drag.originDur,
      dx,
      drag.pxPerSec,
      false
    )
  }

  const onClipEdgePointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!edgeDragRef.current) return
    edgeDragRef.current = null
    e.currentTarget.classList.remove('is-dragging')
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    const latest = docRef.current
    if (latest && path) persistDoc(latest)
  }


  const onMonitorPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const d = docRef.current
    if (!d) return
    const clip = findVideoClipAt(d.timeline.videoClips, playheadRef.current)
    if (!clip) return
    e.preventDefault()
    setSelectedClipId(clip.id)
    setPlaying(false)
    camDragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      clipId: clip.id
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMonitorPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = camDragRef.current
    const canvas = canvasRef.current
    if (!drag || drag.pointerId !== e.pointerId || !canvas) return
    const dx = e.clientX - drag.lastX
    const dy = e.clientY - drag.lastY
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    applyLiveCamera((clip, localT) => {
      const cam = cameraAtClip(clip, localT)
      const delta = canvasDeltaToCamera(canvas, dx, dy, cam.scale)
      if (
        !upsertCameraKeyMut(clip, localT, {
          x: cam.x + delta.x,
          y: cam.y + delta.y,
          scale: cam.scale
        })
      ) {
        warnCamKeysFull()
      }
    }, 'soon')
  }

  const onMonitorPointerUp = () => {
    if (!camDragRef.current) return
    camDragRef.current = null
    window.clearTimeout(camPersistTimerRef.current)
    const latest = docRef.current
    if (latest && path) persistDoc(latest)
  }

  return (
    <div className="storyboard-editor">
      <div className="storyboard-toolbar">
        <SegmentedControl
          aria-label={t('storyboard.modes')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'sheets', label: t('storyboard.modeSheets') },
            { value: 'timeline', label: t('storyboard.modeTimeline') },
            { value: 'export', label: t('storyboard.modeExport') }
          ]}
        />
        <button
          type="button"
          className="btn-small"
          onClick={() => void saveTab(tabId)}
          title={`${t('menu.save')} (Ctrl+S)`}
        >
          {t('menu.save')}
        </button>
        <div className="storyboard-toolbar-meta">
          {doc.layout.cols}×{doc.layout.rows} · {sheetSize.width}×{sheetSize.height}
          {busy ? ` · ${t('storyboard.busy')}` : ''}
        </div>
      </div>

      {mode === 'sheets' && (
        <div ref={formScrollRef} className="storyboard-pane storyboard-sheets kentucky-overlay-scroll">
          <section className="storyboard-section">
            <div className="storyboard-section-head">
              <h3>{t('storyboard.layoutTitle')}</h3>
              <p className="storyboard-section-desc">{t('storyboard.layoutSectionDesc')}</p>
            </div>
            <div className="storyboard-section-body">
              <div className="storyboard-field-grid storyboard-field-grid--prefs">
                <label className="storyboard-field">
                  <span>{t('storyboard.panelCount')}</span>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={panelCount}
                    onChange={(e) => setPanelCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                <div className="storyboard-field">
                  <span>{t('storyboard.preferLandscape')} / {t('storyboard.preferPortrait')}</span>
                  <SegmentedControl
                    value={prefer}
                    onChange={setPrefer}
                    options={[
                      { value: 'landscape', label: t('storyboard.preferLandscape') },
                      { value: 'portrait', label: t('storyboard.preferPortrait') }
                    ]}
                  />
                </div>
                <button type="button" className="btn" onClick={applySuggestedLayout}>
                  {t('storyboard.applyLayout')}
                </button>
              </div>
              <div className="storyboard-field-grid">
                <label className="storyboard-field">
                  <span>{t('storyboard.cols')}</span>
                  <input
                    type="number"
                    min={1}
                    value={doc.layout.cols}
                    onChange={(e) =>
                      updateDoc((d) => {
                        d.layout.cols = Math.max(1, Number(e.target.value) || 1)
                        return d
                      })
                    }
                  />
                </label>
                <label className="storyboard-field">
                  <span>{t('storyboard.rows')}</span>
                  <input
                    type="number"
                    min={1}
                    value={doc.layout.rows}
                    onChange={(e) =>
                      updateDoc((d) => {
                        d.layout.rows = Math.max(1, Number(e.target.value) || 1)
                        return d
                      })
                    }
                  />
                </label>
                <label className="storyboard-field">
                  <span>{t('storyboard.defaultDuration')}</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={doc.defaults.panelDurationSec}
                    onChange={(e) =>
                      updateDoc((d) => {
                        d.defaults.panelDurationSec = Math.max(0.1, Number(e.target.value) || 2)
                        return d
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="storyboard-section">
            <div className="storyboard-section-head">
              <h3>{t('storyboard.outputSectionTitle')}</h3>
              <p className="storyboard-section-desc">{t('storyboard.outputSectionDesc')}</p>
            </div>
            <div className="storyboard-section-body">
              <div className="storyboard-export-field">
                <label htmlFor="storyboard-blank-dir">{t('storyboard.blankDir')}</label>
                <div className="storyboard-export-path-row">
                  <input
                    id="storyboard-blank-dir"
                    type="text"
                    className="storyboard-export-input"
                    value={blankDir}
                    onChange={(e) => {
                      blankDirTouchedRef.current = true
                      setBlankDir(e.target.value)
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    placeholder={t('storyboard.blankDirPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                  <button type="button" className="btn" onClick={() => void onPickBlankDir()}>
                    {t('storyboard.browseDir')}
                  </button>
                </div>
              </div>
              <div className="storyboard-export-field">
                <label htmlFor="storyboard-blank-name">{t('storyboard.blankFileName')}</label>
                <input
                  id="storyboard-blank-name"
                  type="text"
                  className="storyboard-export-input"
                  value={blankFileName}
                  onChange={(e) => {
                    blankFileNameTouchedRef.current = true
                    setBlankFileName(e.target.value)
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
              <div className="storyboard-path-preview">
                <div className="storyboard-path-preview-row">
                  <span className="storyboard-path-preview-tag">PNG</span>
                  <span className="storyboard-path-preview-path">
                    {blankDir
                      ? platform.joinPath(blankDir, ensureExt(blankFileName || 'blank.png', '.png'))
                      : ensureExt(blankFileName || 'blank.png', '.png')}
                  </span>
                </div>
              </div>
              <div className="storyboard-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onGenerateBlank()}>
                  {t('storyboard.generateBlank')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void onImportAndSlice()}>
                  {t('storyboard.importSlice')}
                </button>
              </div>
            </div>
          </section>

          <section className="storyboard-section">
            <div className="storyboard-section-head">
              <h3>
                {t('storyboard.panels')} ({doc.panels.length})
              </h3>
              <p className="storyboard-section-desc">{t('storyboard.panelsSectionDesc')}</p>
            </div>
            <div className="storyboard-section-body">
              <div
                className="storyboard-panel-grid"
                style={
                  doc.layout.cols > 0
                    ? { gridTemplateColumns: `repeat(${Math.min(doc.layout.cols, 6)}, minmax(0, 1fr))` }
                    : undefined
                }
              >
                {sortedPanels.map((p) => (
                    <div key={p.id} className="storyboard-panel-chip">
                      <div className="storyboard-panel-chip-thumb">
                        {panelThumbUrls[p.id] ? (
                          <img src={panelThumbUrls[p.id]} alt={panelFileLabel(p.imageRel, p.index)} />
                        ) : (
                          <span className="storyboard-panel-chip-placeholder" />
                        )}
                        <span className="storyboard-panel-chip-index">
                          {panelFileLabel(p.imageRel, p.index)}
                        </span>
                      </div>
                      <span className="storyboard-panel-chip-coord">
                        {t('storyboard.panelCoord', { col: p.col + 1, row: p.row + 1 })}
                      </span>
                    </div>
                  ))}
              </div>
              {!doc.panels.length && (
                <p className="storyboard-empty">{t('storyboard.noPanels')}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {mode === 'timeline' && (
        <div className="storyboard-pane storyboard-timeline storyboard-timeline-nle">
          <div className="storyboard-transport-bar">
            <div className="storyboard-transport-controls">
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.toStart')}
                onClick={() => seekPlayhead(0)}
              >
                {t('storyboard.toStartShort')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.stepBack')}
                onClick={() => seekPlayhead(playheadRef.current - FRAME_SEC)}
              >
                {t('storyboard.stepBackShort')}
              </button>
              <button type="button" className="btn btn-small btn-primary" onClick={() => setPlaying((p) => !p)}>
                {playing ? t('storyboard.pause') : t('storyboard.play')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.stepForward')}
                onClick={() => seekPlayhead(playheadRef.current + FRAME_SEC)}
              >
                {t('storyboard.stepForwardShort')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.toEnd')}
                onClick={() => seekPlayhead(programDur)}
              >
                {t('storyboard.toEndShort')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.camInsertKeyTitle')}
                onClick={() => insertCameraKeyAtPlayhead()}
              >
                {t('storyboard.camInsertKey')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                title={t('storyboard.deleteClip')}
                disabled={!selectedClipId}
                onClick={() => deleteSelectedClip()}
              >
                {t('storyboard.delete')}
              </button>
            </div>
            <span className="storyboard-timecode storyboard-timecode-lg">
              {formatTimecode(playhead)} / {formatTimecode(programDur)}
            </span>
            <div className="storyboard-zoom-controls">
              <button type="button" className="btn btn-small" onClick={() => setTimelineZoom(timelinePxPerSec / 1.25)}>
                −
              </button>
              <button type="button" className="btn btn-small" onClick={() => fitTimelineZoom()}>
                {t('storyboard.zoomFit')}
              </button>
              <button type="button" className="btn btn-small" onClick={() => setTimelineZoom(timelinePxPerSec * 1.25)}>
                +
              </button>
            </div>
          </div>

          <div
            className="storyboard-nle-body"
            style={{
              gridTemplateRows: `minmax(0, ${monitorSplit}fr) 6px minmax(220px, ${1 - monitorSplit}fr)`
            }}
          >
            <div className="storyboard-monitor-row">
              <div className="storyboard-nle-tools" role="toolbar" aria-label={t('storyboard.timelineTools')}>
                <button
                  type="button"
                  className={`storyboard-nle-tool${!bladeMode ? ' is-active' : ''}`}
                  title={t('storyboard.selectTool')}
                  aria-pressed={!bladeMode}
                  onClick={() => setBladeMode(false)}
                >
                  <MousePointer2 size={16} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`storyboard-nle-tool${bladeMode ? ' is-active' : ''}`}
                  title={t('storyboard.bladeTool')}
                  aria-pressed={bladeMode}
                  onClick={() => setBladeMode((on) => !on)}
                >
                  <Scissors size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <div className="storyboard-monitor">
                <div className="storyboard-monitor-frame">
                  <canvas
                    ref={canvasRef}
                    className="storyboard-monitor-canvas"
                    onPointerDown={onMonitorPointerDown}
                    onPointerMove={onMonitorPointerMove}
                    onPointerUp={onMonitorPointerUp}
                    onPointerCancel={onMonitorPointerUp}
                  />
                  <div className="storyboard-monitor-tc">{formatTimecode(playhead)}</div>
                </div>
              </div>
              <div className="storyboard-inspector">
                <h3>
                  {t('storyboard.inspector')}
                  {selectedClip
                    ? ` · ${panelFileLabel(
                        doc.panels.find((p) => p.id === selectedClip.panelId)?.imageRel || '',
                        doc.panels.find((p) => p.id === selectedClip.panelId)?.index ?? 0
                      )} · ${selectedClip.duration.toFixed(1)}s`
                    : selectedAudio
                      ? ` · A${(selectedAudio.track ?? 0) + 1}`
                      : ''}
                </h3>
                <div className="storyboard-inspector-block storyboard-panel-bin">
                  <div className="storyboard-panel-bin-head">
                    <span className="storyboard-sheet-bar-title">{t('storyboard.panelBin')}</span>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() => void onImportAndSlice()}
                    >
                      {t('storyboard.importSlice')}
                    </button>
                  </div>
                  <p className="storyboard-sheet-bar-hint">{t('storyboard.panelBinHint')}</p>
                  <div className="storyboard-panel-bin-grid">
                    {sortedPanels.map((p) => {
                      const label = panelFileLabel(p.imageRel, p.index)
                      const thumb = panelThumbUrls[p.id]
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="storyboard-bin-thumb"
                          draggable
                          title={t('storyboard.panelBinDrag', { name: label })}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(PANEL_DND, p.id)
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                        >
                          {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="storyboard-panel-chip-placeholder" />}
                          <span>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                  {!sortedPanels.length ? (
                    <p className="storyboard-muted">{t('storyboard.noPanels')}</p>
                  ) : null}
                </div>
                {selectedClip ? (
                  <div className="storyboard-inspector-block">
                    <label>
                      {t('storyboard.clipDuration')}
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={selectedClip.duration}
                        onChange={(e) => {
                          const v = Math.max(0.1, Number(e.target.value) || 0.1)
                          setClipDuration(selectedClip.id, v, true)
                        }}
                      />
                    </label>
                    {selectedLiveCam && (
                      <p className="storyboard-cam-live">
                        {t('storyboard.camLive', {
                          s: selectedLiveCam.scale.toFixed(2),
                          x: Math.round(selectedLiveCam.x),
                          y: Math.round(selectedLiveCam.y)
                        })}
                      </p>
                    )}
                    <div className="storyboard-cam-key-actions">
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        title={t('storyboard.camInsertKeyTitle')}
                        onClick={() => insertCameraKeyAtPlayhead()}
                      >
                        {t('storyboard.camInsertKey')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        title={t('storyboard.camDeleteKeyTitle')}
                        disabled={!canDeleteCamKey}
                        onClick={() => deleteCameraKeyAtPlayhead()}
                      >
                        {t('storyboard.camDeleteKey')}
                      </button>
                    </div>
                    <div className="storyboard-cam-key-strip" role="list">
                      {selectedCamKeys.map((k) => (
                        <button
                          key={`${k.t}`}
                          type="button"
                          role="listitem"
                          className={`storyboard-cam-key-chip${keyAtPlayhead && Math.abs(keyAtPlayhead.t - k.t) < 0.01 ? ' is-near' : ''}`}
                          onClick={() => seekPlayhead(selectedClip.start + k.t * selectedClip.duration)}
                        >
                          {Math.round(k.t * 100)}%
                        </button>
                      ))}
                    </div>
                    <p className="storyboard-sheet-bar-hint">{t('storyboard.camKeyHint')}</p>
                  </div>
                ) : selectedAudio ? null : (
                  <p className="storyboard-inspector-empty">{t('storyboard.selectClipHint')}</p>
                )}
                {selectedAudio && (
                  <div className="storyboard-inspector-block storyboard-audio-insp">
                    <h4>
                      {t('storyboard.audioTrackN', { n: (selectedAudio.track ?? 0) + 1 })}
                    </h4>
                    <label>
                      {t('storyboard.volume')}
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedAudio.volume}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.volume = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <label>
                      {t('storyboard.audioStart')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedAudio.start}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0)
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.start = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <label>
                      {t('storyboard.audioIn')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedAudio.inSec}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.inSec = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <label>
                      {t('storyboard.audioOut')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedAudio.outSec}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.outSec = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <label>
                      {t('storyboard.fadeIn')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedAudio.fadeInSec}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0)
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.fadeInSec = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <label>
                      {t('storyboard.fadeOut')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedAudio.fadeOutSec}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0)
                          const id = selectedAudio.id
                          updateDoc((d) => {
                            const a = ensureAudioClipsMut(d).find((c) => c.id === id)
                            if (a) a.fadeOutSec = v
                            syncLegacyAudioClip(d)
                            return d
                          })
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        const id = selectedAudio.id
                        updateDoc((d) => {
                          removeAudioClipMut(d, id)
                          return d
                        })
                        setSelectedClipId(null)
                      }}
                    >
                      {t('storyboard.removeBgm')}
                    </button>
                  </div>
                )}
                {emptyAudioTrack != null && (
                  <div className="storyboard-inspector-block">
                    <button type="button" className="btn btn-small" onClick={() => void onAddBgm()}>
                      {t('storyboard.addBgm')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className="storyboard-split-handle"
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={(e) => {
                e.preventDefault()
                splitDragRef.current = { startY: e.clientY, startRatio: monitorSplit }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const drag = splitDragRef.current
                if (!drag || !e.currentTarget.hasPointerCapture(e.pointerId)) return
                const body = e.currentTarget.parentElement
                if (!body) return
                const dy = e.clientY - drag.startY
                const next = Math.min(0.75, Math.max(0.28, drag.startRatio + dy / body.clientHeight))
                setMonitorSplit(next)
                saveMonitorSplit(next)
              }}
              onPointerUp={(e) => {
                splitDragRef.current = null
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                } catch {
                  /* ignore */
                }
              }}
            />

            <div className="storyboard-timeline-dock">
              <div
                className="storyboard-timeline-scroll"
                ref={timelineScrollRef}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedClipId(null)
                }}
              >
                <div className="storyboard-timeline-inner" style={{ width: canvasWidthPx }}>
                  <div
                    className="storyboard-ruler"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      playheadDragRef.current = true
                      e.currentTarget.setPointerCapture(e.pointerId)
                      const rect = e.currentTarget.getBoundingClientRect()
                      const sc = timelineScrollRef.current
                      const x = e.clientX - rect.left + (sc?.scrollLeft || 0)
                      seekPlayhead(x / timelinePxPerSec, { snap: true })
                    }}
                    onPointerMove={(e) => {
                      if (!playheadDragRef.current) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const sc = timelineScrollRef.current
                      const x = e.clientX - rect.left + (sc?.scrollLeft || 0)
                      seekPlayhead(x / timelinePxPerSec, { snap: true })
                    }}
                    onPointerUp={() => {
                      playheadDragRef.current = false
                    }}
                  >
                    {buildRulerTicks(laneSec, timelinePxPerSec).map((tick) => (
                      <div
                        key={tick.t}
                        className={`storyboard-ruler-tick${tick.major ? ' is-major' : ''}`}
                        style={{ left: tick.t * timelinePxPerSec }}
                      >
                        {tick.major && tick.label ? <span>{tick.label}</span> : null}
                      </div>
                    ))}
                  </div>

                  <div className="storyboard-tracks">
                    <div className="storyboard-track-label">V1</div>
                    <div
                      className={`storyboard-track-lane storyboard-track-v1${bladeMode ? ' is-blade' : ''}${
                        binDropAt != null ? ' is-bin-drop' : ''
                      }${draggingClipId ? ' is-clip-reorder' : ''}`}
                      ref={v1LaneRef}
                      onDragOver={onV1PanelDragOver}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setBinDropAt(null)
                      }}
                      onDrop={onV1PanelDrop}
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          if (bladeMode) splitAtPlayhead()
                          else setSelectedClipId(null)
                        }
                      }}
                    >
                      <div
                        className="storyboard-track-canvas"
                        style={{ width: canvasWidthPx }}
                        onDragOver={onV1PanelDragOver}
                        onDrop={onV1PanelDrop}
                      >
                        {binDropAt != null ? (
                          <div
                            className="storyboard-bin-drop-caret"
                            style={{
                              left: Math.max(0, binDropAt) * timelinePxPerSec
                            }}
                          />
                        ) : null}
                        {sortedClips.map((c, clipIndex) => {
                          const lifting = draggingClipId === c.id
                          const left = c.start * timelinePxPerSec
                          const width = Math.max(c.duration * timelinePxPerSec, 12)
                          const panel = doc.panels.find((p) => p.id === c.panelId)
                          const thumb = panel ? panelThumbUrls[panel.id] : undefined
                          return (
                            <div
                              key={c.id}
                              className={`storyboard-clip${c.id === selectedClipId ? ' active' : ''}${
                                lifting ? ' is-reorder-source' : ''
                              }`}
                              style={{ left, width }}
                              draggable={false}
                              onPointerDown={(e) => onClipReorderPointerDown(e, c.id)}
                              onDragStart={(e) => e.preventDefault()}
                              onDragOver={onV1PanelDragOver}
                              onDrop={onV1PanelDrop}
                            >
                              {thumb ? (
                                <div
                                  className="storyboard-clip-thumb"
                                  style={{ backgroundImage: `url(${thumb})` }}
                                />
                              ) : null}
                              <div
                                role="button"
                                tabIndex={0}
                                className="storyboard-clip-hit"
                                data-clip-id={c.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (reorderMovedRef.current) {
                                    reorderMovedRef.current = false
                                    return
                                  }
                                  if (bladeMode) {
                                    seekPlayhead(c.start + c.duration * 0.5)
                                    // split uses playheadRef — set then split on next tick
                                    playheadRef.current = c.start + c.duration * 0.5
                                    splitAtPlayhead()
                                    return
                                  }
                                  setSelectedClipId(c.id)
                                }}
                                title={t('storyboard.clipReorder')}
                              >
                                {panelFileLabel(panel?.imageRel || '', panel?.index ?? 0)}
                                <span className="storyboard-clip-dur">{c.duration.toFixed(1)}s</span>
                              </div>
                              {storedCameraKeys(c).map((k) => (
                                <button
                                  key={`k-${k.t}`}
                                  type="button"
                                  className={`storyboard-clip-camkey${
                                    c.id === selectedClipId &&
                                    Math.abs(clipLocalT(c, playhead) - k.t) < 0.015
                                      ? ' is-on'
                                      : ''
                                  }`}
                                  style={{ left: `${k.t * 100}%` }}
                                  title={`${Math.round(k.t * 100)}%`}
                                  onPointerDown={(e) => {
                                    e.stopPropagation()
                                    setSelectedClipId(c.id)
                                    seekPlayhead(c.start + k.t * c.duration)
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                  }}
                                />
                              ))}
                              {clipIndex > 0 && (
                                <span
                                  className="storyboard-clip-edge is-in"
                                  data-clip-id={c.id}
                                  data-edge="in"
                                  role="slider"
                                  tabIndex={0}
                                  aria-label={t('storyboard.clipEdgeIn')}
                                  title={t('storyboard.clipEdgeIn')}
                                  onPointerDown={(e) => onClipEdgePointerDown(e, c.id, 'in')}
                                  onPointerMove={onClipEdgePointerMove}
                                  onPointerUp={onClipEdgePointerUp}
                                  onPointerCancel={onClipEdgePointerUp}
                                />
                              )}
                              <span
                                className="storyboard-clip-edge is-out"
                                data-clip-id={c.id}
                                data-edge="out"
                                role="slider"
                                tabIndex={0}
                                aria-label={t('storyboard.clipEdgeOut')}
                                title={t('storyboard.clipEdgeOut')}
                                onPointerDown={(e) => onClipEdgePointerDown(e, c.id, 'out')}
                                onPointerMove={onClipEdgePointerMove}
                                onPointerUp={onClipEdgePointerUp}
                                onPointerCancel={onClipEdgePointerUp}
                              />
                            </div>
                          )
                        })}
                        {!sortedClips.length && (
                          <span className="storyboard-muted">{t('storyboard.emptyTimeline')}</span>
                        )}
                      </div>
                    </div>
                    {Array.from({ length: MAX_AUDIO_TRACKS }, (_, track) => {
                      const clip = audioOnTrack(doc, track)
                      return (
                        <Fragment key={`a${track}`}>
                          <div className="storyboard-track-label">{`A${track + 1}`}</div>
                          <div className="storyboard-track-lane storyboard-track-audio">
                            <div className="storyboard-track-canvas" style={{ width: canvasWidthPx }}>
                              {clip ? (
                                <div
                                  className={`storyboard-clip audio${selectedClipId === clip.id ? ' active' : ''}`}
                                  style={{
                                    left: clip.start * timelinePxPerSec,
                                    width:
                                      Math.max(0.1, clip.outSec - clip.inSec) * timelinePxPerSec
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedClipId(clip.id)
                                  }}
                                >
                                  <span
                                    className="storyboard-clip-edge is-in"
                                    data-clip-id={clip.id}
                                    data-edge="in"
                                    onPointerDown={(e) => onAudioEdgePointerDown(e, clip.id, 'in')}
                                    onPointerMove={onClipEdgePointerMove}
                                    onPointerUp={onClipEdgePointerUp}
                                    onPointerCancel={onClipEdgePointerUp}
                                  />
                                  <span className="storyboard-clip-hit">
                                    A{track + 1} · {(clip.outSec - clip.inSec).toFixed(1)}s
                                  </span>
                                  <span
                                    className="storyboard-clip-edge is-out"
                                    data-clip-id={clip.id}
                                    data-edge="out"
                                    onPointerDown={(e) => onAudioEdgePointerDown(e, clip.id, 'out')}
                                    onPointerMove={onClipEdgePointerMove}
                                    onPointerUp={onClipEdgePointerUp}
                                    onPointerCancel={onClipEdgePointerUp}
                                  />
                                </div>
                              ) : emptyAudioTrack === track ? (
                                <button type="button" className="btn btn-small" onClick={() => void onAddBgm()}>
                                  {t('storyboard.addBgm')}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>

                  <div
                    className="storyboard-playhead"
                    style={{ left: playhead * timelinePxPerSec }}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      playheadDragRef.current = true
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={(e) => {
                      if (!playheadDragRef.current) return
                      const sc = timelineScrollRef.current
                      if (!sc) return
                      const rect = sc.getBoundingClientRect()
                      const x = e.clientX - rect.left + sc.scrollLeft
                      seekPlayhead(x / timelinePxPerSec, { snap: true })
                    }}
                    onPointerUp={() => {
                      playheadDragRef.current = false
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'export' && (
        <div ref={formScrollRef} className="storyboard-pane storyboard-export kentucky-overlay-scroll">
          <section className="storyboard-section">
            <div className="storyboard-section-head">
              <h3>{t('storyboard.exportTitle')}</h3>
              <p className="storyboard-section-desc">{t('storyboard.exportSectionDesc')}</p>
            </div>
            <div className="storyboard-section-body">
              <div className="storyboard-export-field">
                <label htmlFor="storyboard-export-dir">{t('storyboard.exportDir')}</label>
                <div className="storyboard-export-path-row">
                  <input
                    id="storyboard-export-dir"
                    type="text"
                    className="storyboard-export-input"
                    value={exportDir}
                    onChange={(e) => setExportDir(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={workspacePath || t('storyboard.exportDirPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button type="button" className="btn" onClick={() => void onPickExportDir()}>
                    {t('storyboard.browseDir')}
                  </button>
                </div>
              </div>

              <div className="storyboard-field-grid">
                <div className="storyboard-export-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="storyboard-export-png-name">{t('storyboard.exportPngName')}</label>
                  <input
                    id="storyboard-export-png-name"
                    type="text"
                    className="storyboard-export-input"
                    value={exportPngName}
                    onChange={(e) => setExportPngName(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="storyboard-export-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="storyboard-export-mp4-name">{t('storyboard.exportMp4Name')}</label>
                  <input
                    id="storyboard-export-mp4-name"
                    type="text"
                    className="storyboard-export-input"
                    value={exportMp4Name}
                    onChange={(e) => setExportMp4Name(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="storyboard-path-preview">
                <div className="storyboard-path-preview-row">
                  <span className="storyboard-path-preview-tag">{t('storyboard.exportPreviewTagPng')}</span>
                  <span className="storyboard-path-preview-path">
                    {exportDir
                      ? platform.joinPath(exportDir, ensureExt(exportPngName, '.png'))
                      : ensureExt(exportPngName, '.png')}
                  </span>
                </div>
                <div className="storyboard-path-preview-row">
                  <span className="storyboard-path-preview-tag">{t('storyboard.exportPreviewTagMp4')}</span>
                  <span className="storyboard-path-preview-path">
                    {exportDir
                      ? platform.joinPath(exportDir, ensureExt(exportMp4Name, '.mp4'))
                      : ensureExt(exportMp4Name, '.mp4')}
                  </span>
                </div>
              </div>

              <div className="storyboard-actions storyboard-actions--split">
                <div className="storyboard-actions-primary">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !exportDir.trim()}
                    onClick={() => void onExportMp4(false)}
                  >
                    {t('storyboard.exportMp4')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !exportDir.trim()}
                    onClick={() => void onExportPngLastBlank(false)}
                  >
                    {t('storyboard.exportPng')}
                  </button>
                </div>
                <div className="storyboard-actions-secondary">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() => void onExportPngLastBlank(true)}
                  >
                    {t('storyboard.exportPngSaveAs')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() => void onExportMp4(true)}
                  >
                    {t('storyboard.exportMp4SaveAs')}
                  </button>
                  {emptyAudioTrack != null && (
                    <button type="button" className="btn btn-small" onClick={() => void onAddBgm()}>
                      {t('storyboard.addBgm')}
                    </button>
                  )}
                </div>
              </div>
              {exportPct != null && (
                <div className="storyboard-progress">
                  <div className="storyboard-progress-bar" style={{ width: `${exportPct}%` }} />
                  <span>{exportPct}%</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {clipGhost ? (
        <div
          className="storyboard-clip storyboard-clip-reorder-ghost"
          style={{
            left: clipGhost.x,
            top: clipGhost.y,
            width: clipGhost.w,
            height: clipGhost.h
          }}
        >
          {clipGhost.thumb ? (
            <div
              className="storyboard-clip-thumb"
              style={{ backgroundImage: `url(${clipGhost.thumb})` }}
            />
          ) : null}
          <div className="storyboard-clip-hit">{clipGhost.label}</div>
        </div>
      ) : null}
    </div>
  )
}
