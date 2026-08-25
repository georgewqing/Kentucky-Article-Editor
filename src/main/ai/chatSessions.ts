import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getAiChatsDir } from './appBodyPaths'
import {
  parseAskUserArgs,
  type AskUserAnswer,
  type AskUserCard,
  type CiteCard,
  type CiteLink,
  type PendingAskSnapshot
} from '../../shared/agentAsk'

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface AttachmentPreview {
  path: string
  /** First lines of the file for the sent-message “page” thumbnail. */
  lines: string[]
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  toolName?: string
  toolCallId?: string
  proposalIds?: string[]
  /** Agent Git confirm-card ops produced by this assistant turn. */
  gitOpIds?: string[]
  error?: string
  /** Paperclip / composer mounts for this user turn (workspace-relative). */
  attachedPaths?: string[]
  attachmentPreviews?: AttachmentPreview[]
  /** Slash skill id invoked for this user turn (composer chip). */
  skillId?: string
  /** API-only expansion at send time (mounts + this turn's Editor context / skill). Replay this; do not re-read disk or rebuild L5. Not shown in the UI bubble. */
  apiContent?: string
  /** Assistant turn was cut off by Stop (or a following edit/resend). */
  aborted?: boolean
}

export interface PlanStep {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface FileProposal {
  id: string
  path: string
  /** Absolute path inside workspace */
  absPath: string
  before: string
  after: string
  summary: string
  status: 'pending' | 'applied' | 'rejected'
  /** Assistant message that produced this proposal (inline in that turn). */
  messageId?: string
  /** G3 classification hint from tools */
  kind?:
    | 'prose'
    | 'characters'
    | 'dialogue'
    | 'dialogue_performance'
    | 'dialogue_choices'
    | 'dialogue_layout'
    | 'kmind'
    | 'kmind_layout'
    | 'story_state'
    | 'foreshadow'
    | 'voice_anchor'
    | 'voice_bank'
    | 'glossary'
    | 'materials_index'
    | 'revision_meta'
    | 'other'
  /** Lines touched (dialogue) */
  changeCount?: number
}

/** Agent Git write ops — auto-executed; UI shows highlight card (no Confirm). */
export type GitPendingKind = 'add' | 'commit' | 'remote_add' | 'remote_remove'

export interface GitPendingOp {
  id: string
  kind: GitPendingKind
  summary: string
  /** Human-readable detail shown on the result card */
  detail: string
  /** Opaque params for execution */
  params: {
    paths?: string[]
    all?: boolean
    message?: string
    remote?: string
    url?: string
  }
  status: 'pending' | 'applied' | 'rejected'
  messageId?: string
  resultNote?: string
  error?: string
}

export interface ChatSession {
  id: string
  title: string
  workspacePath: string | null
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  plan: PlanStep[]
  /** Workspace-relative path to active plans/*.plan.md (Mirror companion). */
  planFileRel?: string | null
  proposals: FileProposal[]
  /** Pending / history Agent Git ops (confirm card). */
  gitOps?: GitPendingOp[]
  /** Answered / cancelled ask_user cards. */
  askCards?: AskUserCard[]
  /** cite_workspace chips (do not steal editor focus). */
  citeCards?: CiteCard[]
  /** Live ask_user wait; cleared when answered or the run ends. */
  pendingAsk?: PendingAskSnapshot
}

function sessionPath(id: string): string {
  return join(getAiChatsDir(), `${id}.json`)
}

function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

export function listSessions(
  workspacePath?: string | null
): Array<Pick<ChatSession, 'id' | 'title' | 'workspacePath' | 'updatedAt'>> {
  const dir = getAiChatsDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const out: Array<Pick<ChatSession, 'id' | 'title' | 'workspacePath' | 'updatedAt'>> = []
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ChatSession
      const ws = s.workspacePath ?? null
      // When filtering: only sessions for this workspace (null ↔ null for no-project).
      if (workspacePath !== undefined && !pathsEqual(ws, workspacePath)) continue
      out.push({
        id: s.id,
        title: s.title || 'Chat',
        workspacePath: ws,
        updatedAt: s.updatedAt
      })
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

export function loadSession(id: string): ChatSession | null {
  const p = sessionPath(id)
  if (!existsSync(p)) return null
  try {
    const session = JSON.parse(readFileSync(p, 'utf-8')) as ChatSession
    if (!session.gitOps) session.gitOps = []
    if (!session.askCards) session.askCards = []
    if (!session.citeCards) session.citeCards = []
    // Migrate legacy pending file proposals (Accept UI removed): treat as applied if after
    // looks like a real write, else rejected. Legacy pending gitOps (Confirm removed) → rejected.
    let dirty = hydrateAskCiteFromMessages(session)
    for (const prop of session.proposals || []) {
      if (prop.status !== 'pending') continue
      prop.status = prop.after != null && String(prop.after).length >= 0 ? 'applied' : 'rejected'
      dirty = true
    }
    for (const op of session.gitOps) {
      if (op.status !== 'pending') continue
      op.status = 'rejected'
      op.resultNote = op.resultNote || 'Superseded: Git ops now auto-execute'
      dirty = true
    }
    if (dirty) saveSession(session)
    return session
  } catch {
    return null
  }
}

export function saveSession(session: ChatSession): void {
  session.updatedAt = Date.now()
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8')
}

export function createSession(workspacePath: string | null): ChatSession {
  const now = Date.now()
  const session: ChatSession = {
    id: randomUUID(),
    title: 'New chat',
    workspacePath,
    createdAt: now,
    updatedAt: now,
    messages: [],
    plan: [],
    proposals: [],
    gitOps: [],
    askCards: [],
    citeCards: []
  }
  saveSession(session)
  return session
}

export function deleteSession(id: string): void {
  const p = sessionPath(id)
  if (existsSync(p)) unlinkSync(p)
}

export function lastUserMessage(session: ChatSession): ChatMessage | undefined {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === 'user') return session.messages[i]
  }
  return undefined
}

/** Cursor rule: only the last user turn can be rewritten. Drops following assistant/tool rows. */
export function rewindToUserTurn(
  session: ChatSession,
  userMessageId: string,
  nextContent: string
): boolean {
  const last = lastUserMessage(session)
  if (!last || last.id !== userMessageId) return false
  const idx = session.messages.findIndex((m) => m.id === userMessageId)
  if (idx < 0 || session.messages[idx].role !== 'user') return false
  const removed = session.messages.slice(idx + 1)
  const removedAssistantIds = new Set(
    removed.filter((m) => m.role === 'assistant').map((m) => m.id)
  )
  session.messages = session.messages.slice(0, idx + 1)
  const user = session.messages[idx]
  user.content = nextContent
  delete user.apiContent
  session.proposals = (session.proposals || []).filter(
    (p) => !p.messageId || !removedAssistantIds.has(p.messageId)
  )
  session.gitOps = (session.gitOps || []).filter(
    (g) => !g.messageId || !removedAssistantIds.has(g.messageId)
  )
  session.askCards = (session.askCards || []).filter(
    (c) => !c.messageId || !removedAssistantIds.has(c.messageId)
  )
  session.citeCards = (session.citeCards || []).filter(
    (c) => !c.messageId || !removedAssistantIds.has(c.messageId)
  )
  if (session.pendingAsk && removedAssistantIds.has(session.pendingAsk.messageId)) {
    delete session.pendingAsk
  }
  return true
}

export function estimateTokensFromText(text: string | null | undefined): number {
  // Rough: ~4 chars / token for mixed CJK+Latin
  if (typeof text !== 'string' || !text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateSessionTokens(session: ChatSession): number {
  let n = 0
  for (const m of session.messages) n += estimateTokensFromText(m.content)
  return n
}

type MsgEx = ChatMessage & {
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return null
}

/** Rebuild ask/cite cards from tool rows when older sessions omitted them. Returns true if it added any. */
export function hydrateAskCiteFromMessages(session: ChatSession): boolean {
  if (!session.askCards) session.askCards = []
  if (!session.citeCards) session.citeCards = []
  const haveAsk = new Set(session.askCards.map((c) => c.id))
  const haveCite = new Set(session.citeCards.map((c) => c.id))
  const msgs = session.messages as MsgEx[]
  let added = false
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role !== 'tool' || !m.toolCallId) continue
    const body = parseJsonObject(m.content || '')
    if (!body) continue
    let ownerId: string | undefined
    for (let j = i - 1; j >= 0; j--) {
      const prev = msgs[j]
      if (prev.role === 'assistant' && prev.toolCalls?.some((t) => t.id === m.toolCallId)) {
        ownerId = prev.id
        break
      }
    }
    if (!ownerId) continue
    if (m.toolName === 'ask_user' && !haveAsk.has(m.toolCallId)) {
      const owner = msgs.find((x) => x.id === ownerId)
      const argRaw = owner?.toolCalls?.find((t) => t.id === m.toolCallId)?.arguments
      const parsed = argRaw ? parseAskUserArgs(parseJsonObject(argRaw) || {}) : { ok: false as const }
      const answers = Array.isArray(body.answers) ? (body.answers as AskUserAnswer[]) : undefined
      const cancelled = body.cancelled === true || (body.ok === false && !answers)
      if (!parsed.ok && !answers?.length) continue
      session.askCards.push({
        id: m.toolCallId,
        messageId: ownerId,
        title: parsed.ok ? parsed.title : undefined,
        questions: parsed.ok ? parsed.questions : [],
        status: cancelled ? 'cancelled' : 'answered',
        answers
      })
      haveAsk.add(m.toolCallId)
      added = true
    }
    if (
      m.toolName === 'cite_workspace' &&
      body.ok &&
      Array.isArray(body.links) &&
      !haveCite.has(m.toolCallId)
    ) {
      session.citeCards.push({
        id: m.toolCallId,
        messageId: ownerId,
        links: body.links as CiteLink[]
      })
      haveCite.add(m.toolCallId)
      added = true
    }
  }
  return added
}
