export interface KMindNode {
  id: string
  text: string
  children: KMindNode[]
}

export interface KMindDocument {
  version: 1
  root: KMindNode
  viewport?: { x: number; y: number; zoom: number }
}

export function createEmptyKMind(rootText = 'Central Topic'): KMindDocument {
  return {
    version: 1,
    root: {
      id: 'root',
      text: rootText,
      children: []
    },
    viewport: { x: 0, y: 0, zoom: 1 }
  }
}

export function parseKMind(raw: string): KMindDocument {
  const data = JSON.parse(raw) as KMindDocument
  if (!data || data.version !== 1 || !data.root) {
    throw new Error('Invalid .kmind format')
  }
  return data
}

export function serializeKMind(doc: KMindDocument): string {
  return JSON.stringify(doc, null, 2)
}

let idCounter = 0
export function newNodeId(): string {
  idCounter += 1
  return `n_${Date.now().toString(36)}_${idCounter}`
}
