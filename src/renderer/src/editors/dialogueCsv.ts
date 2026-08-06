/** Dialogue line + characters.csv helpers for Kentucky dialogue editor. */

export interface DialogueLine {
  id: string
  speaker: string
  text: string
  note: string
  emotion: string
  scene: string
  condition: string
  audio: string
}

export interface Character {
  id: string
  name: string
  color: string
  note: string
}

export const DIALOGUE_HEADER =
  'id,speaker,text,note,emotion,scene,condition,audio' as const

export const CHARACTERS_HEADER = 'id,name,color,note' as const

export const DIALOGUE_EXT = '.dialogue.csv'

export function isDialoguePath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith(DIALOGUE_EXT)
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
    audio: colIndex(header, 'audio')
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
      audio: get(idx.audio)
    })
  }
  return lines
}

export function serializeDialogueCsv(lines: DialogueLine[]): string {
  const rows: string[][] = [
    ['id', 'speaker', 'text', 'note', 'emotion', 'scene', 'condition', 'audio']
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
      line.audio
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
      note: get(noteI)
    })
  }
  return out
}

export function serializeCharactersCsv(chars: Character[]): string {
  const rows: string[][] = [['id', 'name', 'color', 'note']]
  for (const c of chars) {
    rows.push([c.id, c.name, c.color, c.note])
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
  cols: { emotion: boolean; condition: boolean; audio: boolean }
): string {
  const header = ['id', 'speaker', 'text', 'note', 'scene']
  if (cols.emotion) header.push('emotion')
  if (cols.condition) header.push('condition')
  if (cols.audio) header.push('audio')
  const rows: string[][] = [header]
  for (const line of lines) {
    const row = [line.id, line.speaker, line.text, line.note, line.scene]
    if (cols.emotion) row.push(line.emotion)
    if (cols.condition) row.push(line.condition)
    if (cols.audio) row.push(line.audio)
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
