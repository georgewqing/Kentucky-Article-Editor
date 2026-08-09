import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  statSync
} from 'fs'
import { join, basename } from 'path'
import { shell } from 'electron'
import { getAiSkillsDir } from './appBodyPaths'
import { loadAiSettings, saveAiSettings } from './aiSettings'

export interface SkillMeta {
  id: string
  name: string
  description: string
  enabled: boolean
  path: string
}

export interface SkillDetail extends SkillMeta {
  body: string
  extraFiles: Record<string, string>
}

const SAMPLE_ID = 'literary-voice'
const SAMPLE_SKILL = `---
name: literary-voice
description: >-
  Apply when the user asks for prose voice, cadence, or style polishing in fiction
  or dialogue. Prefer concrete sensory detail over abstract emotion labels.
---

# Literary voice

When rewriting or drafting fiction/dialogue:

1. Match the author's style memo if present.
2. Prefer concrete sensory detail over abstract emotion words.
3. Keep speaker identity (character id) consistent in dialogue CSV work.
4. Do not invent lore that contradicts \`characters.csv\` without flagging it.
`

function parseFrontmatter(raw: string): { name: string; description: string; body: string } {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) {
    return { name: '', description: '', body: text.trim() }
  }
  const end = text.indexOf('\n---', 3)
  if (end < 0) {
    return { name: '', description: '', body: text.trim() }
  }
  const fm = text.slice(3, end).trim()
  const body = text.slice(end + 4).replace(/^\r?\n/, '').trim()
  let name = ''
  let description = ''
  // Minimal YAML: name: value | description: >- folded block
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
  const descBlock = fm.match(/^description:\s*>-?\s*\n((?:[ \t]+.+\n?)+)/m)
  if (descBlock) {
    description = descBlock[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^[ \t]+/, '').trim())
      .filter(Boolean)
      .join(' ')
  } else {
    const descLine = fm.match(/^description:\s*(.+)$/m)
    if (descLine) description = descLine[1].trim().replace(/^["']|["']$/g, '')
  }
  return { name, description, body }
}

export function ensureSkillsDir(): string {
  const dir = getAiSkillsDir()
  const sampleDir = join(dir, SAMPLE_ID)
  const sampleFile = join(sampleDir, 'SKILL.md')
  if (!existsSync(sampleFile)) {
    if (!existsSync(sampleDir)) mkdirSync(sampleDir, { recursive: true })
    writeFileSync(sampleFile, SAMPLE_SKILL, 'utf-8')
  }
  return dir
}

function enabledSet(): Set<string> | null {
  const ids = loadAiSettings().enabledSkillIds
  if (ids === null || ids === undefined) return null
  return new Set(ids)
}

export function listSkills(): SkillMeta[] {
  const dir = ensureSkillsDir()
  const enabled = enabledSet()
  const out: SkillMeta[] = []
  for (const name of readdirSync(dir)) {
    const skillDir = join(dir, name)
    try {
      if (!statSync(skillDir).isDirectory()) continue
    } catch {
      continue
    }
    const skillPath = join(skillDir, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const raw = readFileSync(skillPath, 'utf-8')
    const parsed = parseFrontmatter(raw)
    const id = name
    out.push({
      id,
      name: parsed.name || id,
      description: parsed.description || '',
      enabled: enabled === null ? true : enabled.has(id),
      path: skillPath
    })
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export function listEnabledSkills(): SkillMeta[] {
  return listSkills().filter((s) => s.enabled)
}

export function skillsCatalogText(): string {
  const skills = listEnabledSkills()
  if (!skills.length) return ''
  const lines = skills.map((s) => `- ${s.id}: ${s.description || s.name}`)
  return [
    'Available agent skills (call read_skill for full instructions when relevant):',
    ...lines
  ].join('\n')
}

export function loadSkill(
  id: string,
  extraFiles?: string[]
): SkillDetail | { error: string } {
  const safe = basename(String(id || '').trim())
  if (!safe || safe !== id.trim()) return { error: 'Invalid skill id' }
  const meta = listSkills().find((s) => s.id === safe)
  if (!meta) return { error: `Skill not found: ${safe}` }
  if (!meta.enabled) return { error: `Skill disabled: ${safe}` }
  const raw = readFileSync(meta.path, 'utf-8')
  const parsed = parseFrontmatter(raw)
  const extra: Record<string, string> = {}
  const skillDir = join(getAiSkillsDir(), safe)
  const allowed = new Set(['reference.md', 'examples.md'])
  for (const f of extraFiles || []) {
    const base = basename(f)
    if (!allowed.has(base.toLowerCase())) continue
    const p = join(skillDir, base)
    if (existsSync(p) && statSync(p).isFile()) {
      extra[base] = readFileSync(p, 'utf-8').slice(0, 40_000)
    }
  }
  return {
    ...meta,
    name: parsed.name || meta.name,
    description: parsed.description || meta.description,
    body: parsed.body.slice(0, 60_000),
    extraFiles: extra
  }
}

export function setSkillEnabled(id: string, enabled: boolean): SkillMeta[] {
  const safe = basename(String(id || '').trim())
  const all = listSkills()
  if (!all.some((s) => s.id === safe)) return all
  const currently = enabledSet()
  let nextIds: string[]
  if (currently === null) {
    nextIds = all.map((s) => s.id)
  } else {
    nextIds = Array.from(currently)
  }
  if (enabled) {
    if (!nextIds.includes(safe)) nextIds.push(safe)
  } else {
    nextIds = nextIds.filter((x) => x !== safe)
  }
  // If every skill is enabled, store null (= all)
  if (nextIds.length === all.length && all.every((s) => nextIds.includes(s.id))) {
    saveAiSettings({ enabledSkillIds: null })
  } else {
    saveAiSettings({ enabledSkillIds: nextIds })
  }
  return listSkills()
}

export function revealSkillsDir(): void {
  const dir = ensureSkillsDir()
  void shell.openPath(dir)
}

/** Copy a folder containing SKILL.md into ai-skills/<folderName>. */
export function importSkillFolder(sourceDir: string): { ok: boolean; id?: string; error?: string } {
  try {
    const skillMd = join(sourceDir, 'SKILL.md')
    if (!existsSync(skillMd)) return { ok: false, error: 'Folder must contain SKILL.md' }
    const id = basename(sourceDir).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill'
    const dest = join(ensureSkillsDir(), id)
    if (existsSync(dest)) {
      // overwrite files
      cpSync(sourceDir, dest, { recursive: true })
    } else {
      cpSync(sourceDir, dest, { recursive: true })
    }
    // Ensure newly imported is enabled if using allow-list
    const enabled = enabledSet()
    if (enabled !== null && !enabled.has(id)) {
      setSkillEnabled(id, true)
    }
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
