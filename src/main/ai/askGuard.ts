/** Ask mode: models (esp. DeepSeek) may dump native tool XML as assistant text. */

export const ASK_NO_TOOLS_REPLY =
  'Ask 模式不能读写工作区。请把输入栏从 Ask 改成 Agent，再发同一句话。'

const TOOL_MARKUP_RE =
  /DSML|tool_calls|<invoke\b|<tool_call\b|<parameter\b|<\s*(?:\|+|｜+)/i

export function looksLikeToolDump(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (!TOOL_MARKUP_RE.test(t)) return false
  return /invoke|tool_calls|read_file|propose_|read_skill|list_dir/i.test(t) || t.startsWith('<')
}

export function stripToolMarkup(text: string): string {
  return text
    .replace(/<(?:\|+|｜+)[^>]*>/g, '')
    .replace(/<\/(?:\|+|｜+)[^>]*>/g, '')
    .replace(/<tool_calls\b[^>]*>[\s\S]*?<\/tool_calls>/gi, '')
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '')
    .replace(/<parameter\b[\s\S]*?<\/parameter>/gi, '')
    .replace(/<\/?(?:tool_calls|tool_call|invoke|parameter)\b[^>]*>/gi, '')
    .trim()
}

export function sanitizeAskAssistantContent(text: string): string {
  if (!text.trim()) return ''
  const wasDump = looksLikeToolDump(text)
  const stripped = stripToolMarkup(text)
  if (wasDump && (!stripped || stripped.length < 40 || looksLikeToolDump(stripped))) {
    return ASK_NO_TOOLS_REPLY
  }
  if (!stripped || looksLikeToolDump(stripped)) return ASK_NO_TOOLS_REPLY
  return stripped
}
