/** Dialogue line + characters.csv helpers for Kentucky dialogue editor. */

import type { FileEntry } from '@/platform'

export interface DialogueLine {
  id: string
  speaker: string
  text: string
  note: string
  emotion: string
  scene: string
  condition: string
  audio: string
  /** Camera focus node name; empty → executor falls back to character model_node. */
  focus_node: string
  /** Pixel font size as decimal string; empty/`0` → Godot UI default (disk always ''). */
  font_size: string
  /** Body color `#RGB` / `#RRGGBB` / `#RRGGBBAA`; empty → Godot default. */
  text_color: string
}

export interface Character {
  id: string
  name: string
  color: string
  note: string
  /** Godot model / character node name for plugin linkage. */
  model_node: string
  /** Player-operable: empty-text options wait for confirm. Non-operable: auto-advance. */
  operable: boolean
}

/** File-level Godot binding, stored beside `*.dialogue.csv` as `*.dialogue.meta.json`. */
export interface DialogueFileMeta {
  godot_scene: string
  dialogue_id: string
}

export const DIALOGUE_HEADER =
  'id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color' as const

/** Valid `text_color`: empty, or #RGB / #RRGGBB / #RRGGBBAA (case-insensitive). */
const TEXT_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * Empty and `0` both mean default; disk writes empty string.
 * Positive integer strings kept; other non-empty values are invalid → ''.
 */
export function normalizeFontSize(value: string): { value: string; ok: boolean } {
  const raw = value.trim()
  if (!raw || raw === '0') return { value: '', ok: true }
  if (/^[1-9]\d*$/.test(raw)) return { value: raw, ok: true }
  return { value: '', ok: false }
}

/** Empty or #RGB / #RRGGBB / #RRGGBBAA. Invalid → ''. */
export function normalizeTextColor(value: string): { value: string; ok: boolean } {
  const raw = value.trim()
  if (!raw) return { value: '', ok: true }
  if (TEXT_COLOR_RE.test(raw)) return { value: raw, ok: true }
  return { value: '', ok: false }
}

export const CHARACTERS_HEADER = 'id,name,color,note,model_node,operable' as const

/** Parse operable flag: 1/true/yes/y → true; missing/empty/0/false → false. */
export function parseOperableFlag(raw: string | undefined | null): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'y'
}

export function serializeOperableFlag(operable: boolean): string {
  return operable ? '1' : ''
}

export const DIALOGUE_EXT = '.dialogue.csv'
export const DIALOGUE_META_EXT = '.dialogue.meta.json'
export const DIALOGUE_CHOICES_EXT = '.dialogue.choices.json'
export const DIALOGUE_LAYOUT_EXT = '.dialogue.layout.json'

/** Virtual End sink id — never written to CSV. */
export const DIALOGUE_END_NODE_ID = '__kentucky_end__'

export interface DialogueChoiceOption {
  text: string
  goto: string
  end?: boolean
}

export interface DialogueChoicesFile {
  version: 1
  nodes: Record<string, { options: DialogueChoiceOption[] }>
}

export interface DialogueLayoutFile {
  version: 1
  nodes: Record<string, { x: number; y: number }>
  end?: { x: number; y: number }
}

export function isDialoguePath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith(DIALOGUE_EXT)
}

export function isDialogueMetaPath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith(DIALOGUE_META_EXT)
}

export function isDialogueChoicesPath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith(DIALOGUE_CHOICES_EXT)
}

export function isDialogueLayoutPath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith(DIALOGUE_LAYOUT_EXT)
}

export function isDialogueSidecarPath(path: string): boolean {
  return isDialogueMetaPath(path) || isDialogueChoicesPath(path) || isDialogueLayoutPath(path)
}

/** Workspace role table: basename must be characters.csv (any folder). */
export function isCharactersPath(path: string): boolean {
  const base = path.replace(/\\/g, '/').split('/').pop() || ''
  return base.toLowerCase() === 'characters.csv'
}

function replaceDialogueExt(dialogueCsvPath: string, nextExt: string): string {
  const lower = dialogueCsvPath.toLowerCase()
  const idx = lower.lastIndexOf(DIALOGUE_EXT)
  if (idx >= 0 && idx === lower.length - DIALOGUE_EXT.length) {
    return dialogueCsvPath.slice(0, idx) + nextExt
  }
  return dialogueCsvPath + nextExt
}

/** `foo.dialogue.csv` → `foo.dialogue.meta.json` */
export function dialogueMetaPathFor(dialogueCsvPath: string): string {
  return replaceDialogueExt(dialogueCsvPath, DIALOGUE_META_EXT)
}

export function dialogueChoicesPathFor(dialogueCsvPath: string): string {
  return replaceDialogueExt(dialogueCsvPath, DIALOGUE_CHOICES_EXT)
}

export function dialogueLayoutPathFor(dialogueCsvPath: string): string {
  return replaceDialogueExt(dialogueCsvPath, DIALOGUE_LAYOUT_EXT)
}

function normPathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

function emptyDialogueChoices(): DialogueChoicesFile {
  return { version: 1, nodes: {} }
}

export function parseDialogueChoices(text: string): DialogueChoicesFile {
  try {
    const raw = JSON.parse(text) as Partial<DialogueChoicesFile>
    const nodes: DialogueChoicesFile['nodes'] = {}
    if (raw && raw.nodes && typeof raw.nodes === 'object') {
      for (const [lineId, node] of Object.entries(raw.nodes)) {
        const id = String(lineId || '').trim()
        if (!id || !node || !Array.isArray(node.options)) continue
        const options: DialogueChoiceOption[] = []
        for (const opt of node.options) {
          if (!opt || typeof opt !== 'object') continue
          // v1.3: empty text is valid (silent continue / end)
          const textVal = typeof opt.text === 'string' ? opt.text.trim() : ''
          const end = Boolean(opt.end)
          const goto = typeof opt.goto === 'string' ? opt.goto.trim() : ''
          if (end) options.push({ text: textVal, goto: '', end: true })
          else if (goto) options.push({ text: textVal, goto })
        }
        if (options.length) nodes[id] = { options }
      }
    }
    return { version: 1, nodes }
  } catch {
    return emptyDialogueChoices()
  }
}

/** Empty nodes → empty string (caller should delete file). */
export function serializeDialogueChoices(file: DialogueChoicesFile): string {
  const nodes: DialogueChoicesFile['nodes'] = {}
  for (const [id, node] of Object.entries(file.nodes || {})) {
    const options = (node?.options || [])
      .map((o) => {
        const text = (o.text || '').trim()
        if (o.end) return { text, goto: '', end: true as const }
        const goto = (o.goto || '').trim()
        if (!goto) return null
        return { text, goto }
      })
      .filter(Boolean) as DialogueChoiceOption[]
    if (options.length) nodes[id] = { options }
  }
  if (!Object.keys(nodes).length) return ''
  return JSON.stringify({ version: 1, nodes }, null, 2) + '\n'
}

export function parseDialogueLayout(text: string): DialogueLayoutFile {
  try {
    const raw = JSON.parse(text) as Partial<DialogueLayoutFile>
    const nodes: DialogueLayoutFile['nodes'] = {}
    if (raw?.nodes && typeof raw.nodes === 'object') {
      for (const [id, pos] of Object.entries(raw.nodes)) {
        if (!id || !pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue
        nodes[id] = { x: pos.x, y: pos.y }
      }
    }
    const end =
      raw?.end && typeof raw.end.x === 'number' && typeof raw.end.y === 'number'
        ? { x: raw.end.x, y: raw.end.y }
        : undefined
    return { version: 1, nodes, end }
  } catch {
    return { version: 1, nodes: {} }
  }
}

export function serializeDialogueLayout(file: DialogueLayoutFile): string {
  const nodes: DialogueLayoutFile['nodes'] = {}
  for (const [id, pos] of Object.entries(file.nodes || {})) {
    if (!id || id === DIALOGUE_END_NODE_ID) continue
    if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number') continue
    nodes[id] = { x: pos.x, y: pos.y }
  }
  const out: DialogueLayoutFile = { version: 1, nodes }
  if (file.end && typeof file.end.x === 'number' && typeof file.end.y === 'number') {
    out.end = { x: file.end.x, y: file.end.y }
  }
  return JSON.stringify(out, null, 2) + '\n'
}

/**
 * Display-only: nest sibling meta / choices / layout under matching `*.dialogue.csv`.
 * Orphan sidecars stay as siblings.
 */
export function nestDialogueSidecarsInTree(entries: FileEntry[]): FileEntry[] {
  const walk = (list: FileEntry[]): FileEntry[] => {
    const normalized = list.map((e) =>
      e.isDirectory && e.children ? { ...e, children: walk(e.children) } : e
    )

    const byKey = new Map<string, FileEntry>()
    for (const e of normalized) {
      if (e.isDirectory || !isDialogueSidecarPath(e.path)) continue
      byKey.set(normPathKey(e.path), e)
    }

    const claimed = new Set<string>()
    for (const e of normalized) {
      if (e.isDirectory || !isDialoguePath(e.path)) continue
      for (const p of [
        dialogueMetaPathFor(e.path),
        dialogueChoicesPathFor(e.path),
        dialogueLayoutPathFor(e.path)
      ]) {
        const key = normPathKey(p)
        if (byKey.has(key)) claimed.add(key)
      }
    }

    const out: FileEntry[] = []
    for (const e of normalized) {
      if (!e.isDirectory && isDialogueSidecarPath(e.path) && claimed.has(normPathKey(e.path))) {
        continue
      }
      if (!e.isDirectory && isDialoguePath(e.path)) {
        const children: FileEntry[] = []
        for (const p of [
          dialogueMetaPathFor(e.path),
          dialogueChoicesPathFor(e.path),
          dialogueLayoutPathFor(e.path)
        ]) {
          const side = byKey.get(normPathKey(p))
          if (side) children.push(side)
        }
        if (children.length) {
          out.push({ ...e, children })
          continue
        }
      }
      out.push(e)
    }
    return out
  }
  return walk(entries)
}

/** @deprecated Use nestDialogueSidecarsInTree */
export function nestDialogueMetaInTree(entries: FileEntry[]): FileEntry[] {
  return nestDialogueSidecarsInTree(entries)
}

export function parseDialogueFileMeta(text: string): DialogueFileMeta | null {
  try {
    const parsed = JSON.parse(text) as Partial<DialogueFileMeta>
    const godot_scene = typeof parsed.godot_scene === 'string' ? parsed.godot_scene.trim() : ''
    const dialogue_id = typeof parsed.dialogue_id === 'string' ? parsed.dialogue_id.trim() : ''
    if (!godot_scene || !dialogue_id) return null
    return { godot_scene, dialogue_id }
  } catch {
    return null
  }
}

export function serializeDialogueFileMeta(meta: DialogueFileMeta): string {
  return JSON.stringify(
    {
      godot_scene: meta.godot_scene.trim(),
      dialogue_id: meta.dialogue_id.trim()
    },
    null,
    2
  ) + '\n'
}

/** Filename stem from Godot scene path/name (e.g. res://scenes/tavern.tscn → tavern). */
export function sceneStemFromGodotScene(godotScene: string): string {
  const raw = godotScene.trim().replace(/\\/g, '/')
  const base = raw.split('/').filter(Boolean).pop() || raw
  const noExt = base.replace(/\.(tscn|scn|res)$/i, '')
  return sanitizeIdPart(noExt) || 'scene'
}

/**
 * Auto file name: `{sceneStem}_{dialogueId}.dialogue.csv`
 * e.g. res://scenes/tavern.tscn + intro → tavern_intro.dialogue.csv
 */
export function dialogueFileNameFromMeta(godotScene: string, dialogueId: string): string {
  const scenePart = sceneStemFromGodotScene(godotScene)
  const idPart = sanitizeIdPart(dialogueId) || 'dialogue'
  return `${scenePart}_${idPart}${DIALOGUE_EXT}`
}

/** @deprecated Prefer dialogueFileNameFromMeta(scene, id) */
export function dialogueFileNameFromId(dialogueId: string): string {
  const stem = sanitizeIdPart(dialogueId) || 'dialogue'
  return `${stem}${DIALOGUE_EXT}`
}

export function emptyDialogueCsv(): string {
  return DIALOGUE_HEADER + '\n'
}

export function emptyCharactersCsv(): string {
  return CHARACTERS_HEADER + '\n'
}

/** Minimal RFC4180-ish CSV parse (handles quotes and commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let inQuotes = false
  const s = text.replace(/^\uFEFF/, '')

  while (i < s.length) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += 1
      continue
    }
    cell += ch
    i += 1
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== '') || r.length > 1)
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n') + (rows.length ? '\n' : '')
}

function colIndex(header: string[], name: string): number {
  const lower = name.toLowerCase()
  return header.findIndex((h) => h.trim().toLowerCase() === lower)
}

export function parseDialogueCsv(text: string): DialogueLine[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  const idx = {
    id: colIndex(header, 'id'),
    speaker: colIndex(header, 'speaker'),
    text: colIndex(header, 'text'),
    note: colIndex(header, 'note'),
    emotion: colIndex(header, 'emotion'),
    scene: colIndex(header, 'scene'),
    condition: colIndex(header, 'condition'),
    audio: colIndex(header, 'audio'),
    focus_node: colIndex(header, 'focus_node'),
    font_size: colIndex(header, 'font_size'),
    text_color: colIndex(header, 'text_color')
  }
  // Also accept key as id alias
  if (idx.id < 0) idx.id = colIndex(header, 'key')
  if (idx.id < 0 || idx.speaker < 0 || idx.text < 0) return []

  const lines: DialogueLine[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const get = (i: number): string => (i >= 0 && i < row.length ? row[i] : '')
    const id = get(idx.id).trim()
    if (!id) continue
    lines.push({
      id,
      speaker: get(idx.speaker).trim(),
      text: get(idx.text),
      note: get(idx.note),
      emotion: get(idx.emotion),
      scene: get(idx.scene),
      condition: get(idx.condition),
      audio: get(idx.audio),
      focus_node: get(idx.focus_node).trim(),
      font_size: normalizeFontSize(get(idx.font_size)).value,
      text_color: normalizeTextColor(get(idx.text_color)).value
    })
  }
  return lines
}

export function serializeDialogueCsv(lines: DialogueLine[]): string {
  const rows: string[][] = [
    [
      'id',
      'speaker',
      'text',
      'note',
      'emotion',
      'scene',
      'condition',
      'audio',
      'focus_node',
      'font_size',
      'text_color'
    ]
  ]
  for (const line of lines) {
    rows.push([
      line.id,
      line.speaker,
      line.text,
      line.note,
      line.emotion,
      line.scene,
      line.condition,
      line.audio,
      line.focus_node ?? '',
      normalizeFontSize(line.font_size ?? '').value,
      normalizeTextColor(line.text_color ?? '').value
    ])
  }
  return serializeCsv(rows)
}

export function parseCharactersCsv(text: string): Character[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  const idI = colIndex(header, 'id')
  const nameI = colIndex(header, 'name')
  const colorI = colIndex(header, 'color')
  const noteI = colIndex(header, 'note')
  const modelI = colIndex(header, 'model_node')
  const operableI = colIndex(header, 'operable')
  if (idI < 0 || nameI < 0) return []
  const out: Character[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const get = (i: number): string => (i >= 0 && i < row.length ? row[i] : '')
    const id = get(idI).trim()
    if (!id) continue
    out.push({
      id,
      name: get(nameI).trim() || id,
      color: get(colorI).trim() || '#88c0d0',
      note: get(noteI),
      model_node: get(modelI).trim(),
      operable: parseOperableFlag(get(operableI))
    })
  }
  return out
}

export function serializeCharactersCsv(chars: Character[]): string {
  const rows: string[][] = [['id', 'name', 'color', 'note', 'model_node', 'operable']]
  for (const c of chars) {
    rows.push([
      c.id,
      c.name,
      c.color,
      c.note,
      c.model_node ?? '',
      serializeOperableFlag(Boolean(c.operable))
    ])
  }
  return serializeCsv(rows)
}

export function slugifyCharacterId(name: string): string {
  const s = sanitizeIdPart(name.toLowerCase())
  return s || 'char'
}

/** Keep letters/digits/CJK; fold other punctuation to `_`. */
export function sanitizeIdPart(value: string): string {
  return value
    .trim()
    .replace(/[\s./\\:,;"'`!?@#$%^&*()+=[\]{}|<>~]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function fileStemFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() || 'dialogue'
  return base.replace(/\.dialogue\.csv$/i, '') || 'dialogue'
}

/** Collect next free id: {scene|stem}_{characterId}_{###} */
export function allocateDialogueId(
  existing: Set<string>,
  opts: { scene: string; fileStem: string; characterId: string }
): string {
  const scenePart = sanitizeIdPart(opts.scene.trim() || opts.fileStem) || 'scene'
  const charPart = sanitizeIdPart(opts.characterId) || 'char'
  const prefix = `${scenePart}_${charPart}_`
  let n = 1
  while (n < 1000) {
    const id = `${prefix}${String(n).padStart(3, '0')}`
    if (!existing.has(id)) return id
    n += 1
  }
  return `${prefix}${Date.now()}`
}

export function exportPipelineCsv(
  lines: DialogueLine[],
  cols: {
    emotion: boolean
    condition: boolean
    audio: boolean
    focus_node?: boolean
    font_size?: boolean
    text_color?: boolean
  }
): string {
  const header = ['id', 'speaker', 'text', 'note', 'scene']
  if (cols.emotion) header.push('emotion')
  if (cols.condition) header.push('condition')
  if (cols.audio) header.push('audio')
  if (cols.focus_node) header.push('focus_node')
  if (cols.font_size) header.push('font_size')
  if (cols.text_color) header.push('text_color')
  const rows: string[][] = [header]
  for (const line of lines) {
    const row = [line.id, line.speaker, line.text, line.note, line.scene]
    if (cols.emotion) row.push(line.emotion)
    if (cols.condition) row.push(line.condition)
    if (cols.audio) row.push(line.audio)
    if (cols.focus_node) row.push(line.focus_node ?? '')
    if (cols.font_size) row.push(normalizeFontSize(line.font_size ?? '').value)
    if (cols.text_color) row.push(normalizeTextColor(line.text_color ?? '').value)
    rows.push(row)
  }
  return serializeCsv(rows)
}

export function exportLocaleCsv(lines: DialogueLine[], langKey: string): string {
  const rows: string[][] = [['keys', langKey]]
  for (const line of lines) {
    rows.push([line.id, line.text])
  }
  return serializeCsv(rows)
}

export const CHARACTER_COLOR_PRESETS = [
  '#88c0d0',
  '#a3be8c',
  '#ebcb8b',
  '#d08770',
  '#b48ead',
  '#bf616a',
  '#5e81ac',
  '#8fbcbb'
]
