import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getAiChatsDir } from './appBodyPaths'

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
    // Migrate legacy pending file proposals (Accept UI removed): treat as applied if after
    // looks like a real write, else rejected. Legacy pending gitOps (Confirm removed) → rejected.
    let dirty = false
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
    gitOps: []
  }
  saveSession(session)
  return session
}

export function deleteSession(id: string): void {
  const p = sessionPath(id)
  if (existsSync(p)) unlinkSync(p)
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
