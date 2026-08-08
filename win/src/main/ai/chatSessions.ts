import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getAiChatsDir } from './appBodyPaths'

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
    return JSON.parse(readFileSync(p, 'utf-8')) as ChatSession
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
    proposals: []
  }
  saveSession(session)
  return session
}

export function deleteSession(id: string): void {
  const p = sessionPath(id)
  if (existsSync(p)) unlinkSync(p)
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
