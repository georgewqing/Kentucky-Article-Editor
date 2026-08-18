import { BrowserWindow } from 'electron'
import { getWindowMeta } from '../windowRegistry'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { randomUUID } from 'crypto'
import {
  loadSession,
  saveSession,
  estimateSessionTokens,
  rewindToUserTurn,
  type ChatMessage,
  type ChatSession,
  type FileProposal,
  type GitPendingOp,
  type PlanStep
} from './chatSessions'
import { loadAiSettings } from './aiSettings'
import { REVISIONS_DIR } from './revisions'
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
  resolveWorkspacePath,
  type AgentToolMode
} from './tools'
import { assertInsideWorkspace, isDialogReadAllowed } from './workspacePath'
import { docApplyRewindWrite, docEvict } from '../documentHub'
import { collectFileRestoresAfterUser, type RewindFileRestore } from '../../shared/rewindFiles'
import { parseCharactersCsv } from './formats'
import {
  decideAutoApply,
  type FileProposalEx,
  type GateDecision
} from './proposalGate'
import { skillsCatalogText, cavemanSystemBlock, loadSkill } from './skills'
import { buildDesignL5Summary, workspaceHasDesignTree } from './designGddL5'
import { looksLikeToolDump, sanitizeAskAssistantContent } from './askGuard'

type ActiveRun = { ac: AbortController; runId: string }
const activeRuns = new Map<number, ActiveRun>()
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

/** Keep sandbox-refusal JSON intact so the refused path is not cut at 400 chars. */
function toolResultPreview(result: string): string {
  try {
    const o = JSON.parse(result) as { error?: unknown }
    if (typeof o.error === 'string' && o.error.startsWith('Path escapes workspace')) {
      return result
    }
  } catch {
    /* not JSON */
  }
  return result.length <= 400 ? result : result.slice(0, 400)
}

function readAbsSafe(workspaceRoot: string | null, filePath: string): string | null {
  if (!filePath) return null
  const raw = filePath.replace(/[/\\]+$/, '')
  if (workspaceRoot) {
    try {
      const abs = resolveWorkspacePath(workspaceRoot, raw)
      if (existsSync(abs)) return abs
    } catch {
      /* dialog allowlist */
    }
  }
  try {
    const abs = resolve(raw)
    if (isDialogReadAllowed(abs) && existsSync(abs)) return abs
  } catch {
    /* ignore */
  }
  return null
}

/** File body, or shallow directory listing for mounted folders. */
function readWorkspaceMention(workspaceRoot: string | null, filePath: string): string | null {
  const abs = readAbsSafe(workspaceRoot, filePath)
  if (!abs) return null
  try {
    const st = statSync(abs)
    if (st.isDirectory()) {
      const listingRoot = Boolean(
        workspaceRoot && resolve(abs) === resolve(workspaceRoot)
      )
      const all = readdirSync(abs, { withFileTypes: true }).filter((e) => {
        if (e.name === '.git' || e.name === 'node_modules') return false
        if (listingRoot && e.isDirectory() && e.name === REVISIONS_DIR) return false
        return true
      })
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

/**
 * Expand a user bubble for the model API: bind composer chips to deixis
 * (这个/该/this folder…) so mounts are not ignored in favor of workspace L5.
 * UI still shows the original short content + chips.
 */
function expandUserMountsForApi(m: ChatMessage, workspaceRoot: string | null): string {
  const paths = (m.attachedPaths || [])
    .map((p) => p.replace(/\\/g, '/').trim())
    .filter(Boolean)
  if (!paths.length) return m.content

  const lines: string[] = [
    '[Composer mounts for this message — these ARE the referent of 这个/那个/该文件/该文件夹/这目录/this/that/it file/folder/path in the user text. Answer about THESE paths. Do not inventory the whole workspace unless the user explicitly asks.]',
    ''
  ]
  for (const rel of paths.slice(0, 8)) {
    const body = readWorkspaceMention(workspaceRoot, rel)
    lines.push(`# Mounted: ${rel}`)
    if (!body) {
      lines.push(
        '(Could not read — missing, unreadable, or outside the workspace sandbox. Tell the user.)'
      )
    } else {
      lines.push('"""')
      lines.push(body)
      lines.push('"""')
    }
    lines.push('')
  }
  if (paths.length > 8) {
    lines.push(`…and ${paths.length - 8} more mount(s) omitted.`)
    lines.push('')
  }
  lines.push('---')
  lines.push('User message:')
  lines.push(m.content?.trim() ? m.content : '(no text — answer about the mounts above)')
  return lines.join('\n')
}

function ensureUserApiContent(m: ChatMessage, workspaceRoot: string | null): string {
  if (typeof m.apiContent === 'string') return m.apiContent
  const expanded = expandUserMountsForApi(m, workspaceRoot)
  m.apiContent = expanded
  return expanded
}

const EDITOR_CTX_SEP = '\n\n---\nEditor context:\n'
const TURN_HINT_SEP = '\n\n---\nTurn instructions:\n'

async function buildEditorContextText(
  editor: EditorContextPayload,
  session: ChatSession,
  mode: AgentToolMode
): Promise<string> {
  const ctxParts: string[] = []
  const attachedNorm = (editor.attachedPaths || [])
    .map((p) => p.replace(/\\/g, '/').trim())
    .filter(Boolean)
  const attachedKeys = new Set(attachedNorm.map((p) => p.replace(/\/+$/, '').toLowerCase()))
  // Mounts first — otherwise L5 / active-file dumps drown the subject.
  if (attachedNorm.length) {
    ctxParts.push(
      `PRIMARY SUBJECT (composer mounts this turn): ${attachedNorm.join(', ')}`,
      'Deixis (这个/该文件夹/this folder…) refers to these mounts, not the workspace root or the active tab.'
    )
  }
  if (editor.workspacePath) ctxParts.push(`Workspace: ${editor.workspacePath}`)

  const cast = buildCharacterSummary(editor.workspacePath)
  if (cast) ctxParts.push(cast)

  if (editor.workspacePath) {
    const storyL5 = buildStoryStateL5Summary(editor.workspacePath)
    if (storyL5) ctxParts.push(storyL5)
    const designL5 = buildDesignL5Summary(editor.workspacePath)
    if (designL5) ctxParts.push(designL5)
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
    if (!attachedNorm.length) {
      const body = readWorkspaceText(editor.workspacePath, editor.activeFilePath, editor.selection)
      if (body) ctxParts.push(`Active file content:\n"""\n${body}\n"""`)
    } else {
      ctxParts.push(
        mode === 'ask'
          ? '(Active file body omitted this turn — composer mounts are the primary subject.)'
          : '(Active file body omitted this turn — composer mounts are the primary subject. Use read_file if you still need the open tab.)'
      )
    }
  }
  if (editor.selection) ctxParts.push(`Selection:\n"""\n${editor.selection.slice(0, 12000)}\n"""`)
  if (editor.mentionedPaths?.length) {
    const mentionOnly = editor.mentionedPaths.filter((rel) => {
      const key = rel.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      return !attachedKeys.has(key)
    })
    if (mentionOnly.length) {
      ctxParts.push(`@mentions: ${mentionOnly.join(', ')}`)
      for (const rel of mentionOnly.slice(0, 8)) {
        const body = readWorkspaceMention(editor.workspacePath, rel)
        if (body) ctxParts.push(`@${rel}:\n"""\n${body}\n"""`)
      }
    }
  }
  if (session.planFileRel) {
    ctxParts.push(`Active plan file: ${session.planFileRel}`)
    if (mode !== 'ask') {
      ctxParts.push(
        'If executing work from a prior Plan mode, call read_file on that path first, then follow its todos. Soft: update_plan_step when completing steps.'
      )
    }
  }
  return ctxParts.join('\n')
}

/** CRITICAL turn hint for composer paperclip mounts (parity with skill body injection). */
function buildMountedFilesHint(
  workspaceRoot: string | null,
  attachedPaths: string[]
): string | null {
  if (!attachedPaths.length) return null
  const labels = attachedPaths.slice(0, 8).map((p) => p.replace(/\\/g, '/'))
  const blocks: string[] = [
    'CRITICAL: User mounted file(s) / folder(s) via the composer chip for this turn.',
    `Primary subject path(s): ${labels.join(', ')}`,
    'Deixis rule: 这个/那个/该文件/该文件夹/这目录/this/that/it → the mount(s) above, NOT the open tab, NOT a workspace survey.',
    'If the user asks what is in a mounted folder, list that folder’s entries (already injected below and in the user message). Do not list the whole workspace root.',
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

function flattenToolHistoryText(
  m: ChatMessage & {
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
  }
): string {
  if (m.role === 'tool') {
    const name = m.toolName || 'tool'
    const body = (m.content || '').slice(0, 4000)
    return `[Prior ${name} result]\n${body}`
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    const names = m.toolCalls.map((t) => t.name).join(', ')
    return (m.content || '').trim() || `(called ${names})`
  }
  return m.content
}

function toApiMessagesWithTools(
  session: ChatSession,
  editor: EditorContextPayload,
  mode: AgentToolMode,
  pack: {
    editorContextText: string
    turnHint?: string
    userTurnId: string
    flattenToolHistory: boolean
  }
): ChatCompletionMessage[] {
  const settings = loadAiSettings()
  const msgs: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: LITERARY_SYSTEM_PROMPT(settings.styleMemo, mode, {
        skillsCatalog: skillsCatalogText(),
        webSearchEnabled: settings.webSearchEnabled,
        designDiscipline: workspaceHasDesignTree(editor.workspacePath),
        cavemanBody: cavemanSystemBlock()
      })
    }
  ]

  for (const m of session.messages) {
    const extra = m as ChatMessage & {
      toolCalls?: Array<{ id: string; name: string; arguments: string }>
    }
    if (pack.flattenToolHistory && (m.role === 'tool' || extra.toolCalls?.length)) {
      msgs.push({ role: 'assistant', content: flattenToolHistoryText(extra) })
    } else if (m.role === 'assistant' && extra.toolCalls?.length) {
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
    } else if (m.role === 'user') {
      let content: string
      if (m.id === pack.userTurnId) {
        if (typeof m.apiContent === 'string') {
          content = m.apiContent
        } else {
          content = expandUserMountsForApi(m, editor.workspacePath)
          if (pack.editorContextText.trim()) {
            content += `${EDITOR_CTX_SEP}${pack.editorContextText.trim()}`
          }
          if (pack.turnHint?.trim()) {
            content += `${TURN_HINT_SEP}${pack.turnHint.trim()}`
          }
          m.apiContent = content
        }
      } else {
        content = ensureUserApiContent(m, editor.workspacePath)
      }
      msgs.push({ role: 'user', content })
    } else if (m.role === 'system' || m.role === 'assistant') {
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
  p.status = 'applied'
  const gate = decideAutoApply(p, turnPaths, settings)
  turnPaths.add(p.absPath.replace(/\//g, '\\').toLowerCase())
  const isNewFile = !p.before
  // Always auto + always disk (architecture: Git working tree)
  applyProposalToDisk(p, session.workspacePath || undefined)
  if (!session.proposals) session.proposals = []
  const existing = session.proposals.findIndex((x) => x.id === p.id)
  if (existing >= 0) session.proposals[existing] = p
  else session.proposals.push(p)
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
  activeRuns.get(wcId)?.ac.abort()
}

function isCurrentRun(wcId: number, runId: string): boolean {
  return activeRuns.get(wcId)?.runId === runId
}

function beginRun(wcId: number, runId?: string): ActiveRun {
  abortAiForWebContents(wcId)
  const run: ActiveRun = { ac: new AbortController(), runId: runId || randomUUID() }
  activeRuns.set(wcId, run)
  return run
}

function endRun(wcId: number, runId: string): boolean {
  if (!isCurrentRun(wcId, runId)) return false
  activeRuns.delete(wcId)
  return true
}

function closeIncompleteToolRound(session: ChatSession): void {
  type Asst = ChatMessage & { toolCalls?: Array<{ id: string; name: string; arguments: string }> }
  const lastAsst = [...session.messages].reverse().find((m) => m.role === 'assistant') as
    | Asst
    | undefined
  if (!lastAsst?.toolCalls?.length) return
  const have = new Set(
    session.messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => m.toolCallId)
  )
  for (const tc of lastAsst.toolCalls) {
    if (have.has(tc.id)) continue
    session.messages.push({
      id: randomUUID(),
      role: 'tool',
      content: JSON.stringify({ error: 'Aborted by user' }),
      createdAt: Date.now(),
      toolName: tc.name,
      toolCallId: tc.id
    })
  }
}

function applyRewindFileRestores(
  restores: RewindFileRestore[],
  workspaceRoot: string | null,
  emit: (channel: string, payload: unknown) => void
): void {
  for (const r of restores) {
    try {
      if (workspaceRoot) assertInsideWorkspace(workspaceRoot, r.absPath)
      if (r.isNew) {
        if (existsSync(r.absPath)) unlinkSync(r.absPath)
        docEvict(r.absPath)
        emit('ai:workspaceOp', {
          op: 'fsDeleted',
          path: r.path.replace(/\\/g, '/'),
          absPath: r.absPath
        })
      } else {
        const dir = dirname(r.absPath)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(r.absPath, r.before, 'utf-8')
        docApplyRewindWrite(r.absPath, r.before)
      }
    } catch {
      /* keep restoring the rest */
    }
  }
  if (restores.length) emit('ai:workspaceOp', { op: 'refreshTree' })
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
  /** Rewrite this last user bubble and drop everything after it (Cursor edit). */
  replaceUserMessageId?: string
  /** Renderer generation id so in-flight IPC from a replaced turn is ignored. */
  runId?: string
}): Promise<void> {
  const mode: AgentToolMode =
    opts.mode === 'ask' || opts.mode === 'plan' || opts.mode === 'outline' || opts.mode === 'agent'
      ? opts.mode
      : loadAiSettings().agentMode || 'agent'
  const wcId = opts.win.webContents.id
  const { ac, runId } = beginRun(wcId, opts.runId)
  const alive = (): boolean => isCurrentRun(wcId, runId)
  const emit = (channel: string, payload: unknown): void => {
    if (!alive()) return
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      send(opts.win, channel, { ...(payload as Record<string, unknown>), runId })
      return
    }
    send(opts.win, channel, { runId, payload })
  }

  const session = loadSession(opts.sessionId)
  if (!session) {
    endRun(wcId, runId)
    send(opts.win, 'ai:error', { message: 'Session not found', runId })
    send(opts.win, 'ai:done', { sessionId: opts.sessionId, runId })
    return
  }
  const persist = (): boolean => {
    if (!alive()) return false
    saveSession(session)
    return true
  }
  const emitSession = (): void => {
    if (!alive()) return
    send(opts.win, 'ai:session', { session, runId })
  }

  const winRoot = getWindowMeta(opts.win)?.workspacePath
  if (winRoot) {
    opts.editor.workspacePath = winRoot
    session.workspacePath = winRoot
  }

  if (opts.planFileRel !== undefined && opts.planFileRel !== null) {
    session.planFileRel = opts.planFileRel
  }

  const attachedPaths = Array.from(
    new Set(
      (opts.editor.attachedPaths || [])
        .map((p) => p.replace(/\\/g, '/').trim())
        .filter(Boolean)
    )
  )
  const requestedSkill =
    typeof opts.skillId === 'string' && /^[A-Za-z0-9._-]+$/.test(opts.skillId.trim())
      ? opts.skillId.trim()
      : undefined

  let userTurnId: string
  let skillId: string | undefined
  if (opts.replaceUserMessageId) {
    const restores = collectFileRestoresAfterUser(
      session.messages,
      session.proposals || [],
      opts.replaceUserMessageId
    )
    if (!rewindToUserTurn(session, opts.replaceUserMessageId, opts.userText)) {
      endRun(wcId, runId)
      send(opts.win, 'ai:error', {
        message: 'Only the latest question can be edited.',
        runId,
        sessionId: opts.sessionId
      })
      send(opts.win, 'ai:done', { sessionId: opts.sessionId, runId })
      return
    }
    applyRewindFileRestores(restores, session.workspacePath, emit)
    userTurnId = opts.replaceUserMessageId
    const user = session.messages.find((m) => m.id === userTurnId)
    if (user && attachedPaths.length) user.attachedPaths = attachedPaths
    const kept = user?.skillId
    skillId =
      typeof kept === 'string' && /^[A-Za-z0-9._-]+$/.test(kept) ? kept : requestedSkill
    const firstUser = session.messages.find((m) => m.role === 'user')
    if (firstUser?.id === userTurnId) {
      const titleSrc = skillId
        ? `/${skillId}${opts.userText.trim() ? ` ${opts.userText.trim()}` : ''}`
        : opts.userText.trim()
      if (titleSrc) session.title = titleSrc.slice(0, 48)
    }
  } else {
    skillId = requestedSkill
    userTurnId = randomUUID()
    session.messages.push({
      id: userTurnId,
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
  }

  const settings = loadAiSettings()
  const used = estimateSessionTokens(session)
  if (used >= settings.contextWindow * 0.98) {
    send(opts.win, 'ai:error', {
      message:
        'Context window is nearly full. Create a new chat or delete older messages — history was not silently reset.',
      runId,
      sessionId: opts.sessionId
    })
    send(opts.win, 'ai:done', { sessionId: opts.sessionId, runId })
    endRun(wcId, runId)
    return
  }

  persist()
  emitSession()

  let turnHint = opts.turnSystemHint?.trim() || ''
  if (skillId) {
    const loaded = loadSkill(skillId, ['examples.md', 'reference.md'])
    if ('error' in loaded) {
      turnHint = [
        `CRITICAL: User mounted skill /${skillId}, but it could not be loaded (${loaded.error}).`,
        'Tell the user the skill failed to load; do not invent its instructions.',
        turnHint
      ]
        .filter(Boolean)
        .join('\n')
    } else {
      const extraBlocks = Object.entries(loaded.extraFiles || {}).map(
        ([name, text]) => `## ${name}\n${text}`
      )
      turnHint = [
        `CRITICAL: User mounted skill /${skillId} via the composer chip.`,
        'Follow the skill instructions below for this entire turn.',
        'Plain "/…" text inside the user message is literal text, not a slash command.',
        extraBlocks.length
          ? 'examples.md / reference.md are included below when present.'
          : mode === 'ask'
            ? 'Ask cannot call read_skill; use only the skill text below.'
            : `You may still call read_skill("${skillId}") if you need extraFiles.`,
        '',
        `# Skill /${skillId} (${loaded.name})`,
        loaded.description ? `Description: ${loaded.description}` : '',
        '',
        loaded.body,
        extraBlocks.length ? extraBlocks.join('\n\n') : ''
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
  const toolsAllowed = Boolean(tools && tools.length > 0)

  for (const m of session.messages) {
    if (m.role === 'user' && m.id !== userTurnId) ensureUserApiContent(m, workspaceRoot)
  }
  const editorContextText = await buildEditorContextText(opts.editor, session, mode)
  persist()

  try {
    while (steps < maxSteps) {
      steps += 1
      if (ac.signal.aborted || !alive()) break

      const assistantId = randomUUID()
      let content = ''
      const toolAcc = new Map<number, { id: string; name: string; arguments: string }>()
      emit('ai:assistant_start', { messageId: assistantId, sessionId: session.id })

      await new Promise<void>((resolve) => {
        void (async () => {
          const messages = toApiMessagesWithTools(session, opts.editor, mode, {
            editorContextText,
            turnHint: turnHint || undefined,
            userTurnId,
            flattenToolHistory: !toolsAllowed
          })
          if (steps === 1) persist()
          await streamChatCompletion({
            messages,
            tools,
            signal: ac.signal,
            onEvent: (ev) => {
              if (ev.type === 'content') {
                content += ev.text
                if (mode === 'ask' && looksLikeToolDump(content)) {
                  return
                }
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
        })().catch((err) => {
          emit('ai:error', {
            message: err instanceof Error ? err.message : String(err),
            sessionId: session.id
          })
          resolve()
        })
      })

      if (ac.signal.aborted || !alive()) {
        if (alive()) {
          const trimmed = content.trim()
          if (trimmed) {
            session.messages.push({
              id: assistantId,
              role: 'assistant',
              content: mode === 'ask' ? sanitizeAskAssistantContent(content) : content,
              createdAt: Date.now(),
              aborted: true
            })
          }
          closeIncompleteToolRound(session)
          persist()
          emitSession()
        }
        break
      }

      const toolCalls = Array.from(toolAcc.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({
          id: v.id || randomUUID(),
          name: v.name,
          arguments: v.arguments
        }))
        .filter((t) => t.name)

      if (toolCalls.length === 0 || !toolsAllowed) {
        if (mode === 'ask') {
          content = sanitizeAskAssistantContent(content)
        }
        session.messages.push({
          id: assistantId,
          role: 'assistant',
          content: content || '(empty)',
          createdAt: Date.now()
        })
        persist()
        emitSession()
        break
      }

      const assistantMsg: ChatMessage & {
        toolCalls?: Array<{ id: string; name: string; arguments: string }>
      } = {
        id: assistantId,
        role: 'assistant',
        content: content || '',
        createdAt: Date.now(),
        toolCalls
      }
      session.messages.push(assistantMsg)

      if (!workspaceRoot) {
        emit('ai:error', { message: 'Open a workspace folder to use agent tools.' })
        persist()
        break
      }

      for (const tc of toolCalls) {
        if (ac.signal.aborted || !alive()) break
        emit('ai:tool', { sessionId: session.id, name: tc.name, status: 'running' })
        const result = await runTool(tc.name, tc.arguments, {
          workspaceRoot,
          onProposal: (p) => {
            if (!alive() || ac.signal.aborted) {
              return {
                autoApplied: false,
                writeDisk: false,
                gate: { reason: 'aborted', kind: 'other', otherTurnPaths: 0 }
              }
            }
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
          onGitOp: async (partial) => {
            if (!alive() || ac.signal.aborted) {
              return {
                ...partial,
                status: 'rejected' as const,
                error: 'Aborted',
                messageId: assistantId
              }
            }
            return commitGitOp(opts.win, session, assistantId, partial)
          },
          onPlan: (stepsIn, planFileRel) => {
            if (!alive() || ac.signal.aborted) return
            session.plan = stepsIn
            if (planFileRel) session.planFileRel = planFileRel
            emit('ai:plan', {
              sessionId: session.id,
              plan: session.plan,
              planFileRel: session.planFileRel ?? null
            })
          },
          onPlanUpdate: (patch) => {
            if (!alive() || ac.signal.aborted) return
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
            emit('ai:plan', {
              sessionId: session.id,
              plan: session.plan,
              planFileRel: session.planFileRel ?? null
            })
          },
          onOpenFile: (relPath, line) => {
            if (!alive()) return
            emit('ai:workspaceOp', { op: 'openFile', path: relPath, line })
          },
          onWorkspaceFs: (payload) => {
            if (!alive()) return
            emit('ai:workspaceOp', payload)
          },
          getPlan: () => session.plan,
          getPlanFileRel: () => session.planFileRel,
          webSearchEnabled: settings.webSearchEnabled,
          webSearchProvider: settings.webSearchProvider,
          webSearchMaxResults: settings.webSearchMaxResults
        })
        if (!alive()) break
        session.messages.push({
          id: randomUUID(),
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
          resultPreview: toolResultPreview(result)
        })
      }

      if (ac.signal.aborted || !alive()) {
        if (alive()) {
          closeIncompleteToolRound(session)
          persist()
          emitSession()
        }
        break
      }

      persist()
      emitSession()
    }
  } finally {
    if (endRun(wcId, runId)) {
      send(opts.win, 'ai:done', { sessionId: opts.sessionId, runId })
      const latest = loadSession(opts.sessionId)
      if (latest) send(opts.win, 'ai:session', { session: latest, runId })
    }
  }
}

export function applyProposal(sessionId: string, proposalId: string): FileProposal | null {
  const session = loadSession(sessionId)
  if (!session) return null
  const p = session.proposals.find((x) => x.id === proposalId)
  if (!p || p.status !== 'pending') return null
  applyProposalToDisk(p, session.workspacePath || undefined)
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
    applyProposalToDisk(p, session.workspacePath || undefined)
    p.status = 'applied'
    applied.push(p)
  }
  saveSession(session)
  return applied
}
