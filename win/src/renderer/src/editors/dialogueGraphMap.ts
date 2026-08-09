/**
 * Pure mapping between dialogue graph (xyflow) and disk CSV / choices / layout.
 */

import type { Edge, Node } from '@xyflow/react'
import {
  DIALOGUE_END_NODE_ID,
  type DialogueChoicesFile,
  type DialogueLayoutFile,
  type DialogueLine
} from './dialogueCsv'

export type DialogueNodeData = {
  kind: 'line' | 'end'
  line?: DialogueLine
  speakerName?: string
  speakerColor?: string
  isOpening?: boolean
  choiceCount?: number
}

export type DialogueFlowNode = Node<DialogueNodeData>
export type DialogueEdgeKind = 'sequence' | 'choice'

export type DialogueFlowEdge = Edge & {
  data?: { kind: DialogueEdgeKind; label?: string }
}

/** Theme-aware label chrome for choice edges (avoids RF default white pill). */
export const CHOICE_EDGE_LABEL_STYLE = {
  fill: 'var(--fg-bright)',
  fontSize: 10,
  fontWeight: 500
} as const

export const CHOICE_EDGE_LABEL_BG_STYLE = {
  fill: 'var(--bg-elev-3)',
  stroke: 'var(--border)',
  strokeWidth: 1
} as const

const NODE_GAP_Y = 120
const NODE_X = 80
const END_OFFSET_X = 320

export function autoLayoutPositions(
  lineIds: string[]
): { nodes: Record<string, { x: number; y: number }>; end: { x: number; y: number } } {
  const nodes: Record<string, { x: number; y: number }> = {}
  lineIds.forEach((id, i) => {
    nodes[id] = { x: NODE_X, y: 40 + i * NODE_GAP_Y }
  })
  return {
    nodes,
    end: { x: NODE_X + END_OFFSET_X, y: 40 + Math.max(0, lineIds.length - 1) * NODE_GAP_Y }
  }
}

function sortRootsByPosition(roots: DialogueFlowNode[]): DialogueFlowNode[] {
  return [...roots].sort((a, b) => {
    const dy = a.position.y - b.position.y
    if (Math.abs(dy) > 8) return dy
    return a.position.x - b.position.x
  })
}

/** Would adding sequence edge source→target create a cycle among sequence edges? */
export function wouldCreateSequenceCycle(
  edges: DialogueFlowEdge[],
  source: string,
  target: string
): boolean {
  if (source === target) return true
  const seq = edges.filter((e) => e.data?.kind === 'sequence')
  const adj = new Map<string, string[]>()
  for (const e of seq) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  // Tentative edge
  if (!adj.has(source)) adj.set(source, [])
  adj.get(source)!.push(target)

  const seen = new Set<string>()
  const stack = [target]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const n of adj.get(cur) || []) stack.push(n)
  }
  return false
}

export function hasChoiceOut(edges: DialogueFlowEdge[], nodeId: string): boolean {
  return edges.some((e) => e.source === nodeId && e.data?.kind === 'choice')
}

export function hasSequenceOut(edges: DialogueFlowEdge[], nodeId: string): boolean {
  return edges.some((e) => e.source === nodeId && e.data?.kind === 'sequence')
}

/**
 * Load graph from disk structures.
 * Infers sequence edges between consecutive CSV rows that have no choice node.
 */
export function graphFromDisk(opts: {
  lines: DialogueLine[]
  choices: DialogueChoicesFile
  layout: DialogueLayoutFile | null
  speakerName?: (id: string) => string
  speakerColor?: (id: string) => string
}): { nodes: DialogueFlowNode[]; edges: DialogueFlowEdge[] } {
  const { lines, choices } = opts
  const layout =
    opts.layout && Object.keys(opts.layout.nodes).length
      ? opts.layout
      : { version: 1 as const, ...autoLayoutPositions(lines.map((l) => l.id)) }

  const choiceIds = new Set(Object.keys(choices.nodes || {}))
  const openingId = lines[0]?.id

  const nodes: DialogueFlowNode[] = lines.map((line) => {
    const pos = layout.nodes[line.id] || { x: NODE_X, y: 40 }
    const optsCount = choices.nodes[line.id]?.options?.length || 0
    return {
      id: line.id,
      type: 'dialogueLine',
      position: pos,
      data: {
        kind: 'line',
        line,
        speakerName: opts.speakerName?.(line.speaker),
        speakerColor: opts.speakerColor?.(line.speaker),
        isOpening: line.id === openingId,
        choiceCount: optsCount
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

  const edges: DialogueFlowEdge[] = []
  let edgeN = 0
  const nextId = (): string => `e${++edgeN}`

  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]
    if (choiceIds.has(a.id) && (choices.nodes[a.id]?.options?.length || 0) > 0) continue
    const b = lines[i + 1]
    edges.push({
      id: nextId(),
      source: a.id,
      target: b.id,
      sourceHandle: 'sequence',
      targetHandle: 'in',
      type: 'default',
      data: { kind: 'sequence' },
      className: 'dialogue-edge-sequence'
    })
  }

  for (const [fromId, node] of Object.entries(choices.nodes || {})) {
    for (const opt of node.options || []) {
      const toEnd = Boolean(opt.end)
      const target = toEnd ? DIALOGUE_END_NODE_ID : opt.goto
      if (!toEnd && !lines.some((l) => l.id === target)) continue
      edges.push({
        id: nextId(),
        source: fromId,
        target,
        sourceHandle: 'choice',
        targetHandle: 'in',
        type: 'default',
        label: opt.text,
        labelStyle: { ...CHOICE_EDGE_LABEL_STYLE },
        labelBgStyle: { ...CHOICE_EDGE_LABEL_BG_STYLE },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        data: { kind: 'choice', label: opt.text },
        className: 'dialogue-edge-choice'
      })
    }
  }

  return { nodes, edges }
}

/**
 * Serialize graph → CSV lines (ordered), choices, layout.
 * Opening root = top-left-most root among sequence roots; its chain is first.
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
  const endNode = nodes.find((n) => n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end')

  const seqEdges = edges.filter((e) => e.data?.kind === 'sequence')
  const choiceEdges = edges.filter((e) => e.data?.kind === 'choice')

  const seqTargets = new Set(seqEdges.map((e) => e.target))
  const seqOut = new Map<string, string>()
  for (const e of seqEdges) {
    if (hasChoiceOut(edges, e.source)) continue
    if (!seqOut.has(e.source)) seqOut.set(e.source, e.target)
  }

  const roots = sortRootsByPosition(lineNodes.filter((n) => !seqTargets.has(n.id)))
  const visited = new Set<string>()
  const ordered: DialogueLine[] = []

  const walkChain = (start: DialogueFlowNode): void => {
    let cur: DialogueFlowNode | undefined = start
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id)
      if (cur.data.line) ordered.push({ ...cur.data.line })
      if (hasChoiceOut(edges, cur.id)) break
      const nextId = seqOut.get(cur.id)
      if (!nextId) break
      cur = lineNodes.find((n) => n.id === nextId)
    }
  }

  for (const root of roots) walkChain(root)

  // Orphans / remaining (choice-only reachable, etc.)
  const rest = sortRootsByPosition(lineNodes.filter((n) => !visited.has(n.id)))
  for (const n of rest) walkChain(n)

  const choices: DialogueChoicesFile = { version: 1, nodes: {} }
  for (const e of choiceEdges) {
    if (!lineNodes.some((n) => n.id === e.source)) continue
    const text = (e.data?.label || (typeof e.label === 'string' ? e.label : '') || '').trim()
    if (!text) continue
    const isEnd = e.target === DIALOGUE_END_NODE_ID
    if (!choices.nodes[e.source]) choices.nodes[e.source] = { options: [] }
    if (isEnd) {
      choices.nodes[e.source].options.push({ text, goto: '', end: true })
    } else {
      choices.nodes[e.source].options.push({ text, goto: e.target })
    }
  }

  const layoutNodes: DialogueLayoutFile['nodes'] = {}
  for (const n of lineNodes) {
    layoutNodes[n.id] = { x: n.position.x, y: n.position.y }
  }
  const layout: DialogueLayoutFile = {
    version: 1,
    nodes: layoutNodes,
    end: endNode
      ? { x: endNode.position.x, y: endNode.position.y }
      : autoLayoutPositions(ordered.map((l) => l.id)).end
  }

  const openingId = ordered[0]?.id ?? null
  return { lines: ordered, choices, layout, openingId }
}

export function refreshNodePresentation(
  nodes: DialogueFlowNode[],
  edges: DialogueFlowEdge[],
  openingId: string | null,
  speakerName?: (id: string) => string,
  speakerColor?: (id: string) => string
): DialogueFlowNode[] {
  return nodes.map((n) => {
    if (n.data?.kind !== 'line' || !n.data.line) return n
    const line = n.data.line
    return {
      ...n,
      data: {
        ...n.data,
        speakerName: speakerName?.(line.speaker) ?? n.data.speakerName,
        speakerColor: speakerColor?.(line.speaker) ?? n.data.speakerColor,
        isOpening: openingId === n.id,
        choiceCount: edges.filter((e) => e.source === n.id && e.data?.kind === 'choice').length
      }
    }
  })
}

export function listBrokenRefsIfDelete(
  nodeId: string,
  edges: DialogueFlowEdge[]
): { edgeId: string; from: string; label: string }[] {
  return edges
    .filter((e) => e.target === nodeId && e.data?.kind === 'choice')
    .map((e) => ({
      edgeId: e.id,
      from: e.source,
      label: String(e.data?.label || e.label || '')
    }))
}
