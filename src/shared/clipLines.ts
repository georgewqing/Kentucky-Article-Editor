/** Keep the first few lines of a log/toast; overflow becomes a single ellipsis. */
export function clipLines(text: string, maxLines = 4, maxChars = 360): string {
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!normalized) return ''
  let lines = normalized.split('\n')
  let clipped = false
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    clipped = true
  }
  let out = lines.join('\n')
  if (out.length > maxChars) {
    out = out.slice(0, maxChars).trimEnd()
    clipped = true
  }
  return clipped ? `${out}\n…` : out
}
