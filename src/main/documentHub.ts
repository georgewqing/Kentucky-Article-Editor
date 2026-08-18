import { BrowserWindow, webContents } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { contentIsDirty } from '../common/kmindDirty'

export interface DocSnapshot {
  path: string
  content: string
  originalContent: string
  dirty: boolean
  rev: number
}

interface DocEntry extends DocSnapshot {
  /** webContents.id subscribers */
  subscribers: Set<number>
}

const docs = new Map<string, DocEntry>()

/** Case-insensitive lookup key on Windows-friendly paths. */
function keyOf(filePath: string): string {
  return filePath.replace(/\//g, '\\').toLowerCase()
}

function findEntry(filePath: string): DocEntry | undefined {
  const k = keyOf(filePath)
  const entries = Array.from(docs.entries())
  for (let i = 0; i < entries.length; i++) {
    const [path, entry] = entries[i]
    if (keyOf(path) === k) return entry
  }
  return undefined
}

function broadcast(entry: DocEntry, exceptWcId?: number): void {
  const payload: DocSnapshot = {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
  const ids = Array.from(entry.subscribers)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (exceptWcId !== undefined && id === exceptWcId) continue
    try {
      const wc = webContents.fromId(id)
      if (wc && !wc.isDestroyed()) {
        wc.send('doc:apply', payload)
      }
    } catch {
      /* ignore */
    }
  }
}

export async function docOpen(filePath: string, subscriberId?: number): Promise<DocSnapshot> {
  let entry = findEntry(filePath)
  if (!entry) {
    const content = await readFile(filePath, 'utf-8')
    entry = {
      path: filePath,
      content,
      originalContent: content,
      dirty: false,
      rev: 1,
      subscribers: new Set()
    }
    docs.set(filePath, entry)
  }
  if (subscriberId !== undefined) {
    entry.subscribers.add(subscriberId)
  }
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export function docSubscribe(filePath: string, subscriberId: number): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  entry.subscribers.add(subscriberId)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export function docUnsubscribe(filePath: string, subscriberId: number): void {
  const entry = findEntry(filePath)
  if (!entry) return
  entry.subscribers.delete(subscriberId)
  if (entry.subscribers.size === 0 && !entry.dirty) {
    docs.delete(entry.path)
  }
}

export function docUnsubscribeAll(subscriberId: number): void {
  const entries = Array.from(docs.values())
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry.subscribers.has(subscriberId)) continue
    entry.subscribers.delete(subscriberId)
    if (entry.subscribers.size === 0 && !entry.dirty) {
      docs.delete(entry.path)
    }
  }
}

export function docPatch(
  filePath: string,
  content: string,
  fromWcId: number
): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  if (entry.content === content) {
    entry.subscribers.add(fromWcId)
    return {
      path: entry.path,
      content: entry.content,
      originalContent: entry.originalContent,
      dirty: entry.dirty,
      rev: entry.rev
    }
  }
  entry.content = content
  entry.dirty = contentIsDirty(entry.path, content, entry.originalContent)
  entry.rev += 1
  entry.subscribers.add(fromWcId)
  broadcast(entry, fromWcId)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export async function docSave(filePath: string, fromWcId?: number): Promise<DocSnapshot | null> {
  const entry = findEntry(filePath)
  if (!entry) return null
  await writeFile(entry.path, entry.content, 'utf-8')
  entry.originalContent = entry.content
  entry.dirty = false
  entry.rev += 1
  if (fromWcId !== undefined) entry.subscribers.add(fromWcId)
  broadcast(entry) // all windows including saver — clear dirty everywhere
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/** Revert buffer to last saved content and clear dirty. */
export function docDiscard(filePath: string, fromWcId?: number): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  entry.content = entry.originalContent
  entry.dirty = false
  entry.rev += 1
  if (fromWcId !== undefined) entry.subscribers.add(fromWcId)
  broadcast(entry)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export function docEnsure(
  filePath: string,
  content: string,
  dirty: boolean,
  originalContent: string
): DocSnapshot {
  let entry = findEntry(filePath)
  if (!entry) {
    entry = {
      path: filePath,
      content,
      originalContent,
      dirty,
      rev: 1,
      subscribers: new Set()
    }
    docs.set(filePath, entry)
  }
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export function getDoc(filePath: string): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/** Sync hub after an external disk write (e.g. Soft plan checkbox). Marks clean + broadcasts. */
export function docApplyExternalWrite(filePath: string, content: string): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  entry.content = content
  entry.originalContent = content
  entry.dirty = false
  entry.rev += 1
  broadcast(entry)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/**
 * Agent auto-write: disk already has `content`. Update hub buffer, keep prior
 * originalContent baseline (or `baseline` for first seed), mark dirty until
 * user Ctrl+S (or git reload).
 */
export function docApplyAgentWrite(
  filePath: string,
  content: string,
  baseline?: string
): DocSnapshot {
  let entry = findEntry(filePath)
  if (!entry) {
    const original = baseline !== undefined ? baseline : content
    entry = {
      path: filePath,
      content,
      originalContent: original,
      dirty: contentIsDirty(filePath, content, original) || baseline !== undefined,
      rev: 1,
      subscribers: new Set()
    }
    // Always dirty for agent writes so yellow ● shows until user save
    entry.dirty = true
    docs.set(filePath, entry)
  } else {
    entry.content = content
    entry.dirty = true
    entry.rev += 1
  }
  broadcast(entry)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/** Rewind an agent write: disk already has `content`. Keep last Ctrl+S baseline. */
export function docApplyRewindWrite(filePath: string, content: string): DocSnapshot | null {
  const entry = findEntry(filePath)
  if (!entry) return null
  entry.content = content
  entry.dirty = contentIsDirty(filePath, content, entry.originalContent)
  entry.rev += 1
  broadcast(entry)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/**
 * Force hub + subscribers to match on-disk bytes (e.g. after git discard).
 * Sets original=content, dirty=false.
 */
export async function docReloadFromDisk(filePath: string): Promise<DocSnapshot> {
  let content = ''
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    content = ''
  }
  let entry = findEntry(filePath)
  if (!entry) {
    entry = {
      path: filePath,
      content,
      originalContent: content,
      dirty: false,
      rev: 1,
      subscribers: new Set()
    }
    docs.set(filePath, entry)
  } else {
    entry.content = content
    entry.originalContent = content
    entry.dirty = false
    entry.rev += 1
  }
  broadcast(entry)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

/** Remove hub entry after file deleted from disk (e.g. untracked discard). */
export function docEvict(filePath: string): void {
  const entry = findEntry(filePath)
  if (!entry) return
  docs.delete(entry.path)
}

/** Seed hub from an already-open renderer tab before spawning a float. */
export function docSeedFromRenderer(
  filePath: string,
  content: string,
  originalContent: string,
  dirty: boolean,
  subscriberId?: number
): DocSnapshot {
  let entry = findEntry(filePath)
  if (!entry) {
    entry = {
      path: filePath,
      content,
      originalContent,
      dirty,
      rev: 1,
      subscribers: new Set()
    }
    docs.set(filePath, entry)
  } else {
    // Prefer newer dirty buffer from the spawning window if hub is clean
    if (dirty || entry.content !== content) {
      entry.content = content
      entry.originalContent = originalContent
      entry.dirty = dirty
      entry.rev += 1
    }
  }
  if (subscriberId !== undefined) entry.subscribers.add(subscriberId)
  return {
    path: entry.path,
    content: entry.content,
    originalContent: entry.originalContent,
    dirty: entry.dirty,
    rev: entry.rev
  }
}

export function listSubscriberWindows(filePath: string): BrowserWindow[] {
  const entry = findEntry(filePath)
  if (!entry) return []
  const wins: BrowserWindow[] = []
  const ids = Array.from(entry.subscribers)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      const wc = webContents.fromId(id)
      if (!wc || wc.isDestroyed()) continue
      const win = BrowserWindow.fromWebContents(wc)
      if (win && !win.isDestroyed()) wins.push(win)
    } catch {
      /* ignore */
    }
  }
  return wins
}
