/** Files to restore when rewriting the last user turn (Cursor-style checkpoint). */

export type RewindFileRestore = {
  absPath: string
  path: string
  before: string
  isNew: boolean
}

export function collectFileRestoresAfterUser(
  messages: Array<{ id: string; role: string }>,
  proposals: Array<{
    status: string
    messageId?: string
    absPath: string
    path: string
    before?: string
  }>,
  userMessageId: string
): RewindFileRestore[] {
  const idx = messages.findIndex((m) => m.id === userMessageId)
  if (idx < 0) return []
  const removedAssistantIds = new Set(
    messages.slice(idx + 1).filter((m) => m.role === 'assistant').map((m) => m.id)
  )
  const byPath = new Map<string, RewindFileRestore>()
  for (const p of proposals) {
    if (p.status !== 'applied') continue
    if (!p.messageId || !removedAssistantIds.has(p.messageId)) continue
    const key = p.absPath.replace(/\\/g, '/').toLowerCase()
    if (byPath.has(key)) continue
    const before = typeof p.before === 'string' ? p.before : ''
    byPath.set(key, {
      absPath: p.absPath,
      path: p.path || p.absPath,
      before,
      isNew: !before
    })
  }
  return Array.from(byPath.values())
}
