/** Compact unified-ish preview of before → after for AI proposal cards. */
export function formatProposalDiff(before: string, after: string, maxLines = 48): string {
  const b = before ?? ''
  const a = after ?? ''
  if (!b.trim()) {
    const lines = a.split('\n')
    const shown = lines.slice(0, maxLines).map((l) => `+ ${l}`)
    if (lines.length > maxLines) shown.push(`… (+${lines.length - maxLines} more lines)`)
    return shown.join('\n') || '(empty file)'
  }
  if (b === a) return '(no text change)'

  const oldLines = b.split('\n')
  const newLines = a.split('\n')
  let start = 0
  const oldLen = oldLines.length
  const newLen = newLines.length
  while (start < oldLen && start < newLen && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLen - 1
  let newEnd = newLen - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1
    newEnd -= 1
  }

  const out: string[] = []
  if (start > 0) out.push(`@@ context: ${start} unchanged line(s) above @@`)
  for (let i = start; i <= oldEnd; i++) {
    if (out.length >= maxLines) break
    out.push(`- ${oldLines[i]}`)
  }
  for (let i = start; i <= newEnd; i++) {
    if (out.length >= maxLines) break
    out.push(`+ ${newLines[i]}`)
  }
  const removed = Math.max(0, oldEnd - start + 1)
  const added = Math.max(0, newEnd - start + 1)
  const tail = Math.min(oldLen - 1 - oldEnd, newLen - 1 - newEnd)
  if (tail > 0) out.push(`@@ context: ${tail} unchanged line(s) below @@`)
  if (out.length >= maxLines && removed + added > maxLines) {
    out.push(`… (diff truncated; −${removed} / +${added} lines in hunk)`)
  }
  return out.join('\n')
}
