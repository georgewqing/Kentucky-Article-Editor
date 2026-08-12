import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  asStringArray,
  asStringRecord,
  dumpYamlDoc,
  normRelPath,
  parseYamlDoc
} from './yamlUtil'

export const STORY_STATE_FILE = 'story_state.yaml'

export type StoryChapter = {
  id: string
  sourcePath?: string
  castAppeared: string[]
  castNew: string[]
  propsNew: string[]
  propsAt: Record<string, string>
  dayDelta: number
  locations: string[]
  foreshadowPlanted: string[]
  foreshadowResolved: string[]
  characterStatus: Record<string, string>
  notes: string
}

export type StoryScene = {
  id: string
  chapterId?: string
  sourcePath?: string
  when?: string
  where?: string
  present: string[]
  light?: string
  propsHere: Record<string, string>
  exits: string[]
  notes: string
}

export type StoryStateDoc = {
  version: number
  current: {
    location: string
    dayOffset: number
    props: Record<string, string>
    characterStatus: Record<string, string>
    sceneId?: string
  }
  chapters: StoryChapter[]
  /** M3 additive — may be absent in M1 files */
  scenes?: StoryScene[]
}

export function emptyStoryState(): StoryStateDoc {
  return {
    version: 1,
    current: {
      location: '',
      dayOffset: 0,
      props: {},
      characterStatus: {}
    },
    chapters: []
  }
}

function parseChapter(raw: unknown): StoryChapter | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id || '').trim()
  if (!id) return null
  return {
    id,
    sourcePath: o.sourcePath != null ? String(o.sourcePath) : undefined,
    castAppeared: asStringArray(o.castAppeared),
    castNew: asStringArray(o.castNew),
    propsNew: asStringArray(o.propsNew),
    propsAt: asStringRecord(o.propsAt),
    dayDelta: typeof o.dayDelta === 'number' ? o.dayDelta : Number(o.dayDelta) || 0,
    locations: asStringArray(o.locations),
    foreshadowPlanted: asStringArray(o.foreshadowPlanted),
    foreshadowResolved: asStringArray(o.foreshadowResolved),
    characterStatus: asStringRecord(o.characterStatus),
    notes: o.notes != null ? String(o.notes) : ''
  }
}

function parseScene(raw: unknown): StoryScene | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id || '').trim()
  if (!id) return null
  return {
    id,
    chapterId: o.chapterId != null ? String(o.chapterId) : undefined,
    sourcePath: o.sourcePath != null ? String(o.sourcePath) : undefined,
    when: o.when != null ? String(o.when) : undefined,
    where: o.where != null ? String(o.where) : undefined,
    present: asStringArray(o.present),
    light: o.light != null ? String(o.light) : undefined,
    propsHere: asStringRecord(o.propsHere),
    exits: asStringArray(o.exits),
    notes: o.notes != null ? String(o.notes) : ''
  }
}

export function parseStoryState(text: string): StoryStateDoc {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyStoryState()
  const cur = (raw.current && typeof raw.current === 'object'
    ? (raw.current as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const chapters = Array.isArray(raw.chapters)
    ? (raw.chapters.map(parseChapter).filter(Boolean) as StoryChapter[])
    : []
  const scenes = Array.isArray(raw.scenes)
    ? (raw.scenes.map(parseScene).filter(Boolean) as StoryScene[])
    : undefined
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    current: {
      location: cur.location != null ? String(cur.location) : '',
      dayOffset: typeof cur.dayOffset === 'number' ? cur.dayOffset : Number(cur.dayOffset) || 0,
      props: asStringRecord(cur.props),
      characterStatus: asStringRecord(cur.characterStatus),
      sceneId: cur.sceneId != null ? String(cur.sceneId) : undefined
    },
    chapters,
    scenes
  }
}

export function serializeStoryState(doc: StoryStateDoc): string {
  const out: Record<string, unknown> = {
    version: doc.version || 1,
    current: {
      location: doc.current.location || '',
      dayOffset: doc.current.dayOffset || 0,
      props: doc.current.props || {},
      characterStatus: doc.current.characterStatus || {},
      ...(doc.current.sceneId ? { sceneId: doc.current.sceneId } : {})
    },
    chapters: doc.chapters
  }
  if (doc.scenes && doc.scenes.length) out.scenes = doc.scenes
  return dumpYamlDoc(out)
}

export function loadStoryState(workspaceRoot: string): {
  doc: StoryStateDoc
  exists: boolean
  text: string
} {
  const abs = join(workspaceRoot, STORY_STATE_FILE)
  if (!existsSync(abs)) return { doc: emptyStoryState(), exists: false, text: '' }
  const text = readFileSync(abs, 'utf-8')
  return { doc: parseStoryState(text), exists: true, text }
}

/** Enabled = file exists AND at least one chapter record. */
export function isStoryStateEnabled(doc: StoryStateDoc, exists: boolean): boolean {
  return exists && doc.chapters.length >= 1
}

export function rollupCurrentFromChapter(
  doc: StoryStateDoc,
  chapter: StoryChapter
): StoryStateDoc {
  const props = { ...doc.current.props, ...chapter.propsAt }
  const characterStatus = { ...doc.current.characterStatus, ...chapter.characterStatus }
  const location =
    chapter.locations.length > 0
      ? chapter.locations[chapter.locations.length - 1]
      : doc.current.location
  const dayOffset = doc.current.dayOffset + (chapter.dayDelta || 0)
  return {
    ...doc,
    current: {
      ...doc.current,
      location,
      dayOffset,
      props,
      characterStatus
    }
  }
}

export function upsertChapter(
  doc: StoryStateDoc,
  patch: Partial<StoryChapter> & { id: string },
  opts?: { rollup?: boolean }
): StoryStateDoc {
  const idx = doc.chapters.findIndex((c) => c.id === patch.id)
  const base: StoryChapter =
    idx >= 0
      ? doc.chapters[idx]
      : {
          id: patch.id,
          castAppeared: [],
          castNew: [],
          propsNew: [],
          propsAt: {},
          dayDelta: 0,
          locations: [],
          foreshadowPlanted: [],
          foreshadowResolved: [],
          characterStatus: {},
          notes: ''
        }
  const next: StoryChapter = {
    ...base,
    ...patch,
    id: patch.id,
    castAppeared: patch.castAppeared ?? base.castAppeared,
    castNew: patch.castNew ?? base.castNew,
    propsNew: patch.propsNew ?? base.propsNew,
    propsAt: patch.propsAt ? { ...base.propsAt, ...patch.propsAt } : base.propsAt,
    dayDelta: patch.dayDelta !== undefined ? patch.dayDelta : base.dayDelta,
    locations: patch.locations ?? base.locations,
    foreshadowPlanted: patch.foreshadowPlanted ?? base.foreshadowPlanted,
    foreshadowResolved: patch.foreshadowResolved ?? base.foreshadowResolved,
    characterStatus: patch.characterStatus
      ? { ...base.characterStatus, ...patch.characterStatus }
      : base.characterStatus,
    notes: patch.notes !== undefined ? patch.notes : base.notes,
    sourcePath: patch.sourcePath !== undefined ? patch.sourcePath : base.sourcePath
  }
  const chapters = [...doc.chapters]
  if (idx >= 0) chapters[idx] = next
  else chapters.push(next)
  let out: StoryStateDoc = { ...doc, chapters }
  if (opts?.rollup !== false) out = rollupCurrentFromChapter(out, next)
  return out
}

export function upsertScene(
  doc: StoryStateDoc,
  patch: Partial<StoryScene> & { id: string },
  opts?: { setCurrent?: boolean }
): StoryStateDoc {
  const scenes = [...(doc.scenes || [])]
  const idx = scenes.findIndex((s) => s.id === patch.id)
  const base: StoryScene =
    idx >= 0
      ? scenes[idx]
      : {
          id: patch.id,
          present: [],
          propsHere: {},
          exits: [],
          notes: ''
        }
  const next: StoryScene = {
    ...base,
    ...patch,
    id: patch.id,
    present: patch.present ?? base.present,
    propsHere: patch.propsHere ? { ...base.propsHere, ...patch.propsHere } : base.propsHere,
    exits: patch.exits ?? base.exits,
    notes: patch.notes !== undefined ? patch.notes : base.notes
  }
  if (idx >= 0) scenes[idx] = next
  else scenes.push(next)
  const setCurrent = opts?.setCurrent !== false
  return {
    ...doc,
    scenes,
    current: {
      ...doc.current,
      // setCurrent:false must not move the pointer OR current.location from scene.where
      ...(setCurrent
        ? {
            sceneId: next.id,
            ...(next.where ? { location: next.where } : {})
          }
        : {})
    }
  }
}

export function findChapterBySourcePath(
  doc: StoryStateDoc,
  focusPath: string
): StoryChapter | undefined {
  const n = normRelPath(focusPath)
  return doc.chapters.find((c) => c.sourcePath && normRelPath(c.sourcePath) === n)
}

export function anyChapterHasSourcePath(doc: StoryStateDoc): boolean {
  return doc.chapters.some((c) => Boolean(c.sourcePath && c.sourcePath.trim()))
}

/** Table-only prop consistency: latest chapter propsAt vs rolled current after that chapter. */
export function findPropTableConflicts(doc: StoryStateDoc): Array<{
  chapterId: string
  prop: string
  chapterHolder: string
  currentHolder: string
}> {
  const conflicts: Array<{
    chapterId: string
    prop: string
    chapterHolder: string
    currentHolder: string
  }> = []
  // Rebuild props chronologically and compare each chapter's propsAt to post-chapter state
  const props: Record<string, string> = {}
  for (const ch of doc.chapters) {
    for (const [prop, holder] of Object.entries(ch.propsAt)) {
      if (props[prop] !== undefined && props[prop] !== holder) {
        // Overwriting is intentional for story; conflict = same chapter claims differ from
        // what rollup already had *within* duplicate keys in propsAt (impossible) —
        // instead flag if chapter propsAt disagrees with *final* current after full rollup
        // for chapters that aren't the last writer of that prop.
      }
      props[prop] = holder
    }
  }
  // Compare stored current.props to chronological rollup
  for (const [prop, holder] of Object.entries(props)) {
    const cur = doc.current.props[prop]
    if (cur !== undefined && cur !== holder) {
      conflicts.push({
        chapterId: '(current)',
        prop,
        chapterHolder: holder,
        currentHolder: cur
      })
    }
  }
  // Also: within a single chapter, propsNew listed but missing from propsAt
  for (const ch of doc.chapters) {
    for (const p of ch.propsNew) {
      if (!ch.propsAt[p] && !doc.current.props[p]) {
        conflicts.push({
          chapterId: ch.id,
          prop: p,
          chapterHolder: '(listed in propsNew)',
          currentHolder: '(missing)'
        })
      }
    }
  }
  return conflicts
}

export function sumDayDelta(doc: StoryStateDoc): number {
  return doc.chapters.reduce((s, c) => s + (c.dayDelta || 0), 0)
}
