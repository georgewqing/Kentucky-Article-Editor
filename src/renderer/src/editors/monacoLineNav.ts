import type { Editor } from '@tiptap/core'
import type { editor as MonacoEditor } from 'monaco-editor'
import { Range } from 'monaco-editor'

const FLASH_CLASS = 'kmind-line-flash'

function normalizeSearchText(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^\[\s?[xX ]\]\s+/i, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectTextblockPositions(editor: Editor): number[] {
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) positions.push(pos)
  })
  return positions
}

/** Map a 1-based markdown source line to a ProseMirror textblock pos. */
export function posForMarkdownLine(
  editor: Editor,
  markdown: string,
  line: number
): number | null {
  const lines = markdown.split(/\r?\n/)
  if (line < 1 || line > lines.length) return null

  const positions = collectTextblockPositions(editor)
  if (positions.length === 0) return null

  const needle = normalizeSearchText(lines[line - 1]!)

  if (needle) {
    let seen = 0
    for (let i = 0; i < line - 1; i++) {
      if (normalizeSearchText(lines[i]!) === needle) seen += 1
    }
    let hit = 0
    let exact: number | null = null
    let includes: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return
      const text = normalizeSearchText(node.textContent)
      if (text === needle) {
        if (hit === seen) {
          exact = pos
          return false
        }
        hit += 1
      } else if (includes === null && needle.length >= 2 && text.includes(needle)) {
        includes = pos
      }
    })
    if (exact !== null) return exact
    if (includes !== null) return includes
  }

  // Nth non-empty markdown line → Nth textblock (blank line → previous).
  let nonEmptyIndex = -1
  let targetIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim()) {
      if (i + 1 === line) break
      continue
    }
    nonEmptyIndex += 1
    if (i + 1 === line) {
      targetIdx = nonEmptyIndex
      break
    }
    targetIdx = nonEmptyIndex
  }

  return positions[Math.min(Math.max(targetIdx, 0), positions.length - 1)] ?? null
}

export function domForPos(editor: Editor, pos: number): HTMLElement | null {
  const node = editor.view.nodeDOM(pos)
  if (node instanceof HTMLElement) return node
  if (node?.parentElement instanceof HTMLElement) return node.parentElement
  return null
}

export function resolveArticleLineEl(
  editor: Editor,
  markdown: string,
  line: number
): HTMLElement | null {
  const pos = posForMarkdownLine(editor, markdown, line)
  return pos !== null ? domForPos(editor, pos) : null
}

/**
 * Reveal a 1-based line in Monaco and highlight until the cursor moves.
 * When hideLineNumbers is true, the gutter stays hidden for the flash (jump UX).
 */
export function flashMonacoLine(
  ed: MonacoEditor.IStandaloneCodeEditor,
  line: number,
  opts?: { hideLineNumbers?: boolean }
): () => void {
  const model = ed.getModel()
  if (!model) return () => undefined

  const max = model.getLineCount()
  if (line < 1 || line > max) return () => undefined

  if (opts?.hideLineNumbers) {
    ed.updateOptions({ lineNumbers: 'off' })
  }

  ed.revealLineInCenter(line)
  ed.setPosition({ lineNumber: line, column: 1 })
  ed.focus()

  const collection = ed.createDecorationsCollection([
    {
      range: new Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: FLASH_CLASS
      }
    }
  ])

  let cleared = false
  let armed = false
  const clear = (): void => {
    if (cleared) return
    cleared = true
    collection.clear()
    if (opts?.hideLineNumbers) {
      ed.updateOptions({ lineNumbers: 'on' })
    }
    dispCursor.dispose()
  }

  const armId = window.setTimeout(() => {
    armed = true
  }, 400)

  const dispCursor = ed.onDidChangeCursorPosition(() => {
    if (!armed) return
    clear()
  })

  return () => {
    window.clearTimeout(armId)
    clear()
  }
}

/** Click a line while picking — returns disposable. */
export function bindMonacoLinePick(
  ed: MonacoEditor.IStandaloneCodeEditor,
  onPick: (line: number) => void
): () => void {
  const disp = ed.onMouseDown((e) => {
    if (e.event.rightButton) return
    const line = e.target.position?.lineNumber
    if (!line) return
    e.event.preventDefault()
    e.event.stopPropagation()
    onPick(line)
  })
  return () => disp.dispose()
}
