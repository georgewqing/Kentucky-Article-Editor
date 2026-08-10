/**
 * Pure mapping between dialogue graph (xyflow) and disk CSV / choices / layout.
 * Protocol v1.3: every outgoing edge is an option (no sequence edges).
 */

import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import {
  DIALOGUE_END_NODE_ID,
  type DialogueChoicesFile,
  type DialogueLayoutFile,
  type DialogueLine
} from './dialogueCsv'

export type DialogueChoiceOut = {
  text: string
  isEnd: boolean
}

export type DialogueNodeData = {
  kind: 'line' | 'end'
  line?: DialogueLine
  speakerName?: string
  speakerColor?: string
  isOpening?: boolean
  choiceCount?: number
  /** Outgoing options for in-node chips (edge keeps data.label). */
  choiceOuts?: DialogueChoiceOut[]
  /** Speaker is player-operable (empty-text waits confirm); else NPC auto-advance. */
  speakerOperable?: boolean
  /** @deprecated use choiceOuts */
  choiceLabels?: string[]
}

export type DialogueFlowNode = Node<DialogueNodeData>
/** v1.3: only option edges (legacy 'sequence' treated as option on read). */
export type DialogueEdgeKind = 'choice'

export type DialogueFlowEdge = Edge & {
  data?: { kind: DialogueEdgeKind; label?: string }
  pathOptions?: { offset?: number; borderRadius?: number }
}

export const CHOICE_EDGE_LABEL_STYLE = {
  fill: 'var(--fg-muted)',
  fontSize: 9,
  fontWeight: 600
} as const

export const CHOICE_EDGE_LABEL_BG_STYLE = {
  fill: 'var(--bg-elev-3)',
  stroke: 'var(--border)',
  strokeWidth: 1
} as const

export const CHOICE_EDGE_LABEL_BG_PADDING: [number, number] = [3, 5]

export const CHOICE_EDGE_PATH_OPTIONS = { offset: 24, borderRadius: 8 } as const

const NODE_GAP_Y = 140
const NODE_X = 80
const END_OFFSET_X = 80
const LINE_W = 220
const LINE_H_BASE = 90
const LINE_CHIP_ROW = 22
const END_W = 56
const END_H = 56
const END_EDGE_WEIGHT = 4

export function truncateChoiceLabel(text: string, maxChars = 14): string {
  const t = (text || '').trim()
  const chars = Array.from(t)
  if (chars.length <= maxChars) return t
  return chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…'
}

function lineNodeHeight(choiceCount: number): number {
  if (choiceCount <= 0) return LINE_H_BASE
  return LINE_H_BASE + 8 + Math.min(choiceCount, 6) * LINE_CHIP_ROW
}

export function choiceEdgeVisualProps(index: number): {
  type: 'smoothstep'
  label: string
  labelStyle: typeof CHOICE_EDGE_LABEL_STYLE
  labelBgStyle: typeof CHOICE_EDGE_LABEL_BG_STYLE
  labelBgPadding: [number, number]
  labelBgBorderRadius: number
  labelShowBg: boolean
  pathOptions: typeof CHOICE_EDGE_PATH_OPTIONS
} {
  return {
    type: 'smoothstep',
    label: String(index),
    labelStyle: { ...CHOICE_EDGE_LABEL_STYLE },
    labelBgStyle: { ...CHOICE_EDGE_LABEL_BG_STYLE },
    labelBgPadding: CHOICE_EDGE_LABEL_BG_PADDING,
    labelBgBorderRadius: 4,
    labelShowBg: true,
    pathOptions: { ...CHOICE_EDGE_PATH_OPTIONS }
  }
}

/** Assign per-source indices and smoothstep styling for all option edges. */
export function decorateDialogueEdges(edges: DialogueFlowEdge[]): DialogueFlowEdge[] {
  const choiceIndex = new Map<string, number>()
  return edges.map((e) => {
    const next = (choiceIndex.get(e.source) || 0) + 1
    choiceIndex.set(e.source, next)
    const full = String(e.data?.label ?? '')
    return {
      ...e,
      ...choiceEdgeVisualProps(next),
      sourceHandle: 'out',
      targetHandle: e.targetHandle || 'in',
      data: { kind: 'choice' as const, label: full },
      className: 'dialogue-edge-choice'
    }
  })
}

export function autoLayoutPositions(
  lineIds: string[]
): { nodes: Record<string, { x: number; y: number }>; end: { x: number; y: number } } {
  const nodes: Record<string, { x: number; y: number }> = {}
  lineIds.forEach((id, i) => {
    nodes[id] = { x: NODE_X, y: 40 + i * NODE_GAP_Y }
  })
  return {
    nodes,
    end: { x: NODE_X + END_OFFSET_X, y: 40 + Math.max(0, lineIds.length) * NODE_GAP_Y }
  }
}

/**
 * Layered TB layout via dagre (all option edges).
 * End stays a bottom sink; x centered on End sources.
 */
export function layoutDialogueFlow(
  nodes: DialogueFlowNode[],
  edges: DialogueFlowEdge[],
  opts?: { nodesep?: number; ranksep?: number }
): DialogueFlowNode[] {
  if (!nodes.length) return nodes

  const choiceCountById = new Map<string, number>()
  for (const e of edges) {
    choiceCountById.set(e.source, (choiceCountById.get(e.source) || 0) + 1)
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: opts?.nodesep ?? 90,
    ranksep: opts?.ranksep ?? 130,
    marginx: 48,
    marginy: 48
  })

  for (const n of nodes) {
    const isEnd = n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end'
    const chips = choiceCountById.get(n.id) || n.data?.choiceOuts?.length || 0
    g.setNode(n.id, {
      width: isEnd ? END_W : LINE_W,
      height: isEnd ? END_H : lineNodeHeight(chips)
    })
  }

  const seen = new Set<string>()
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
    const key = `${e.source}->${e.target}`
    if (seen.has(key)) continue
    seen.add(key)
    const toEnd = e.target === DIALOGUE_END_NODE_ID
    g.setEdge(e.source, e.target, toEnd ? { weight: END_EDGE_WEIGHT } : {})
  }

  dagre.layout(g)

  let next = nodes.map((n) => {
    const pos = g.node(n.id) as { x: number; y: number } | undefined
    if (!pos) return n
    const isEnd = n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end'
    const chips = choiceCountById.get(n.id) || n.data?.choiceOuts?.length || 0
    const w = isEnd ? END_W : LINE_W
    const h = isEnd ? END_H : lineNodeHeight(chips)
    return {
      ...n,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 }
    }
  })

  const endIdx = next.findIndex((n) => n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end')
  if (endIdx >= 0) {
    const endNode = next[endIdx]
    const endSources = edges
      .filter((e) => e.target === DIALOGUE_END_NODE_ID)
      .map((e) => next.find((n) => n.id === e.source))
      .filter((n): n is DialogueFlowNode => Boolean(n))
    if (endSources.length > 0) {
      const xs = endSources.map((n) => n.position.x + LINE_W / 2).sort((a, b) => a - b)
      const mid = xs[Math.floor(xs.length / 2)]
      next = next.map((n, i) =>
        i === endIdx
          ? { ...n, position: { x: mid - END_W / 2, y: endNode.position.y } }
          : n
      )
    }
  }

  return next
}

export function layoutFileFromNodes(nodes: DialogueFlowNode[]): DialogueLayoutFile {
  const layoutNodes: DialogueLayoutFile['nodes'] = {}
  let end: { x: number; y: number } | undefined
  for (const n of nodes) {
    if (n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end') {
      end = { x: n.position.x, y: n.position.y }
      continue
    }
    if (n.data?.kind === 'line') {
      layoutNodes[n.id] = { x: n.position.x, y: n.position.y }
    }
  }
  const out: DialogueLayoutFile = { version: 1, nodes: layoutNodes }
  if (end) out.end = end
  return out
}

function sortByPosition(nodes: DialogueFlowNode[]): DialogueFlowNode[] {
  return [...nodes].sort((a, b) => {
    const dy = a.position.y - b.position.y
    if (Math.abs(dy) > 8) return dy
    return a.position.x - b.position.x
  })
}

export function hasChoiceOut(edges: DialogueFlowEdge[], nodeId: string): boolean {
  return edges.some((e) => e.source === nodeId)
}

/** True if adding an option with `newLabel` would mix empty and non-empty texts on source. */
export function wouldCreateMixedEmptyOptions(
  edges: DialogueFlowEdge[],
  source: string,
  newLabel: string,
  excludeEdgeId?: string
): boolean {
  const existing = edges
    .filter((e) => e.source === source && e.id !== excludeEdgeId)
    .map((e) => String(e.data?.label ?? '').trim())
  if (!existing.length) return false
  const nextEmpty = newLabel.trim() === ''
  const hasEmpty = existing.some((t) => t === '')
  const hasNonEmpty = existing.some((t) => t !== '')
  if (nextEmpty && hasNonEmpty) return true
  if (!nextEmpty && hasEmpty) return true
  return false
}

/**
 * Load graph from disk (protocol v1.3).
 * - Choices options → option edges (empty text allowed).
 * - Lines with no options: synthesize empty-text edge to CSV next row.
 * - No choices file / empty nodes: synthesize full CSV adjacency chain.
 */
export function graphFromDisk(opts: {
  lines: DialogueLine[]
  choices: DialogueChoicesFile
  layout: DialogueLayoutFile | null
  speakerName?: (id: string) => string
  speakerColor?: (id: string) => string
  speakerOperable?: (id: string) => boolean
}): { nodes: DialogueFlowNode[]; edges: DialogueFlowEdge[] } {
  const { lines, choices } = opts
  const hasLayout = Boolean(opts.layout && Object.keys(opts.layout.nodes).length)
  const layout =
    hasLayout && opts.layout
      ? opts.layout
      : { version: 1 as const, ...autoLayoutPositions(lines.map((l) => l.id)) }

  const openingId = lines[0]?.id
  const idSet = new Set(lines.map((l) => l.id).filter(Boolean))

  let edges: DialogueFlowEdge[] = []
  let edgeN = 0
  const nextId = (): string => `e${++edgeN}`
  const sourcesWithOptions = new Set<string>()

  for (const [fromId, node] of Object.entries(choices.nodes || {})) {
    if (!idSet.has(fromId)) continue
    for (const opt of node.options || []) {
      const toEnd = Boolean(opt.end)
      const target = toEnd ? DIALOGUE_END_NODE_ID : (opt.goto || '').trim()
      if (!toEnd && !idSet.has(target)) continue
      sourcesWithOptions.add(fromId)
      edges.push({
        id: nextId(),
        source: fromId,
        target: toEnd ? DIALOGUE_END_NODE_ID : target,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'smoothstep',
        data: { kind: 'choice', label: opt.text ?? '' },
        className: 'dialogue-edge-choice'
      })
    }
  }

  // Migrate: lines with no options yet → empty-text edge to CSV next row.
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]
    if (!a?.id || sourcesWithOptions.has(a.id)) continue
    const b = lines[i + 1]
    if (!b?.id) continue
    sourcesWithOptions.add(a.id)
    edges.push({
      id: nextId(),
      source: a.id,
      target: b.id,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      data: { kind: 'choice', label: '' },
      className: 'dialogue-edge-choice'
    })
  }

  edges = decorateDialogueEdges(edges)

  let nodes: DialogueFlowNode[] = lines.map((line) => {
    const pos = layout.nodes[line.id] || { x: NODE_X, y: 40 }
    const outs = edges
      .filter((e) => e.source === line.id)
      .map((e) => ({
        text: String(e.data?.label ?? ''),
        isEnd: e.target === DIALOGUE_END_NODE_ID
      }))
    return {
      id: line.id,
      type: 'dialogueLine',
      position: pos,
      data: {
        kind: 'line',
        line,
        speakerName: opts.speakerName?.(line.speaker),
        speakerColor: opts.speakerColor?.(line.speaker),
        speakerOperable: opts.speakerOperable?.(line.speaker),
        isOpening: line.id === openingId,
        choiceCount: outs.length,
        choiceOuts: outs,
        choiceLabels: outs.map((o) => o.text)
      }
    }
  })

  const endPos = layout.end || {
    x: NODE_X + END_OFFSET_X,
    y: 40 + Math.max(0, lines.length) * NODE_GAP_Y
  }
  nodes.push({
    id: DIALOGUE_END_NODE_ID,
    type: 'dialogueEnd',
    position: endPos,
    data: { kind: 'end' },
    deletable: false
  })

  if (!hasLayout && nodes.length > 1) {
    nodes = layoutDialogueFlow(nodes, edges)
  }

  return { nodes, edges }
}

/**
 * Serialize graph → CSV lines, choices, layout (protocol v1.3).
 * Opening = top-left-most line with no incoming option edges → CSV first row.
 * Empty-text options are written; nodes empty → caller may delete choices file.
 */
export function diskFromGraph(
  nodes: DialogueFlowNode[],
  edges: DialogueFlowEdge[]
): {
  lines: DialogueLine[]
  choices: DialogueChoicesFile
  layout: DialogueLayoutFile
  openingId: string | null
} {
  const lineNodes = nodes.filter((n) => n.data?.kind === 'line' && n.data.line)

  const optionEdges = edges.filter((e) => lineNodes.some((n) => n.id === e.source))
  const targets = new Set(
    optionEdges.filter((e) => e.target !== DIALOGUE_END_NODE_ID).map((e) => e.target)
  )
  const roots = sortByPosition(lineNodes.filter((n) => !targets.has(n.id)))
  const opening = roots[0] || sortByPosition(lineNodes)[0] || null
  const openingId = opening?.id ?? null

  const ordered: DialogueLine[] = []
  const visited = new Set<string>()
  if (opening?.data.line) {
    ordered.push({ ...opening.data.line })
    visited.add(opening.id)
  }
  for (const n of sortByPosition(lineNodes)) {
    if (visited.has(n.id) || !n.data.line) continue
    ordered.push({ ...n.data.line })
    visited.add(n.id)
  }

  const choices: DialogueChoicesFile = { version: 1, nodes: {} }
  for (const e of optionEdges) {
    if (!lineNodes.some((n) => n.id === e.source)) continue
    const text = String(e.data?.label ?? '')
    const isEnd = e.target === DIALOGUE_END_NODE_ID
    if (!choices.nodes[e.source]) choices.nodes[e.source] = { options: [] }
    if (isEnd) {
      choices.nodes[e.source].options.push({ text, goto: '', end: true })
    } else {
      choices.nodes[e.source].options.push({ text, goto: e.target })
    }
  }

  const layout = layoutFileFromNodes(nodes)
  if (!layout.end) {
    layout.end = autoLayoutPositions(ordered.map((l) => l.id)).end
  }

  return { lines: ordered, choices, layout, openingId }
}

export function refreshNodePresentation(
  nodes: DialogueFlowNode[],
  edges: DialogueFlowEdge[],
  openingId: string | null,
  speakerName?: (id: string) => string,
  speakerColor?: (id: string) => string,
  speakerOperable?: (id: string) => boolean
): DialogueFlowNode[] {
  return nodes.map((n) => {
    if (n.data?.kind !== 'line' || !n.data.line) return n
    const line = n.data.line
    const choiceOuts = edges
      .filter((e) => e.source === n.id)
      .map((e) => ({
        text: String(e.data?.label ?? ''),
        isEnd: e.target === DIALOGUE_END_NODE_ID
      }))
    return {
      ...n,
      data: {
        ...n.data,
        speakerName: speakerName?.(line.speaker) ?? n.data.speakerName,
        speakerColor: speakerColor?.(line.speaker) ?? n.data.speakerColor,
        speakerOperable: speakerOperable?.(line.speaker) ?? n.data.speakerOperable,
        isOpening: openingId === n.id,
        choiceCount: choiceOuts.length,
        choiceOuts,
        choiceLabels: choiceOuts.map((o) => o.text)
      }
    }
  })
}

export function listBrokenRefsIfDelete(
  nodeId: string,
  edges: DialogueFlowEdge[]
): { edgeId: string; from: string; label: string }[] {
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => ({
      edgeId: e.id,
      from: e.source,
      label: String(e.data?.label || e.label || '')
    }))
}

/** Edge ids on any path from `fromId` toward End (forks included). */
export function edgesOnPathsTowardEnd(
  fromId: string,
  edges: DialogueFlowEdge[]
): Set<string> {
  if (!fromId || fromId === DIALOGUE_END_NODE_ID) return new Set()

  const adj = new Map<string, DialogueFlowEdge[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e)
  }

  const canReachEnd = new Map<string, boolean>()
  const visiting = new Set<string>()
  const reachesEnd = (nodeId: string): boolean => {
    if (nodeId === DIALOGUE_END_NODE_ID) return true
    if (canReachEnd.has(nodeId)) return canReachEnd.get(nodeId)!
    if (visiting.has(nodeId)) return false
    visiting.add(nodeId)
    let ok = false
    for (const e of adj.get(nodeId) || []) {
      if (reachesEnd(e.target)) {
        ok = true
        break
      }
    }
    visiting.delete(nodeId)
    canReachEnd.set(nodeId, ok)
    return ok
  }

  const flowing = new Set<string>()
  const queue = [fromId]
  const seen = new Set<string>([fromId])
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of adj.get(cur) || []) {
      if (!reachesEnd(e.target) && e.target !== DIALOGUE_END_NODE_ID) continue
      flowing.add(e.id)
      if (e.target !== DIALOGUE_END_NODE_ID && !seen.has(e.target)) {
        seen.add(e.target)
        queue.push(e.target)
      }
    }
  }
  return flowing
}
