/** Shared Ask-tool / workspace-cite types (main + renderer). */

export const ASK_OTHER_ID = '__other__'
export const ASK_MAX_QUESTIONS = 3
export const ASK_MAX_OPTIONS = 8
export const ASK_MAX_PER_TURN = 8
export const CITE_MAX_LINKS = 4

export interface AskUserOption {
  id: string
  label: string
}

export interface AskUserQuestion {
  id: string
  prompt: string
  options: AskUserOption[]
  recommendedId?: string
}

export interface AskUserAnswer {
  questionId: string
  optionId: string
  otherText?: string
}

export interface AskUserCard {
  id: string
  messageId: string
  title?: string
  questions: AskUserQuestion[]
  status: 'answered' | 'cancelled'
  answers?: AskUserAnswer[]
}

/** Written to session JSON while the card is on screen (crash / Ctrl+R restore). */
export interface PendingAskSnapshot {
  askId: string
  messageId: string
  title?: string
  questions: AskUserQuestion[]
}

export interface CiteLink {
  path: string
  line?: number
  /** Resolved to `line` at cite time (mind-map “link to paragraph”). */
  snippet?: string
  label?: string
  exists: boolean
}

export interface CiteCard {
  id: string
  messageId: string
  links: CiteLink[]
}

export type ParseAskUserResult =
  | { ok: true; title?: string; questions: AskUserQuestion[] }
  | { ok: false; error: string }

function asId(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  return s || fallback
}

export function parseAskUserArgs(args: Record<string, unknown>): ParseAskUserResult {
  const titleRaw = typeof args.title === 'string' ? args.title.trim() : ''
  const rawQs = Array.isArray(args.questions) ? args.questions : []
  if (rawQs.length === 0) {
    return { ok: false, error: 'ask_user requires questions[] (1–3 items).' }
  }
  if (rawQs.length > ASK_MAX_QUESTIONS) {
    return { ok: false, error: `ask_user allows at most ${ASK_MAX_QUESTIONS} questions per call.` }
  }
  const questions: AskUserQuestion[] = []
  const seenQ = new Set<string>()
  for (let i = 0; i < rawQs.length; i++) {
    const q = rawQs[i]
    if (!q || typeof q !== 'object') {
      return { ok: false, error: `questions[${i}] is invalid.` }
    }
    const rec = q as Record<string, unknown>
    const id = asId(rec.id, `q${i + 1}`)
    if (seenQ.has(id)) return { ok: false, error: `Duplicate question id: ${id}` }
    seenQ.add(id)
    const prompt = String(rec.prompt ?? rec.title ?? '').trim()
    if (!prompt) return { ok: false, error: `questions[${i}] needs a prompt.` }
    const rawOpts = Array.isArray(rec.options) ? rec.options : []
    if (rawOpts.length < 2) {
      return { ok: false, error: `questions[${i}] needs at least 2 options.` }
    }
    if (rawOpts.length > ASK_MAX_OPTIONS) {
      return { ok: false, error: `questions[${i}] allows at most ${ASK_MAX_OPTIONS} options.` }
    }
    const options: AskUserOption[] = []
    const seenO = new Set<string>()
    for (let j = 0; j < rawOpts.length; j++) {
      const o = rawOpts[j]
      if (!o || typeof o !== 'object') {
        return { ok: false, error: `questions[${i}].options[${j}] is invalid.` }
      }
      const orec = o as Record<string, unknown>
      const oid = asId(orec.id, `opt${j + 1}`)
      if (oid === ASK_OTHER_ID) {
        return { ok: false, error: `Option id "${ASK_OTHER_ID}" is reserved.` }
      }
      if (seenO.has(oid)) return { ok: false, error: `Duplicate option id: ${oid}` }
      seenO.add(oid)
      const label = String(orec.label ?? orec.text ?? '').trim()
      if (!label) return { ok: false, error: `questions[${i}].options[${j}] needs a label.` }
      options.push({ id: oid, label })
    }
    const recId =
      typeof rec.recommendedId === 'string' && seenO.has(rec.recommendedId)
        ? rec.recommendedId
        : undefined
    questions.push({ id, prompt, options, recommendedId: recId })
  }
  return { ok: true, title: titleRaw || undefined, questions }
}

export function parseCiteLinks(args: Record<string, unknown>): CiteLink[] | { error: string } {
  const raw = Array.isArray(args.links)
    ? args.links
    : args.path
      ? [{ path: args.path, line: args.line, label: args.label }]
      : []
  if (raw.length === 0) return { error: 'cite_workspace requires links[] (1–4).' }
  if (raw.length > CITE_MAX_LINKS) {
    return { error: `cite_workspace allows at most ${CITE_MAX_LINKS} links per call.` }
  }
  const links: CiteLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const path = String(rec.path || '').trim().replace(/\\/g, '/')
    if (!path) continue
    const lineNum = typeof rec.line === 'number' && rec.line >= 1 ? Math.floor(rec.line) : undefined
    const snippet = typeof rec.snippet === 'string' ? rec.snippet.trim() : ''
    const label = typeof rec.label === 'string' ? rec.label.trim() : ''
    links.push({
      path,
      line: lineNum,
      snippet: snippet || undefined,
      label: label || undefined,
      exists: false
    })
  }
  if (links.length === 0) return { error: 'cite_workspace: no valid links.' }
  return links
}
