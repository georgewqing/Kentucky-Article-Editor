import { BrowserWindow } from 'electron'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import { randomUUID } from 'crypto'
import {
  loadSession,
  saveSession,
  estimateSessionTokens,
  type ChatMessage,
  type ChatSession,
  type FileProposal,
  type GitPendingOp,
  type PlanStep
} from './chatSessions'
import { loadAiSettings } from './aiSettings'
import {
  streamChatCompletion,
  type ChatCompletionMessage
} from './openaiCompatClient'
import { buildStoryStateL5Summary } from './literaryContinuity'
import {
  getWritingToolsForMode,
  runTool,
  LITERARY_SYSTEM_PROMPT,
  applyProposalToDisk,
  type AgentToolMode
} from './tools'
import { parseCharactersCsv } from './formats'
import {
  decideAutoApply,
  type FileProposalEx,
  type GateDecision
} from './proposalGate'
import { skillsCatalogText, loadSkill } from './skills'

const activeAborts = new Map<number, AbortController>()
const MAX_CTX_FILE_CHARS = 24000
const MAX_CHAR_SUMMARY_CHARS = 6000

export interface EditorContextPayload {
  workspacePath: string | null
  activeFilePath: string | null
  selection: string | null
  mentionedPaths: string[]
  /** Composer paperclip mounts; bodies CRITICAL-injected each turn (like skill chips). */
  attachedPaths?: string[]
}

function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

function pathKey(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function readAbsSafe(workspaceRoot: string | null, filePath: string): string | null {
  if (!workspaceRoot || !filePath) return null
  try {
    const cleaned = filePath.replace(/[/\\]+$/, '')
    const abs = isAbsolute(cleaned) ? cleaned : join(workspaceRoot, cleaned)
    const rootKey = pathKey(workspaceRoot)
    const absKey = pathKey(abs)
    if (absKey !== rootKey && !absKey.startsWith(rootKey + '\\')) return null
    if (!existsSync(abs)) return null
    return abs
  } catch {
    return null
  }
}

/** File body, or shallow directory listing for mounted folders. */
function readWorkspaceMention(workspaceRoot: string | null, filePath: string): string | null {
  const abs = readAbsSafe(workspaceRoot, filePath)
  if (!abs) return null
  try {
    const st = statSync(abs)
    if (st.isDirectory()) {
      const all = readdirSync(abs, { withFileTypes: true }).filter(
        (e) => e.name !== '.git' && e.name !== 'node_modules'
      )
      const entries = all.slice(0, 48)
      const lines = entries.map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`)
      const label = filePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
      const more = all.length > entries.length ? '\n…[truncated]' : ''
      return `Mounted directory ${label}\n${lines.join('\n')}${more}`
    }
  } catch {
    return null
  }
  return readWorkspaceText(workspaceRoot, filePath.replace(/[/\\]+$/, ''), null)
}

/** CRITICAL turn hint for composer paperclip mounts (parity with skill body injection). */
function buildMountedFilesHint(
  workspaceRoot: string | null,
  attachedPaths: string[]
): string | null {
  if (!attachedPaths.length) return null
  const blocks: string[] = [
    'CRITICAL: User mounted file(s) / folder(s) via the composer chip for this turn.',
    'These are primary attached workspace paths — treat them as the subject of the request.',
    'They are NOT skills. Skills are /id capsules whose SKILL.md body is injected separately.',
    'Do not ask the user to re-attach or claim you cannot see a mounted path if its body is below.',
    ''
  ]
  for (const rel of attachedPaths.slice(0, 8)) {
    const label = rel.replace(/\\/g, '/')
    const body = readWorkspaceMention(workspaceRoot, rel)
    blocks.push(`# Mounted: ${label}`)
    if (!body) {
      blocks.push(
        '(Could not read — missing, unreadable, or outside the workspace sandbox. Tell the user.)'
      )
    } else {
      blocks.push('"""')
      blocks.push(body)
      blocks.push('"""')
    }
    blocks.push('')
  }
  if (attachedPaths.length > 8) {
    blocks.push(`…and ${attachedPaths.length - 8} more mount(s) omitted from this injection.`)
  }
  return blocks.join('\n')
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

async function toApiMessagesWithTools(
  session: ChatSession,
  editor: EditorContextPayload,
  mode: AgentToolMode,
  turnSystemHint?: string
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

  const cast = buildCharacterSummary(editor.workspacePath)
  if (cast) ctxParts.push(cast)

  if (editor.workspacePath) {
    const storyL5 = buildStoryStateL5Summary(editor.workspacePath)
    if (storyL5) ctxParts.push(storyL5)
    try {
      const { buildGitL5Summary } = await import('../git/gitService')
      const gitL5 = await buildGitL5Summary(editor.workspacePath)
      if (gitL5) ctxParts.push(gitL5)
    } catch {
      /* git optional */
    }
  }

  if (editor.activeFilePath) {
    ctxParts.push(`Active file: ${editor.activeFilePath}`)
    const body = readWorkspaceText(editor.workspacePath, editor.activeFilePath, editor.selection)
    if (body) ctxParts.push(`Active file content:\n"""\n${body}\n"""`)
  }
  if (editor.selection) ctxParts.push(`Selection:\n"""\n${editor.selection.slice(0, 12000)}\n"""`)
  if (editor.mentionedPaths?.length) {
    const attachedKeys = new Set(
      (editor.attachedPaths || []).map((p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())
    )
    ctxParts.push(`@mentions: ${editor.mentionedPaths.join(', ')}`)
    for (const rel of editor.mentionedPaths.slice(0, 8)) {
      const key = rel.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      // Paperclip mounts are injected as CRITICAL turn hints — skip duplicate bodies here.
      if (attachedKeys.has(key)) continue
      const body = readWorkspaceMention(editor.workspacePath, rel)
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
  const gate = decideAutoApply(p, turnPaths, settings)
  turnPaths.add(p.absPath.replace(/\//g, '\\').toLowerCase())
  const isNewFile = !p.before
  // Always auto + always disk (architecture: Git working tree)
  applyProposalToDisk(p)
  p.status = 'applied'
  session.proposals.push(p)
  const owner = session.messages.find((m) => m.id === assistantId)
  if (owner) {
    owner.proposalIds = [...(owner.proposalIds || []), p.id]
  }
  saveSession(session)
  send(win, 'ai:proposal', {
    sessionId: session.id,
    proposal: p,
    autoApplied: true,
    writeDisk: true,
    isNew: isNewFile,
    gateReason: gate.reason
  })
  return { autoApplied: true, gate, writeDisk: true }
}

async function commitGitOp(
  win: BrowserWindow,
  session: ChatSession,
  assistantId: string,
  partial: Omit<GitPendingOp, 'status' | 'messageId' | 'resultNote' | 'error'> & {
    status?: 'pending'
  }
): Promise<GitPendingOp> {
  if (!session.gitOps) session.gitOps = []
  const op: GitPendingOp = {
    ...partial,
    status: 'pending',
    messageId: assistantId
  }
  const workspaceRoot = session.workspacePath
  if (!workspaceRoot) {
    op.status = 'rejected'
    op.error = 'No workspace'
  } else {
    const r = await executeGitPendingOp(workspaceRoot, op)
    if (r.ok) {
      op.status = 'applied'
      op.resultNote = r.note
      op.error = undefined
    } else {
      op.status = 'rejected'
      op.error = r.error || 'Git operation failed'
    }
  }
  session.gitOps.push(op)
  const owner = session.messages.find((m) => m.id === assistantId)
  if (owner) {
    owner.gitOpIds = [...(owner.gitOpIds || []), op.id]
  }
  saveSession(session)
  send(win, 'ai:gitOp', { sessionId: session.id, op, highlight: true })
  return op
}

async function executeGitPendingOp(
  workspaceRoot: string,
  op: GitPendingOp
): Promise<{ ok: boolean; note?: string; error?: string }> {
  const {
    gitAddAll,
    gitStage,
    gitCommit,
    gitRemoteAdd,
    gitRemoteRemove
  } = await import('../git/gitService')
  if (op.kind === 'add') {
    if (op.params.all) {
      const r = await gitAddAll(workspaceRoot)
      return r.ok
        ? { ok: true, note: 'Staged all changes (git add -A).' }
        : { ok: false, error: r.error }
    }
    const paths = op.params.paths || []
    const r = await gitStage(workspaceRoot, paths)
    return r.ok
      ? { ok: true, note: `Staged ${paths.length} path(s).` }
      : { ok: false, error: r.error }
  }
  if (op.kind === 'commit') {
    const message = (op.params.message || '').trim()
    const r = await gitCommit(workspaceRoot, message)
    return r.ok
      ? { ok: true, note: (r.stdout || 'Committed.').trim() }
      : { ok: false, error: r.error }
  }
  if (op.kind === 'remote_add') {
    const remote = (op.params.remote || '').trim()
    const url = (op.params.url || '').trim()
    const r = await gitRemoteAdd(workspaceRoot, remote, url)
    if (!r.ok) return { ok: false, error: r.error }
    const bits = [`Added remote "${remote}".`]
    if (r.bareCreated && r.barePath) {
      bits.push(`Created local bare repo at ${r.barePath}.`)
    }
    return { ok: true, note: bits.join(' ') }
  }
  if (op.kind === 'remote_remove') {
    const remote = (op.params.remote || '').trim()
    const r = await gitRemoteRemove(workspaceRoot, remote)
    return r.ok
      ? { ok: true, note: `Removed remote "${remote}".` }
      : { ok: false, error: r.error }
  }
  return { ok: false, error: `Unknown git op kind: ${(op as GitPendingOp).kind}` }
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
  /** Composer skill chip id (persisted on the user message). */
  skillId?: string
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

  const attachedPaths = Array.from(
    new Set(
      (opts.editor.attachedPaths || [])
        .map((p) => p.replace(/\\/g, '/').trim())
        .filter(Boolean)
    )
  )
  const skillId =
    typeof opts.skillId === 'string' && /^[A-Za-z0-9._-]+$/.test(opts.skillId.trim())
      ? opts.skillId.trim()
      : undefined
  session.messages.push({
    id: randomUUID(),
    role: 'user',
    content: opts.userText,
    createdAt: Date.now(),
    ...(attachedPaths.length ? { attachedPaths } : {}),
    ...(skillId ? { skillId } : {})
  })
  if (session.title === 'New chat') {
    const titleSrc = skillId
      ? `/${skillId}${opts.userText.trim() ? ` ${opts.userText.trim()}` : ''}`
      : opts.userText.trim()
    if (titleSrc) session.title = titleSrc.slice(0, 48)
  }
  saveSession(session)
  send(opts.win, 'ai:session', session)

  let turnHint = opts.turnSystemHint?.trim() || ''
  if (skillId) {
    const loaded = loadSkill(skillId)
    if ('error' in loaded) {
      turnHint = [
        `CRITICAL: User mounted skill /${skillId}, but it could not be loaded (${loaded.error}).`,
        'Tell the user the skill failed to load; do not invent its instructions.',
        turnHint
      ]
        .filter(Boolean)
        .join('\n')
    } else {
      turnHint = [
        `CRITICAL: User mounted skill /${skillId} via the composer chip.`,
        'Follow the skill instructions below for this entire turn.',
        'Plain "/…" text inside the user message is literal text, not a slash command.',
        `You may still call read_skill("${skillId}") if you need extraFiles.`,
        '',
        `# Skill /${skillId} (${loaded.name})`,
        loaded.description ? `Description: ${loaded.description}` : '',
        '',
        loaded.body
      ]
        .filter((line) => line !== '')
        .join('\n')
      if (opts.turnSystemHint?.trim()) {
        turnHint += `\n\n${opts.turnSystemHint.trim()}`
      }
    }
  }

  const mountHint = buildMountedFilesHint(opts.editor.workspacePath, attachedPaths)
  if (mountHint) {
    turnHint = turnHint ? `${mountHint}\n\n${turnHint}` : mountHint
  }

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
        void (async () => {
          const messages = await toApiMessagesWithTools(
            session,
            opts.editor,
            mode,
            turnHint || undefined
          )
          await streamChatCompletion({
            messages,
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
        })().catch((err) => {
          send(opts.win, 'ai:error', {
            message: err instanceof Error ? err.message : String(err),
            sessionId: session.id
          })
          resolve()
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
          onGitOp: (partial) => commitGitOp(opts.win, session, assistantId, partial),
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
  applyProposalToDisk(p)
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

/** @deprecated Confirm gate removed — ops auto-run. Kept for old IPC clients. */
export async function confirmGitOp(
  sessionId: string,
  opId: string
): Promise<GitPendingOp | null> {
  const session = loadSession(sessionId)
  if (!session) return null
  const op = (session.gitOps || []).find((x) => x.id === opId)
  if (!op || op.status !== 'pending') return null
  const workspaceRoot = session.workspacePath
  if (!workspaceRoot) {
    op.status = 'rejected'
    op.error = 'No workspace'
    saveSession(session)
    return op
  }
  const r = await executeGitPendingOp(workspaceRoot, op)
  if (r.ok) {
    op.status = 'applied'
    op.resultNote = r.note
    op.error = undefined
  } else {
    op.error = r.error || 'Git operation failed'
  }
  saveSession(session)
  return op
}

/** @deprecated Confirm gate removed. */
export function rejectGitOp(sessionId: string, opId: string): GitPendingOp | null {
  const session = loadSession(sessionId)
  if (!session) return null
  const op = (session.gitOps || []).find((x) => x.id === opId)
  if (!op || op.status !== 'pending') return null
  op.status = 'rejected'
  op.resultNote = 'Rejected by user'
  saveSession(session)
  return op
}

export function applyAllPending(sessionId: string): FileProposal[] {
  const session = loadSession(sessionId)
  if (!session) return []
  const applied: FileProposal[] = []
  for (const p of session.proposals) {
    if (p.status !== 'pending') continue
    applyProposalToDisk(p)
    p.status = 'applied'
    applied.push(p)
  }
  saveSession(session)
  return applied
}
