/** Shared literary format helpers for main-process AI tools (no renderer imports). */

import dagre from '@dagrejs/dagre'

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
  /** Player-operable: empty-text options wait for confirm. Non-operable: auto-advance. */
  operable: boolean
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

/** Protocol v1.3 dialogue graph sidecar (Godot plays via options; empty text = confirm-to-continue). */
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

/** Empty nodes → empty string (caller should delete the file). */
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
    if (!id || typeof pos?.x !== 'number' || typeof pos?.y !== 'number') continue
    nodes[id] = { x: pos.x, y: pos.y }
  }
  const out: DialogueLayoutFile = { version: 1, nodes }
  if (file.end && typeof file.end.x === 'number' && typeof file.end.y === 'number') {
    out.end = { x: file.end.x, y: file.end.y }
  }
  return JSON.stringify(out, null, 2) + '\n'
}

const LAYOUT_GAP_Y = 140
const LAYOUT_GAP_X = 220
const LAYOUT_BASE_X = 80
const LAYOUT_LINE_W = 220
const LAYOUT_LINE_H = 90
const LAYOUT_CHIP_ROW = 22
const LAYOUT_END_W = 56
const LAYOUT_END_H = 56
const LAYOUT_END_WEIGHT = 4
/** Must match renderer `DIALOGUE_END_NODE_ID` (layout file only stores end x/y). */
const LAYOUT_END_ID = '__kentucky_end__'

function layoutLineHeight(choiceCount: number): number {
  if (choiceCount <= 0) return LAYOUT_LINE_H
  return LAYOUT_LINE_H + 8 + Math.min(choiceCount, 6) * LAYOUT_CHIP_ROW
}

/** Linear column layout (fallback when graph has no edges). */
export function autoLayoutDialogueLinear(lineIds: string[]): DialogueLayoutFile {
  const nodes: DialogueLayoutFile['nodes'] = {}
  lineIds.forEach((id, i) => {
    nodes[id] = { x: LAYOUT_BASE_X, y: 40 + i * LAYOUT_GAP_Y }
  })
  return {
    version: 1,
    nodes,
    end: {
      x: LAYOUT_BASE_X + Math.floor(LAYOUT_GAP_X / 2),
      y: 40 + Math.max(0, lineIds.length) * LAYOUT_GAP_Y
    }
  }
}

/**
 * Branch-aware canvas layout for agent “排版” (dagre TB + End bottom sink).
 * Protocol v1.3: edges from choices options (empty text continue included);
 * lines missing options get a synthetic empty-text link to the next CSV row.
 */
export function layoutDialogueGraph(
  lineIds: string[],
  choices: DialogueChoicesFile
): DialogueLayoutFile {
  const ids = lineIds.filter(Boolean)
  if (!ids.length) {
    return { version: 1, nodes: {}, end: { x: LAYOUT_BASE_X, y: 40 } }
  }

  const idSet = new Set(ids)
  const choiceCountById = new Map<string, number>()
  const sourcesWithOptions = new Set<string>()

  type LayoutEdge = { source: string; target: string; toEnd?: boolean }
  const edges: LayoutEdge[] = []
  const seen = new Set<string>()
  const addEdge = (source: string, target: string, toEnd = false): void => {
    if (source === target) return
    const key = `${source}->${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target, toEnd })
  }

  let hasEndEdge = false
  for (const [fromId, node] of Object.entries(choices.nodes || {})) {
    if (!idSet.has(fromId)) continue
    const opts = node.options || []
    if (!opts.length) continue
    sourcesWithOptions.add(fromId)
    choiceCountById.set(fromId, opts.length)
    for (const opt of opts) {
      if (opt.end) {
        addEdge(fromId, LAYOUT_END_ID, true)
        hasEndEdge = true
        continue
      }
      const goto = (opt.goto || '').trim()
      if (goto && idSet.has(goto)) addEdge(fromId, goto)
    }
  }

  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i]
    if (sourcesWithOptions.has(a)) continue
    addEdge(a, ids[i + 1])
    choiceCountById.set(a, (choiceCountById.get(a) || 0) + 1)
  }

  if (!edges.length) {
    return autoLayoutDialogueLinear(ids)
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: 90,
    ranksep: 130,
    marginx: 48,
    marginy: 48
  })

  for (const id of ids) {
    g.setNode(id, {
      width: LAYOUT_LINE_W,
      height: layoutLineHeight(choiceCountById.get(id) || 0)
    })
  }
  if (hasEndEdge) {
    g.setNode(LAYOUT_END_ID, { width: LAYOUT_END_W, height: LAYOUT_END_H })
  }

  for (const e of edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
    g.setEdge(e.source, e.target, e.toEnd ? { weight: LAYOUT_END_WEIGHT } : {})
  }

  dagre.layout(g)

  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of ids) {
    const pos = g.node(id) as { x: number; y: number } | undefined
    if (!pos) continue
    const h = layoutLineHeight(choiceCountById.get(id) || 0)
    positions[id] = { x: pos.x - LAYOUT_LINE_W / 2, y: pos.y - h / 2 }
  }

  let fallbackY = 40
  for (const p of Object.values(positions)) {
    fallbackY = Math.max(fallbackY, p.y + LAYOUT_GAP_Y)
  }
  for (const id of ids) {
    if (positions[id]) continue
    positions[id] = { x: LAYOUT_BASE_X, y: fallbackY }
    fallbackY += LAYOUT_GAP_Y
  }

  let endPos = { x: LAYOUT_BASE_X, y: fallbackY }
  if (hasEndEdge) {
    const pos = g.node(LAYOUT_END_ID) as { x: number; y: number } | undefined
    if (pos) {
      endPos = { x: pos.x - LAYOUT_END_W / 2, y: pos.y - LAYOUT_END_H / 2 }
    }
    const endSources = edges
      .filter((e) => e.target === LAYOUT_END_ID)
      .map((e) => positions[e.source])
      .filter(Boolean)
    if (endSources.length > 0) {
      const xs = endSources.map((p) => p.x + LAYOUT_LINE_W / 2).sort((a, b) => a - b)
      const mid = xs[Math.floor(xs.length / 2)]
      endPos = { x: mid - LAYOUT_END_W / 2, y: endPos.y }
    }
  }

  return {
    version: 1,
    nodes: positions,
    end: endPos
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
    const texts = cn.options.map((o) => o.text.trim())
    if (texts.some((t) => t === '') && texts.some((t) => t !== '')) {
      warnings.push(
        `choices "${cn.after}" mixes empty-text continue with labeled options (illegal in v1.3)`
      )
    }
    for (const o of cn.options) {
      if (!o.end && o.goto && !idSet.has(o.goto)) {
        warnings.push(`option "${o.text}" goto "${o.goto}" missing from CSV`)
      }
    }
  }

  // Empty-text continue chains via choices goto (not CSV row order).
  const emptyNext = new Map<string, string>()
  for (const cn of choiceNodes) {
    const onlyEmpty =
      cn.options.length === 1 && !cn.options[0].end && cn.options[0].text.trim() === ''
    if (onlyEmpty && cn.options[0].goto) emptyNext.set(cn.after, cn.options[0].goto)
  }
  const chains: string[][] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.id || seen.has(line.id) || !emptyNext.has(line.id)) continue
    const chain: string[] = [line.id]
    seen.add(line.id)
    let cur = emptyNext.get(line.id)
    while (cur && !seen.has(cur)) {
      chain.push(cur)
      seen.add(cur)
      cur = emptyNext.get(cur)
    }
    chains.push(chain)
  }

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
    const opRaw = get('operable').trim().toLowerCase()
    const operable = opRaw === '1' || opRaw === 'true' || opRaw === 'yes' || opRaw === 'y'
    out.push({
      id,
      name: get('name') || id,
      color: get('color') || '#88c0d0',
      note: get('note'),
      model_node: get('model_node'),
      operable
    })
  }
  return out
}

export function serializeCharactersCsv(chars: Character[]): string {
  const rows = ['id,name,color,note,model_node,operable']
  for (const c of chars) {
    rows.push(
      [c.id, c.name, c.color, c.note, c.model_node, c.operable ? '1' : '']
        .map(escapeCsv)
        .join(',')
    )
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
