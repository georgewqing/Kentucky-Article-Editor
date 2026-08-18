import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { asStringArray, dumpYamlDoc, parseYamlDoc } from './yamlUtil'

export const GLOSSARY_FILE = 'glossary.yaml'
export const MATERIALS_DIR = 'materials'
export const MATERIALS_INDEX = 'materials/index.yaml'

export type GlossaryEntry = {
  id: string
  zh: string
  en?: string
  aliases: string[]
  kind?: string
}

export type GlossaryDoc = {
  version: number
  entries: GlossaryEntry[]
}

export function emptyGlossary(): GlossaryDoc {
  return { version: 1, entries: [] }
}

export function parseGlossary(text: string): GlossaryDoc {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyGlossary()
  const entries: GlossaryEntry[] = []
  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = String(o.id || '').trim()
      if (!id) continue
      entries.push({
        id,
        zh: o.zh != null ? String(o.zh) : id,
        en: o.en != null ? String(o.en) : undefined,
        aliases: asStringArray(o.aliases),
        kind: o.kind != null ? String(o.kind) : undefined
      })
    }
  }
  return { version: typeof raw.version === 'number' ? raw.version : 1, entries }
}

export function serializeGlossary(doc: GlossaryDoc): string {
  return dumpYamlDoc({ version: doc.version || 1, entries: doc.entries })
}

export function loadGlossary(workspaceRoot: string): {
  doc: GlossaryDoc
  exists: boolean
  text: string
} {
  const abs = join(workspaceRoot, GLOSSARY_FILE)
  if (!existsSync(abs)) return { doc: emptyGlossary(), exists: false, text: '' }
  const text = readFileSync(abs, 'utf-8')
  return { doc: parseGlossary(text), exists: true, text }
}

export function upsertGlossaryEntry(
  doc: GlossaryDoc,
  patch: Partial<GlossaryEntry> & { id: string }
): GlossaryDoc {
  const idx = doc.entries.findIndex((e) => e.id === patch.id)
  const base: GlossaryEntry =
    idx >= 0
      ? doc.entries[idx]
      : { id: patch.id, zh: patch.zh || patch.id, aliases: [] }
  const next: GlossaryEntry = {
    ...base,
    ...patch,
    id: patch.id,
    zh: patch.zh !== undefined ? patch.zh : base.zh,
    aliases: patch.aliases ?? base.aliases
  }
  const entries = [...doc.entries]
  if (idx >= 0) entries[idx] = next
  else entries.push(next)
  return { ...doc, entries }
}

/** Weak: if an alias appears but canonical zh does not in the same file → inconsistency. */
export function findGlossaryIssues(
  text: string,
  path: string,
  doc: GlossaryDoc
): Array<{
  severity: 'warn' | 'info'
  kind: string
  path: string
  quote: string
  suggestion: string
}> {
  const issues: Array<{
    severity: 'warn' | 'info'
    kind: string
    path: string
    quote: string
    suggestion: string
  }> = []
  for (const e of doc.entries) {
    for (const alias of e.aliases) {
      if (!alias || alias === e.zh) continue
      if (text.includes(alias) && e.zh && !text.includes(e.zh)) {
        const i = text.indexOf(alias)
        issues.push({
          severity: 'warn',
          kind: 'name_inconsistency',
          path,
          quote: text.slice(Math.max(0, i - 8), i + alias.length + 8),
          suggestion: `Alias 「${alias}」 used without canonical 「${e.zh}」 (glossary ${e.id}).`
        })
      }
    }
  }
  return issues
}

export type MaterialIndexEntry = {
  title: string
  tags: string[]
  path: string
}

export type MaterialsIndex = {
  version: number
  entries: MaterialIndexEntry[]
}

export function emptyMaterialsIndex(): MaterialsIndex {
  return { version: 1, entries: [] }
}

export function parseMaterialsIndex(text: string): MaterialsIndex {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyMaterialsIndex()
  const entries: MaterialIndexEntry[] = []
  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const path = String(o.path || '').trim()
      if (!path) continue
      entries.push({
        title: o.title != null ? String(o.title) : path,
        tags: asStringArray(o.tags),
        path
      })
    }
  }
  return { version: typeof raw.version === 'number' ? raw.version : 1, entries }
}

export function serializeMaterialsIndex(doc: MaterialsIndex): string {
  return dumpYamlDoc({ version: doc.version || 1, entries: doc.entries })
}

export function loadMaterialsIndex(workspaceRoot: string): MaterialsIndex {
  const abs = join(workspaceRoot, MATERIALS_INDEX)
  if (!existsSync(abs)) return emptyMaterialsIndex()
  return parseMaterialsIndex(readFileSync(abs, 'utf-8'))
}

export function searchMaterials(
  workspaceRoot: string,
  query: string,
  tag?: string
): Array<{ path: string; title: string; tags: string[]; snippet: string }> {
  const idx = loadMaterialsIndex(workspaceRoot)
  let entries = idx.entries
  const q = (query || '').trim().toLowerCase()
  if (tag) entries = entries.filter((e) => e.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
  if (q) {
    entries = entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }
  // Also scan materials/ filenames if index empty
  if (!entries.length) {
    const dir = join(workspaceRoot, MATERIALS_DIR)
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      for (const name of readdirSync(dir)) {
        if (name === 'index.yaml') continue
        if (!/\.(md|txt|yaml|yml)$/i.test(name)) continue
        if (q && !name.toLowerCase().includes(q)) continue
        entries.push({ title: name, tags: [], path: `${MATERIALS_DIR}/${name}` })
      }
    }
  }
  return entries.slice(0, 24).map((e) => {
    let snippet = ''
    try {
      const abs = join(workspaceRoot, e.path)
      if (existsSync(abs)) snippet = readFileSync(abs, 'utf-8').slice(0, 160)
    } catch {
      /* skip */
    }
    return { path: e.path, title: e.title, tags: e.tags, snippet }
  })
}

export function upsertMaterialIndexEntry(
  doc: MaterialsIndex,
  entry: MaterialIndexEntry
): MaterialsIndex {
  const idx = doc.entries.findIndex((e) => e.path === entry.path)
  const entries = [...doc.entries]
  if (idx >= 0) entries[idx] = entry
  else entries.push(entry)
  return { ...doc, entries }
}
