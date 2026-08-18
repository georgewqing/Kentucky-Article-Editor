import { BrowserWindow, ipcMain, dialog } from 'electron'
import { senderWorkspaceOrNull } from '../ipcSandbox'
import { sameWorkspace } from './workspacePath'
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
  confirmGitOp,
  rejectGitOp,
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

function sessionForSender(e: Electron.IpcMainInvokeEvent, id: string) {
  if (!id) return null
  const session = loadSession(id)
  if (!session) return null
  if (!sameWorkspace(session.workspacePath, senderWorkspaceOrNull(e))) return null
  return session
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

  ipcMain.handle('ai:listSessions', (e, _workspacePath?: string | null) =>
    listSessions(senderWorkspaceOrNull(e))
  )

  ipcMain.handle('ai:createSession', (e, _workspacePath: string | null) => {
    return createSession(senderWorkspaceOrNull(e))
  })

  ipcMain.handle('ai:getWorkspacePrefs', (e, _workspacePath: string | null) => {
    return getWorkspaceAiPrefs(senderWorkspaceOrNull(e))
  })

  ipcMain.handle(
    'ai:setWorkspacePrefs',
    (e, _workspacePath: string, partial: { panelVisible?: boolean }) => {
      const root = senderWorkspaceOrNull(e)
      if (!root) return getWorkspaceAiPrefs(null)
      return setWorkspaceAiPrefs(root, partial)
    }
  )

  ipcMain.handle('ai:loadSession', (e, id: string) => sessionForSender(e, id))

  ipcMain.handle('ai:deleteSession', (e, id: string) => {
    if (!sessionForSender(e, id)) return false
    deleteSession(id)
    return true
  })

  ipcMain.handle('ai:contextUsage', (e, sessionId: string, mode?: AgentMode) => {
    try {
      const session = sessionId ? sessionForSender(e, sessionId) : null
      const agentMode =
        mode === 'ask' || mode === 'plan' || mode === 'outline' || mode === 'agent' ? mode : 'agent'
      return estimateContextBreakdown(session, agentMode, senderWorkspaceOrNull(e))
    } catch {
      return { used: 0, limit: loadAiSettings().contextWindow || 128000, buckets: [] }
    }
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
        replaceUserMessageId?: string
        runId?: string
      }
    ) => {
      const win = winFromEvent(e)
      if (!win) {
        e.sender.send('ai:error', { message: 'Window not found' })
        e.sender.send('ai:done', { sessionId: payload.sessionId })
        return { ok: false }
      }
      if (payload.sessionId) {
        const session = loadSession(payload.sessionId)
        if (!session) {
          e.sender.send('ai:error', { message: 'Session not found' })
          e.sender.send('ai:done', { sessionId: payload.sessionId })
          return { ok: false }
        }
        const senderWs = senderWorkspaceOrNull(e)
        const canBind = !session.workspacePath && Boolean(senderWs)
        if (!canBind && !sameWorkspace(session.workspacePath, senderWs)) {
          e.sender.send('ai:error', {
            message: 'This chat belongs to another workspace. Start a new chat.'
          })
          e.sender.send('ai:done', { sessionId: payload.sessionId })
          return { ok: false }
        }
      }
      void runAgentTurn({
        win,
        sessionId: payload.sessionId,
        userText: payload.text,
        editor: payload.editor,
        mode: payload.mode,
        planFileRel: payload.planFileRel,
        turnSystemHint: payload.turnSystemHint,
        skillId: payload.skillId,
        replaceUserMessageId: payload.replaceUserMessageId,
        runId: payload.runId
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
    (e, payload: { sessionId: string; proposalId: string }) => {
      if (!sessionForSender(e, payload.sessionId)) return null
      return applyProposal(payload.sessionId, payload.proposalId)
    }
  )

  ipcMain.handle(
    'ai:rejectProposal',
    (e, payload: { sessionId: string; proposalId: string }) => {
      if (!sessionForSender(e, payload.sessionId)) return null
      return rejectProposal(payload.sessionId, payload.proposalId)
    }
  )

  ipcMain.handle(
    'ai:confirmGitOp',
    async (e, payload: { sessionId: string; opId: string }) => {
      if (!sessionForSender(e, payload.sessionId)) return null
      return confirmGitOp(payload.sessionId, payload.opId)
    }
  )

  ipcMain.handle(
    'ai:rejectGitOp',
    (e, payload: { sessionId: string; opId: string }) => {
      if (!sessionForSender(e, payload.sessionId)) return null
      return rejectGitOp(payload.sessionId, payload.opId)
    }
  )

  ipcMain.handle('ai:applyAllProposals', (e, sessionId: string) => {
    if (!sessionForSender(e, sessionId)) return []
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
