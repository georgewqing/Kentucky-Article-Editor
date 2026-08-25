import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReplaceStep } from '@tiptap/pm/transform'
import { Range } from 'monaco-editor'
import type { editor as MonacoEditor } from 'monaco-editor'
import { normalizeSearchText } from '@shared/articleLine'
import type { AgentEditSpan } from '@shared/agentEditSpans'
import { posForMarkdownLine } from './monacoLineNav'

export const agentEditPluginKey = new PluginKey<DecorationSet>('agentEditHighlight')

function offsetToLineCol(md: string, offset: number): { line: number; col: number } {
  const o = Math.max(0, Math.min(offset, md.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < o; i++) {
    if (md[i] === '\n') {
      line += 1
      lineStart = i + 1
    }
  }
  return { line, col: o - lineStart }
}

function markdownColToPlainIndex(mdLine: string, col: number, plain: string): number {
  const c = Math.max(0, Math.min(col, mdLine.length))
  const target = normalizeSearchText(mdLine.slice(0, c))
  if (!target) return c === 0 ? 0 : Math.min(c, plain.length)
  for (let i = 0; i <= plain.length; i++) {
    if (normalizeSearchText(plain.slice(0, i)).length >= target.length) return i
  }
  return plain.length
}

/** Markdown cursor offset → ProseMirror position (between characters). */
export function pmPosForMarkdownOffset(
  editor: Editor,
  markdown: string,
  offset: number
): number | null {
  if (!markdown.length) return 1
  const { line, col } = offsetToLineCol(markdown, offset)
  const blockPos = posForMarkdownLine(editor, markdown, line)
  if (blockPos == null) return null
  const $pos = editor.state.doc.resolve(Math.min(blockPos + 1, editor.state.doc.content.size))
  const parent = $pos.parent
  if (!parent.isTextblock) return $pos.pos
  const mdLine = markdown.split('\n')[line - 1] ?? ''
  const idx = markdownColToPlainIndex(mdLine, col, parent.textContent)
  const start = $pos.start($pos.depth)
  return Math.max(start, Math.min(start + idx, start + parent.content.size))
}

function mapNeverGrowRange(
  a: number,
  b: number,
  from: number,
  to: number,
  ins: number
): Array<[number, number]> {
  const del = to - from
  const out: Array<[number, number]> = []
  if (a < from) {
    const l1 = Math.min(b, from)
    if (l1 > a) out.push([a, l1])
  }
  if (b > to) {
    const r0 = Math.max(a, to) - del + ins
    const r1 = b - del + ins
    if (r1 > r0) out.push([r0, r1])
  }
  return out
}

function mapSetNeverGrow(set: DecorationSet, tr: Transaction): DecorationSet {
  if (!tr.docChanged) return set
  const next: Decoration[] = []
  for (const d of set.find()) {
    const cls = typeof d.spec.class === 'string' ? d.spec.class : ''
    if (!cls) continue
    let pieces: Array<[number, number]> = [[d.from, d.to]]
    for (const step of tr.steps) {
      if (!(step instanceof ReplaceStep)) {
        const m = step.getMap()
        pieces = pieces
          .map(([x, y]) => [m.map(x, 1), m.map(y, -1)] as [number, number])
          .filter(([x, y]) => y > x)
        continue
      }
      const mapped: Array<[number, number]> = []
      for (const [x, y] of pieces) {
        mapped.push(
          ...mapNeverGrowRange(x, y, step.from, step.to, step.slice.content.size)
        )
      }
      pieces = mapped
    }
    for (const [x, y] of pieces) {
      if (y > x && y <= tr.doc.content.size) {
        next.push(Decoration.inline(x, y, { class: cls }, { class: cls }))
      }
    }
  }
  return DecorationSet.create(tr.doc, next)
}

export function decorationsFromAgentSpans(
  editor: Editor,
  markdown: string,
  spans: AgentEditSpan[]
): DecorationSet {
  const decos: Decoration[] = []
  const size = editor.state.doc.content.size
  for (const s of spans) {
    if (s.end <= s.start) continue
    const from = pmPosForMarkdownOffset(editor, markdown, s.start)
    const to = pmPosForMarkdownOffset(editor, markdown, s.end)
    if (from == null || to == null) continue
    const a = Math.max(1, Math.min(from, to))
    const b = Math.max(a, Math.max(from, to))
    if (b <= a || a > size || b > size) continue
    const cls = s.kind === 'added' ? 'article-agent-added' : 'article-agent-modified'
    decos.push(Decoration.inline(a, b, { class: cls }, { class: cls }))
  }
  return DecorationSet.create(editor.state.doc, decos)
}

export const AgentEditHighlight = Extension.create({
  name: 'agentEditHighlight',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: agentEditPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(agentEditPluginKey) as
              | { spans: AgentEditSpan[]; markdown: string }
              | undefined
            if (meta) {
              return decorationsFromAgentSpans(editor, meta.markdown, meta.spans)
            }
            return mapSetNeverGrow(old, tr)
          }
        },
        props: {
          decorations(state) {
            return agentEditPluginKey.getState(state) || DecorationSet.empty
          }
        }
      })
    ]
  }
})

export function syncMonacoAgentSpans(
  ed: MonacoEditor.IStandaloneCodeEditor | null,
  spans: AgentEditSpan[]
): () => void {
  if (!ed) return () => undefined
  const model = ed.getModel()
  if (!model) return () => undefined
  const len = model.getValueLength()
  const list = spans.flatMap((s) => {
    if (s.end <= s.start) return []
    const start = Math.max(0, Math.min(s.start, len))
    const end = Math.max(start, Math.min(s.end, len))
    if (end <= start) return []
    const p1 = model.getPositionAt(start)
    const p2 = model.getPositionAt(end)
    return [
      {
        range: new Range(p1.lineNumber, p1.column, p2.lineNumber, p2.column),
        options: {
          inlineClassName:
            s.kind === 'added' ? 'monaco-agent-added' : 'monaco-agent-modified',
          stickiness: 1
        }
      }
    ]
  })
  const ids = ed.deltaDecorations([], list)
  return () => {
    ed.deltaDecorations(ids, [])
  }
}
