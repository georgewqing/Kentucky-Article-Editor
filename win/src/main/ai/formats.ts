/** Shared literary format helpers for main-process AI tools (no renderer imports). */

export interface DialogueLine {
  id: string
  speaker: string
  text: string
  note: string
  emotion: string
  scene: string
  condition: string
  audio: string
  focus_node: string
  font_size: string
  text_color: string
}

export interface Character {
  id: string
  name: string
  color: string
  note: string
  model_node: string
}

const DIALOGUE_HEADER =
  'id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color'

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function escapeCsv(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function parseDialogueCsv(text: string): { lines: DialogueLine[] } {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (rows.length === 0) return { lines: [] }
  const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string): number => header.indexOf(name)
  const lines: DialogueLine[] = []
  for (let r = 1; r < rows.length; r++) {
    const cols = parseCsvLine(rows[r])
    const get = (name: string): string => {
      const i = idx(name)
      return i >= 0 ? (cols[i] ?? '') : ''
    }
    lines.push({
      id: get('id'),
      speaker: get('speaker'),
      text: get('text'),
      note: get('note'),
      emotion: get('emotion'),
      scene: get('scene'),
      condition: get('condition'),
      audio: get('audio'),
      focus_node: get('focus_node'),
      font_size: get('font_size'),
      text_color: get('text_color')
    })
  }
  return { lines }
}

export function serializeDialogueCsv(lines: DialogueLine[]): string {
  const rows = [DIALOGUE_HEADER]
  for (const l of lines) {
    rows.push(
      [
        l.id,
        l.speaker,
        l.text,
        l.note,
        l.emotion,
        l.scene,
        l.condition,
        l.audio,
        l.focus_node,
        l.font_size,
        l.text_color
      ]
        .map(escapeCsv)
        .join(',')
    )
  }
  return rows.join('\n') + '\n'
}

export function parseCharactersCsv(text: string): Character[] {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (rows.length === 0) return []
  const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string): number => header.indexOf(name)
  const out: Character[] = []
  for (let r = 1; r < rows.length; r++) {
    const cols = parseCsvLine(rows[r])
    const get = (name: string): string => {
      const i = idx(name)
      return i >= 0 ? (cols[i] ?? '') : ''
    }
    const id = get('id')
    if (!id) continue
    out.push({
      id,
      name: get('name') || id,
      color: get('color') || '#88c0d0',
      note: get('note'),
      model_node: get('model_node')
    })
  }
  return out
}

export function serializeCharactersCsv(chars: Character[]): string {
  const rows = ['id,name,color,note,model_node']
  for (const c of chars) {
    rows.push([c.id, c.name, c.color, c.note, c.model_node].map(escapeCsv).join(','))
  }
  return rows.join('\n') + '\n'
}

export type KMindShape = 'rect' | 'rounded' | 'ellipse'

export interface KMindGraphNode {
  id: string
  text: string
  shape: KMindShape
  x: number
  y: number
  width: number
  height: number
  note?: string
  noteOpen?: boolean
}

export interface KMindGraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface KMindDocument {
  version: 2
  nodes: KMindGraphNode[]
  edges: KMindGraphEdge[]
  viewport: { x: number; y: number; zoom: number }
}

let idCounter = 0

export function newNodeId(prefix = 'n'): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

export function newEdgeId(): string {
  return newNodeId('e')
}

export function parseKMind(text: string): KMindDocument {
  const data = JSON.parse(text) as KMindDocument
  if (!data || data.version !== 2 || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Invalid .kmind')
  }
  return data
}

export function serializeKMind(doc: KMindDocument): string {
  return JSON.stringify(doc, null, 2) + '\n'
}
