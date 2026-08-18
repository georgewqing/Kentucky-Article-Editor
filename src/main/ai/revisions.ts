import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  readdirSync,
  statSync,
  rmSync
} from 'fs'
import { dirname, join, resolve, relative, isAbsolute } from 'path'
import { asStringArray, dumpYamlDoc, parseYamlDoc } from './yamlUtil'
import { resolveWorkspacePath, WorkspacePathError } from './workspacePath'

export const REVISIONS_DIR = 'revisions'
export const REVISIONS_MANIFEST = 'revisions/manifest.yaml'

export type RevisionVolume = {
  id: string
  label: string
  chapterIds: string[]
}

export type RevisionSnapMeta = {
  id: string
  label?: string
  paths: string[]
  note?: string
  createdAt: string
}

export type RevisionsManifest = {
  version: number
  volumes: RevisionVolume[]
  snapshots: RevisionSnapMeta[]
}

export function emptyManifest(): RevisionsManifest {
  return { version: 1, volumes: [], snapshots: [] }
}

export function parseManifest(text: string): RevisionsManifest {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyManifest()
  const volumes: RevisionVolume[] = []
  if (Array.isArray(raw.volumes)) {
    for (const v of raw.volumes) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const id = String(o.id || '').trim()
      if (!id) continue
      volumes.push({
        id,
        label: o.label != null ? String(o.label) : id,
        chapterIds: asStringArray(o.chapterIds)
      })
    }
  }
  const snapshots: RevisionSnapMeta[] = []
  if (Array.isArray(raw.snapshots)) {
    for (const s of raw.snapshots) {
      if (!s || typeof s !== 'object') continue
      const o = s as Record<string, unknown>
      const id = String(o.id || '').trim()
      if (!id) continue
      snapshots.push({
        id,
        label: o.label != null ? String(o.label) : undefined,
        paths: asStringArray(o.paths),
        note: o.note != null ? String(o.note) : undefined,
        createdAt: o.createdAt != null ? String(o.createdAt) : ''
      })
    }
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    volumes,
    snapshots
  }
}

export function serializeManifest(doc: RevisionsManifest): string {
  return dumpYamlDoc({
    version: doc.version || 1,
    volumes: doc.volumes,
    snapshots: doc.snapshots
  })
}

export function loadManifest(workspaceRoot: string): RevisionsManifest {
  const abs = join(workspaceRoot, REVISIONS_MANIFEST)
  if (!existsSync(abs)) return emptyManifest()
  return parseManifest(readFileSync(abs, 'utf-8'))
}

export function saveManifest(workspaceRoot: string, doc: RevisionsManifest): string {
  const abs = join(workspaceRoot, REVISIONS_MANIFEST)
  mkdirSync(dirname(abs), { recursive: true })
  const text = serializeManifest(doc)
  writeFileSync(abs, text, 'utf-8')
  return text
}

export function snapDir(workspaceRoot: string, id: string): string {
  const safe = String(id || '').trim()
  if (!safe || /[\\/]/.test(safe) || safe.includes('..')) {
    throw new WorkspacePathError('Invalid revision snapshot id')
  }
  return join(workspaceRoot, REVISIONS_DIR, 'snaps', safe)
}

function snapshotTime(s: RevisionSnapMeta, index: number): number {
  const t = Date.parse(s.createdAt || '')
  return Number.isFinite(t) ? t : index
}

function oldestSnapshotIndex(snaps: RevisionSnapMeta[]): number {
  let best = 0
  let bestTime = Number.POSITIVE_INFINITY
  for (let i = 0; i < snaps.length; i++) {
    const t = snapshotTime(snaps[i], i)
    if (t < bestTime) {
      bestTime = t
      best = i
    }
  }
  return best
}

function removeSnapshotAt(
  workspaceRoot: string,
  manifest: RevisionsManifest,
  index: number
): RevisionSnapMeta | null {
  if (index < 0 || index >= manifest.snapshots.length) return null
  const [removed] = manifest.snapshots.splice(index, 1)
  try {
    rmSync(snapDir(workspaceRoot, removed.id), { recursive: true, force: true })
  } catch {
    /* missing or invalid id — drop the manifest row anyway */
  }
  return removed
}

/** Drop oldest snaps until count is below max (ring buffer). */
export function evictOldestSnapshots(
  workspaceRoot: string,
  manifest: RevisionsManifest,
  maxSnaps: number
): string[] {
  const cap = Math.max(1, Math.floor(maxSnaps))
  const evicted: string[] = []
  while (manifest.snapshots.length >= cap) {
    const i = oldestSnapshotIndex(manifest.snapshots)
    const gone = removeSnapshotAt(workspaceRoot, manifest, i)
    if (!gone) break
    evicted.push(gone.id)
  }
  return evicted
}

export function createRevisionSnapshot(
  workspaceRoot: string,
  paths: string[],
  opts: { label?: string; note?: string; maxSnaps: number }
): {
  ok: true
  id: string
  manifest: RevisionsManifest
  evicted: string[]
} | { ok: false; error: string } {
  const manifest = loadManifest(workspaceRoot)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const id = `${stamp}_${(opts.label || 'snap').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40)}`
  const destRoot = join(snapDir(workspaceRoot, id), 'files')
  mkdirSync(destRoot, { recursive: true })
  const copied: string[] = []
  for (const rel of paths) {
    let from: string
    let safeRel: string
    try {
      from = resolveWorkspacePath(workspaceRoot, rel)
      safeRel = relative(resolve(workspaceRoot), from).split(/[/\\]/).join('/')
      if (!safeRel || safeRel.startsWith('..') || isAbsolute(safeRel)) continue
      // Ensure snap dest stays under destRoot
      resolveWorkspacePath(destRoot, safeRel)
    } catch {
      continue
    }
    if (!existsSync(from) || !statSync(from).isFile()) continue
    const to = join(destRoot, safeRel)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to)
    copied.push(safeRel)
  }
  if (!copied.length) {
    rmSync(snapDir(workspaceRoot, id), { recursive: true, force: true })
    return { ok: false, error: 'No existing files to snapshot for the given paths.' }
  }
  const meta: RevisionSnapMeta = {
    id,
    label: opts.label,
    paths: copied,
    note: opts.note,
    createdAt: new Date().toISOString()
  }
  writeFileSync(join(snapDir(workspaceRoot, id), 'meta.yaml'), dumpYamlDoc(meta), 'utf-8')
  const evicted = evictOldestSnapshots(workspaceRoot, manifest, opts.maxSnaps)
  manifest.snapshots.push(meta)
  saveManifest(workspaceRoot, manifest)
  return { ok: true, id, manifest, evicted }
}

export function listSnapshotFiles(
  workspaceRoot: string,
  snapId: string
): Array<{ rel: string; content: string }> {
  const filesRoot = join(snapDir(workspaceRoot, snapId), 'files')
  if (!existsSync(filesRoot)) return []
  const out: Array<{ rel: string; content: string }> = []
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      if (statSync(abs).isDirectory()) walk(abs, rel)
      else out.push({ rel: rel.replace(/\\/g, '/'), content: readFileSync(abs, 'utf-8') })
    }
  }
  walk(filesRoot, '')
  return out
}

export function upsertVolume(
  manifest: RevisionsManifest,
  patch: Partial<RevisionVolume> & { id: string }
): RevisionsManifest {
  const idx = manifest.volumes.findIndex((v) => v.id === patch.id)
  const base: RevisionVolume =
    idx >= 0 ? manifest.volumes[idx] : { id: patch.id, label: patch.label || patch.id, chapterIds: [] }
  const next: RevisionVolume = {
    ...base,
    ...patch,
    id: patch.id,
    label: patch.label !== undefined ? patch.label : base.label,
    chapterIds: patch.chapterIds ?? base.chapterIds
  }
  const volumes = [...manifest.volumes]
  if (idx >= 0) volumes[idx] = next
  else volumes.push(next)
  return { ...manifest, volumes }
}
