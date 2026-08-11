import { BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { isAbsolute, join } from 'path'
import { randomUUID } from 'crypto'
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
import { getWritingToolsForMode, runTool, LITERARY_SYSTEM_PROMPT, applyProposalToDisk, type AgentToolMode } from './tools'
import { parseCharactersCsv } from './formats'
import {
  decideAutoApply,
  shouldPersistAutoToDisk,
  type FileProposalEx,
  type GateDecision
} from './proposalGate'
import { skillsCatalogText } from './skills'

const activeAborts = new Map<number, AbortController>()
const MAX_CTX_FILE_CHARS = 24000
const MAX_CHAR_SUMMARY_CHARS = 6000

export interface EditorContextPayload {
  workspacePath: string | null
  activeFilePath: string | null
  selection: string | null
  mentionedPaths: string[]
}

function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

function readAbsSafe(workspaceRoot: string | null, filePath: string): string | null {
  if (!workspaceRoot || !filePath) return null
  try {
    const abs = isAbsolute(filePath) ? filePath : join(workspaceRoot, filePath)
    const rootNorm = workspaceRoot.replace(/[/\\]+$/, '').toLowerCase()
    if (!abs.toLowerCase().startsWith(rootNorm)) return null
    if (!existsSync(abs)) return null
    return abs
  } catch {
    return null
  }
}

/** L5: head + selection neighborhood + tail when file is large. */
function readWorkspaceText(
  workspaceRoot: string | null,
  filePath: string,
  selection: string | null
): string | null {
  const abs = readAbsSafe(workspaceRoot, filePath)
  if (!abs) return null
  try {
    const text = readFileSync(abs, 'utf-8')
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

function buildCharacterSummary(workspaceRoot: string | null): string | null {
  if (!workspaceRoot) return null
  const abs = join(workspaceRoot, 'characters.csv')
  if (!existsSync(abs)) return null
  try {
    const chars = parseCharactersCsv(readFileSync(abs, 'utf-8'))
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

function toApiMessagesWithTools(
  session: ChatSession,
  editor: EditorContextPayload,
  mode: AgentToolMode,
  turnSystemHint?: string
): ChatCompletionMessage[] {
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

  const cast = buildCharacterSummary(editor.workspacePath)
  if (cast) ctxParts.push(cast)

  if (editor.activeFilePath) {
    ctxParts.push(`Active file: ${editor.activeFilePath}`)
    const body = readWorkspaceText(editor.workspacePath, editor.activeFilePath, editor.selection)
    if (body) ctxParts.push(`Active file content:\n"""\n${body}\n"""`)
  }
  if (editor.selection) ctxParts.push(`Selection:\n"""\n${editor.selection.slice(0, 12000)}\n"""`)
  if (editor.mentionedPaths?.length) {
    ctxParts.push(`@mentions: ${editor.mentionedPaths.join(', ')}`)
    for (const rel of editor.mentionedPaths.slice(0, 8)) {
      const body = readWorkspaceText(editor.workspacePath, rel, null)
      if (body) ctxParts.push(`@${rel}:\n"""\n${body}\n"""`)
    }
  }
  if (session.planFileRel) {
    ctxParts.push(
      `Active plan file: ${session.planFileRel}`,
      'If executing work from a prior Plan mode, call read_file on that path first, then follow its todos. Soft: update_plan_step when completing steps.'
    )
  }
  if (ctxParts.length) msgs.push({ role: 'system', content: `Editor context:\n${ctxParts.join('\n')}` })
  if (turnSystemHint?.trim()) {
    msgs.push({ role: 'system', content: turnSystemHint.trim() })
  }

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

function commitProposal(
  win: BrowserWindow,
  session: ChatSession,
  p: FileProposalEx,
  assistantId: string,
  turnPaths: Set<string>,
  settings: ReturnType<typeof loadAiSettings>
): { autoApplied: boolean; gate: GateDecision; writeDisk: boolean } {
  p.messageId = assistantId
  // Decide BEFORE registering this path so multi-file means "other paths already in turn".
  const gate = decideAutoApply(p, turnPaths, settings)
  turnPaths.add(p.absPath.replace(/\//g, '\\').toLowerCase())
  const auto = gate.auto
  const isNewFile = !p.before
  let wroteDisk = false
  if (auto) {
    wroteDisk = shouldPersistAutoToDisk(p, settings)
    if (wroteDisk) applyProposalToDisk(p)
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
  send(win, 'ai:proposal', {
    sessionId: session.id,
    proposal: p,
    autoApplied: auto,
    writeDisk: wroteDisk,
    isNew: isNewFile,
    gateReason: gate.reason
  })
  return { autoApplied: auto, gate, writeDisk: wroteDisk }
}

export function abortAiForWebContents(wcId: number): void {
  const c = activeAborts.get(wcId)
  if (c) {
    c.abort()
    activeAborts.delete(wcId)
  }
}

export async function runAgentTurn(opts: {
  win: BrowserWindow
  sessionId: string
  userText: string
  editor: EditorContextPayload
  mode?: AgentToolMode
  /** Bind / refresh active plan file for InjectPath (e.g. Build button). */
  planFileRel?: string | null
  /** Hidden system nudge for this turn only (not shown as a user bubble). */
  turnSystemHint?: string
}): Promise<void> {
  const mode: AgentToolMode = opts.mode || loadAiSettings().agentMode || 'agent'
  const wcId = opts.win.webContents.id
  abortAiForWebContents(wcId)
  const ac = new AbortController()
  activeAborts.set(wcId, ac)

  const session = loadSession(opts.sessionId)
  if (!session) {
    send(opts.win, 'ai:error', { message: 'Session not found' })
    return
  }

  if (opts.planFileRel !== undefined && opts.planFileRel !== null) {
    session.planFileRel = opts.planFileRel
  }

  const settings = loadAiSettings()
  const used = estimateSessionTokens(session)
  if (used >= settings.contextWindow * 0.98) {
    send(opts.win, 'ai:error', {
      message:
        'Context window is nearly full. Create a new chat or delete older messages — history was not silently reset.'
    })
    activeAborts.delete(wcId)
    return
  }

  session.messages.push({
    id: randomUUID(),
    role: 'user',
    content: opts.userText,
    createdAt: Date.now()
  })
  if (session.title === 'New chat' && opts.userText.trim()) {
    session.title = opts.userText.trim().slice(0, 48)
  }
  saveSession(session)
  send(opts.win, 'ai:session', session)

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

      const assistantId = randomUUID()
      let content = ''
      const toolAcc = new Map<number, { id: string; name: string; arguments: string }>()
      send(opts.win, 'ai:assistant_start', { messageId: assistantId, sessionId: session.id })

      await new Promise<void>((resolve) => {
        void streamChatCompletion({
          messages: toApiMessagesWithTools(session, opts.editor, mode, opts.turnSystemHint),
          tools,
          signal: ac.signal,
          onEvent: (ev) => {
            if (ev.type === 'content') {
              content += ev.text
              send(opts.win, 'ai:chunk', {
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
              send(opts.win, 'ai:error', { message: ev.message, sessionId: session.id })
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
          id: v.id || randomUUID(),
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
        send(opts.win, 'ai:session', session)
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
        send(opts.win, 'ai:error', { message: 'Open a workspace folder to use agent tools.' })
        saveSession(session)
        break
      }

      for (const tc of toolCalls) {
        send(opts.win, 'ai:tool', { sessionId: session.id, name: tc.name, status: 'running' })
        const result = await runTool(tc.name, tc.arguments, {
          workspaceRoot,
          onProposal: (p) => {
            const r = commitProposal(
              opts.win,
              session,
              p as FileProposalEx,
              assistantId,
              turnPaths,
              loadAiSettings()
            )
            return {
              autoApplied: r.autoApplied,
              writeDisk: r.writeDisk,
              gate: {
                reason: r.gate.reason,
                kind: r.gate.kind,
                otherTurnPaths: r.gate.otherTurnPaths
              }
            }
          },
          onPlan: (stepsIn, planFileRel) => {
            session.plan = stepsIn
            if (planFileRel) session.planFileRel = planFileRel
            send(opts.win, 'ai:plan', {
              sessionId: session.id,
              plan: session.plan,
              planFileRel: session.planFileRel ?? null
            })
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
            send(opts.win, 'ai:plan', {
              sessionId: session.id,
              plan: session.plan,
              planFileRel: session.planFileRel ?? null
            })
          },
          onOpenFile: (relPath, line) => {
            send(opts.win, 'ai:workspaceOp', { op: 'openFile', path: relPath, line })
          },
          onWorkspaceFs: (payload) => {
            send(opts.win, 'ai:workspaceOp', payload)
          },
          getPlan: () => session.plan,
          getPlanFileRel: () => session.planFileRel,
          webSearchEnabled: settings.webSearchEnabled,
          webSearchProvider: settings.webSearchProvider,
          webSearchMaxResults: settings.webSearchMaxResults
        })
        session.messages.push({
          id: randomUUID(),
          role: 'tool',
          content: result,
          createdAt: Date.now(),
          toolName: tc.name,
          toolCallId: tc.id
        })
        send(opts.win, 'ai:tool', {
          sessionId: session.id,
          name: tc.name,
          status: 'done',
          resultPreview: result.slice(0, 400)
        })
      }

      saveSession(session)
      send(opts.win, 'ai:session', session)
    }
  } finally {
    activeAborts.delete(wcId)
    send(opts.win, 'ai:done', { sessionId: opts.sessionId })
    const latest = loadSession(opts.sessionId)
    if (latest) send(opts.win, 'ai:session', latest)
  }
}

export function applyProposal(sessionId: string, proposalId: string): FileProposal | null {
  const session = loadSession(sessionId)
  if (!session) return null
  const p = session.proposals.find((x) => x.id === proposalId)
  if (!p || p.status !== 'pending') return null
  const settings = loadAiSettings()
  const isNewFile = !p.before
  if (shouldPersistAutoToDisk(p, settings) || settings.applyWritesToDisk || isNewFile) {
    applyProposalToDisk(p)
  }
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

export function applyAllPending(sessionId: string): FileProposal[] {
  const session = loadSession(sessionId)
  if (!session) return []
  const settings = loadAiSettings()
  const applied: FileProposal[] = []
  for (const p of session.proposals) {
    if (p.status !== 'pending') continue
    const isNewFile = !p.before
    if (shouldPersistAutoToDisk(p, settings) || settings.applyWritesToDisk || isNewFile) {
      applyProposalToDisk(p)
    }
    p.status = 'applied'
    applied.push(p)
  }
  saveSession(session)
  return applied
}
