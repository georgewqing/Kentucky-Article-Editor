import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  statSync
} from 'fs'
import { join, basename } from 'path'
import { shell } from 'electron'
import { getAiSkillsDir } from './appBodyPaths'
import {
  loadAiSettings,
  saveAiSettings,
  loadSeenBundledSkillIds,
  saveSeenBundledSkillIds
} from './aiSettings'

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

/** Built-in always-applied voice skill (seeded like game skills; user may disable). */
export const CAVEMAN_SKILL_ID = 'caveman'

/** Grill / ask_user skill — not part of the game-design octet; not auto-injected. */
export const GRILL_SKILL_ID = 'grill'

/** Factory game-design skills shipped in resources/ai-skills. */
export const BUNDLED_GAME_SKILL_IDS = [
  'game-brainstorm',
  'game-gdd',
  'game-narrative',
  'game-systems',
  'game-numbers',
  'game-levels',
  'game-store',
  'game-consistency'
] as const

const BUNDLED_SKILL_IDS = [CAVEMAN_SKILL_ID, GRILL_SKILL_ID, ...BUNDLED_GAME_SKILL_IDS] as const

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

function bundledSkillsRoot(): string | null {
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'ai-skills'))
  }
  candidates.push(join(__dirname, '../../resources/ai-skills'))
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c
    } catch {
      /* skip */
    }
  }
  return null
}

const BUNDLED_SKILL_FILES = ['SKILL.md', 'examples.md', 'reference.md'] as const

function seedBundledGameSkills(destRoot: string): void {
  const srcRoot = bundledSkillsRoot()
  if (!srcRoot) return
  const present: string[] = []
  for (const id of BUNDLED_SKILL_IDS) {
    const srcDir = join(srcRoot, id)
    const destDir = join(destRoot, id)
    let hasSkill = false
    for (const file of BUNDLED_SKILL_FILES) {
      const srcFile = join(srcDir, file)
      const destFile = join(destDir, file)
      try {
        if (!existsSync(srcFile) || !statSync(srcFile).isFile()) continue
        if (!existsSync(destFile)) {
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
          copyFileSync(srcFile, destFile)
        }
        if (file === 'SKILL.md' && existsSync(destFile)) hasSkill = true
      } catch {
        /* skip one file; do not fail the whole seed */
      }
    }
    if (hasSkill) present.push(id)
  }
  welcomeUnseenBundled(present)
}

/**
 * Append never-seen bundled ids to the whitelist. Disabled skills stay off:
 * once an id is in seenBundledSkillIds, a later launch must not re-enable it.
 */
function welcomeUnseenBundled(presentIds: string[]): void {
  if (!presentIds.length) return
  const seen = loadSeenBundledSkillIds()
  const seenSet = new Set(seen)
  const unseen = presentIds.filter((id) => !seenSet.has(id))
  const nextSeen = Array.from(new Set(seen.concat(presentIds)))
  if (unseen.length) {
    const enabled = loadAiSettings().enabledSkillIds
    if (enabled !== null) {
      const next = [...enabled]
      for (const id of unseen) {
        if (!next.includes(id)) next.push(id)
      }
      saveAiSettings({ enabledSkillIds: next })
    }
  }
  if (nextSeen.length !== seen.length || unseen.length) {
    saveSeenBundledSkillIds(nextSeen)
  }
}

export function ensureSkillsDir(): string {
  const dir = getAiSkillsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sampleDir = join(dir, SAMPLE_ID)
  const sampleFile = join(sampleDir, 'SKILL.md')
  if (!existsSync(sampleFile)) {
    if (!existsSync(sampleDir)) mkdirSync(sampleDir, { recursive: true })
    writeFileSync(sampleFile, SAMPLE_SKILL, 'utf-8')
  }
  seedBundledGameSkills(dir)
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
  const optional = skills.filter((s) => s.id !== CAVEMAN_SKILL_ID)
  const cavemanOn = skills.some((s) => s.id === CAVEMAN_SKILL_ID)
  const lines: string[] = []
  if (cavemanOn) {
    lines.push(
      `Built-in /${CAVEMAN_SKILL_ID} is already in the system prompt this turn — do not call read_skill for it.`
    )
  }
  if (optional.length) {
    lines.push('Available agent skills (call read_skill for full instructions when relevant):')
    for (const s of optional) {
      lines.push(`- ${s.id}: ${s.description || s.name}`)
    }
  }
  return lines.join('\n')
}

/** Full caveman body when the built-in skill is enabled; empty if disabled/missing. */
export function cavemanSystemBlock(): string {
  const loaded = loadSkill(CAVEMAN_SKILL_ID)
  if ('error' in loaded) return ''
  return [
    `CRITICAL built-in skill /${CAVEMAN_SKILL_ID} (already applied — do not call read_skill for it):`,
    loaded.body
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
