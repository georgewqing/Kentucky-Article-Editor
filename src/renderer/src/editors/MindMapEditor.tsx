import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
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
  NodeResizer,
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
  assetsDirForKmind,
  KMindFormatError,
  type KMindDocument,
  type KMindShape,
  type KMindNodeLink,
  type KMindNodeImage
} from './kmind'
import { useSettingsStore } from '@/state/settingsStore'
import { getPlatform } from '@/platform'
import type { FileEntry } from '@/platform'
import { Link2, ChevronRight, ChevronDown } from 'lucide-react'

const MINIMAP_SIZE = { width: 168, height: 110 } as const
const DEFAULT_NODE_W = 160
const DEFAULT_NODE_H = 48
const IMAGE_NODE_W = 200
const IMAGE_NODE_H = 168
const REF_IMAGE_MAX = 220

type KMindNodeData = {
  text: string
  shape: KMindShape
  width: number
  height: number
  link?: KMindNodeLink
  image?: KMindNodeImage
  imageOnly?: boolean
  /** Presence means chin exists (may be ''). */
  note?: string
  noteOpen?: boolean
  noteLink?: KMindNodeLink
}

type MindMapActions = {
  workspacePath: string | null
  openNodeLink: (link: KMindNodeLink) => void
  /** Node id that should focus its note textarea once. */
  noteFocusId: string | null
  clearNoteFocus: () => void
}

const MindMapActionsCtx = createContext<MindMapActions>({
  workspacePath: null,
  openNodeLink: () => undefined,
  noteFocusId: null,
  clearNoteFocus: () => undefined
})

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
      height: n.height,
      ...(n.link ? { link: n.link } : {}),
      ...(n.image ? { image: n.image } : {}),
      ...(n.imageOnly ? { imageOnly: true } : {}),
      ...(n.note !== undefined
        ? {
            note: n.note,
            ...(n.noteOpen ? { noteOpen: true } : {}),
            ...(n.noteLink ? { noteLink: n.noteLink } : {})
          }
        : {})
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
      height: n.data.height,
      ...(n.data.link ? { link: n.data.link } : {}),
      ...(n.data.image ? { image: n.data.image } : {}),
      ...(n.data.imageOnly ? { imageOnly: true } : {}),
      ...(n.data.note !== undefined
        ? {
            note: n.data.note,
            ...(n.data.noteOpen ? { noteOpen: true } : {}),
            ...(n.data.noteLink ? { noteLink: n.data.noteLink } : {})
          }
        : {})
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

const KMindNodeView = memo(function KMindNodeView({ id, data, selected }: NodeProps<RFNode>) {
  const zoom = useStore((s) => s.transform[2])
  const { setNodes } = useReactFlow()
  const { workspacePath, openNodeLink, noteFocusId, clearNoteFocus } =
    useContext(MindMapActionsCtx)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const handlePx = Math.min(14, Math.max(7, Math.round(10 / Math.max(zoom, 0.08))))
  const handleStyle = { width: handlePx, height: handlePx }
  const imageOnly = Boolean(data.imageOnly && data.image)
  const hasImage = Boolean(data.image)
  const hasNote = data.note !== undefined
  const noteOpen = Boolean(data.noteOpen)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!data.image || !workspacePath) {
        setImgUrl(null)
        return
      }
      const platform = getPlatform()
      const abs = platform.joinPath(workspacePath, ...data.image.src.split('/'))
      try {
        const url = await platform.toMediaUrl(abs)
        if (!cancelled) setImgUrl(url)
      } catch {
        if (!cancelled) setImgUrl(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [data.image, workspacePath])

  useEffect(() => {
    if (noteFocusId !== id || !noteOpen) return
    const timer = window.setTimeout(() => {
      noteRef.current?.focus()
      clearNoteFocus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [noteFocusId, id, noteOpen, clearNoteFocus])

  const syncNoteTextareaHeight = useCallback(() => {
    const el = noteRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (!noteOpen) return
    syncNoteTextareaHeight()
  }, [noteOpen, data.note, syncNoteTextareaHeight])

  const patchData = useCallback(
    (patch: Partial<KMindNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      )
    },
    [id, setNodes]
  )

  const cornerRadius =
    hasImage || imageOnly ? 8 : data.shape === 'ellipse' ? 24 : data.shape === 'rounded' ? 10 : 2

  const bodyContent = imageOnly ? (
    <div className="kmind-node-media image-only-media">
      {imgUrl ? (
        <img src={imgUrl} alt={data.image?.name ?? ''} draggable={false} />
      ) : (
        <div className="kmind-node-media-fallback">{data.image?.name}</div>
      )}
    </div>
  ) : (
    <>
      {hasImage ? (
        <div className="kmind-node-media">
          {imgUrl ? (
            <img src={imgUrl} alt={data.image?.name ?? ''} draggable={false} />
          ) : (
            <div className="kmind-node-media-fallback">{data.image?.name}</div>
          )}
          <div className="kmind-node-media-name" title={data.image?.name}>
            {data.image?.name}
          </div>
        </div>
      ) : null}

      <div className="kmind-node-footer">
        {data.link ? (
          <button
            type="button"
            className="kmind-node-link"
            title={
              data.link.path +
              (data.link.kind === 'line' && data.link.line ? `:${data.link.line}` : '')
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              openNodeLink(data.link!)
            }}
          >
            <Link2 size={12} strokeWidth={1.8} />
            <span className="kmind-node-label linked">{data.text}</span>
          </button>
        ) : (
          <div className="kmind-node-label">{data.text}</div>
        )}
      </div>
    </>
  )

  return (
    <div
      className={`kmind-node ${selected ? 'selected' : ''} shape-${data.shape} ${hasImage ? 'has-image' : ''} ${imageOnly ? 'image-only' : ''} ${data.link ? 'has-link' : ''} ${hasNote ? 'has-note' : ''}`}
      style={{
        width: data.width,
        height: data.height,
        /* Keep full radius incl. bottom so the mid divider matches other corners. */
        borderRadius:
          hasImage || imageOnly ? 8 : data.shape === 'ellipse' ? '50%' : cornerRadius,
        ['--kmind-radius' as string]: `${hasImage || imageOnly ? 8 : cornerRadius}px`
      }}
    >
      {imageOnly && selected ? (
        <NodeResizer
          minWidth={48}
          minHeight={48}
          keepAspectRatio
          isVisible={selected}
          lineClassName="kmind-resizer-line"
          handleClassName="kmind-resizer-handle"
          onResize={(_e, params) => {
            const width = Math.round(params.width)
            const height = Math.round(params.height)
            setNodes((ns) =>
              ns.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      data: { ...n.data, width, height },
                      style: { width, height }
                    }
                  : n
              )
            )
          }}
        />
      ) : null}

      <Handle type="source" position={Position.Top} id="st" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Top} id="tt" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="sr" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="tr" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="sb" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="tb" className="kmind-handle" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="sl" className="kmind-handle" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="tl" className="kmind-handle" style={handleStyle} />

      <div className="kmind-node-shell">{bodyContent}</div>

      {hasNote ? (
        <div
          className={`kmind-note-chin nodrag nopan ${noteOpen ? 'expanded' : ''}`}
          style={{ borderRadius: `0 0 ${cornerRadius}px ${cornerRadius}px` }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="kmind-note-toggle"
            onClick={(e) => {
              e.stopPropagation()
              patchData({ noteOpen: !noteOpen })
            }}
          >
            {noteOpen ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
          </button>
          {noteOpen ? (
            <div className="kmind-note-body">
              <textarea
                ref={noteRef}
                className="kmind-note-textarea"
                value={data.note ?? ''}
                rows={1}
                spellCheck={false}
                onChange={(e) => {
                  patchData({ note: e.target.value })
                  // Height sync runs via effect on data.note; also nudge for this frame.
                  requestAnimationFrame(() => {
                    const el = e.target
                    el.style.height = 'auto'
                    el.style.height = `${el.scrollHeight}px`
                  })
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {data.noteLink ? (
                <button
                  type="button"
                  className="kmind-note-link-btn"
                  title={
                    data.noteLink.path +
                    (data.noteLink.kind === 'line' && data.noteLink.line
                      ? `:${data.noteLink.line}`
                      : '')
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    openNodeLink(data.noteLink!)
                  }}
                >
                  <Link2 size={12} strokeWidth={1.8} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
  const workspacePath = useAppStore((s) => s.workspacePath)
  const fileTree = useAppStore((s) => s.fileTree)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const saveTab = useAppStore((s) => s.saveTab)
  const showToast = useAppStore((s) => s.showToast)
  const openFile = useAppStore((s) => s.openFile)
  const beginLinePick = useAppStore((s) => s.beginLinePick)
  const linePickResult = useAppStore((s) => s.linePickResult)
  const clearLinePickResult = useAppStore((s) => s.clearLinePickResult)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const { screenToFlowPosition, setViewport, fitView, getZoom } = useReactFlow()

  const warnedRef = useRef(false)
  const skipSerializeRef = useRef(true)
  const lastJsonRef = useRef('')
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const zoom = useStore((s) => s.transform[2])
  // connectionRadius is in flow units; scale up when zoomed out so screen hit size stays usable.
  const connectionRadius = Math.max(28, Math.round(56 / Math.max(zoom, 0.08)))

  type LinkOverlay = null | {
    type: 'pickFile'
    nodeId: string
    forLine: boolean
    linkTarget: 'node' | 'note'
  }

  const [linkOverlay, setLinkOverlay] = useState<LinkOverlay>(null)
  const [noteFocusId, setNoteFocusId] = useState<string | null>(null)
  const clearNoteFocus = useCallback(() => setNoteFocusId(null), [])

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

  // Live sync from DocumentHub / other windows
  useEffect(() => {
    if (!tab) return
    if (tab.content === lastJsonRef.current) return
    const { doc } = loadDoc(tab.content, t('editor.mindMapRoot'))
    const flow = docToFlow(doc)
    skipSerializeRef.current = true
    lastJsonRef.current = serializeKMind(doc)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    requestAnimationFrame(() => {
      skipSerializeRef.current = false
    })
  }, [tab, tab?.content, setNodes, setEdges, t])

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

  const fitRefImageSize = useCallback((nw: number, nh: number) => {
    if (nw <= 0 || nh <= 0) {
      return { width: REF_IMAGE_MAX, height: Math.round(REF_IMAGE_MAX * 0.75) }
    }
    const scale = Math.min(1, REF_IMAGE_MAX / Math.max(nw, nh))
    return {
      width: Math.max(48, Math.round(nw * scale)),
      height: Math.max(48, Math.round(nh * scale))
    }
  }, [])

  const probeImageNaturalSize = useCallback(async (absPath: string) => {
    const platform = getPlatform()
    try {
      const url = await platform.toMediaUrl(absPath)
      return await new Promise<{ width: number; height: number }>((resolve) => {
        const im = new window.Image()
        im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight })
        im.onerror = () =>
          resolve({ width: REF_IMAGE_MAX, height: Math.round(REF_IMAGE_MAX * 0.75) })
        im.src = url
      })
    } catch {
      return { width: REF_IMAGE_MAX, height: Math.round(REF_IMAGE_MAX * 0.75) }
    }
  }, [])

  const deleteAssetCopies = useCallback(
    async (images: KMindNodeImage[]) => {
      if (!workspacePath || !images.length) return
      const platform = getPlatform()
      for (const img of images) {
        try {
          const abs = platform.joinPath(workspacePath, ...img.src.split('/'))
          if (await platform.exists(abs)) await platform.delete(abs)
        } catch {
          /* ignore missing file */
        }
      }
    },
    [workspacePath]
  )

  const removeImageOnlyNode = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      const img = node?.data.image
      setNodes((ns) => ns.filter((n) => n.id !== nodeId))
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId))
      if (img) await deleteAssetCopies([img])
    },
    [nodes, setNodes, setEdges, deleteAssetCopies]
  )

  const importRefImagesAt = useCallback(
    async (flowX: number, flowY: number) => {
      if (!workspacePath || !tab) return
      const platform = getPlatform()
      const paths = await platform.openImages()
      if (!paths.length) return
      try {
        const assetsAbs = assetsDirForKmind(tab.path)
        await platform.mkdir(assetsAbs)
        const stagger = 28
        const created: RFNode[] = []
        for (let i = 0; i < paths.length; i++) {
          const srcPath = paths[i]!
          const rawName = platform.basename(srcPath)
          const safe = rawName.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_')
          const destName = `${Date.now().toString(36)}_${i}_${safe}`
          const destAbs = platform.joinPath(assetsAbs, destName)
          await platform.copyFile(srcPath, destAbs)
          const rel = platform.relativeTo(workspacePath, destAbs)
          const natural = await probeImageNaturalSize(destAbs)
          const { width, height } = fitRefImageSize(natural.width, natural.height)
          const id = newNodeId()
          const ox = (i % 4) * stagger
          const oy = Math.floor(i / 4) * stagger
          created.push({
            id,
            type: 'kmind',
            position: { x: flowX - width / 2 + ox, y: flowY - height / 2 + oy },
            data: {
              text: '',
              shape: 'rounded',
              width,
              height,
              image: { src: rel, name: rawName },
              imageOnly: true
            },
            style: { width, height }
          })
        }
        setNodes((ns) => [...ns, ...created])
        void refreshTree()
      } catch {
        showToast(t('errors.createFailed'))
      }
    },
    [
      workspacePath,
      tab,
      setNodes,
      probeImageNaturalSize,
      fitRefImageSize,
      refreshTree,
      showToast,
      t
    ]
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

  const openNodeLink = useCallback(
    (link: KMindNodeLink) => {
      if (!workspacePath) return
      const platform = getPlatform()
      const abs = platform.joinPath(workspacePath, ...link.path.split('/'))
      void openFile(
        abs,
        link.kind === 'line' && link.line ? { line: link.line } : undefined
      )
    },
    [workspacePath, openFile]
  )

  const mindActions = useMemo(
    () => ({ workspacePath, openNodeLink, noteFocusId, clearNoteFocus }),
    [workspacePath, openNodeLink, noteFocusId, clearNoteFocus]
  )

  const linkableFiles = useMemo(() => {
    const platform = getPlatform()
    const out: { name: string; path: string; rel: string }[] = []
    const walk = (entries: FileEntry[]) => {
      for (const e of entries) {
        if (e.isDirectory) {
          if (e.children) walk(e.children)
          continue
        }
        const ext = platform.extname(e.path)
        if (ext !== '.md' && ext !== '.txt' && ext !== '.kmind') continue
        if (!workspacePath) continue
        out.push({
          name: e.name,
          path: e.path,
          rel: platform.relativeTo(workspacePath, e.path)
        })
      }
    }
    walk(fileTree)
    return out
  }, [fileTree, workspacePath])

  const applyNodeLink = useCallback(
    (nodeId: string, link: KMindNodeLink, linkTarget: 'node' | 'note' = 'node') => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          if (linkTarget === 'note') {
            return { ...n, data: { ...n.data, noteLink: link } }
          }
          return { ...n, data: { ...n.data, link } }
        })
      )
      setLinkOverlay(null)
    },
    [setNodes]
  )

  useEffect(() => {
    if (!linePickResult || linePickResult.mindmapTabId !== tabId) return
    applyNodeLink(
      linePickResult.nodeId,
      linePickResult.link,
      linePickResult.linkTarget ?? 'node'
    )
    clearLinePickResult()
  }, [linePickResult, tabId, applyNodeLink, clearLinePickResult])

  const clearNodeLink = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          const { link: _l, ...rest } = n.data
          return { ...n, data: rest }
        })
      )
    },
    [setNodes]
  )

  const clearNoteLink = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          const { noteLink: _nl, ...rest } = n.data
          return { ...n, data: rest }
        })
      )
    },
    [setNodes]
  )

  const addNodeNote = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, note: n.data.note ?? '', noteOpen: true } } : n
        )
      )
      setNoteFocusId(nodeId)
    },
    [setNodes]
  )

  const clearNodeNote = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          const { note: _n, noteOpen: _o, noteLink: _nl, ...rest } = n.data
          return { ...n, data: rest }
        })
      )
    },
    [setNodes]
  )

  const insertNodeImage = useCallback(
    async (nodeId: string) => {
      if (!workspacePath || !tab) return
      const platform = getPlatform()
      const srcPath = await platform.openImage()
      if (!srcPath) return
      try {
        const assetsAbs = assetsDirForKmind(tab.path)
        await platform.mkdir(assetsAbs)
        const rawName = platform.basename(srcPath)
        const safe = rawName.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_')
        const destName = `${Date.now().toString(36)}_${safe}`
        const destAbs = platform.joinPath(assetsAbs, destName)
        await platform.copyFile(srcPath, destAbs)
        const rel = platform.relativeTo(workspacePath, destAbs)
        const image: KMindNodeImage = { src: rel, name: rawName }
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== nodeId) return n
            const width = Math.max(n.data.width, IMAGE_NODE_W)
            const height = Math.max(IMAGE_NODE_H, n.data.height)
            return {
              ...n,
              data: { ...n.data, image, width, height },
              style: { width, height }
            }
          })
        )
        void refreshTree()
      } catch {
        showToast(t('errors.createFailed'))
      }
    },
    [workspacePath, tab, setNodes, showToast, t, refreshTree]
  )

  const removeNodeImage = useCallback(
    async (nodeId: string) => {
      if (!workspacePath) return
      const platform = getPlatform()
      const node = nodes.find((n) => n.id === nodeId)
      const img = node?.data.image
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          const { image: _i, ...rest } = n.data
          const width = DEFAULT_NODE_W
          const height = DEFAULT_NODE_H
          return {
            ...n,
            data: { ...rest, width, height },
            style: { width, height }
          }
        })
      )
      if (img) {
        try {
          const abs = platform.joinPath(workspacePath, ...img.src.split('/'))
          if (await platform.exists(abs)) await platform.delete(abs)
        } catch {
          /* ignore missing file */
        }
      }
    },
    [workspacePath, nodes, setNodes]
  )

  const startLineLink = useCallback(
    async (
      nodeId: string,
      fileAbs: string,
      fileRel: string,
      linkTarget: 'node' | 'note' = 'node'
    ) => {
      setLinkOverlay(null)
      await beginLinePick({ mindmapTabId: tabId, nodeId, fileAbs, fileRel, linkTarget })
    },
    [beginLinePick, tabId]
  )

  const deleteSelected = useCallback(() => {
    const removingNodes = nodes.filter((n) => n.selected)
    const removing = new Set(removingNodes.map((n) => n.id))
    const orphanImgs = removingNodes
      .filter((n) => n.data.imageOnly && n.data.image)
      .map((n) => n.data.image!)
    setNodes((ns) => ns.filter((n) => !n.selected))
    setEdges((es) =>
      es.filter((e) => !e.selected && !removing.has(e.source) && !removing.has(e.target))
    )
    void deleteAssetCopies(orphanImgs)
  }, [nodes, setNodes, setEdges, deleteAssetCopies])

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
    if (n.data.imageOnly) return
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

  const menuNode = menu?.kind === 'node' ? nodes.find((n) => n.id === menu.nodeId) : null

  return (
    <MindMapActionsCtx.Provider value={mindActions}>
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
            disabled={!selectedNode || selectedNode.data.imageOnly}
            className={selectedNode?.data.shape === 'rect' ? 'active' : ''}
            onClick={() => selectedNode && setShape(selectedNode.id, 'rect')}
          >
            {t('mindmap.shapeRect')}
          </button>
          <button
            type="button"
            disabled={!selectedNode || selectedNode.data.imageOnly}
            className={selectedNode?.data.shape === 'rounded' ? 'active' : ''}
            onClick={() => selectedNode && setShape(selectedNode.id, 'rounded')}
          >
            {t('mindmap.shapeRounded')}
          </button>
          <button
            type="button"
            disabled={!selectedNode || selectedNode.data.imageOnly}
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
            <>
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
              {menu.kind === 'pane' ? (
                <button
                  type="button"
                  onClick={() => {
                    void importRefImagesAt(menu.flowX, menu.flowY)
                    setMenu(null)
                  }}
                >
                  {t('mindmap.importRefImages')}
                </button>
              ) : null}
            </>
          ) : menuNode?.data.imageOnly ? (
            <>
              {menuNode.data.note === undefined ? (
                <button
                  type="button"
                  onClick={() => {
                    addNodeNote(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  {t('mindmap.addNote')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkOverlay({
                        type: 'pickFile',
                        nodeId: menu.nodeId,
                        forLine: false,
                        linkTarget: 'note'
                      })
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.noteLinkToFile')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkOverlay({
                        type: 'pickFile',
                        nodeId: menu.nodeId,
                        forLine: true,
                        linkTarget: 'note'
                      })
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.noteLinkToLine')}
                  </button>
                  {menuNode.data.noteLink ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearNoteLink(menu.nodeId)
                        setMenu(null)
                      }}
                    >
                      {t('mindmap.clearNoteLink')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      clearNodeNote(menu.nodeId)
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.clearNote')}
                  </button>
                </>
              )}
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  void removeImageOnlyNode(menu.nodeId)
                  setMenu(null)
                }}
              >
                {t('mindmap.removeImage')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void removeImageOnlyNode(menu.nodeId)
                  setMenu(null)
                }}
              >
                {t('mindmap.removeNode')}
              </button>
            </>
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
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  setLinkOverlay({
                    type: 'pickFile',
                    nodeId: menu.nodeId,
                    forLine: false,
                    linkTarget: 'node'
                  })
                  setMenu(null)
                }}
              >
                {t('mindmap.linkToFile')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkOverlay({
                    type: 'pickFile',
                    nodeId: menu.nodeId,
                    forLine: true,
                    linkTarget: 'node'
                  })
                  setMenu(null)
                }}
              >
                {t('mindmap.linkToLine')}
              </button>
              {menuNode?.data.link ? (
                <button
                  type="button"
                  onClick={() => {
                    clearNodeLink(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  {t('mindmap.clearLink')}
                </button>
              ) : null}
              <div className="ctx-sep" />
              {menuNode?.data.note === undefined ? (
                <button
                  type="button"
                  onClick={() => {
                    addNodeNote(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  {t('mindmap.addNote')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkOverlay({
                        type: 'pickFile',
                        nodeId: menu.nodeId,
                        forLine: false,
                        linkTarget: 'note'
                      })
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.noteLinkToFile')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkOverlay({
                        type: 'pickFile',
                        nodeId: menu.nodeId,
                        forLine: true,
                        linkTarget: 'note'
                      })
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.noteLinkToLine')}
                  </button>
                  {menuNode.data.noteLink ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearNoteLink(menu.nodeId)
                        setMenu(null)
                      }}
                    >
                      {t('mindmap.clearNoteLink')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      clearNodeNote(menu.nodeId)
                      setMenu(null)
                    }}
                  >
                    {t('mindmap.clearNote')}
                  </button>
                </>
              )}
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  void insertNodeImage(menu.nodeId)
                  setMenu(null)
                }}
              >
                {t('mindmap.insertImage')}
              </button>
              {menuNode?.data.image ? (
                <button
                  type="button"
                  onClick={() => {
                    void removeNodeImage(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  {t('mindmap.removeImage')}
                </button>
              ) : null}
              <div className="ctx-sep" />
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

      {linkOverlay ? (
        <div className="kmind-picker-overlay" onClick={() => setLinkOverlay(null)}>
          <div
            className="kmind-picker"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="kmind-picker-title">
              {linkOverlay.linkTarget === 'note'
                ? linkOverlay.forLine
                  ? t('mindmap.noteLinkToLine')
                  : t('mindmap.noteLinkToFile')
                : linkOverlay.forLine
                  ? t('mindmap.linkToLine')
                  : t('mindmap.linkToFile')}
            </div>
            <div className="kmind-picker-list">
              {linkableFiles
                .filter((f) =>
                  linkOverlay.forLine
                    ? f.rel.toLowerCase().endsWith('.md') || f.rel.toLowerCase().endsWith('.txt')
                    : true
                )
                .map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      if (linkOverlay.forLine) {
                        void startLineLink(
                          linkOverlay.nodeId,
                          f.path,
                          f.rel,
                          linkOverlay.linkTarget
                        )
                      } else {
                        applyNodeLink(
                          linkOverlay.nodeId,
                          { path: f.rel, kind: 'file' },
                          linkOverlay.linkTarget
                        )
                      }
                    }}
                  >
                    {f.rel}
                  </button>
                ))}
            </div>
            <button type="button" className="kmind-picker-cancel" onClick={() => setLinkOverlay(null)}>
              {t('explorer.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
    </MindMapActionsCtx.Provider>
  )
}

export function MindMapEditor({ tabId }: { tabId: string }) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas tabId={tabId} />
    </ReactFlowProvider>
  )
}
