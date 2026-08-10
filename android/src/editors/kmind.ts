export type KMindShape = 'rect' | 'rounded' | 'ellipse'

export type KMindLinkKind = 'file' | 'line'

export interface KMindNodeLink {
  /** Path relative to workspace root (forward slashes). */
  path: string
  kind: KMindLinkKind
  /** 1-based line number when kind === 'line'. */
  line?: number
}

export interface KMindNodeImage {
  /** Path relative to workspace root, e.g. "ideas.assets/img_x.png". */
  src: string
  name: string
}

export interface KMindGraphNode {
  id: string
  text: string
  shape: KMindShape
  x: number
  y: number
  width: number
  height: number
  link?: KMindNodeLink
  image?: KMindNodeImage
  /** Pane-imported reference image: no text chrome; resizable. */
  imageOnly?: boolean
  /**
   * Node note (“chin”). Field presence means the chin exists (may be '').
   * Cleared by removing the field entirely.
   */
  note?: string
  /** Whether the note chin is expanded. Default false when omitted. */
  noteOpen?: boolean
  /** Optional hyperlink attached to the note (not the node title). */
  noteLink?: KMindNodeLink
}

export interface KMindGraphEdge {
  id: string
  source: string
  target: string
  /** Handle ids on custom nodes, e.g. "sb" / "tt". Optional for older files. */
  sourceHandle?: string
  targetHandle?: string
}

export interface KMindDocument {
  version: 2
  nodes: KMindGraphNode[]
  edges: KMindGraphEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export class KMindFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KMindFormatError'
  }
}

let idCounter = 0

export function newNodeId(prefix = 'n'): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

export function newEdgeId(): string {
  return newNodeId('e')
}

export function createEmptyKMind(rootText = 'Central Topic'): KMindDocument {
  const id = 'n_root'
  return {
    version: 2,
    nodes: [
      {
        id,
        text: rootText,
        shape: 'rounded',
        x: 280,
        y: 200,
        width: 160,
        height: 48
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  }
}

function isShape(v: unknown): v is KMindShape {
  return v === 'rect' || v === 'rounded' || v === 'ellipse'
}

function parseLink(raw: unknown): KMindNodeLink | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.path !== 'string' || !o.path.trim()) return undefined
  const path = o.path.replace(/\\/g, '/')
  // Legacy heading links → whole-file link.
  if (o.kind === 'heading') {
    return { path, kind: 'file' }
  }
  if (o.kind === 'line') {
    const line = typeof o.line === 'number' ? Math.floor(o.line) : Number(o.line)
    if (!Number.isFinite(line) || line < 1) return undefined
    return { path, kind: 'line', line }
  }
  return { path, kind: 'file' }
}

function parseImage(raw: unknown): KMindNodeImage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.src !== 'string' || !o.src.trim()) return undefined
  return {
    src: o.src.replace(/\\/g, '/'),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : o.src.split('/').pop() || 'image'
  }
}

export function parseKMind(raw: string): KMindDocument {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new KMindFormatError('invalid_json')
  }

  if (!data || typeof data !== 'object') {
    throw new KMindFormatError('invalid')
  }

  const doc = data as Record<string, unknown>
  if (doc.version === 1) {
    throw new KMindFormatError('legacy_v1')
  }
  if (doc.version !== 2) {
    throw new KMindFormatError('unsupported_version')
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new KMindFormatError('invalid')
  }

  const nodes: KMindGraphNode[] = doc.nodes.map((n, i) => {
    const node = n as Record<string, unknown>
    if (!node || typeof node.id !== 'string') {
      throw new KMindFormatError('invalid_node')
    }
    const link = parseLink(node.link)
    const image = parseImage(node.image)
    const imageOnly = node.imageOnly === true && Boolean(image)
    const hasNote = Object.prototype.hasOwnProperty.call(node, 'note')
    const note =
      hasNote && typeof node.note === 'string'
        ? node.note
        : hasNote
          ? ''
          : undefined
    const noteLink = note !== undefined ? parseLink(node.noteLink) : undefined
    return {
      id: node.id,
      text: imageOnly
        ? ''
        : typeof node.text === 'string'
          ? node.text
          : `Node ${i + 1}`,
      shape: imageOnly ? 'rounded' : isShape(node.shape) ? node.shape : 'rounded',
      x: typeof node.x === 'number' ? node.x : 0,
      y: typeof node.y === 'number' ? node.y : 0,
      width: typeof node.width === 'number' ? node.width : imageOnly ? 200 : 160,
      height: typeof node.height === 'number' ? node.height : imageOnly ? 150 : 48,
      ...(link ? { link } : {}),
      ...(image ? { image } : {}),
      ...(imageOnly ? { imageOnly: true } : {}),
      ...(note !== undefined
        ? {
            note,
            ...(node.noteOpen === true ? { noteOpen: true } : {}),
            ...(noteLink ? { noteLink } : {})
          }
        : {})
    }
  })

  const edges: KMindGraphEdge[] = doc.edges.map((e, i) => {
    const edge = e as Record<string, unknown>
    if (
      !edge ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string'
    ) {
      throw new KMindFormatError('invalid_edge')
    }
    return {
      id: typeof edge.id === 'string' ? edge.id : `e_${i}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : undefined,
      targetHandle: typeof edge.targetHandle === 'string' ? edge.targetHandle : undefined
    }
  })

  const vp = (doc.viewport ?? {}) as Record<string, unknown>
  return {
    version: 2,
    nodes,
    edges,
    viewport: {
      x: typeof vp.x === 'number' ? vp.x : 0,
      y: typeof vp.y === 'number' ? vp.y : 0,
      zoom: typeof vp.zoom === 'number' ? vp.zoom : 1
    }
  }
}

export function serializeKMind(doc: KMindDocument): string {
  return JSON.stringify(doc, null, 2)
}

export { isKmindPath, kmindContentDirty } from '@/common/kmindDirty'

/** Assets dir sibling to the .kmind file: `ideas.kmind` → `ideas.assets`. */
export function assetsDirForKmind(kmindPath: string): string {
  const normalized = kmindPath.replace(/\\/g, '/')
  const base = normalized.replace(/\.kmind$/i, '')
  return `${base}.assets`
}
