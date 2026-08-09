import { useMemo } from 'react'
import {
  Panel,
  useNodes,
  useEdges,
  getNodesBounds,
  type Node
} from '@xyflow/react'
import { DIALOGUE_END_NODE_ID } from './dialogueCsv'
import type { DialogueNodeData } from './dialogueGraphMap'

const LINE_W = 200
const LINE_H = 72
const END_SIZE = 56
const MINIMAP_SIZE = { width: 168, height: 110 } as const

function nodeSize(n: Node<DialogueNodeData>): { w: number; h: number } {
  if (n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end') {
    return { w: END_SIZE, h: END_SIZE }
  }
  return {
    w: n.width ?? n.measured?.width ?? LINE_W,
    h: n.height ?? n.measured?.height ?? LINE_H
  }
}

function handleAnchor(
  n: Node<DialogueNodeData>,
  handleId: string | null
): { x: number; y: number } {
  const { w, h } = nodeSize(n)
  const { x, y } = n.position
  const cx = x + w / 2
  const cy = y + h / 2
  if (n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end') {
    if (handleId === 'in') return { x, y: cy }
    return { x: cx, y: cy }
  }
  switch (handleId) {
    case 'sequence':
      return { x: cx, y: y + h }
    case 'choice':
      return { x: x + w, y: cy }
    case 'in':
      return { x: cx, y }
    default:
      return { x: cx, y: cy }
  }
}

/** Custom minimap (nodes + edges) matching mind-map chrome — stock MiniMap has no edges. */
export function DialogueMiniMap({
  bgColor,
  nodeColor,
  edgeColor
}: {
  bgColor: string
  nodeColor: string
  edgeColor: string
}) {
  const width = MINIMAP_SIZE.width
  const height = MINIMAP_SIZE.height
  const nodes = useNodes() as Node<DialogueNodeData>[]
  const edges = useEdges()

  const bounds = useMemo(() => {
    if (!nodes.length) return { x: 0, y: 0, width, height }
    return getNodesBounds(
      nodes.map((n) => {
        const { w, h } = nodeSize(n)
        return { ...n, width: w, height: h }
      })
    )
  }, [nodes, width, height])

  const MIN_WORLD_W = 560
  const MIN_WORLD_H = 360
  const contentW = Math.max(bounds.width, MIN_WORLD_W)
  const contentH = Math.max(bounds.height, MIN_WORLD_H)
  const content = {
    x: bounds.x + bounds.width / 2 - contentW / 2,
    y: bounds.y + bounds.height / 2 - contentH / 2,
    width: contentW,
    height: contentH
  }

  const viewScale = Math.max(content.width / width, content.height / height, 0.001)
  const offset = 2 * viewScale
  const viewWidth = viewScale * width
  const viewHeight = viewScale * height
  const vbX = content.x - (viewWidth - content.width) / 2 - offset
  const vbY = content.y - (viewHeight - content.height) / 2 - offset
  const vbW = viewWidth + offset * 2
  const vbH = viewHeight + offset * 2
  const strokeW = Math.max(viewScale * 1.25, 1)

  return (
    <Panel
      position="bottom-right"
      className="react-flow__minimap kmind-minimap dialogue-minimap"
      style={{ width, height, background: bgColor }}
      data-testid="rf__minimap"
    >
      <svg
        width={width}
        height={height}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="react-flow__minimap-svg"
        role="img"
        aria-label="minimap"
      >
        {edges.map((e) => {
          const s = nodes.find((n) => n.id === e.source)
          const t = nodes.find((n) => n.id === e.target)
          if (!s || !t) return null
          const p1 = handleAnchor(s, (e.sourceHandle as string | null) ?? null)
          const p2 = handleAnchor(t, (e.targetHandle as string | null) ?? null)
          return (
            <line
              key={e.id}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              style={{ stroke: edgeColor, strokeWidth: strokeW }}
              strokeLinecap="round"
            />
          )
        })}
        {nodes.map((n) => {
          const { w, h } = nodeSize(n)
          const isEnd = n.id === DIALOGUE_END_NODE_ID || n.data?.kind === 'end'
          return (
            <rect
              key={n.id}
              className="kmind-minimap-node"
              x={n.position.x}
              y={n.position.y}
              width={w}
              height={h}
              rx={isEnd ? h / 2 : 6}
              ry={isEnd ? w / 2 : 6}
              style={{ fill: nodeColor }}
            />
          )
        })}
      </svg>
    </Panel>
  )
}
