import { create } from 'zustand'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

export type AgentMode = 'ask' | 'plan' | 'outline' | 'agent'

export interface AiSettingsView {
  baseUrl: string
  model: string
  contextWindow: number
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
  proposals: AiProposal[]
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
  /** UI phase while a turn is in flight (avoid looking frozen). */
  agentPhase: 'idle' | 'thinking' | 'streaming' | 'tool'
  agentToolName: string | null
  error: string | null
  contextUsed: number
  contextLimit: number
  showHistory: boolean
  draft: string
  agentMode: AgentMode
  profiles: AiProfileView[]
  composerAttachments: string[]
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
  send: (text?: string) => Promise<void>
  abort: () => Promise<void>
  retryLast: () => Promise<void>
  applyProposal: (id: string) => Promise<void>
  rejectProposal: (id: string) => Promise<void>
  applyAll: (messageId?: string) => Promise<void>
  syncAppliedFile: (p: AiProposal, writeDisk: boolean, isNew?: boolean) => Promise<void>
  bindEvents: () => () => void
  refreshContextUsage: () => Promise<void>
}

function getEditorContext(mentionedPaths: string[] = []): {
  workspacePath: string | null
  activeFilePath: string | null
  selection: string | null
  mentionedPaths: string[]
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
    mentionedPaths
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
  agentPhase: 'idle',
  agentToolName: null,
  error: null,
  contextUsed: 0,
  contextLimit: 128000,
  showHistory: false,
  draft: '',
  agentMode: 'agent',
  profiles: [],
  composerAttachments: [],

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
      agentToolName: null
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
    const norm = relPath.replace(/\\/g, '/')
    if (!norm) return
    set((s) => ({
      composerAttachments: s.composerAttachments.includes(norm)
        ? s.composerAttachments
        : [...s.composerAttachments, norm]
    }))
  },

  removeComposerAttachment: (relPath) => {
    const norm = relPath.replace(/\\/g, '/')
    set((s) => ({
      composerAttachments: s.composerAttachments.filter((p) => p !== norm)
    }))
  },

  clearComposerAttachments: () => set({ composerAttachments: [] }),

  pickComposerAttachments: async () => {
    const ws = useAppStore.getState().workspacePath
    if (!ws) {
      set({ error: 'Open a workspace to attach files.' })
      return
    }
    const platform = getPlatform()
    const absPaths = await platform.openContextFiles(ws)
    const rootNorm = ws.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
    for (const abs of absPaths) {
      const absNorm = abs.replace(/\\/g, '/')
      if (!absNorm.toLowerCase().startsWith(rootNorm + '/') && absNorm.toLowerCase() !== rootNorm) {
        set({ error: 'Reference files must be inside the workspace.' })
        continue
      }
      const rel = platform.relativeTo(ws, abs)
      if (rel) get().addComposerAttachment(rel)
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
    set({ session, error: null, streamBuffer: '', showHistory: false })
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
    set({ session, error: null, streamBuffer: '', showHistory: false })
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
    const id = get().session?.id
    if (!id) return
    const usage = await getPlatform().aiContextUsage(id)
    set({ contextUsed: usage.used, contextLimit: usage.limit })
  },

  send: async (text) => {
    const content = (text ?? get().draft).trim()
    if (!content || get().streaming) return
    let session = get().session
    if (!session) {
      await get().newChat()
      session = get().session
    }
    if (!session) return
    if (!get().settings?.hasApiKey) {
      set({ error: 'API key is not set. Open Settings → AI.' })
      return
    }

    const ratio = get().contextUsed / Math.max(1, get().contextLimit)
    if (ratio >= 0.98) {
      set({
        error:
          'Context window is nearly full. Create a new chat — history will not be silently reset.'
      })
      return
    }

    set({
      streaming: true,
      error: null,
      draft: '',
      streamBuffer: '',
      agentPhase: 'thinking',
      agentToolName: null
    })
    const fromAt = Array.from(content.matchAll(/@([^\s@]+)/g)).map((m) => m[1])
    const attachments = get().composerAttachments
    const mentions = Array.from(new Set([...fromAt, ...attachments].map((p) => p.replace(/\\/g, '/'))))
    await getPlatform().aiSend({
      sessionId: session.id,
      text: content,
      mode: get().agentMode,
      editor: getEditorContext(mentions)
    })
  },

  abort: async () => {
    await getPlatform().aiAbort()
    set({ streaming: false, agentPhase: 'idle', agentToolName: null })
  },

  retryLast: async () => {
    const session = get().session
    if (!session) return
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    set({ error: null })
    await get().send(lastUser.content)
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
    const offs = [
      p.onAiEvent('ai:assistant_start', () => {
        set({ agentPhase: 'thinking', agentToolName: null })
      }),
      p.onAiEvent('ai:chunk', (payload) => {
        const data = payload as { messageId: string; text: string }
        set((s) => ({
          streamMessageId: data.messageId,
          streamBuffer: s.streamBuffer + data.text,
          agentPhase: 'streaming',
          agentToolName: null
        }))
      }),
      p.onAiEvent('ai:session', (payload) => {
        set((s) => ({
          session: payload as AiSession,
          streamBuffer: '',
          // Keep thinking between tool rounds while still streaming
          agentPhase: s.streaming && s.agentPhase !== 'tool' ? 'thinking' : s.agentPhase
        }))
        void get().refreshContextUsage()
        void get().refreshSessions()
      }),
      p.onAiEvent('ai:tool', (payload) => {
        const data = payload as { name: string; status: string }
        if (data.status === 'running') {
          set({ agentPhase: 'tool', agentToolName: data.name, streaming: true })
        } else {
          set({ agentPhase: 'thinking', agentToolName: null })
        }
      }),
      p.onAiEvent('ai:error', (payload) => {
        const data = payload as { message: string }
        set({
          error: data.message,
          streaming: false,
          agentPhase: 'idle',
          agentToolName: null
        })
      }),
      p.onAiEvent('ai:done', () => {
        set({
          streaming: false,
          streamBuffer: '',
          streamMessageId: null,
          agentPhase: 'idle',
          agentToolName: null
        })
        void get().refreshContextUsage()
      }),
      p.onAiEvent('ai:proposal', (payload) => {
        const data = payload as {
          proposal: AiProposal
          autoApplied?: boolean
          writeDisk?: boolean
          isNew?: boolean
        }
        if (!data.proposal) return
        // R1: only sync editor when auto-applied; pending waits for Accept.
        if (data.autoApplied) {
          void get().syncAppliedFile(data.proposal, data.writeDisk === true, data.isNew === true)
        }
      }),
      p.onAiEvent('ai:plan', (payload) => {
        const data = payload as { sessionId: string; plan: AiPlanStep[] }
        const cur = get().session
        if (cur && cur.id === data.sessionId) {
          set({ session: { ...cur, plan: data.plan } })
        }
      }),
      p.onAiEvent('ai:workspaceOp', (payload) => {
        const data = payload as { op: string; path: string; line?: number }
        if (data.op === 'openFile') {
          const ws = useAppStore.getState().workspacePath
          if (!ws) return
          const abs = getPlatform().joinPath(ws, data.path)
          void useAppStore.getState().openFile(abs, data.line ? { line: data.line } : undefined)
        }
      })
    ]
    return () => offs.forEach((off) => off())
  }
}))
