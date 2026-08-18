/**
 * Shared dirty helpers for .kmind (main DocumentHub + renderer appStore).
 * Viewport-only pan/zoom must not mark the file dirty.
 */

export function isKmindPath(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').toLowerCase().endsWith('.kmind')
}

function canonicalBody(text: string): string {
  const doc = JSON.parse(text) as {
    version?: unknown
    nodes?: Array<Record<string, unknown>>
    edges?: Array<Record<string, unknown>>
  }
  const nodes = (doc.nodes ?? []).map((n, i) => {
    const imageOnly = n.imageOnly === true && Boolean(n.image)
    const out: Record<string, unknown> = {
      id: typeof n.id === 'string' ? n.id : `n_${i}`,
      text: imageOnly ? '' : typeof n.text === 'string' ? n.text : `Node ${i + 1}`,
      shape: imageOnly
        ? 'rounded'
        : n.shape === 'rect' || n.shape === 'rounded' || n.shape === 'ellipse'
          ? n.shape
          : 'rounded',
      x: typeof n.x === 'number' ? n.x : 0,
      y: typeof n.y === 'number' ? n.y : 0,
      width: typeof n.width === 'number' ? n.width : imageOnly ? 200 : 160,
      height: typeof n.height === 'number' ? n.height : imageOnly ? 150 : 48
    }
    if (n.link) out.link = n.link
    if (n.image) out.image = n.image
    if (imageOnly) out.imageOnly = true
    if (Object.prototype.hasOwnProperty.call(n, 'note')) {
      out.note = typeof n.note === 'string' ? n.note : ''
      if (n.noteOpen === true) out.noteOpen = true
      if (n.noteLink) out.noteLink = n.noteLink
    }
    return out
  })
  const edges = (doc.edges ?? []).map((e, i) => {
    const out: Record<string, unknown> = {
      id: typeof e.id === 'string' ? e.id : `e_${i}`,
      source: e.source,
      target: e.target
    }
    if (typeof e.sourceHandle === 'string') out.sourceHandle = e.sourceHandle
    if (typeof e.targetHandle === 'string') out.targetHandle = e.targetHandle
    return out
  })
  return JSON.stringify({ version: doc.version ?? 2, nodes, edges })
}

export function kmindContentDirty(content: string, originalContent: string): boolean {
  if (content === originalContent) return false
  try {
    return canonicalBody(content) !== canonicalBody(originalContent)
  } catch {
    return content !== originalContent
  }
}

export function contentIsDirty(filePath: string, content: string, originalContent: string): boolean {
  if (content === originalContent) return false
  if (isKmindPath(filePath)) return kmindContentDirty(content, originalContent)
  // Prose/text: ignore CRLF vs LF alone (open/save across tools must not false-dirty).
  const a = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const b = originalContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return a !== b
}
