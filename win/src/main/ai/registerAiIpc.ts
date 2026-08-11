import { BrowserWindow, ipcMain, dialog } from 'electron'
import {
  clearApiKey,
  hasApiKey,
  loadAiSettings,
  saveAiSettings,
  setApiKey,
  type AiPublicSettings,
  type AgentMode
} from './aiSettings'
import {
  listProfiles,
  upsertProfile,
  deleteProfile,
  setActiveProfile,
  setProfileKey,
  clearProfileKey,
  getActiveProfile,
  type AiProfileMeta
} from './aiProfiles'
import { getWorkspaceAiPrefs, setWorkspaceAiPrefs } from './aiWorkspacePrefs'
import {
  createSession,
  deleteSession,
  listSessions,
  loadSession
} from './chatSessions'
import { estimateContextBreakdown } from './contextEstimate'
import {
  abortAiForWebContents,
  applyAllPending,
  applyProposal,
  rejectProposal,
  runAgentTurn,
  type EditorContextPayload
} from './agentLoop'
import {
  listSkills,
  setSkillEnabled,
  revealSkillsDir,
  importSkillFolder,
  ensureSkillsDir
} from './skills'

function winFromEvent(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:getSettings', () => {
    const s = loadAiSettings()
    return { ...s, hasApiKey: hasApiKey() }
  })

  ipcMain.handle('ai:saveSettings', (_e, partial: Partial<AiPublicSettings>) => {
    const s = saveAiSettings(partial)
    return { ...s, hasApiKey: hasApiKey() }
  })

  ipcMain.handle('ai:setKey', (_e, key: string) => {
    setApiKey(key)
    return { hasApiKey: hasApiKey() }
  })

  ipcMain.handle('ai:clearKey', () => {
    clearApiKey()
    return { hasApiKey: false }
  })

  ipcMain.handle('ai:listProfiles', () => listProfiles())

  ipcMain.handle('ai:upsertProfile', (_e, partial: Partial<AiProfileMeta> & { id?: string }) => {
    return upsertProfile(partial)
  })

  ipcMain.handle('ai:deleteProfile', (_e, id: string) => deleteProfile(id))

  ipcMain.handle('ai:setActiveProfile', (_e, id: string) => {
    const p = setActiveProfile(id)
    const s = loadAiSettings()
    return { profile: p, settings: { ...s, hasApiKey: hasApiKey() } }
  })

  ipcMain.handle('ai:setProfileKey', (_e, id: string, key: string) => {
    setProfileKey(id, key)
    return { hasKey: Boolean(key.trim()), activeHasKey: hasApiKey() }
  })

  ipcMain.handle('ai:clearProfileKey', (_e, id: string) => {
    clearProfileKey(id)
    return { hasKey: false, activeHasKey: hasApiKey() }
  })

  ipcMain.handle('ai:getActiveProfile', () => getActiveProfile())

  ipcMain.handle('ai:listSessions', (_e, workspacePath?: string | null) =>
    listSessions(workspacePath)
  )

  ipcMain.handle('ai:createSession', (_e, workspacePath: string | null) => {
    return createSession(workspacePath)
  })

  ipcMain.handle('ai:getWorkspacePrefs', (_e, workspacePath: string | null) => {
    return getWorkspaceAiPrefs(workspacePath)
  })

  ipcMain.handle(
    'ai:setWorkspacePrefs',
    (_e, workspacePath: string, partial: { panelVisible?: boolean }) => {
      if (!workspacePath) return getWorkspaceAiPrefs(null)
      return setWorkspaceAiPrefs(workspacePath, partial)
    }
  )

  ipcMain.handle('ai:loadSession', (_e, id: string) => loadSession(id))

  ipcMain.handle('ai:deleteSession', (_e, id: string) => {
    deleteSession(id)
    return true
  })

  ipcMain.handle('ai:contextUsage', (_e, sessionId: string, mode?: AgentMode) => {
    const session = sessionId ? loadSession(sessionId) : null
    const agentMode = mode === 'ask' || mode === 'plan' || mode === 'outline' || mode === 'agent' ? mode : 'agent'
    return estimateContextBreakdown(session, agentMode)
  })

  ipcMain.handle(
    'ai:send',
    async (
      e,
      payload: {
        sessionId: string
        text: string
        editor: EditorContextPayload
        mode?: AgentMode
        planFileRel?: string | null
        turnSystemHint?: string
        skillId?: string
      }
    ) => {
      const win = winFromEvent(e)
      if (!win) return { ok: false }
      void runAgentTurn({
        win,
        sessionId: payload.sessionId,
        userText: payload.text,
        editor: payload.editor,
        mode: payload.mode,
        planFileRel: payload.planFileRel,
        turnSystemHint: payload.turnSystemHint,
        skillId: payload.skillId
      })
      return { ok: true }
    }
  )

  ipcMain.handle('ai:abort', (e) => {
    abortAiForWebContents(e.sender.id)
    return true
  })

  ipcMain.handle(
    'ai:applyProposal',
    (_e, payload: { sessionId: string; proposalId: string }) => {
      return applyProposal(payload.sessionId, payload.proposalId)
    }
  )

  ipcMain.handle(
    'ai:rejectProposal',
    (_e, payload: { sessionId: string; proposalId: string }) => {
      return rejectProposal(payload.sessionId, payload.proposalId)
    }
  )

  ipcMain.handle('ai:applyAllProposals', (_e, sessionId: string) => {
    return applyAllPending(sessionId)
  })

  ipcMain.handle('ai:listSkills', () => {
    ensureSkillsDir()
    return listSkills()
  })

  ipcMain.handle('ai:setSkillEnabled', (_e, id: string, enabled: boolean) => {
    return setSkillEnabled(id, enabled)
  })

  ipcMain.handle('ai:revealSkillsDir', () => {
    revealSkillsDir()
    return true
  })

  ipcMain.handle('ai:importSkillFolder', async (e) => {
    const win = winFromEvent(e)
    const res = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
          title: 'Import skill folder (must contain SKILL.md)'
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Import skill folder (must contain SKILL.md)'
        })
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'Cancelled' }
    return importSkillFolder(res.filePaths[0])
  })
}
