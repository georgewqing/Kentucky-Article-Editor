export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export type WindowRole = 'main' | 'float'

export interface WindowBootstrap {
  role: WindowRole
  workspacePath: string | null
  filePath: string | null
}

export interface DocSnapshot {
  path: string
  content: string
  originalContent: string
  dirty: boolean
  rev: number
}

/** Platform filesystem / dialog abstraction — UI must only use this. */
export interface Platform {
  openFolder(): Promise<string | null>
  openImage(): Promise<string | null>
  openImages(): Promise<string[]>
  openContextFiles(workspacePath?: string | null): Promise<string[]>
  readDir(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(targetPath: string): Promise<void>
  exists(targetPath: string): Promise<boolean>
  copyFile(src: string, dest: string): Promise<void>
  toMediaUrl(filePath: string): Promise<string>
  /** Reveal path in the OS file manager (Explorer / Finder). */
  showItemInFolder(targetPath: string): Promise<void>
  /** Open http(s) URL in the system browser. */
  openExternal(url: string): Promise<void>
  joinPath(...parts: string[]): string
  basename(filePath: string): string
  dirname(filePath: string): string
  extname(filePath: string): string
  /** Absolute path → path relative to workspace root (forward slashes). */
  relativeTo(workspaceRoot: string, absolutePath: string): string
  /** OS platform: darwin keeps native menu; win32/linux use custom menubar. */
  getOsPlatform(): Promise<string>
  setMenuLocale(locale: 'zh-CN' | 'en'): Promise<void>
  /** Sync theme to main-process userData so the startup splash matches. */
  persistTheme(payload: { themeMode?: 'dark' | 'light'; accent?: string }): Promise<void>
  runMenuAction(action: string): Promise<void>
  onMenuOpenFolder(cb: () => void): () => void
  onMenuSave(cb: () => void): () => void
  onMenuNewWindow(cb: () => void): () => void
  onMenuNewMainWindow(cb: () => void): () => void

  getWindowBootstrap(): Promise<WindowBootstrap>
  reportWorkspace(workspacePath: string | null): Promise<void>
  newMainWindow(workspacePath?: string | null): Promise<void>
  newFloatWindow(payload: {
    filePath: string
    workspacePath: string
    content: string
    originalContent: string
    dirty: boolean
  }): Promise<void>

  docOpen(filePath: string): Promise<DocSnapshot | null>
  docSubscribe(filePath: string): Promise<DocSnapshot | null>
  docUnsubscribe(filePath: string): Promise<void>
  docPatch(filePath: string, content: string): Promise<DocSnapshot | null>
  docSave(filePath: string): Promise<DocSnapshot | null>
  docDiscard(filePath: string): Promise<DocSnapshot | null>
  docReloadFromDisk(filePath: string): Promise<DocSnapshot | null>
  docEvict(filePath: string): Promise<void>
  onDocApply(cb: (snap: DocSnapshot) => void): () => void

  gitProbe(): Promise<{ ok: boolean; version: string | null; error: string | null }>
  gitSetPath(gitPath: string | null): Promise<{ ok: boolean; version: string | null; error: string | null }>
  gitFindRoot(workspaceRoot: string): Promise<string | null>
  gitInit(workspaceRoot: string): Promise<{ ok: boolean; repoRoot: string; error?: string }>
  gitEnsure(workspaceRoot: string): Promise<{
    ok: boolean
    repoRoot: string | null
    created: boolean
    error?: string
  }>
  gitStatus(workspaceRoot: string): Promise<unknown>
  gitDiff(workspaceRoot: string, path: string, staged?: boolean): Promise<unknown>
  gitStage(workspaceRoot: string, paths: string[]): Promise<unknown>
  gitUnstage(workspaceRoot: string, paths: string[]): Promise<unknown>
  gitCommit(workspaceRoot: string, message: string): Promise<unknown>
  gitDiscard(
    workspaceRoot: string,
    absPath: string,
    opts?: { untrackedConfirmed?: boolean }
  ): Promise<unknown>

  confirmWindowClose(): Promise<void>
  onWindowCloseRequest(cb: () => void): () => void

  // AI
  aiGetSettings(): Promise<Record<string, unknown>>
  aiSaveSettings(partial: Record<string, unknown>): Promise<Record<string, unknown>>
  aiSetKey(key: string): Promise<{ hasApiKey: boolean }>
  aiClearKey(): Promise<{ hasApiKey: boolean }>
  aiListProfiles(): Promise<unknown[]>
  aiUpsertProfile(partial: Record<string, unknown>): Promise<unknown>
  aiDeleteProfile(id: string): Promise<boolean>
  aiSetActiveProfile(id: string): Promise<{ profile: unknown; settings: Record<string, unknown> }>
  aiSetProfileKey(id: string, key: string): Promise<{ hasKey: boolean; activeHasKey: boolean }>
  aiClearProfileKey(id: string): Promise<{ hasKey: boolean; activeHasKey: boolean }>
  aiGetActiveProfile(): Promise<unknown>
  aiListSessions(workspacePath?: string | null): Promise<unknown[]>
  aiCreateSession(workspacePath: string | null): Promise<unknown>
  aiGetWorkspacePrefs(workspacePath: string | null): Promise<{ panelVisible: boolean }>
  aiSetWorkspacePrefs(
    workspacePath: string,
    partial: { panelVisible?: boolean }
  ): Promise<{ panelVisible: boolean }>
  aiLoadSession(id: string): Promise<unknown>
  aiDeleteSession(id: string): Promise<boolean>
  aiContextUsage(
    sessionId: string,
    mode?: string
  ): Promise<{
    used: number
    limit: number
    buckets: Array<{ id: string; tokens: number }>
  }>
  aiSend(payload: {
    sessionId: string
    text: string
    mode?: string
    planFileRel?: string | null
    turnSystemHint?: string
    skillId?: string
    editor: {
      workspacePath: string | null
      activeFilePath: string | null
      selection: string | null
      mentionedPaths: string[]
      attachedPaths?: string[]
    }
  }): Promise<{ ok: boolean }>
  aiAbort(): Promise<boolean>
  aiApplyProposal(payload: { sessionId: string; proposalId: string }): Promise<unknown>
  aiRejectProposal(payload: { sessionId: string; proposalId: string }): Promise<unknown>
  aiConfirmGitOp(payload: { sessionId: string; opId: string }): Promise<unknown>
  aiRejectGitOp(payload: { sessionId: string; opId: string }): Promise<unknown>
  aiApplyAllProposals(sessionId: string): Promise<unknown[]>
  aiListSkills(): Promise<unknown[]>
  aiSetSkillEnabled(id: string, enabled: boolean): Promise<unknown[]>
  aiRevealSkillsDir(): Promise<boolean>
  aiImportSkillFolder(): Promise<{ ok: boolean; id?: string; error?: string }>
  onAiEvent(channel: string, cb: (payload: unknown) => void): () => void
}

function joinPath(...parts: string[]): string {
  if (parts.length === 0) return ''
  const isWin = parts[0].includes('\\') || /^[A-Za-z]:/.test(parts[0])
  const sep = isWin ? '\\' : '/'
  let result = parts[0].replace(/[/\\]+$/, '')
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
    if (p) result = result + sep + p
  }
  return result
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function dirname(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  if (idx <= 0) return filePath
  return filePath.slice(0, idx)
}

function extname(filePath: string): string {
  const name = basename(filePath)
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx).toLowerCase()
}

function relativeTo(workspaceRoot: string, absolutePath: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const abs = absolutePath.replace(/\\/g, '/')
  if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return abs.slice(root.length + 1)
  }
  if (abs.toLowerCase() === root.toLowerCase()) return ''
  return abs
}

export function createElectronPlatform(): Platform {
  const api = window.kentucky
  if (!api) {
    throw new Error('Electron bridge (window.kentucky) is not available')
  }

  return {
    openFolder: () => api.openDirectory(),
    openImage: () => api.openImage(),
    openImages: () => api.openImages(),
    openContextFiles: (workspacePath) => api.openContextFiles(workspacePath),
    readDir: (dirPath) => api.readDir(dirPath),
    readFile: (filePath) => api.readFile(filePath),
    writeFile: async (filePath, content) => {
      await api.writeFile(filePath, content)
    },
    mkdir: async (dirPath) => {
      await api.mkdir(dirPath)
    },
    rename: async (oldPath, newPath) => {
      await api.rename(oldPath, newPath)
    },
    delete: async (targetPath) => {
      await api.delete(targetPath)
    },
    exists: (targetPath) => api.exists(targetPath),
    copyFile: async (src, dest) => {
      await api.copyFile(src, dest)
    },
    toMediaUrl: (filePath) => api.toMediaUrl(filePath),
    showItemInFolder: async (targetPath) => {
      await api.showItemInFolder(targetPath)
    },
    openExternal: async (url) => {
      await api.openExternal(url)
    },
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    getOsPlatform: () => api.getOsPlatform(),
    setMenuLocale: async (locale) => {
      await api.setMenuLocale(locale)
    },
    persistTheme: async (payload) => {
      await api.persistTheme(payload)
    },
    runMenuAction: async (action) => {
      await api.runMenuAction(action)
    },
    onMenuOpenFolder: (cb) => api.onMenuOpenFolder(cb),
    onMenuSave: (cb) => api.onMenuSave(cb),
    onMenuNewWindow: (cb) => api.onMenuNewWindow(cb),
    onMenuNewMainWindow: (cb) => api.onMenuNewMainWindow(cb),

    getWindowBootstrap: () => api.getWindowBootstrap(),
    reportWorkspace: async (workspacePath) => {
      await api.reportWorkspace(workspacePath)
    },
    newMainWindow: async (workspacePath) => {
      await api.newMainWindow(workspacePath)
    },
    newFloatWindow: async (payload) => {
      await api.newFloatWindow(payload)
    },

    docOpen: (filePath) => api.docOpen(filePath),
    docSubscribe: (filePath) => api.docSubscribe(filePath),
    docUnsubscribe: async (filePath) => {
      await api.docUnsubscribe(filePath)
    },
    docPatch: (filePath, content) => api.docPatch(filePath, content),
    docSave: (filePath) => api.docSave(filePath),
    docDiscard: (filePath) => api.docDiscard(filePath),
    docReloadFromDisk: (filePath) => api.docReloadFromDisk(filePath),
    docEvict: async (filePath) => {
      await api.docEvict(filePath)
    },
    onDocApply: (cb) => api.onDocApply(cb),

    gitProbe: () => api.gitProbe(),
    gitSetPath: (p) => api.gitSetPath(p),
    gitFindRoot: (ws) => api.gitFindRoot(ws),
    gitInit: (ws) => api.gitInit(ws),
    gitEnsure: (ws) => api.gitEnsure(ws),
    gitStatus: (ws) => api.gitStatus(ws),
    gitDiff: (ws, path, staged) => api.gitDiff(ws, path, staged),
    gitStage: (ws, paths) => api.gitStage(ws, paths),
    gitUnstage: (ws, paths) => api.gitUnstage(ws, paths),
    gitCommit: (ws, message) => api.gitCommit(ws, message),
    gitDiscard: (ws, abs, opts) => api.gitDiscard(ws, abs, opts),

    confirmWindowClose: async () => {
      await api.confirmWindowClose()
    },
    onWindowCloseRequest: (cb) => api.onWindowCloseRequest(cb),

    aiGetSettings: () => api.aiGetSettings(),
    aiSaveSettings: (partial) => api.aiSaveSettings(partial),
    aiSetKey: (key) => api.aiSetKey(key),
    aiClearKey: () => api.aiClearKey(),
    aiListProfiles: () => api.aiListProfiles(),
    aiUpsertProfile: (partial) => api.aiUpsertProfile(partial),
    aiDeleteProfile: (id) => api.aiDeleteProfile(id),
    aiSetActiveProfile: (id) => api.aiSetActiveProfile(id),
    aiSetProfileKey: (id, key) => api.aiSetProfileKey(id, key),
    aiClearProfileKey: (id) => api.aiClearProfileKey(id),
    aiGetActiveProfile: () => api.aiGetActiveProfile(),
    aiListSessions: (workspacePath) => api.aiListSessions(workspacePath),
    aiCreateSession: (workspacePath) => api.aiCreateSession(workspacePath),
    aiGetWorkspacePrefs: (workspacePath) => api.aiGetWorkspacePrefs(workspacePath),
    aiSetWorkspacePrefs: (workspacePath, partial) =>
      api.aiSetWorkspacePrefs(workspacePath, partial),
    aiLoadSession: (id) => api.aiLoadSession(id),
    aiDeleteSession: (id) => api.aiDeleteSession(id),
    aiContextUsage: (sessionId, mode) => api.aiContextUsage(sessionId, mode),
    aiSend: (payload) => api.aiSend(payload),
    aiAbort: () => api.aiAbort(),
    aiApplyProposal: (payload) => api.aiApplyProposal(payload),
    aiRejectProposal: (payload) => api.aiRejectProposal(payload),
    aiConfirmGitOp: (payload) => api.aiConfirmGitOp(payload),
    aiRejectGitOp: (payload) => api.aiRejectGitOp(payload),
    aiApplyAllProposals: (sessionId) => api.aiApplyAllProposals(sessionId),
    aiListSkills: () => api.aiListSkills(),
    aiSetSkillEnabled: (id, enabled) => api.aiSetSkillEnabled(id, enabled),
    aiRevealSkillsDir: () => api.aiRevealSkillsDir(),
    aiImportSkillFolder: () => api.aiImportSkillFolder(),
    onAiEvent: (channel, cb) => api.onAiEvent(channel, cb)
  }
}

/** Browser stub for non-Electron preview / future Capacitor wiring. */
export function createBrowserStubPlatform(): Platform {
  const localDocs = new Map<string, DocSnapshot>()
  return {
    openFolder: async () => null,
    openImage: async () => null,
    openImages: async () => [],
    openContextFiles: async () => [],
    readDir: async () => [],
    readFile: async () => '',
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    rename: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    copyFile: async () => undefined,
    toMediaUrl: async (filePath) => filePath,
    showItemInFolder: async () => undefined,
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    joinPath,
    basename,
    dirname,
    extname,
    relativeTo,
    getOsPlatform: async () => 'browser',
    setMenuLocale: async () => undefined,
    persistTheme: async () => undefined,
    runMenuAction: async () => undefined,
    onMenuOpenFolder: () => () => undefined,
    onMenuSave: () => () => undefined,
    onMenuNewWindow: () => () => undefined,
    onMenuNewMainWindow: () => () => undefined,
    getWindowBootstrap: async () => ({ role: 'main', workspacePath: null, filePath: null }),
    reportWorkspace: async () => undefined,
    newMainWindow: async () => undefined,
    newFloatWindow: async () => undefined,
    docOpen: async (filePath) => {
      const existing = localDocs.get(filePath)
      if (existing) return existing
      const snap: DocSnapshot = {
        path: filePath,
        content: '',
        originalContent: '',
        dirty: false,
        rev: 1
      }
      localDocs.set(filePath, snap)
      return snap
    },
    docSubscribe: async (filePath) => localDocs.get(filePath) ?? null,
    docUnsubscribe: async () => undefined,
    docPatch: async (filePath, content) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = {
        ...cur,
        content,
        dirty: content !== cur.originalContent,
        rev: cur.rev + 1
      }
      localDocs.set(filePath, next)
      return next
    },
    docSave: async (filePath) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = { ...cur, originalContent: cur.content, dirty: false, rev: cur.rev + 1 }
      localDocs.set(filePath, next)
      return next
    },
    docDiscard: async (filePath) => {
      const cur = localDocs.get(filePath)
      if (!cur) return null
      const next = { ...cur, content: cur.originalContent, dirty: false, rev: cur.rev + 1 }
      localDocs.set(filePath, next)
      return next
    },
    docReloadFromDisk: async (filePath) => {
      const next = {
        path: filePath,
        content: '',
        originalContent: '',
        dirty: false,
        rev: (localDocs.get(filePath)?.rev || 0) + 1
      }
      localDocs.set(filePath, next)
      return next
    },
    docEvict: async (filePath) => {
      localDocs.delete(filePath)
    },
    onDocApply: () => () => undefined,
    gitProbe: async () => ({ ok: false, version: null, error: 'Git not available in web stub' }),
    gitSetPath: async () => ({ ok: false, version: null, error: 'Git not available' }),
    gitFindRoot: async () => null,
    gitInit: async () => ({ ok: false, repoRoot: '', error: 'Git not available' }),
    gitEnsure: async () => ({
      ok: false,
      repoRoot: null,
      created: false,
      error: 'Git not available'
    }),
    gitStatus: async () => ({ repoRoot: null, branch: null, files: [], error: 'Git not available' }),
    gitDiff: async () => ({ ok: false, diff: '', error: 'Git not available' }),
    gitStage: async () => ({ ok: false }),
    gitUnstage: async () => ({ ok: false }),
    gitCommit: async () => ({ ok: false }),
    gitDiscard: async () => ({ ok: false }),
    confirmWindowClose: async () => undefined,
    onWindowCloseRequest: () => () => undefined,
    aiGetSettings: async () => ({
      hasApiKey: false,
      panelVisible: false,
      panelWidth: 380,
      forceReviewAllWrites: false,
      applyWritesToDisk: false
    }),
    aiSaveSettings: async (p) => p,
    aiSetKey: async () => ({ hasApiKey: false }),
    aiClearKey: async () => ({ hasApiKey: false }),
    aiListProfiles: async () => [],
    aiUpsertProfile: async () => null,
    aiDeleteProfile: async () => false,
    aiSetActiveProfile: async () => ({ profile: null, settings: {} }),
    aiSetProfileKey: async () => ({ hasKey: false, activeHasKey: false }),
    aiClearProfileKey: async () => ({ hasKey: false, activeHasKey: false }),
    aiGetActiveProfile: async () => null,
    aiListSessions: async () => [],
    aiCreateSession: async () => null,
    aiGetWorkspacePrefs: async () => ({ panelVisible: false }),
    aiSetWorkspacePrefs: async () => ({ panelVisible: false }),
    aiLoadSession: async () => null,
    aiDeleteSession: async () => true,
    aiContextUsage: async () => ({ used: 0, limit: 128000, buckets: [] }),
    aiSend: async () => ({ ok: false }),
    aiAbort: async () => true,
    aiApplyProposal: async () => null,
    aiRejectProposal: async () => null,
    aiConfirmGitOp: async () => null,
    aiRejectGitOp: async () => null,
    aiApplyAllProposals: async () => [],
    aiListSkills: async () => [],
    aiSetSkillEnabled: async () => [],
    aiRevealSkillsDir: async () => true,
    aiImportSkillFolder: async () => ({ ok: false, error: 'Not available' }),
    onAiEvent: () => () => undefined
  }
}

let platform: Platform | null = null

export function getPlatform(): Platform {
  if (!platform) {
    platform = window.kentucky ? createElectronPlatform() : createBrowserStubPlatform()
  }
  return platform
}

export function setPlatform(p: Platform): void {
  platform = p
}
