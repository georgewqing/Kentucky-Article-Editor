import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { dumpYamlDoc, parseYamlDoc } from './yamlUtil'
import type { StoryStateDoc } from './storyState'

export const FORESHADOW_FILE = 'foreshadow.yaml'

export type ForeshadowStatus = 'open' | 'resolved' | 'dropped'

export type ForeshadowItem = {
  id: string
  title: string
  plantedIn?: string
  plantNote?: string
  dueBy?: string | null
  resolvedIn?: string | null
  status: ForeshadowStatus
}

export type ForeshadowDoc = {
  version: number
  items: ForeshadowItem[]
}

export function emptyForeshadow(): ForeshadowDoc {
  return { version: 1, items: [] }
}

function parseItem(raw: unknown): ForeshadowItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id || '').trim()
  if (!id) return null
  const st = String(o.status || 'open')
  const status: ForeshadowStatus =
    st === 'resolved' || st === 'dropped' ? st : 'open'
  return {
    id,
    title: o.title != null ? String(o.title) : id,
    plantedIn: o.plantedIn != null ? String(o.plantedIn) : undefined,
    plantNote: o.plantNote != null ? String(o.plantNote) : undefined,
    dueBy: o.dueBy != null ? String(o.dueBy) : null,
    resolvedIn: o.resolvedIn != null ? String(o.resolvedIn) : null,
    status
  }
}

export function parseForeshadow(text: string): ForeshadowDoc {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyForeshadow()
  const items = Array.isArray(raw.items)
    ? (raw.items.map(parseItem).filter(Boolean) as ForeshadowItem[])
    : []
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    items
  }
}

export function serializeForeshadow(doc: ForeshadowDoc): string {
  return dumpYamlDoc({
    version: doc.version || 1,
    items: doc.items
  })
}

export function loadForeshadow(workspaceRoot: string): {
  doc: ForeshadowDoc
  exists: boolean
  text: string
} {
  const abs = join(workspaceRoot, FORESHADOW_FILE)
  if (!existsSync(abs)) return { doc: emptyForeshadow(), exists: false, text: '' }
  const text = readFileSync(abs, 'utf-8')
  return { doc: parseForeshadow(text), exists: true, text }
}

export function upsertForeshadowItem(
  doc: ForeshadowDoc,
  patch: Partial<ForeshadowItem> & { id: string }
): ForeshadowDoc {
  const idx = doc.items.findIndex((i) => i.id === patch.id)
  const base: ForeshadowItem =
    idx >= 0
      ? doc.items[idx]
      : { id: patch.id, title: patch.title || patch.id, status: 'open' }
  const next: ForeshadowItem = {
    ...base,
    ...patch,
    id: patch.id,
    title: patch.title !== undefined ? patch.title : base.title,
    status: patch.status || base.status
  }
  if (next.status === 'resolved' && !next.resolvedIn && patch.resolvedIn) {
    next.resolvedIn = patch.resolvedIn
  }
  const items = [...doc.items]
  if (idx >= 0) items[idx] = next
  else items.push(next)
  return { ...doc, items }
}

export function listOpen(doc: ForeshadowDoc): ForeshadowItem[] {
  return doc.items.filter((i) => i.status === 'open')
}

/**
 * Overdue only when dueBy exactly equals a chapter.id and a later chapter
 * (by array order) already exists while item remains open.
 */
export function listOverdue(
  foreshadow: ForeshadowDoc,
  story: StoryStateDoc
): ForeshadowItem[] {
  const chapterIds = story.chapters.map((c) => c.id)
  const indexOf = (id: string): number => chapterIds.indexOf(id)
  const lastIdx = chapterIds.length - 1
  if (lastIdx < 0) return []
  return foreshadow.items.filter((item) => {
    if (item.status !== 'open') return false
    const due = (item.dueBy || '').trim()
    if (!due) return false
    const dueIdx = indexOf(due)
    if (dueIdx < 0) return false // free-text dueBy → never auto-overdue
    return lastIdx > dueIdx
  })
}
