import dagre from '@dagrejs/dagre'
import type { KMindDocument, KMindGraphEdge, KMindGraphNode } from './formats'

export type KMindRankDir = 'LR' | 'TB' | 'RL' | 'BT'

export interface LayoutKMindOptions {
  /** Sugiyama / dagre rank direction. Literary timelines prefer LR. */
  rankdir?: KMindRankDir
  nodesep?: number
  ranksep?: number
  marginx?: number
  marginy?: number
}

function estimateNodeSize(node: KMindGraphNode): { width: number; height: number } {
  const textLen = Array.from(node.text || '').length
  const width = Math.max(node.width || 160, Math.min(300, 48 + textLen * 14))
  const height = Math.max(node.height || 56, 48)
  return { width, height }
}

function handlesForRankdir(rankdir: KMindRankDir): {
  sourceHandle: string
  targetHandle: string
} {
  switch (rankdir) {
    case 'TB':
      return { sourceHandle: 'sb', targetHandle: 'tt' }
    case 'BT':
      return { sourceHandle: 'st', targetHandle: 'tb' }
    case 'RL':
      return { sourceHandle: 'sl', targetHandle: 'tr' }
    case 'LR':
    default:
      return { sourceHandle: 'sr', targetHandle: 'tl' }
  }
}

/**
 * Layered (Sugiyama-style) layout via dagre — same approach React Flow docs recommend.
 * Mutates node x/y/width/height and edge handles for readable flow.
 */
export function layoutKMindDocument(
  doc: KMindDocument,
  options: LayoutKMindOptions = {}
): KMindDocument {
  const rankdir = options.rankdir ?? 'LR'
  const { sourceHandle, targetHandle } = handlesForRankdir(rankdir)

  if (doc.nodes.length === 0) return doc

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir,
    nodesep: options.nodesep ?? 48,
    ranksep: options.ranksep ?? 80,
    marginx: options.marginx ?? 40,
    marginy: options.marginy ?? 40,
    edgesep: 24
  })

  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of doc.nodes) {
    const size = estimateNodeSize(node)
    sizes.set(node.id, size)
    g.setNode(node.id, { width: size.width, height: size.height })
  }

  const seen = new Set<string>()
  for (const edge of doc.edges) {
    if (!sizes.has(edge.source) || !sizes.has(edge.target)) continue
    if (edge.source === edge.target) continue
    const key = `${edge.source}->${edge.target}`
    if (seen.has(key)) continue
    seen.add(key)
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  for (const node of doc.nodes) {
    const laid = g.node(node.id)
    const size = sizes.get(node.id)!
    if (!laid) continue
    node.width = size.width
    node.height = size.height
    // dagre returns center; .kmind / React Flow use top-left
    node.x = Math.round(laid.x - size.width / 2)
    node.y = Math.round(laid.y - size.height / 2)
  }

  for (const edge of doc.edges) {
    edge.sourceHandle = sourceHandle
    edge.targetHandle = targetHandle
  }

  return doc
}

/** Drop duplicate edges and self-loops that destroy readability. */
export function sanitizeKMindEdges(doc: KMindDocument): KMindDocument {
  const seen = new Set<string>()
  const next: KMindGraphEdge[] = []
  for (const edge of doc.edges) {
    if (edge.source === edge.target) continue
    const key = `${edge.source}->${edge.target}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(edge)
  }
  doc.edges = next
  return doc
}
