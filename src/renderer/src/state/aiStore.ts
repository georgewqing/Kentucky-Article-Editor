import { create } from 'zustand'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { askConfirm } from '@/state/confirmDialogStore'
import { collectFileRestoresAfterUser } from '@shared/rewindFiles'
import type { AskUserAnswer, AskUserCard, AskUserQuestion, CiteCard, PendingAskSnapshot } from '@shared/agentAsk'
import i18n from '@/i18n'

export type AgentMode = 'ask' | 'plan' | 'outline' | 'agent'

export type ThinkingLevel = 'high' | 'mid' | 'low'

export interface AiSettingsView {
  baseUrl: string
  model: string
  contextWindow: number
  thinkingLevel: ThinkingLevel
  agentEnabled: boolean
  applyWritesToDisk: boolean
  forceReviewAllWrites: boolean
  temperature: number
  styleMemo: string
  panelWidth: number
  panelVisible: boolean
  agentMode: AgentMode
  activeProfileId: string
  hasApiKey: boolean
  webSearchEnabled: boolean
  webSearchProvider: 'duckduckgo' | 'bing' | 'brave' | 'tavily'
  webSearchMaxResults: number
  enabledSkillIds: string[] | null
  maxRevisionSnaps: number
}

export interface AiContextBucket {
  id: string
  tokens: number
}

export interface AiSkillView {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface AiProfileView {
  id: string
  label: string
  baseUrl: string
  model: string
  contextWindow: number
  thinkingLevel: ThinkingLevel
  hasKey: boolean
}

export interface AiChatMessage {
  id: string
  role: string
  content: string
  createdAt: number
  toolName?: string
  proposalIds?: string[]
  error?: string
  attachedPaths?: string[]
  attachmentPreviews?: Array<{ path: string; lines: string[] }>
  /** Slash skill invoked for this user turn. */
  skillId?: string
  /** Assistant turn was stopped before it finished. */
  aborted?: boolean
}

export interface AiProposal {
  id: string
  path: string
  absPath: string
  before: string
  after: string
  summary: string
  status: 'pending' | 'applied' | 'rejected'
  messageId?: string
}

export type AiGitPendingKind = 'add' | 'commit' | 'remote_add' | 'remote_remove'

export interface AiGitOp {
  id: string
  kind: AiGitPendingKind
  summary: string
  detail: string
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

export interface AiPlanStep {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface AiSession {
  id: string
  title: string
  workspacePath: string | null
  updatedAt: number
  messages: AiChatMessage[]
  plan: AiPlanStep[]
  planFileRel?: string | null
  proposals: AiProposal[]
  gitOps?: AiGitOp[]
  askCards?: AskUserCard[]
  citeCards?: CiteCard[]
  pendingAsk?: PendingAskSnapshot
}

interface AiState {
  settings: AiSettingsView | null
  panelVisible: boolean
  panelWidth: number
  sessions: Array<Pick<AiSession, 'id' | 'title' | 'workspacePath' | 'updatedAt'>>
  session: AiSession | null
  streaming: boolean
  streamBuffer: string
  streamMessageId: string | null
  /** Matches main-process runId so stale IPC from a replaced turn is ignored. */
  agentRunId: string | null
  /** UI phase while a turn is in flight (avoid looking frozen). */
  agentPhase: 'idle' | 'thinking' | 'streaming' | 'tool'
  agentToolName: string | null
  error: string | null
  pendingAsk: {
    sessionId: string
    askId: string
    messageId: string
    title?: string
    questions: AskUserQuestion[]
  } | null
  contextUsed: number
  contextLimit: number
  contextBuckets: AiContextBucket[]
  showHistory: boolean
  draft: string
  agentMode: AgentMode
  profiles: AiProfileView[]
  composerAttachments: string[]
  /** Slash-selected skill shown as a composer chip (not plain `/id` text). */
  composerSkillId: string | null
  hydrate: () => Promise<void>
  /** Rebind panel prefs + chat list when workspace opens/closes/switches. */
  onWorkspaceChanged: (workspacePath: string | null) => Promise<void>
  setPanelVisible: (v: boolean) => void
  togglePanel: () => void
  setPanelWidth: (w: number) => void
  setDraft: (t: string) => void
  setShowHistory: (v: boolean) => void
  setAgentMode: (mode: AgentMode) => void
  refreshProfiles: () => Promise<void>
  setActiveProfile: (id: string) => Promise<void>
  upsertProfile: (partial: Partial<AiProfileView> & { id?: string }) => Promise<AiProfileView | null>
  deleteProfile: (id: string) => Promise<boolean>
  setProfileKey: (id: string, key: string) => Promise<void>
  addComposerAttachment: (relPath: string) => void
  removeComposerAttachment: (relPath: string) => void
  clearComposerAttachments: () => void
  setComposerSkillId: (id: string | null) => void
  pickComposerAttachments: () => Promise<void>
  refreshSessions: () => Promise<void>
  newChat: () => Promise<void>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  saveSettings: (partial: Partial<AiSettingsView>) => Promise<void>
  setApiKey: (key: string) => Promise<void>
  clearApiKey: () => Promise<void>
  listSkills: () => Promise<AiSkillView[]>
  setSkillEnabled: (id: string, enabled: boolean) => Promise<AiSkillView[]>
  revealSkillsDir: () => Promise<void>
  importSkillFolder: () => Promise<{ ok: boolean; id?: string; error?: string }>
  send: (text?: string, opts?: { turnSystemHint?: string; replaceUserMessageId?: string }) => Promise<boolean>
  /** Switch to Agent, bind plan file, open AI panel, and start executing the plan. */
  executePlanFile: (absPath: string) => Promise<void>
  abort: () => Promise<void>
  answerPendingAsk: (answers: AskUserAnswer[]) => Promise<void>
  retryLast: () => Promise<void>
  applyProposal: (id: string) => Promise<void>
  rejectProposal: (id: string) => Promise<void>
  applyAll: (messageId?: string) => Promise<void>
  rejectAll: (messageId?: string) => Promise<void>
  syncAppliedFile: (p: AiProposal, writeDisk: boolean, isNew?: boolean) => Promise<void>
  bindEvents: () => () => void
  refreshContextUsage: () => Promise<void>
}

function getEditorContext(
  mentionedPaths: string[] = [],
  attachedPaths: string[] = []
): {
  workspacePath: string | null
  activeFilePath: string | null
  selection: string | null
  mentionedPaths: string[]
  attachedPaths: string[]
} {
  const app = useAppStore.getState()
  const tab = app.tabs.find((t) => t.id === app.activeTabId)
  let selection: string | null = null
  try {
    const sel = window.getSelection()?.toString()
    if (sel && sel.trim()) selection = sel
  } catch {
    /* ignore */
  }
  return {
    workspacePath: app.workspacePath,
    activeFilePath: tab?.path ?? null,
    selection,
    mentionedPaths,
    attachedPaths
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  settings: null,
  panelVisible: false,
  panelWidth: 380,
  sessions: [],
  session: null,
  streaming: false,
  streamBuffer: '',
  streamMessageId: null,
  agentRunId: null,
  agentPhase: 'idle',
  agentToolName: null,
  error: null,
  pendingAsk: null,
  contextUsed: 0,
  contextLimit: 128000,
  contextBuckets: [],
  showHistory: false,
  draft: '',
  agentMode: 'agent',
  profiles: [],
  composerAttachments: [],
  composerSkillId: null,

  hydrate: async () => {
    const p = getPlatform()
    try {
      const settings = (await p.aiGetSettings()) as unknown as AiSettingsView
      const mode =
        settings.agentMode === 'ask' ||
        settings.agentMode === 'plan' ||
        settings.agentMode === 'outline' ||
        settings.agentMode === 'agent'
          ? settings.agentMode
          : 'agent'
      set({
        settings,
        panelVisible: false,
        panelWidth: settings.panelWidth || 380,
        contextLimit: settings.contextWindow,
        agentMode: mode,
        error: null
      })
      await get().refreshProfiles()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message || 'Failed to load AI settings' })
      return
    }
    const ws = useAppStore.getState().workspacePath
    await get().onWorkspaceChanged(ws)
  },

  onWorkspaceChanged: async (workspacePath) => {
    if (get().streaming) {
      await get().abort()
    }
    const p = getPlatform()
    const prefs = await p.aiGetWorkspacePrefs(workspacePath)
    const sessions = (await p.aiListSessions(workspacePath)) as AiState['sessions']
    set({
      panelVisible: Boolean(prefs.panelVisible),
      session: null,
      sessions,
      draft: '',
      showHistory: false,
      streamBuffer: '',
      streamMessageId: null,
      error: null,
      contextUsed: 0,
      agentPhase: 'idle',
      agentToolName: null,
      composerAttachments: [],
      composerSkillId: null,
      pendingAsk: null
    })
    if (sessions[0]) {
      await get().openSession(sessions[0].id)
    } else {
      set({ session: null })
    }
  },

  setPanelVisible: (v) => {
    const ws = useAppStore.getState().workspacePath
    if (!ws) {
      set({ panelVisible: false })
      return
    }
    set({ panelVisible: v })
    void getPlatform().aiSetWorkspacePrefs(ws, { panelVisible: v })
  },

  togglePanel: () => {
    if (!useAppStore.getState().workspacePath) return
    get().setPanelVisible(!get().panelVisible)
  },

  setPanelWidth: (w) => {
    const panelWidth = Math.min(640, Math.max(280, w))
    set({ panelWidth })
    void getPlatform().aiSaveSettings({ panelWidth })
  },

  setDraft: (draft) => set({ draft }),
  setShowHistory: (showHistory) => set({ showHistory }),

  setAgentMode: (mode) => {
    set({ agentMode: mode })
    void getPlatform().aiSaveSettings({ agentMode: mode })
    void get().refreshContextUsage()
  },

  refreshProfiles: async () => {
    const profiles = (await getPlatform().aiListProfiles()) as AiProfileView[]
    set({ profiles: profiles || [] })
  },

  setActiveProfile: async (id) => {
    const res = await getPlatform().aiSetActiveProfile(id)
    const settings = res.settings as unknown as AiSettingsView
    set({
      settings: {
        ...settings,
        hasApiKey: Boolean(settings.hasApiKey),
        panelVisible: get().panelVisible
      },
      contextLimit: settings.contextWindow,
      agentMode:
        settings.agentMode === 'ask' ||
        settings.agentMode === 'plan' ||
        settings.agentMode === 'outline' ||
        settings.agentMode === 'agent'
          ? settings.agentMode
          : get().agentMode
    })
    await get().refreshProfiles()
  },

  upsertProfile: async (partial) => {
    const p = (await getPlatform().aiUpsertProfile(partial as Record<string, unknown>)) as AiProfileView
    await get().refreshProfiles()
    return p
  },

  deleteProfile: async (id) => {
    const ok = await getPlatform().aiDeleteProfile(id)
    await get().refreshProfiles()
    const settings = (await getPlatform().aiGetSettings()) as unknown as AiSettingsView
    set({
      settings: { ...settings, panelVisible: get().panelVisible },
      contextLimit: settings.contextWindow
    })
    return ok
  },

  setProfileKey: async (id, key) => {
    await getPlatform().aiSetProfileKey(id, key)
    await get().refreshProfiles()
    const settings = (await getPlatform().aiGetSettings()) as unknown as AiSettingsView
    set({ settings: { ...settings, panelVisible: get().panelVisible } })
  },

  addComposerAttachment: (relPath) => {
    const raw = relPath.replace(/\\/g, '/')
    if (!raw) return
    const isDir = /\/$/.test(raw)
    const norm = isDir ? raw.replace(/\/+$/, '') + '/' : raw.replace(/\/+$/, '')
    const key = norm.replace(/\/+$/, '').toLowerCase()
    set((s) => {
      const withoutDup = s.composerAttachments.filter(
        (p) => p.replace(/\/+$/, '').toLowerCase() !== key
      )
      return { composerAttachments: [...withoutDup, norm] }
    })
  },

  removeComposerAttachment: (relPath) => {
    const key = relPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    set((s) => ({
      composerAttachments: s.composerAttachments.filter(
        (p) => p.replace(/\/+$/, '').toLowerCase() !== key
      )
    }))
  },

  clearComposerAttachments: () => set({ composerAttachments: [] }),

  setComposerSkillId: (id) =>
    set({ composerSkillId: id && id.trim() ? id.trim() : null }),

  pickComposerAttachments: async () => {
    const ws = useAppStore.getState().workspacePath
    if (!ws) {
      set({ error: i18n.t('ai.attachNeedWorkspace') })
      return
    }
    const platform = getPlatform()
    const absPaths = await platform.openContextFiles(ws)
    if (!absPaths.length) return
    const rootNorm = ws.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
    const refsDir = platform.joinPath(ws, '.kentucky', 'refs')
    let imported = 0
    let failed = 0
    for (const abs of absPaths) {
      const absNorm = abs.replace(/\\/g, '/')
      const inside =
        absNorm.toLowerCase().startsWith(rootNorm + '/') || absNorm.toLowerCase() === rootNorm
      if (inside) {
        const rel = platform.relativeTo(ws, abs)
        if (rel) {
          const withSlash = (await platform.isDirectory(abs))
            ? rel.replace(/\/+$/, '') + '/'
            : rel.replace(/\/+$/, '')
          get().addComposerAttachment(withSlash)
        }
        continue
      }
      // Outside workspace: copy into .kentucky/refs/ so agent tools stay sandboxed.
      try {
        await platform.mkdir(refsDir)
        const base = platform.basename(abs)
        let dest = platform.joinPath(refsDir, base)
        let n = 1
        while (await platform.exists(dest)) {
          const dot = base.lastIndexOf('.')
          const stem = dot > 0 ? base.slice(0, dot) : base
          const ext = dot > 0 ? base.slice(dot) : ''
          dest = platform.joinPath(refsDir, `${stem}-${n}${ext}`)
          n += 1
        }
        await platform.copyFile(abs, dest)
        const rel = platform.relativeTo(ws, dest)
        if (rel) {
          get().addComposerAttachment(rel)
          imported += 1
        }
      } catch {
        failed += 1
      }
    }
    if (imported > 0) {
      await useAppStore.getState().refreshTree()
      useAppStore.getState().showToast(
        i18n.t('ai.attachImported', { count: imported }),
        'info'
      )
    }
    if (failed > 0) {
      set({ error: i18n.t('ai.attachImportFailed') })
    } else {
      set({ error: null })
    }
  },

  refreshSessions: async () => {
    const ws = useAppStore.getState().workspacePath
    const sessions = (await getPlatform().aiListSessions(ws)) as AiState['sessions']
    set({ sessions })
  },

  newChat: async () => {
    const ws = useAppStore.getState().workspacePath
    if (!ws) {
      set({ error: 'Open a workspace to start an AI chat.' })
      return
    }
    const session = (await getPlatform().aiCreateSession(ws)) as AiSession
    set({
      session,
      error: null,
      streamBuffer: '',
      showHistory: false,
      draft: '',
      composerAttachments: [],
      composerSkillId: null,
      pendingAsk: null
    })
    await get().refreshSessions()
    await get().refreshContextUsage()
  },

  openSession: async (id) => {
    const session = (await getPlatform().aiLoadSession(id)) as AiSession | null
    if (!session) return
    const ws = useAppStore.getState().workspacePath
    const sameWs =
      (session.workspacePath ?? null) === null && ws === null
        ? true
        : Boolean(
            session.workspacePath &&
              ws &&
              session.workspacePath.replace(/\//g, '\\').toLowerCase() ===
                ws.replace(/\//g, '\\').toLowerCase()
          )
    if (!sameWs) {
      set({ error: 'Chat belongs to another workspace.' })
      return
    }
    const live = session.pendingAsk
    const livePending = live
      ? {
          sessionId: session.id,
          askId: live.askId,
          messageId: live.messageId,
          title: live.title,
          questions: live.questions
        }
      : null
    set({
      session,
      error: null,
      streamBuffer: '',
      showHistory: false,
      pendingAsk: livePending,
      streaming: Boolean(livePending) || get().streaming,
      agentPhase: livePending ? 'tool' : get().agentPhase,
      agentToolName: livePending ? 'ask_user' : get().agentToolName
    })
    await get().refreshContextUsage()
  },

  deleteSession: async (id) => {
    await getPlatform().aiDeleteSession(id)
    if (get().session?.id === id) set({ session: null })
    await get().refreshSessions()
    if (!get().session) {
      if (get().sessions[0]) await get().openSession(get().sessions[0].id)
    }
  },

  saveSettings: async (partial) => {
    // panelVisible is per-workspace; never persist it into global ai-settings.
    const rest = { ...partial }
    delete rest.panelVisible
    const settings = (await getPlatform().aiSaveSettings(rest)) as unknown as AiSettingsView
    set({
      settings: { ...settings, hasApiKey: settings.hasApiKey, panelVisible: get().panelVisible },
      panelWidth: settings.panelWidth,
      contextLimit: settings.contextWindow
    })
  },

  setApiKey: async (key) => {
    await getPlatform().aiSetKey(key)
    await get().hydrate()
  },

  clearApiKey: async () => {
    await getPlatform().aiClearKey()
    await get().hydrate()
  },

  listSkills: async () => {
    const list = (await getPlatform().aiListSkills()) as AiSkillView[]
    return list || []
  },

  setSkillEnabled: async (id, enabled) => {
    const list = (await getPlatform().aiSetSkillEnabled(id, enabled)) as AiSkillView[]
    return list || []
  },

  revealSkillsDir: async () => {
    await getPlatform().aiRevealSkillsDir()
  },

  importSkillFolder: async () => {
    return getPlatform().aiImportSkillFolder()
  },

  refreshContextUsage: async () => {
    try {
      const id = get().session?.id
      const usage = await getPlatform().aiContextUsage(id || '', get().agentMode)
      set({
        contextUsed: usage.used,
        contextLimit: usage.limit,
        contextBuckets: usage.buckets || []
      })
    } catch (err) {
      console.error(err)
    }
  },

  send: async (text, opts) => {
    const replacing = opts?.replaceUserMessageId
    if ((get().streaming || get().pendingAsk) && !replacing) return false
    const draftText = (text ?? get().draft).trim()
    const chipSkill = get().composerSkillId?.trim() || null
    const pendingAttachments = get().composerAttachments
    let session = get().session
    if (!replacing && (!draftText && !chipSkill && !pendingAttachments.length)) return false
    if (replacing && !draftText) {
      const existing = session?.messages.find((m) => m.id === replacing)
      if (!existing?.skillId && !(existing?.attachedPaths || []).length) return false
    }
    if (!session) {
      await get().newChat()
      session = get().session
    }
    if (!session) return false
    if (!get().settings?.hasApiKey) {
      set({ error: 'API key is not set. Open Settings → AI.' })
      return false
    }

    const ratio = get().contextUsed / Math.max(1, get().contextLimit)
    if (ratio >= 0.98) {
      set({
        error:
          'Context window is nearly full. Create a new chat — history will not be silently reset.'
      })
      return false
    }

    const replaceMsg = replacing
      ? session.messages.find((m) => m.id === replacing && m.role === 'user')
      : undefined
    if (replacing) {
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user')
      if (!replaceMsg || lastUser?.id !== replacing) return false
      const restores = collectFileRestoresAfterUser(
        session.messages,
        session.proposals || [],
        replacing
      )
      if (restores.length) {
        const names = restores.map((r) => r.path.replace(/\\/g, '/'))
        const shown = names.slice(0, 12)
        const extra = names.length > 12 ? `\n… +${names.length - 12}` : ''
        const ok = await askConfirm({
          title: i18n.t('ai.rewindFilesTitle'),
          message: i18n.t('ai.rewindFilesMessage', { files: shown.join('\n') + extra }),
          confirmLabel: i18n.t('ai.rewindFilesConfirm'),
          cancelLabel: i18n.t('ai.rewindFilesCancel'),
          danger: true
        })
        if (!ok) return false
        await useAppStore.getState().syncTabsAfterFileRewind(restores)
      }
    }

    const MODE_CMDS = new Set(['agent', 'plan', 'outline', 'ask', 'new'])
    const skillInvoke = draftText.match(/^\/([A-Za-z0-9._-]+)(?:\s+([\s\S]*))?$/)
    let sendText = draftText
    let turnSystemHint = opts?.turnSystemHint
    let skillId: string | undefined
    const attachments = replacing
      ? replaceMsg?.attachedPaths || []
      : pendingAttachments
    if (replacing) {
      skillId = replaceMsg?.skillId
    } else if (chipSkill && !MODE_CMDS.has(chipSkill)) {
      skillId = chipSkill
      sendText = draftText || `Follow skill /${skillId} for this request.`
    } else if (skillInvoke && !MODE_CMDS.has(skillInvoke[1])) {
      skillId = skillInvoke[1]
      const rest = (skillInvoke[2] || '').trim()
      sendText = rest || `Follow skill /${skillId} for this request.`
    }

    if (skillId) {
      turnSystemHint = [
        turnSystemHint,
        // Skill body is injected in agentLoop; keep a short reminder for the model.
        `User mounted skill /${skillId}. Follow the injected skill instructions. Plain "/…" in the user text is literal, not a command.`
      ]
        .filter(Boolean)
        .join('\n')
    }

    const runId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`

    // @mentions only — composer chips go via attachedPaths (CRITICAL + user-message bind).
    const fromAt = Array.from(sendText.matchAll(/@([^\s@]+)/g)).map((m) => m[1])
    const mentions = Array.from(new Set(fromAt.map((p) => p.replace(/\\/g, '/'))))

    if (replacing) {
      set({
        streaming: true,
        error: null,
        streamBuffer: '',
        streamMessageId: null,
        agentPhase: 'thinking',
        agentToolName: null,
        agentRunId: runId
      })
    } else {
      set({
        streaming: true,
        error: null,
        draft: '',
        streamBuffer: '',
        streamMessageId: null,
        agentPhase: 'thinking',
        agentToolName: null,
        composerAttachments: [],
        composerSkillId: null,
        agentRunId: runId
      })
    }
    try {
      const res = await getPlatform().aiSend({
        sessionId: session.id,
        text: sendText,
        mode: get().agentMode,
        planFileRel: get().session?.planFileRel ?? undefined,
        turnSystemHint,
        skillId,
        replaceUserMessageId: replacing,
        runId,
        editor: getEditorContext(mentions, attachments.map((p) => p.replace(/\\/g, '/')))
      })
      if (!res?.ok) {
        set({
          streaming: false,
          agentPhase: 'idle',
          agentToolName: null,
          error: i18n.t('ai.sendFailed')
        })
        return false
      }
      return true
    } catch (err) {
      set({
        streaming: false,
        agentPhase: 'idle',
        agentToolName: null,
        error: err instanceof Error ? err.message : String(err)
      })
      return false
    }
  },

  executePlanFile: async (absPath) => {
    const ws = useAppStore.getState().workspacePath
    if (!ws) return
    const wsNorm = ws.replace(/\\/g, '/').replace(/\/+$/, '')
    const absNorm = absPath.replace(/\\/g, '/')
    let planRel = absNorm
    const prefix = wsNorm.toLowerCase()
    if (absNorm.toLowerCase().startsWith(prefix + '/')) {
      planRel = absNorm.slice(wsNorm.length).replace(/^\/+/, '')
    }

    let session = get().session
    if (!session) {
      await get().newChat()
      session = get().session
    }
    if (!session) return

    get().setAgentMode('agent')
    get().setPanelVisible(true)
    set((s) => ({
      session: s.session ? { ...s.session, planFileRel: planRel } : s.session
    }))

    const display = i18n.t('ai.executePlanUserMsg', { path: planRel })
    const hint = [
      `The user clicked Build to execute the plan file: ${planRel}`,
      'Call read_file on that path first, then implement remaining unchecked todos.',
      'Use workspace_mkdir / workspace_copy / workspace_move / workspace_delete for archival or file moves (no shell).',
      'Call update_plan_step as you finish each todo. Do not dump these instructions back to the user.'
    ].join('\n')
    await get().send(display, { turnSystemHint: hint })
  },

  abort: async () => {
    await getPlatform().aiAbort()
    set({ streaming: false, agentPhase: 'idle', agentToolName: null, pendingAsk: null })
  },

  answerPendingAsk: async (answers) => {
    const pending = get().pendingAsk
    if (!pending) return
    await getPlatform().aiAnswerAskUser({
      sessionId: pending.sessionId,
      askId: pending.askId,
      answers
    })
    set({ pendingAsk: null })
  },

  retryLast: async () => {
    const session = get().session
    if (!session) return
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    set({ error: null })
    await get().send(lastUser.content, { replaceUserMessageId: lastUser.id })
  },

  applyProposal: async (id) => {
    const session = get().session
    if (!session) return
    const p = (await getPlatform().aiApplyProposal({
      sessionId: session.id,
      proposalId: id
    })) as AiProposal | null
    if (!p) return
    await get().syncAppliedFile(p, get().settings?.applyWritesToDisk === true, !p.before)
    await get().openSession(session.id)
  },

  rejectProposal: async (id) => {
    const session = get().session
    if (!session) return
    await getPlatform().aiRejectProposal({ sessionId: session.id, proposalId: id })
    await get().openSession(session.id)
  },

  applyAll: async (messageId?: string) => {
    const session = get().session
    if (!session) return
    const lastAssistantId = [...session.messages].reverse().find((m) => m.role === 'assistant')?.id
    const pending = session.proposals.filter((p) => {
      if (p.status !== 'pending') return false
      if (!messageId) return true
      if (p.messageId === messageId) return true
      return !p.messageId && messageId === lastAssistantId
    })
    for (const p of pending) {
      await get().applyProposal(p.id)
    }
  },

  rejectAll: async (messageId?: string) => {
    const session = get().session
    if (!session) return
    const lastAssistantId = [...session.messages].reverse().find((m) => m.role === 'assistant')?.id
    const pending = session.proposals.filter((p) => {
      if (p.status !== 'pending') return false
      if (!messageId) return true
      if (p.messageId === messageId) return true
      return !p.messageId && messageId === lastAssistantId
    })
    for (const p of pending) {
      await get().rejectProposal(p.id)
    }
  },

  syncAppliedFile: async (p, writeDisk, isNew) => {
    const app = useAppStore.getState()
    await app.applyAiFileEdit({
      absPath: p.absPath,
      content: p.after,
      before: p.before,
      writeDisk,
      isNew
    })
    await app.refreshTree()
  },

  bindEvents: () => {
    const p = getPlatform()
    const fromThisRun = (payload: unknown): boolean => {
      if (!payload || typeof payload !== 'object') return true
      const id = (payload as { runId?: string }).runId
      if (!id) return true
      const cur = get().agentRunId
      if (!cur) return true
      return id === cur
    }
    const offs = [
      p.onAiEvent('ai:assistant_start', (payload) => {
        if (!fromThisRun(payload)) return
        set({ agentPhase: 'thinking', agentToolName: null })
      }),
      p.onAiEvent('ai:chunk', (payload) => {
        if (!fromThisRun(payload)) return
        const data = payload as { messageId: string; text: string }
        set((s) => ({
          streamMessageId: data.messageId,
          streamBuffer: s.streamBuffer + data.text,
          agentPhase: 'streaming',
          agentToolName: null
        }))
      }),
      p.onAiEvent('ai:session', (payload) => {
        if (!fromThisRun(payload)) return
        const wrapped = payload as { session?: AiSession; id?: string; messages?: AiChatMessage[] }
        const session =
          wrapped.session && Array.isArray(wrapped.session.messages)
            ? wrapped.session
            : (payload as AiSession)
        if (!session?.id || !Array.isArray(session.messages)) return
        set((s) => ({
          session,
          streamBuffer: '',
          // Keep thinking between tool rounds while still streaming
          agentPhase: s.streaming && s.agentPhase !== 'tool' ? 'thinking' : s.agentPhase
        }))
        void get().refreshContextUsage()
        void get().refreshSessions()
      }),
      p.onAiEvent('ai:tool', (payload) => {
        if (!fromThisRun(payload)) return
        const data = payload as { name: string; status: string }
        if (data.status === 'running') {
          set({ agentPhase: 'tool', agentToolName: data.name, streaming: true })
        } else {
          set({ agentPhase: 'thinking', agentToolName: null })
        }
      }),
      p.onAiEvent('ai:error', (payload) => {
        if (!fromThisRun(payload)) return
        const data = payload as { message: string }
        set({
          error: data.message,
          streaming: false,
          agentPhase: 'idle',
          agentToolName: null,
          pendingAsk: null
        })
      }),
      p.onAiEvent('ai:done', (payload) => {
        if (!fromThisRun(payload)) return
        set({
          streaming: false,
          streamBuffer: '',
          streamMessageId: null,
          agentPhase: 'idle',
          agentToolName: null,
          agentRunId: null,
          pendingAsk: null
        })
        void get().refreshContextUsage()
      }),
      p.onAiEvent('ai:proposal', (payload) => {
        const data = payload as {
          sessionId?: string
          proposal: AiProposal
          autoApplied?: boolean
          writeDisk?: boolean
          isNew?: boolean
        }
        if (!data.proposal) return
        const cur = get().session
        if (cur && (!data.sessionId || cur.id === data.sessionId)) {
          const recorded: AiProposal = {
            ...data.proposal,
            status: data.autoApplied ? 'applied' : data.proposal.status
          }
          const prev = cur.proposals || []
          const proposals = prev.some((x) => x.id === recorded.id)
            ? prev.map((x) => (x.id === recorded.id ? recorded : x))
            : [...prev, recorded]
          set({ session: { ...cur, proposals } })
        }
        if (data.autoApplied) {
          void get().syncAppliedFile(data.proposal, data.writeDisk === true, data.isNew === true)
        }
      }),
      p.onAiEvent('ai:askUser', (payload) => {
        if (!fromThisRun(payload)) return
        const data = payload as {
          sessionId: string
          askId: string
          messageId: string
          title?: string
          questions: AskUserQuestion[]
        }
        if (!data.askId || !Array.isArray(data.questions)) return
        set({
          pendingAsk: {
            sessionId: data.sessionId,
            askId: data.askId,
            messageId: data.messageId,
            title: data.title,
            questions: data.questions
          },
          agentPhase: 'tool',
          agentToolName: 'ask_user',
          streaming: true
        })
      }),
      p.onAiEvent('ai:citeWorkspace', (payload) => {
        if (!fromThisRun(payload)) return
        const data = payload as { sessionId?: string; messageId: string; links: CiteCard['links'] }
        const cur = get().session
        if (!cur || (data.sessionId && cur.id !== data.sessionId)) return
        if (!data.links) return
        const card: CiteCard = {
          id: `cite-${data.messageId}-${(cur.citeCards || []).length}`,
          messageId: data.messageId,
          links: data.links
        }
        set({ session: { ...cur, citeCards: [...(cur.citeCards || []), card] } })
      }),
      p.onAiEvent('ai:gitOp', (payload) => {
        const data = payload as { sessionId: string; op: AiGitOp; highlight?: boolean }
        const cur = get().session
        if (!cur || cur.id !== data.sessionId || !data.op) return
        const prev = cur.gitOps || []
        const next = prev.some((o) => o.id === data.op.id)
          ? prev.map((o) => (o.id === data.op.id ? data.op : o))
          : [...prev, data.op]
        set({ session: { ...cur, gitOps: next } })
        const label =
          data.op.kind === 'add'
            ? 'git add'
            : data.op.kind === 'commit'
              ? 'git commit'
              : data.op.kind === 'remote_remove'
                ? 'git remote remove'
                : 'git remote add'
        const msg =
          data.op.status === 'applied'
            ? `${label}: ${data.op.resultNote || data.op.summary}`
            : `${label} failed: ${data.op.error || 'error'}`
        void import('./appStore').then(({ useAppStore }) => {
          useAppStore
            .getState()
            .showToast(msg, data.op.status === 'applied' ? 'info' : 'error')
        })
      }),
      p.onAiEvent('ai:plan', (payload) => {
        const data = payload as {
          sessionId: string
          plan: AiPlanStep[]
          planFileRel?: string | null
        }
        const cur = get().session
        if (cur && cur.id === data.sessionId) {
          set({
            session: {
              ...cur,
              plan: data.plan,
              planFileRel:
                data.planFileRel !== undefined ? data.planFileRel : cur.planFileRel
            }
          })
        }
      }),
      p.onAiEvent('ai:workspaceOp', (payload) => {
        const data = payload as {
          op: string
          path?: string
          absPath?: string
          line?: number
          from?: string
          to?: string
        }
        const app = useAppStore.getState()
        const ws = app.workspacePath
        const platform = getPlatform()

        const absFromRel = (rel: string) => (ws ? platform.joinPath(ws, rel) : rel)

        void (async () => {
          if (data.op === 'openFile' && data.path) {
            if (!ws) return
            await app.openFile(absFromRel(data.path), data.line ? { line: data.line } : undefined)
            await app.refreshTree()
            return
          }

          if (data.op === 'fsDeleted' && (data.path || data.absPath)) {
            const abs = data.absPath || absFromRel(data.path || '')
            const absLower = abs.replace(/\\/g, '/').toLowerCase()
            const tabs = useAppStore.getState().tabs.filter((t) => {
              const p = t.path.replace(/\\/g, '/').toLowerCase()
              return p === absLower || p.startsWith(absLower + '/')
            })
            for (const tab of tabs) {
              await useAppStore.getState().closeTab(tab.id, true)
            }
            await useAppStore.getState().refreshTree()
            return
          }

          if (data.op === 'fsMoved' && data.from && data.to) {
            const fromAbs = absFromRel(data.from)
            const toAbs = absFromRel(data.to)
            const fromLower = fromAbs.replace(/\\/g, '/').toLowerCase()
            const tabs = useAppStore.getState().tabs.filter((t) => {
              const p = t.path.replace(/\\/g, '/').toLowerCase()
              return p === fromLower || p.startsWith(fromLower + '/')
            })
            const reopen =
              tabs.length === 1 &&
              tabs[0].path.replace(/\\/g, '/').toLowerCase() === fromLower
                ? toAbs
                : null
            for (const tab of tabs) {
              await useAppStore.getState().closeTab(tab.id, true)
            }
            await useAppStore.getState().refreshTree()
            if (reopen) await useAppStore.getState().openFile(reopen)
            return
          }

          if (data.op === 'refreshTree' || data.op === 'fsCopied') {
            await useAppStore.getState().refreshTree()
          }
        })()
      })
    ]
    return () => offs.forEach((off) => off())
  }
}))
