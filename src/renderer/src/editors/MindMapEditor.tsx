import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useNodes,
  useEdges,
  useStore,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  SelectionMode,
  getNodesBounds,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnMoveEnd,
  type OnConnectEnd
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import {
  createEmptyKMind,
  parseKMind,
  serializeKMind,
  newNodeId,
  newEdgeId,
  KMindFormatError,
  type KMindDocument,
  type KMindShape
} from './kmind'
import { useSettingsStore } from '@/state/settingsStore'

const MINIMAP_SIZE = { width: 168, height: 110 } as const
const DEFAULT_NODE_W = 160
const DEFAULT_NODE_H = 48

function useFlowChromeTheme() {
  const themeMode = useSettingsStore((s) => s.themeMode)
  const accent = useSettingsStore((s) => s.accent)

  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const gray =
      css.getPropertyValue('--bg-elev-3').trim() || (themeMode === 'dark' ? '#242424' : '#eeeeee')
    return {
      // SVG fill does not reliably inherit near-invisible CSS borders; use a real grid color.
      dotColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.18)',
      minimap: {
        bgColor: gray,
        // Opaque mask paints a dark “frame” around the viewport hole — looks like a black border.
        maskColor: 'transparent',
        nodeColor: accent,
        edgeColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)',
        nodeStrokeColor: 'transparent',
        maskStrokeColor: 'transparent'
      }
    }
  }, [themeMode, accent])
}

type KMindNodeData = {
  text: string
  shape: KMindShape
  width: number
  height: number
}

type RFNode = Node<KMindNodeData, 'kmind'>
type CtxMenu =
  | { kind: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | {
      kind: 'connect'
      x: number
      y: number
      flowX: number
      flowY: number
      fromNodeId: string
      fromHandleId: string | null
      fromHandleType: 'source' | 'target'
    }
  | null

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('changedTouches' in event) {
    const t = event.changedTouches[0]
    return t ? { x: t.clientX, y: t.clientY } : null
  }
  return { x: event.clientX, y: event.clientY }
}

/** Midpoint of a node's handle by id (st/tt/sr/…); falls back to center. */
function handleAnchor(
  node: { position: { x: number; y: number }; data: { width: number; height: number } },
  handleId: string | null
): { x: number; y: number } {
  const { x, y } = node.position
  const { width: w, height: h } = node.data
  const cx = x + w / 2
  const cy = y + h / 2
  switch (handleId) {
    case 'st':
    case 'tt':
      return { x: cx, y }
    case 'sr':
    case 'tr':
      return { x: x + w, y: cy }
    case 'sb':
    case 'tb':
      return { x: cx, y: y + h }
    case 'sl':
    case 'tl':
      return { x, y: cy }
    default:
      return { x: cx, y: cy }
  }
}

/**
 * Pick the handle on `node` closest to `from` (the other end of the edge).
 * `role` chooses source (s*) or target (t*) handle ids.
 */
function nearestHandleId(
  from: { x: number; y: number },
  nodePos: { x: number; y: number },
  width: number,
  height: number,
  role: 'source' | 'target'
): string {
  const prefix = role === 'source' ? 's' : 't'
  const candidates: { id: string; x: number; y: number }[] = [
    { id: `${prefix}t`, x: nodePos.x + width / 2, y: nodePos.y },
    { id: `${prefix}r`, x: nodePos.x + width, y: nodePos.y + height / 2 },
    { id: `${prefix}b`, x: nodePos.x + width / 2, y: nodePos.y + height },
    { id: `${prefix}l`, x: nodePos.x, y: nodePos.y + height / 2 }
  ]
  let best = candidates[0]!
  let bestDist = Infinity
  for (const c of candidates) {
    const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best.id
}

function distToNodeRect(
  point: { x: number; y: number },
  node: { position: { x: number; y: number }; data: { width: number; height: number } }
): number {
  const left = node.position.x
  const right = node.position.x + node.data.width
  const top = node.position.y
  const bottom = node.position.y + node.data.height
  const cx = Math.min(Math.max(point.x, left), right)
  const cy = Math.min(Math.max(point.y, top), bottom)
  return Math.hypot(point.x - cx, point.y - cy)
}

function buildConnectEdge(
  fromNodeId: string,
  fromHandleId: string | null,
  fromHandleType: 'source' | 'target',
  toNode: { id: string; position: { x: number; y: number }; data: { width: number; height: number } },
  fromPt: { x: number; y: number }
): Edge {
  const nearRole = fromHandleType === 'source' ? 'target' : 'source'
  const nearHandle = nearestHandleId(
    fromPt,
    toNode.position,
    toNode.data.width,
    toNode.data.height,
    nearRole
  )
  if (fromHandleType === 'source') {
    return {
      id: newEdgeId(),
      source: fromNodeId,
      sourceHandle: fromHandleId ?? undefined,
      target: toNode.id,
      targetHandle: nearHandle
    }
  }
  return {
    id: newEdgeId(),
    source: toNode.id,
    sourceHandle: nearHandle,
    target: fromNodeId,
    targetHandle: fromHandleId ?? undefined
  }
}

function docToFlow(doc: KMindDocument): { nodes: RFNode[]; edges: Edge[] } {
  const nodes: RFNode[] = doc.nodes.map((n) => ({
    id: n.id,
    type: 'kmind' as const,
    position: { x: n.x, y: n.y },
    data: {
      text: n.text,
      shape: n.shape,
      width: n.width,
      height: n.height
    },
    style: { width: n.width, height: n.height }
  }))

  const byId = new Map(nodes.map((n) => [n.id, n]))

  const edges: Edge[] = doc.edges.map((e) => {
    let sourceHandle = e.sourceHandle
    let targetHandle = e.targetHandle
    // Older files omitted handles → RF defaults every edge to the same side (merged smoothstep trunk).
    if (!sourceHandle || !targetHandle) {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (s && t) {
        const sCenter = {
          x: s.position.x + s.data.width / 2,
          y: s.position.y + s.data.height / 2
        }
        const tCenter = {
          x: t.position.x + t.data.width / 2,
          y: t.position.y + t.data.height / 2
        }
        if (!sourceHandle) {
          sourceHandle = nearestHandleId(
            tCenter,
            s.position,
            s.data.width,
            s.data.height,
            'source'
          )
        }
        if (!targetHandle) {
          targetHandle = nearestHandleId(
            sCenter,
            t.position,
            t.data.width,
            t.data.height,
            'target'
          )
        }
      }
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle
    }
  })

  return { nodes, edges }
}

function flowToDoc(
  nodes: RFNode[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number }
): KMindDocument {
  return {
    version: 2,
    nodes: nodes.map((n) => ({
      id: n.id,
      text: n.data.text,
      shape: n.data.shape,
      x: n.position.x,
      y: n.position.y,
      width: n.data.width,
      height: n.data.height
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: String(e.sourceHandle) } : {}),
      ...(e.targetHandle ? { targetHandle: String(e.targetHandle) } : {})
    })),
    viewport
  }
}

function loadDoc(
  content: string,
  fallbackRoot: string
): { doc: KMindDocument; formatError: string | null } {
  if (!content.trim()) {
    return { doc: createEmptyKMind(fallbackRoot), formatError: null }
  }
  try {
    return { doc: parseKMind(content), formatError: null }
  } catch (err) {
    if (err instanceof KMindFormatError && err.message === 'legacy_v1') {
      return { doc: createEmptyKMind(fallbackRoot), formatError: 'legacy_v1' }
    }
    return { doc: createEmptyKMind(fallbackRoot), formatError: 'invalid' }
  }
}

const KMindNodeView = memo(function KMindNodeView({ data, selected }: NodeProps<RFNode>) {
  const zoom = useStore((s) => s.transform[2])
  // Keep handle hit targets ~constant on screen when zoomed out (flow units grow as 1/zoom).
  const handlePx = Math.min(28, Math.max(8, Math.round(12 / Math.max(zoom, 0.08))))
  const radius =
    data.shape === 'ellipse' ? '50%' : data.shape === 'rounded' ? '10px' : '2px'
  const handleStyle = { width: handlePx, height: handlePx }

  return (
    <div
      className={`kmind-node ${selected ? 'selected' : ''} shape-${data.shape}`}
      style={{
        width: data.width,
        height: data.height,
        borderRadius: radius
      }}
    >
      <Handle type="source" position={Position.Top} id="st" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="tt" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="sr" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="tr" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="sb" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="tb" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="sl" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="tl" className="kmind-handle" style={handleStyle} />
      <div className="kmind-node-label">{data.text}</div>
    </div>
  )
})

const nodeTypes = { kmind: KMindNodeView }

/** Stock MiniMap has no edges — draw nodes + links ourselves. */
function KMindMiniMap({
  width,
  height,
  bgColor,
  nodeColor,
  edgeColor
}: {
  width: number
  height: number
  bgColor: string
  nodeColor: string
  edgeColor: string
}) {
  const nodes = useNodes() as RFNode[]
  const edges = useEdges()

  const bounds = useMemo(() => {
    if (!nodes.length) return { x: 0, y: 0, width, height }
    return getNodesBounds(
      nodes.map((n) => ({
        ...n,
        width: n.width ?? n.data.width,
        height: n.height ?? n.data.height
      }))
    )
  }, [nodes, width, height])

  // Floor the world span so a lone starter node stays a small chip, not a full-bleed slab.
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
      className="react-flow__minimap kmind-minimap"
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
          const rx =
            n.data.shape === 'ellipse'
              ? n.data.height / 2
              : n.data.shape === 'rounded'
                ? 6
                : 2
          return (
            <rect
              key={n.id}
              className="kmind-minimap-node"
              x={n.position.x}
              y={n.position.y}
              width={n.data.width}
              height={n.data.height}
              rx={rx}
              ry={n.data.shape === 'ellipse' ? n.data.width / 2 : rx}
              style={{ fill: nodeColor }}
            />
          )
        })}
      </svg>
    </Panel>
  )
}

function MindMapCanvas({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const chrome = useFlowChromeTheme()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const saveTab = useAppStore((s) => s.saveTab)
  const showToast = useAppStore((s) => s.showToast)
  const { screenToFlowPosition, setViewport, fitView, getZoom } = useReactFlow()

  const warnedRef = useRef(false)
  const skipSerializeRef = useRef(true)
  const lastJsonRef = useRef('')
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const zoom = useStore((s) => s.transform[2])
  // connectionRadius is in flow units; scale up when zoomed out so screen hit size stays usable.
  const connectionRadius = Math.max(28, Math.round(56 / Math.max(zoom, 0.08)))

  const initial = useMemo(() => {
    if (!tab) return { doc: createEmptyKMind(t('editor.mindMapRoot')), formatError: null as string | null }
    return loadDoc(tab.content, t('editor.mindMapRoot'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [menu, setMenu] = useState<CtxMenu>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    const { doc, formatError } = initial
    const flow = docToFlow(doc)
    skipSerializeRef.current = true
    lastJsonRef.current = serializeKMind(doc)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    viewportRef.current = doc.viewport
    requestAnimationFrame(() => {
      setViewport(doc.viewport)
      skipSerializeRef.current = false
    })
    if (formatError && !warnedRef.current) {
      warnedRef.current = true
      showToast(
        formatError === 'legacy_v1' ? t('errors.kmindLegacy') : t('errors.kmindInvalid'),
        'error'
      )
    }
  }, [initial, setNodes, setEdges, setViewport, showToast, t])

  const persist = useCallback(
    (nextNodes: RFNode[], nextEdges: Edge[]) => {
      if (skipSerializeRef.current) return
      const doc = flowToDoc(nextNodes, nextEdges, viewportRef.current)
      const json = serializeKMind(doc)
      if (json === lastJsonRef.current) return
      lastJsonRef.current = json
      updateTabContent(tabId, json)
    },
    [tabId, updateTabContent]
  )

  useEffect(() => {
    persist(nodes, edges)
  }, [nodes, edges, persist])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: newEdgeId() }, eds))
    },
    [setEdges]
  )

  const onMoveEnd: OnMoveEnd = useCallback(
    (_e, viewport) => {
      viewportRef.current = viewport
      persist(nodes, edges)
    },
    [nodes, edges, persist]
  )

  const addNodeAt = useCallback(
    (x: number, y: number): string => {
      const id = newNodeId()
      const width = DEFAULT_NODE_W
      const height = DEFAULT_NODE_H
      const node: RFNode = {
        id,
        type: 'kmind',
        position: { x: x - width / 2, y: y - height / 2 },
        data: {
          text: t('editor.newNode'),
          shape: 'rounded',
          width,
          height
        },
        style: { width, height }
      }
      setNodes((ns) => [...ns, node])
      return id
    },
    [setNodes, t]
  )

  const addNodeFromConnect = useCallback(
    (menu: Extract<CtxMenu, { kind: 'connect' }>) => {
      const width = DEFAULT_NODE_W
      const height = DEFAULT_NODE_H
      const pos = { x: menu.flowX - width / 2, y: menu.flowY - height / 2 }
      const id = newNodeId()
      const node: RFNode = {
        id,
        type: 'kmind',
        position: pos,
        data: {
          text: t('editor.newNode'),
          shape: 'rounded',
          width,
          height
        },
        style: { width, height }
      }

      const fromNode = nodes.find((n) => n.id === menu.fromNodeId)
      const fromPt = fromNode
        ? handleAnchor(fromNode, menu.fromHandleId)
        : { x: menu.flowX, y: menu.flowY }

      setNodes((ns) => [...ns, node])
      setEdges((es) => [
        ...es,
        buildConnectEdge(menu.fromNodeId, menu.fromHandleId, menu.fromHandleType, node, fromPt)
      ])
    },
    [nodes, setNodes, setEdges, t]
  )

  const setShape = useCallback(
    (nodeId: string, shape: KMindShape) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, shape } } : n))
      )
    },
    [setNodes]
  )

  const deleteSelected = useCallback(() => {
    setNodes((ns) => {
      const removing = new Set(ns.filter((n) => n.selected).map((n) => n.id))
      setEdges((es) =>
        es.filter((e) => !e.selected && !removing.has(e.source) && !removing.has(e.target))
      )
      return ns.filter((n) => !n.selected)
    })
  }, [setNodes, setEdges])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, editingId])

  useEffect(() => {
    const close = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('.ctx-menu')) return
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  const onPaneContextMenu = useCallback(
    (e: MouseEvent | ReactMouseEvent) => {
      e.preventDefault()
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setMenu({
        kind: 'pane',
        x: e.clientX,
        y: e.clientY,
        flowX: flow.x,
        flowY: flow.y
      })
    },
    [screenToFlowPosition]
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.isValid || connectionState.toNode) return
      const fromNodeMeta = connectionState.fromNode
      const fromHandle = connectionState.fromHandle
      if (!fromNodeMeta || !fromHandle) return
      const fromHandleId = fromHandle.id ?? null

      const point = clientPoint(event)
      if (!point) return
      const flow = screenToFlowPosition(point)

      // When zoomed out, handle hit-testing often fails — snap to nearest node body first.
      const z = getZoom()
      const snapDist = Math.max(48, 72 / Math.max(z, 0.08))
      let nearest: RFNode | null = null
      let nearestD = Infinity
      for (const n of nodes) {
        if (n.id === fromNodeMeta.id) continue
        const d = distToNodeRect(flow, n)
        if (d < nearestD) {
          nearestD = d
          nearest = n
        }
      }
      if (nearest && nearestD <= snapDist) {
        const fromNode = nodes.find((n) => n.id === fromNodeMeta.id)
        const fromPt = fromNode ? handleAnchor(fromNode, fromHandleId) : flow
        setEdges((es) => [
          ...es,
          buildConnectEdge(fromNodeMeta.id, fromHandleId, fromHandle.type, nearest!, fromPt)
        ])
        return
      }

      // Defer past the releasing pointer so the dismiss listener does not eat the menu.
      window.setTimeout(() => {
        setMenu({
          kind: 'connect',
          x: point.x,
          y: point.y,
          flowX: flow.x,
          flowY: flow.y,
          fromNodeId: fromNodeMeta.id,
          fromHandleId,
          fromHandleType: fromHandle.type
        })
      }, 0)
    },
    [screenToFlowPosition, getZoom, nodes, setEdges]
  )

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, node: Node) => {
    e.preventDefault()
    setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: node.id })
  }, [])

  const onNodeDoubleClick = useCallback((_e: ReactMouseEvent, node: Node) => {
    const n = node as RFNode
    setEditingId(n.id)
    setEditText(n.data.text)
  }, [])

  const commitEdit = useCallback(() => {
    if (!editingId) return
    const text = editText.trim() || t('editor.newNode')
    setNodes((ns) =>
      ns.map((n) => (n.id === editingId ? { ...n, data: { ...n.data, text } } : n))
    )
    setEditingId(null)
  }, [editingId, editText, setNodes, t])

  const selectedNode = nodes.find((n) => n.selected)
  const hasSelection = Boolean(selectedNode) || edges.some((e) => e.selected)

  if (!tab) return null

  return (
    <div className="mindmap-host">
      <div className="mindmap-toolbar">
        <button
          type="button"
          onClick={() => {
            const center = screenToFlowPosition({
              x: window.innerWidth * 0.55,
              y: window.innerHeight * 0.45
            })
            addNodeAt(center.x, center.y)
          }}
        >
          {t('mindmap.addNode')}
        </button>
        <div className="mindmap-shape-group" title={t('mindmap.shape')}>
          <button
            type="button"
            disabled={!selectedNode}
            className={selectedNode?.data.shape === 'rect' ? 'active' : ''}
            onClick={() => selectedNode && setShape(selectedNode.id, 'rect')}
          >
            {t('mindmap.shapeRect')}
          </button>
          <button
            type="button"
            disabled={!selectedNode}
            className={selectedNode?.data.shape === 'rounded' ? 'active' : ''}
            onClick={() => selectedNode && setShape(selectedNode.id, 'rounded')}
          >
            {t('mindmap.shapeRounded')}
          </button>
          <button
            type="button"
            disabled={!selectedNode}
            className={selectedNode?.data.shape === 'ellipse' ? 'active' : ''}
            onClick={() => selectedNode && setShape(selectedNode.id, 'ellipse')}
          >
            {t('mindmap.shapeEllipse')}
          </button>
        </div>
        <button type="button" disabled={!hasSelection} onClick={deleteSelected}>
          {t('mindmap.remove')}
        </button>
        <button type="button" onClick={() => fitView({ padding: 0.2 })}>
          {t('mindmap.fitView')}
        </button>
        <button type="button" onClick={() => void saveTab(tabId)}>
          {t('editor.save')}
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onMoveEnd={onMoveEnd}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView={false}
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={connectionRadius}
        selectionMode={SelectionMode.Partial}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background gap={18} size={1.25} color={chrome.dotColor} />
        <Controls showInteractive={false} />
        <KMindMiniMap
          width={MINIMAP_SIZE.width}
          height={MINIMAP_SIZE.height}
          bgColor={chrome.minimap.bgColor}
          nodeColor={chrome.minimap.nodeColor}
          edgeColor={chrome.minimap.edgeColor}
        />
      </ReactFlow>

      {editingId ? (
        <div className="kmind-edit-overlay" onClick={commitEdit}>
          <form
            className="kmind-edit-box"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              commitEdit()
            }}
          >
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <button type="submit" className="btn-primary">
              {t('mindmap.apply')}
            </button>
          </form>
        </div>
      ) : null}

      {menu ? (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.kind === 'pane' || menu.kind === 'connect' ? (
            <button
              type="button"
              onClick={() => {
                if (menu.kind === 'connect') addNodeFromConnect(menu)
                else addNodeAt(menu.flowX, menu.flowY)
                setMenu(null)
              }}
            >
              {t('mindmap.addNode')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setShape(menu.nodeId, 'rect')
                  setMenu(null)
                }}
              >
                {t('mindmap.shapeRect')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShape(menu.nodeId, 'rounded')
                  setMenu(null)
                }}
              >
                {t('mindmap.shapeRounded')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShape(menu.nodeId, 'ellipse')
                  setMenu(null)
                }}
              >
                {t('mindmap.shapeEllipse')}
              </button>
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  const n = nodes.find((x) => x.id === menu.nodeId)
                  if (n) {
                    setEditingId(n.id)
                    setEditText(n.data.text)
                  }
                  setMenu(null)
                }}
              >
                {t('mindmap.editText')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setNodes((ns) => ns.filter((n) => n.id !== menu.nodeId))
                  setEdges((es) =>
                    es.filter((e) => e.source !== menu.nodeId && e.target !== menu.nodeId)
                  )
                  setMenu(null)
                }}
              >
                {t('mindmap.removeNode')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function MindMapEditor({ tabId }: { tabId: string }) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas tabId={tabId} />
    </ReactFlowProvider>
  )
}
