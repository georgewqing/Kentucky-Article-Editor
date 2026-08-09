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

export function emptyDialogueLine(partial?: Partial<DialogueLine>): DialogueLine {
  return {
    id: '',
    speaker: '',
    text: '',
    note: '',
    emotion: '',
    scene: '',
    condition: '',
    audio: '',
    focus_node: '',
    font_size: '',
    text_color: '',
    ...partial
  }
}

/** Protocol v1.2 branching sidecar (Godot reads; Kentucky graph options). */
export interface DialogueChoiceOption {
  text: string
  goto: string
  end?: boolean
}

export interface DialogueChoicesFile {
  version: 1
  nodes: Record<string, { options: DialogueChoiceOption[] }>
}

/** Kentucky-only canvas coordinates (Godot ignores). */
export interface DialogueLayoutFile {
  version: 1
  nodes: Record<string, { x: number; y: number }>
  end?: { x: number; y: number }
}

export const DIALOGUE_CHOICES_EXT = '.dialogue.choices.json'
export const DIALOGUE_LAYOUT_EXT = '.dialogue.layout.json'
export const DIALOGUE_CSV_EXT = '.dialogue.csv'

export function dialogueStemPaths(absOrRelDialogueCsv: string): {
  csv: string
  choices: string
  layout: string
} {
  const csv = absOrRelDialogueCsv
  const lower = csv.toLowerCase()
  const idx = lower.lastIndexOf(DIALOGUE_CSV_EXT)
  if (idx < 0) {
    return {
      csv,
      choices: csv + DIALOGUE_CHOICES_EXT,
      layout: csv + DIALOGUE_LAYOUT_EXT
    }
  }
  const stem = csv.slice(0, idx)
  return {
    csv,
    choices: stem + DIALOGUE_CHOICES_EXT,
    layout: stem + DIALOGUE_LAYOUT_EXT
  }
}

/** Map sidecar abs path → sibling *.dialogue.csv abs path, or null. */
export function siblingDialogueCsvPath(absPath: string): string | null {
  const norm = absPath.replace(/\\/g, '/')
  const lower = norm.toLowerCase()
  for (const ext of [DIALOGUE_CHOICES_EXT, DIALOGUE_LAYOUT_EXT] as const) {
    if (lower.endsWith(ext)) {
      return norm.slice(0, -ext.length) + DIALOGUE_CSV_EXT
    }
  }
  return null
}

export function emptyDialogueChoices(): DialogueChoicesFile {
  return { version: 1, nodes: {} }
}

export function parseDialogueChoices(text: string): DialogueChoicesFile {
  try {
    const raw = JSON.parse(text) as Partial<DialogueChoicesFile>
    const nodes: DialogueChoicesFile['nodes'] = {}
    if (raw?.nodes && typeof raw.nodes === 'object') {
      for (const [lineId, node] of Object.entries(raw.nodes)) {
        const id = String(lineId || '').trim()
        if (!id || !node || !Array.isArray(node.options)) continue
        const options: DialogueChoiceOption[] = []
        for (const opt of node.options) {
          if (!opt || typeof opt !== 'object') continue
          const textVal = typeof opt.text === 'string' ? opt.text.trim() : ''
          if (!textVal) continue
          const end = Boolean(opt.end)
          const goto = typeof opt.goto === 'string' ? opt.goto.trim() : ''
          options.push(end ? { text: textVal, goto: '', end: true } : { text: textVal, goto })
        }
        if (options.length) nodes[id] = { options }
      }
    }
    return { version: 1, nodes }
  } catch {
    return emptyDialogueChoices()
  }
}

/** Empty nodes → empty string (caller should delete the file). */
export function serializeDialogueChoices(file: DialogueChoicesFile): string {
  const nodes: DialogueChoicesFile['nodes'] = {}
  for (const [id, node] of Object.entries(file.nodes || {})) {
    const options = (node?.options || [])
      .map((o) => {
        const text = (o.text || '').trim()
        if (!text) return null
        if (o.end) return { text, goto: '', end: true as const }
        return { text, goto: (o.goto || '').trim() }
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
    if (!id || typeof pos?.x !== 'number' || typeof pos?.y !== 'number') continue
    nodes[id] = { x: pos.x, y: pos.y }
  }
  const out: DialogueLayoutFile = { version: 1, nodes }
  if (file.end && typeof file.end.x === 'number' && typeof file.end.y === 'number') {
    out.end = { x: file.end.x, y: file.end.y }
  }
  return JSON.stringify(out, null, 2) + '\n'
}

const LAYOUT_GAP_Y = 120
const LAYOUT_GAP_X = 280
const LAYOUT_BASE_X = 80

/** Linear column layout (matches Kentucky canvas default). */
export function autoLayoutDialogueLinear(lineIds: string[]): DialogueLayoutFile {
  const nodes: DialogueLayoutFile['nodes'] = {}
  lineIds.forEach((id, i) => {
    nodes[id] = { x: LAYOUT_BASE_X, y: 40 + i * LAYOUT_GAP_Y }
  })
  return {
    version: 1,
    nodes,
    end: {
      x: LAYOUT_BASE_X + LAYOUT_GAP_X,
      y: 40 + Math.max(0, lineIds.length - 1) * LAYOUT_GAP_Y
    }
  }
}

/**
 * Branch-aware canvas layout for agent “排版”:
 * main CSV order in left column; choice targets fan out to the right.
 */
export function layoutDialogueGraph(
  lineIds: string[],
  choices: DialogueChoicesFile
): DialogueLayoutFile {
  const nodes: DialogueLayoutFile['nodes'] = {}
  const placed = new Set<string>()
  let y = 40
  let maxCol = 0
  let endY = 40

  for (const id of lineIds) {
    if (placed.has(id)) continue
    nodes[id] = { x: LAYOUT_BASE_X, y }
    placed.add(id)
    endY = Math.max(endY, y)
    const opts = choices.nodes[id]?.options || []
    if (opts.length) {
      let col = 1
      for (const opt of opts) {
        if (opt.end) {
          maxCol = Math.max(maxCol, col)
          continue
        }
        const goto = (opt.goto || '').trim()
        if (goto && !placed.has(goto)) {
          nodes[goto] = { x: LAYOUT_BASE_X + col * LAYOUT_GAP_X, y }
          placed.add(goto)
          maxCol = Math.max(maxCol, col)
          col += 1
        }
      }
    }
    y += LAYOUT_GAP_Y
  }

  for (const id of lineIds) {
    if (placed.has(id)) continue
    nodes[id] = { x: LAYOUT_BASE_X, y }
    placed.add(id)
    endY = Math.max(endY, y)
    y += LAYOUT_GAP_Y
  }

  return {
    version: 1,
    nodes,
    end: {
      x: LAYOUT_BASE_X + Math.max(1, maxCol + 1) * LAYOUT_GAP_X,
      y: endY
    }
  }
}

export function summarizeDialogueGraph(
  lines: DialogueLine[],
  choices: DialogueChoicesFile
): {
  openingId: string | null
  sequenceChains: string[][]
  choiceNodes: Array<{
    after: string
    options: Array<{ text: string; goto: string; end: boolean }>
  }>
  warnings: string[]
} {
  const idSet = new Set(lines.map((l) => l.id).filter(Boolean))
  const warnings: string[] = []
  const choiceNodes = Object.entries(choices.nodes).map(([after, node]) => ({
    after,
    options: (node.options || []).map((o) => ({
      text: o.text || '',
      goto: o.end ? '' : o.goto || '',
      end: Boolean(o.end)
    }))
  }))

  for (const cn of choiceNodes) {
    if (!idSet.has(cn.after)) {
      warnings.push(`choices key "${cn.after}" is not a line id in CSV`)
    }
    for (const o of cn.options) {
      if (!o.end && o.goto && !idSet.has(o.goto)) {
        warnings.push(`option "${o.text}" goto "${o.goto}" missing from CSV`)
      }
    }
  }

  // Sequence chains: consecutive CSV rows until a choice node (protocol: choices pause row order).
  const chains: string[][] = []
  let cur: string[] = []
  for (const line of lines) {
    if (!line.id) continue
    cur.push(line.id)
    if (choices.nodes[line.id]?.options?.length) {
      chains.push(cur)
      cur = []
    }
  }
  if (cur.length) chains.push(cur)

  return {
    openingId: lines[0]?.id || null,
    sequenceChains: chains,
    choiceNodes,
    warnings
  }
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
