import { contextBridge, ipcRenderer } from 'electron'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface WindowBootstrap {
  role: 'main' | 'float'
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

const api = {
  openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  openImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  openImages: (): Promise<string[]> => ipcRenderer.invoke('dialog:openImages'),
  openContextFiles: (workspacePath?: string | null): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openContextFiles', workspacePath),
  readDir: (dirPath: string): Promise<FileEntry[]> => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  mkdir: (dirPath: string): Promise<boolean> => ipcRenderer.invoke('fs:mkdir', dirPath),
  rename: (oldPath: string, newPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  delete: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:delete', targetPath),
  exists: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', targetPath),
  copyFile: (src: string, dest: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:copyFile', src, dest),
  toMediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:toMediaUrl', filePath),
  showItemInFolder: (targetPath: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:openExternal', url),
  setMenuLocale: (locale: 'zh-CN' | 'en'): Promise<boolean> =>
    ipcRenderer.invoke('app:setMenuLocale', locale),
  getOsPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getOsPlatform'),
  persistTheme: (payload: { themeMode?: 'dark' | 'light'; accent?: string }): Promise<boolean> =>
    ipcRenderer.invoke('theme:persist', payload),
  runMenuAction: (action: string): Promise<boolean> => ipcRenderer.invoke('menu:runAction', action),

  getWindowBootstrap: (): Promise<WindowBootstrap> => ipcRenderer.invoke('window:getBootstrap'),
  reportWorkspace: (workspacePath: string | null): Promise<boolean> =>
    ipcRenderer.invoke('window:reportWorkspace', workspacePath),
  newMainWindow: (workspacePath?: string | null): Promise<boolean> =>
    ipcRenderer.invoke('window:newMain', { workspacePath }),
  newFloatWindow: (payload: {
    filePath: string
    workspacePath: string
    content: string
    originalContent: string
    dirty: boolean
  }): Promise<boolean> => ipcRenderer.invoke('window:newFloat', payload),

  docOpen: (filePath: string): Promise<DocSnapshot | null> => ipcRenderer.invoke('doc:open', filePath),
  docSubscribe: (filePath: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:subscribe', filePath),
  docUnsubscribe: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('doc:unsubscribe', filePath),
  docPatch: (filePath: string, content: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:patch', filePath, content),
  docSave: (filePath: string): Promise<DocSnapshot | null> => ipcRenderer.invoke('doc:save', filePath),
  docDiscard: (filePath: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:discard', filePath),
  docReloadFromDisk: (filePath: string): Promise<DocSnapshot | null> =>
    ipcRenderer.invoke('doc:reloadFromDisk', filePath),
  docEvict: (filePath: string): Promise<boolean> => ipcRenderer.invoke('doc:evict', filePath),

  gitProbe: (): Promise<{ ok: boolean; version: string | null; error: string | null }> =>
    ipcRenderer.invoke('git:probe'),
  gitSetPath: (gitPath: string | null): Promise<{ ok: boolean; version: string | null; error: string | null }> =>
    ipcRenderer.invoke('git:setPath', gitPath),
  gitFindRoot: (workspaceRoot: string): Promise<string | null> =>
    ipcRenderer.invoke('git:findRoot', workspaceRoot),
  gitInit: (workspaceRoot: string): Promise<{ ok: boolean; repoRoot: string; error?: string }> =>
    ipcRenderer.invoke('git:init', workspaceRoot),
  gitEnsure: (
    workspaceRoot: string
  ): Promise<{ ok: boolean; repoRoot: string | null; created: boolean; error?: string }> =>
    ipcRenderer.invoke('git:ensure', workspaceRoot),
  gitStatus: (workspaceRoot: string): Promise<unknown> =>
    ipcRenderer.invoke('git:status', workspaceRoot),
  gitDiff: (workspaceRoot: string, path: string, staged?: boolean): Promise<unknown> =>
    ipcRenderer.invoke('git:diff', workspaceRoot, path, staged),
  gitStage: (workspaceRoot: string, paths: string[]): Promise<unknown> =>
    ipcRenderer.invoke('git:stage', workspaceRoot, paths),
  gitUnstage: (workspaceRoot: string, paths: string[]): Promise<unknown> =>
    ipcRenderer.invoke('git:unstage', workspaceRoot, paths),
  gitCommit: (workspaceRoot: string, message: string): Promise<unknown> =>
    ipcRenderer.invoke('git:commit', workspaceRoot, message),
  gitDiscard: (
    workspaceRoot: string,
    absPath: string,
    opts?: { untrackedConfirmed?: boolean }
  ): Promise<unknown> => ipcRenderer.invoke('git:discard', workspaceRoot, absPath, opts),

  confirmWindowClose: (): Promise<boolean> => ipcRenderer.invoke('window:confirmClose'),
  onWindowCloseRequest: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('window:close-request', handler)
    return () => ipcRenderer.removeListener('window:close-request', handler)
  },

  onMenuOpenFolder: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:openFolder', handler)
    return () => ipcRenderer.removeListener('menu:openFolder', handler)
  },
  onMenuSave: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  },
  onMenuNewWindow: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:newWindow', handler)
    return () => ipcRenderer.removeListener('menu:newWindow', handler)
  },
  onMenuNewMainWindow: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('menu:newMainWindow', handler)
    return () => ipcRenderer.removeListener('menu:newMainWindow', handler)
  },
  onDocApply: (cb: (snap: DocSnapshot) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, snap: DocSnapshot): void => cb(snap)
    ipcRenderer.on('doc:apply', handler)
    return () => ipcRenderer.removeListener('doc:apply', handler)
  },

  // —— AI ——
  aiGetSettings: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('ai:getSettings'),
  aiSaveSettings: (partial: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('ai:saveSettings', partial),
  aiSetKey: (key: string): Promise<{ hasApiKey: boolean }> => ipcRenderer.invoke('ai:setKey', key),
  aiClearKey: (): Promise<{ hasApiKey: boolean }> => ipcRenderer.invoke('ai:clearKey'),
  aiListProfiles: (): Promise<unknown[]> => ipcRenderer.invoke('ai:listProfiles'),
  aiUpsertProfile: (partial: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('ai:upsertProfile', partial),
  aiDeleteProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('ai:deleteProfile', id),
  aiSetActiveProfile: (
    id: string
  ): Promise<{ profile: unknown; settings: Record<string, unknown> }> =>
    ipcRenderer.invoke('ai:setActiveProfile', id),
  aiSetProfileKey: (
    id: string,
    key: string
  ): Promise<{ hasKey: boolean; activeHasKey: boolean }> =>
    ipcRenderer.invoke('ai:setProfileKey', id, key),
  aiClearProfileKey: (id: string): Promise<{ hasKey: boolean; activeHasKey: boolean }> =>
    ipcRenderer.invoke('ai:clearProfileKey', id),
  aiGetActiveProfile: (): Promise<unknown> => ipcRenderer.invoke('ai:getActiveProfile'),
  aiListSessions: (workspacePath?: string | null): Promise<unknown[]> =>
    ipcRenderer.invoke('ai:listSessions', workspacePath),
  aiCreateSession: (workspacePath: string | null): Promise<unknown> =>
    ipcRenderer.invoke('ai:createSession', workspacePath),
  aiGetWorkspacePrefs: (
    workspacePath: string | null
  ): Promise<{ panelVisible: boolean }> =>
    ipcRenderer.invoke('ai:getWorkspacePrefs', workspacePath),
  aiSetWorkspacePrefs: (
    workspacePath: string,
    partial: { panelVisible?: boolean }
  ): Promise<{ panelVisible: boolean }> =>
    ipcRenderer.invoke('ai:setWorkspacePrefs', workspacePath, partial),
  aiLoadSession: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:loadSession', id),
  aiDeleteSession: (id: string): Promise<boolean> => ipcRenderer.invoke('ai:deleteSession', id),
  aiContextUsage: (
    sessionId: string,
    mode?: string
  ): Promise<{
    used: number
    limit: number
    buckets: Array<{ id: string; tokens: number }>
  }> => ipcRenderer.invoke('ai:contextUsage', sessionId, mode),
  aiSend: (payload: {
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
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('ai:send', payload),
  aiAbort: (): Promise<boolean> => ipcRenderer.invoke('ai:abort'),
  aiApplyProposal: (payload: {
    sessionId: string
    proposalId: string
  }): Promise<unknown> => ipcRenderer.invoke('ai:applyProposal', payload),
  aiRejectProposal: (payload: {
    sessionId: string
    proposalId: string
  }): Promise<unknown> => ipcRenderer.invoke('ai:rejectProposal', payload),
  aiConfirmGitOp: (payload: {
    sessionId: string
    opId: string
  }): Promise<unknown> => ipcRenderer.invoke('ai:confirmGitOp', payload),
  aiRejectGitOp: (payload: {
    sessionId: string
    opId: string
  }): Promise<unknown> => ipcRenderer.invoke('ai:rejectGitOp', payload),
  aiApplyAllProposals: (sessionId: string): Promise<unknown[]> =>
    ipcRenderer.invoke('ai:applyAllProposals', sessionId),
  aiListSkills: (): Promise<unknown[]> => ipcRenderer.invoke('ai:listSkills'),
  aiSetSkillEnabled: (id: string, enabled: boolean): Promise<unknown[]> =>
    ipcRenderer.invoke('ai:setSkillEnabled', id, enabled),
  aiRevealSkillsDir: (): Promise<boolean> => ipcRenderer.invoke('ai:revealSkillsDir'),
  aiImportSkillFolder: (): Promise<{ ok: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('ai:importSkillFolder'),
  onAiEvent: (channel: string, cb: (payload: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('kentucky', api)

export type KentuckyAPI = typeof api
