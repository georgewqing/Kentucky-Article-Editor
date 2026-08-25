/** Shared markdown line / sentence matching (renderer jump + Agent open_in_editor). */

const SNIPPET_MAX_CHARS = 400
const PATH_LINE_CITE_EXT = /\.(md|txt|csv|json|ya?ml|kmind|kyboard)$/i

export function normalizeSearchText(raw: string): string {
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

/** True if backtick / code text looks like a workspace path:line cite. */
export function looksLikePathLineCite(text: string): boolean {
  const m = /^(.*?):(\d+)$/.exec(text.trim())
  if (!m) return false
  const path = m[1].replace(/\\/g, '/')
  const line = Number(m[2])
  if (!Number.isFinite(line) || line < 1) return false
  if (path.includes('://')) return false
  return path.includes('/') || PATH_LINE_CITE_EXT.test(path)
}

function findMarkdownLineBySnippet(markdown: string, snippet: string): number | undefined {
  const needle = normalizeSearchText(snippet).slice(0, SNIPPET_MAX_CHARS)
  if (needle.length < 2) return undefined
  const lines = markdown.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (normalizeSearchText(lines[i]!) === needle) return i + 1
  }
  for (let i = 0; i < lines.length; i++) {
    const t = normalizeSearchText(lines[i]!)
    if (!t) continue
    if (t.includes(needle) || (t.length >= 2 && needle.includes(t))) return i + 1
  }
  return undefined
}

export function resolveJumpLine(
  markdown: string,
  opts: { line?: number; snippet?: string }
): { line: number } | { error: string } {
  const lines = markdown.split(/\r?\n/)
  const lineRaw = opts.line
  const line =
    typeof lineRaw === 'number' && Number.isFinite(lineRaw) && lineRaw >= 1
      ? Math.floor(lineRaw)
      : undefined
  const snippet = String(opts.snippet || '').trim().slice(0, SNIPPET_MAX_CHARS)
  const needle = snippet ? normalizeSearchText(snippet) : ''

  if (line !== undefined && line <= lines.length) {
    if (!needle) return { line }
    const at = normalizeSearchText(lines[line - 1] || '')
    if (at === needle || (needle.length >= 2 && (at.includes(needle) || needle.includes(at)))) {
      return { line }
    }
  }

  if (needle.length >= 2) {
    const found = findMarkdownLineBySnippet(markdown, snippet)
    if (found) return { line: found }
    return { error: 'Could not find that sentence in the file.' }
  }

  if (line !== undefined) {
    if (line > lines.length) return { error: 'Line is past the end of the file.' }
    return { line }
  }

  return { error: 'Need line or snippet.' }
}
