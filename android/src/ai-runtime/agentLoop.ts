import {
  loadSession,
  saveSession,
  estimateSessionTokens,
  type ChatMessage,
  type ChatSession,
  type FileProposal,
  type PlanStep
} from './chatSessions'
import { loadAiSettings } from './aiSettings'
import {
  streamChatCompletion,
  type ChatCompletionMessage
} from './openaiCompatClient'
import { getWritingToolsForMode, runTool, LITERARY_SYSTEM_PROMPT, applyProposalToDisk, getWorkspaceIo, type AgentToolMode } from './tools'
import { parseCharactersCsv } from './formats'
import { shouldAutoApply, type FileProposalEx } from './proposalGate'
import { skillsCatalogText } from './skills'
import { Capacitor } from '@capacitor/core'

const activeAborts = new Map<string, AbortController>()

/** On Capacitor, Accept/auto-apply must hit disk — dirty-only buffers die on web reload. */
function shouldPersistProposalToDisk(
  settings: ReturnType<typeof loadAiSettings>,
  isNewFile: boolean
): boolean {
  return settings.applyWritesToDisk || isNewFile || Capacitor.isNativePlatform()
}
const MAX_CTX_FILE_CHARS = 24000
const MAX_CHAR_SUMMARY_CHARS = 6000

export interface EditorContextPayload {
  workspacePath: string | null
  activeFilePath: string | null
  selection: string | null
  mentionedPaths: string[]
}

type EventListener = (payload: unknown) => void
const eventListeners = new Map<string, Set<EventListener>>()
export const aiEvents = {
  emit(channel: string, payload: unknown): void {
    for (const listener of eventListeners.get(channel) || []) listener(payload)
  },
  on(channel: string, cb: EventListener): () => void {
    const listeners = eventListeners.get(channel) || new Set<EventListener>()
    listeners.add(cb)
    eventListeners.set(channel, listeners)
    return () => listeners.delete(cb)
  }
}
function uuid(): string {
  return globalThis.crypto?.randomUUID?.() || `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function readAbsSafe(workspaceRoot: string | null, filePath: string): string | null {
  if (!workspaceRoot || !filePath) return null
  try {
    const io = getWorkspaceIo()
    const abs = io.join(workspaceRoot, filePath)
    return abs
  } catch {
    return null
  }
}

/** L5: head + selection neighborhood + tail when file is large. */
async function readWorkspaceText(
  workspaceRoot: string | null,
  filePath: string,
  selection: string | null
): Promise<string | null> {
  const abs = readAbsSafe(workspaceRoot, filePath)
  if (!abs) return null
  try {
    const text = await getWorkspaceIo().readFile(abs)
    if (text === null) return null
    if (text.length <= MAX_CTX_FILE_CHARS) return text
    const headLen = Math.floor(MAX_CTX_FILE_CHARS * 0.35)
    const tailLen = Math.floor(MAX_CTX_FILE_CHARS * 0.25)
    const midBudget = MAX_CTX_FILE_CHARS - headLen - tailLen - 80
    let mid = ''
    if (selection && selection.trim()) {
      const idx = text.indexOf(selection)
      if (idx >= 0) {
        const start = Math.max(0, idx - Math.floor(midBudget / 4))
        const end = Math.min(text.length, idx + selection.length + Math.floor(midBudget / 2))
        mid = text.slice(start, end)
      }
    }
    if (!mid) {
      const midStart = Math.max(0, Math.floor(text.length / 2) - Math.floor(midBudget / 2))
      mid = text.slice(midStart, midStart + midBudget)
    }
    return [
      text.slice(0, headLen),
      `\n\n…[middle excerpt]…\n\n`,
      mid.slice(0, midBudget),
      `\n\n…[truncated; total ${text.length} chars]…\n\n`,
      text.slice(-tailLen)
    ].join('')
  } catch {
    return null
  }
}

async function buildCharacterSummary(workspaceRoot: string | null): Promise<string | null> {
  if (!workspaceRoot) return null
  const abs = getWorkspaceIo().join(workspaceRoot, 'characters.csv')
  try {
    const text = await getWorkspaceIo().readFile(abs)
    if (text === null) return null
    const chars = parseCharactersCsv(text)
    if (!chars.length) return null
    const lines = chars.map((c) => {
      const note = (c.note || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      return `- ${c.id} | ${c.name} | model:${c.model_node || '—'} | ${note}`
    })
    let body = lines.join('\n')
    if (body.length > MAX_CHAR_SUMMARY_CHARS) {
      body = body.slice(0, MAX_CHAR_SUMMARY_CHARS) + '\n…[characters truncated]'
    }
    return `Cast (characters.csv):\n${body}`
  } catch {
    return null
  }
}

async function toApiMessagesWithTools(
  session: ChatSession,
  editor: EditorContextPayload,
  mode: AgentToolMode
): Promise<ChatCompletionMessage[]> {
  const settings = loadAiSettings()
  const msgs: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: LITERARY_SYSTEM_PROMPT(settings.styleMemo, mode, {
        skillsCatalog: skillsCatalogText(),
        webSearchEnabled: settings.webSearchEnabled
      })
    }
  ]
  const ctxParts: string[] = []
  if (editor.workspacePath) ctxParts.push(`Workspace: ${editor.workspacePath}`)

  const cast = await buildCharacterSummary(editor.workspacePath)
  if (cast) ctxParts.push(cast)

  if (editor.activeFilePath) {
    ctxParts.push(`Active file: ${editor.activeFilePath}`)
    const body = await readWorkspaceText(editor.workspacePath, editor.activeFilePath, editor.selection)
    if (body) ctxParts.push(`Active file content:\n"""\n${body}\n"""`)
  }
  if (editor.selection) ctxParts.push(`Selection:\n"""\n${editor.selection.slice(0, 12000)}\n"""`)
  if (editor.mentionedPaths?.length) {
    ctxParts.push(`@mentions: ${editor.mentionedPaths.join(', ')}`)
    for (const rel of editor.mentionedPaths.slice(0, 8)) {
      const body = await readWorkspaceText(editor.workspacePath, rel, null)
      if (body) ctxParts.push(`@${rel}:\n"""\n${body}\n"""`)
    }
  }
  if (ctxParts.length) msgs.push({ role: 'system', content: `Editor context:\n${ctxParts.join('\n')}` })

  for (const m of session.messages) {
    const extra = m as ChatMessage & {
      toolCalls?: Array<{ id: string; name: string; arguments: string }>
    }
    if (m.role === 'assistant' && extra.toolCalls?.length) {
      msgs.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: extra.toolCalls.map((t) => ({
          id: t.id,
          type: 'function' as const,
          function: { name: t.name, arguments: t.arguments }
        }))
      })
    } else if (m.role === 'tool') {
      msgs.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId || 'unknown'
      })
    } else if (m.role === 'user' || m.role === 'system' || m.role === 'assistant') {
      msgs.push({ role: m.role, content: m.content })
    }
  }
  return msgs
}

async function commitProposal(
  session: ChatSession,
  p: FileProposalEx,
  assistantId: string,
  turnPaths: Set<string>,
  settings: ReturnType<typeof loadAiSettings>
): Promise<{ autoApplied: boolean }> {
  p.messageId = assistantId
  turnPaths.add(p.absPath.replace(/\//g, '\\').toLowerCase())
  const auto = shouldAutoApply(p, turnPaths, settings)
  const isNewFile = !p.before
  if (auto) {
    const persistDisk = shouldPersistProposalToDisk(settings, isNewFile)
    if (persistDisk) await applyProposalToDisk(p)
    p.status = 'applied'
  } else {
    p.status = 'pending'
  }
  session.proposals.push(p)
  const owner = session.messages.find((m) => m.id === assistantId)
  if (owner) {
    owner.proposalIds = [...(owner.proposalIds || []), p.id]
  }
  saveSession(session)
  aiEvents.emit('ai:proposal', {
    sessionId: session.id,
    proposal: p,
    autoApplied: auto,
    writeDisk: auto ? shouldPersistProposalToDisk(settings, isNewFile) : false,
    isNew: isNewFile
  })
  return { autoApplied: auto }
}

export function abortAi(sessionId = 'global'): void {
  const c = activeAborts.get(sessionId)
  if (c) {
    c.abort()
    activeAborts.delete(sessionId)
  }
}

export async function runAgentTurn(opts: {
  emit?: (channel: string, payload: unknown) => void
  sessionId: string
  userText: string
  editor: EditorContextPayload
  mode?: AgentToolMode
}): Promise<void> {
  const mode: AgentToolMode = opts.mode || loadAiSettings().agentMode || 'agent'
  const emit = opts.emit || aiEvents.emit
  const abortKey = opts.sessionId || 'global'
  abortAi(abortKey)
  const ac = new AbortController()
  activeAborts.set(abortKey, ac)

  const session = loadSession(opts.sessionId)
  if (!session) {
    emit('ai:error', { message: 'Session not found' })
    return
  }

  const settings = loadAiSettings()
  const used = estimateSessionTokens(session)
  if (used >= settings.contextWindow * 0.98) {
    emit('ai:error', {
      message:
        'Context window is nearly full. Create a new chat or delete older messages — history was not silently reset.'
    })
    activeAborts.delete(abortKey)
    return
  }

  session.messages.push({
    id: uuid(),
    role: 'user',
    content: opts.userText,
    createdAt: Date.now()
  })
  if (session.title === 'New chat' && opts.userText.trim()) {
    session.title = opts.userText.trim().slice(0, 48)
  }
  saveSession(session)
  emit('ai:session', session)

  const workspaceRoot = opts.editor.workspacePath
  let steps = 0
  const maxSteps = mode === 'ask' ? 1 : settings.agentEnabled ? 20 : 1
  const turnPaths = new Set<string>()
  const tools =
    settings.agentEnabled && workspaceRoot
      ? getWritingToolsForMode(mode, { webSearchEnabled: settings.webSearchEnabled })
      : undefined

  try {
    while (steps < maxSteps) {
      steps += 1
      if (ac.signal.aborted) break

      const assistantId = uuid()
      let content = ''
      const toolAcc = new Map<number, { id: string; name: string; arguments: string }>()
      emit('ai:assistant_start', { messageId: assistantId, sessionId: session.id })

      await new Promise<void>(async (resolve) => {
        void streamChatCompletion({
          messages: await toApiMessagesWithTools(session, opts.editor, mode),
          tools,
          signal: ac.signal,
          onEvent: (ev) => {
            if (ev.type === 'content') {
              content += ev.text
              emit('ai:chunk', {
                sessionId: session.id,
                messageId: assistantId,
                text: ev.text
              })
            } else if (ev.type === 'tool_call_delta') {
              const cur = toolAcc.get(ev.index) || { id: '', name: '', arguments: '' }
              if (ev.id) cur.id = ev.id
              if (ev.name) cur.name += ev.name
              if (ev.argumentsDelta) cur.arguments += ev.argumentsDelta
              toolAcc.set(ev.index, cur)
            } else if (ev.type === 'error') {
              emit('ai:error', { message: ev.message, sessionId: session.id })
            } else if (ev.type === 'done') {
              resolve()
            }
          }
        })
      })

      if (ac.signal.aborted) break

      const toolCalls = Array.from(toolAcc.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({
          id: v.id || uuid(),
          name: v.name,
          arguments: v.arguments
        }))
        .filter((t) => t.name)

      if (toolCalls.length === 0) {
        session.messages.push({
          id: assistantId,
          role: 'assistant',
          content: content || '(empty)',
          createdAt: Date.now()
        })
        saveSession(session)
        emit('ai:session', session)
        break
      }

      const assistantMsg: ChatMessage & {
        toolCalls?: Array<{ id: string; name: string; arguments: string }>
      } = {
        id: assistantId,
        role: 'assistant',
        content: content || toolCalls.map((t) => `⚙ ${t.name}`).join('\n'),
        createdAt: Date.now(),
        toolCalls
      }
      session.messages.push(assistantMsg)

      if (!workspaceRoot) {
        emit('ai:error', { message: 'Open a workspace folder to use agent tools.' })
        saveSession(session)
        break
      }

      for (const tc of toolCalls) {
        emit('ai:tool', { sessionId: session.id, name: tc.name, status: 'running' })
        const result = await runTool(tc.name, tc.arguments, {
          workspaceRoot,
          onProposal: (p) => {
            return commitProposal(
              session,
              p as FileProposalEx,
              assistantId,
              turnPaths,
              loadAiSettings()
            )
          },
          onPlan: (stepsIn) => {
            session.plan = stepsIn
            emit('ai:plan', { sessionId: session.id, plan: session.plan })
          },
          onPlanUpdate: (patch) => {
            let step: PlanStep | undefined
            if (patch.id) step = session.plan.find((s) => s.id === patch.id)
            else if (typeof patch.index === 'number') step = session.plan[patch.index]
            if (!step) return
            if (
              patch.status === 'pending' ||
              patch.status === 'in_progress' ||
              patch.status === 'done'
            ) {
              step.status = patch.status
            }
            if (patch.text) step.text = patch.text
            emit('ai:plan', { sessionId: session.id, plan: session.plan })
          },
          onOpenFile: (relPath, line) => {
            emit('ai:workspaceOp', { op: 'openFile', path: relPath, line })
          },
          getPlan: () => session.plan,
          webSearchEnabled: settings.webSearchEnabled,
          webSearchProvider: settings.webSearchProvider,
          webSearchMaxResults: settings.webSearchMaxResults
        })
        session.messages.push({
          id: uuid(),
          role: 'tool',
          content: result,
          createdAt: Date.now(),
          toolName: tc.name,
          toolCallId: tc.id
        })
        emit('ai:tool', {
          sessionId: session.id,
          name: tc.name,
          status: 'done',
          resultPreview: result.slice(0, 400)
        })
      }

      saveSession(session)
      emit('ai:session', session)
    }
  } finally {
    activeAborts.delete(abortKey)
    emit('ai:done', { sessionId: opts.sessionId })
    const latest = loadSession(opts.sessionId)
    if (latest) emit('ai:session', latest)
  }
}

export async function applyProposal(sessionId: string, proposalId: string): Promise<FileProposal | null> {
  const session = loadSession(sessionId)
  if (!session) return null
  const p = session.proposals.find((x) => x.id === proposalId)
  if (!p || p.status !== 'pending') return null
  const settings = loadAiSettings()
  const isNewFile = !p.before
  if (shouldPersistProposalToDisk(settings, isNewFile)) await applyProposalToDisk(p)
  p.status = 'applied'
  saveSession(session)
  return p
}

export function rejectProposal(sessionId: string, proposalId: string): FileProposal | null {
  const session = loadSession(sessionId)
  if (!session) return null
  const p = session.proposals.find((x) => x.id === proposalId)
  if (!p || p.status !== 'pending') return null
  p.status = 'rejected'
  saveSession(session)
  return p
}

export async function applyAllPending(sessionId: string): Promise<FileProposal[]> {
  const session = loadSession(sessionId)
  if (!session) return []
  const settings = loadAiSettings()
  const applied: FileProposal[] = []
  for (const p of session.proposals) {
    if (p.status !== 'pending') continue
    const isNewFile = !p.before
    if (shouldPersistProposalToDisk(settings, isNewFile)) await applyProposalToDisk(p)
    p.status = 'applied'
    applied.push(p)
  }
  saveSession(session)
  return applied
}
