import { join } from './pathUtil'
import { getAiChatsDir } from './appBodyPaths'
import { cacheDelete, cacheList, cacheRead, cacheWrite, writeText } from './storage'

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  toolName?: string
  toolCallId?: string
  proposalIds?: string[]
  error?: string
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
    | 'other'
  /** Lines touched (dialogue) */
  changeCount?: number
}

export interface ChatSession {
  id: string
  title: string
  workspacePath: string | null
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  plan: PlanStep[]
  proposals: FileProposal[]
}

function sessionPath(id: string): string {
  return join(getAiChatsDir(), `${id}.json`)
}
function uuid(): string {
  return globalThis.crypto?.randomUUID?.() || `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
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
  const files = cacheList(dir).filter((f) => f.endsWith('.json'))
  const out: Array<Pick<ChatSession, 'id' | 'title' | 'workspacePath' | 'updatedAt'>> = []
  for (const f of files) {
    try {
      const text = cacheRead(join(dir, f))
      if (!text) continue
      const s = JSON.parse(text) as ChatSession
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
  try {
    const text = cacheRead(p)
    return text ? (JSON.parse(text) as ChatSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: ChatSession): void {
  session.updatedAt = Date.now()
  const path = sessionPath(session.id)
  const text = JSON.stringify(session, null, 2)
  cacheWrite(path, text)
  void writeText(path, text)
}

export function createSession(workspacePath: string | null): ChatSession {
  const now = Date.now()
  const session: ChatSession = {
    id: uuid(),
    title: 'New chat',
    workspacePath,
    createdAt: now,
    updatedAt: now,
    messages: [],
    plan: [],
    proposals: []
  }
  saveSession(session)
  return session
}

export function deleteSession(id: string): void {
  const p = sessionPath(id)
  cacheDelete(p)
  void import('./storage').then(({ deletePath }) => deletePath(p))
}

export function estimateTokensFromText(text: string): number {
  // Rough: ~4 chars / token for mixed CJK+Latin
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateSessionTokens(session: ChatSession): number {
  let n = 0
  for (const m of session.messages) n += estimateTokensFromText(m.content)
  return n
}
