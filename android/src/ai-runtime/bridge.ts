import {
  clearApiKey, hasApiKey, loadAiSettings, saveAiSettings, setApiKey,
  type AiPublicSettings, type AgentMode
} from './aiSettings'
import {
  clearProfileKey, deleteProfile, getActiveProfile, hydrateAiProfiles, listProfiles,
  setActiveProfile, setProfileKey, upsertProfile, type AiProfileMeta
} from './aiProfiles'
import { getWorkspaceAiPrefs, setWorkspaceAiPrefs } from './aiWorkspacePrefs'
import { createSession, deleteSession, estimateSessionTokens, listSessions, loadSession } from './chatSessions'
import { abortAi, aiEvents, applyAllPending, applyProposal, rejectProposal, runAgentTurn, type EditorContextPayload } from './agentLoop'
import { setWorkspaceIo, type WorkspaceIo } from './tools'
import { ensureSkillsDir, importSkillFolder, listSkills, revealSkillsDir, setSkillEnabled } from './skills'
import { ensureReady } from './storage'

export function createAiApi(deps: { workspaceIo: WorkspaceIo }) {
  setWorkspaceIo(deps.workspaceIo)
  const initialize = async () => { await ensureReady(); await hydrateAiProfiles() }
  return {
    async aiGetSettings() { await initialize(); return { ...loadAiSettings(), hasApiKey: hasApiKey() } },
    async aiSaveSettings(partial: Partial<AiPublicSettings>) { await initialize(); return { ...saveAiSettings(partial), hasApiKey: hasApiKey() } },
    async aiSetKey(key: string) { await initialize(); await setApiKey(key); return { hasApiKey: hasApiKey() } },
    async aiClearKey() { await initialize(); await clearApiKey(); return { hasApiKey: false } },
    async aiListProfiles() { await initialize(); return listProfiles() },
    async aiUpsertProfile(partial: Partial<AiProfileMeta> & { id?: string }) { await initialize(); return upsertProfile(partial) },
    async aiDeleteProfile(id: string) { await initialize(); return deleteProfile(id) },
    async aiSetActiveProfile(id: string) { await initialize(); const profile = setActiveProfile(id); return { profile, settings: { ...loadAiSettings(), hasApiKey: hasApiKey() } } },
    async aiSetProfileKey(id: string, key: string) { await initialize(); await setProfileKey(id, key); return { hasKey: Boolean(key.trim()), activeHasKey: hasApiKey() } },
    async aiClearProfileKey(id: string) { await initialize(); await clearProfileKey(id); return { hasKey: false, activeHasKey: hasApiKey() } },
    async aiGetActiveProfile() { await initialize(); return getActiveProfile() },
    async aiListSessions(path?: string | null) { await initialize(); return listSessions(path) },
    async aiCreateSession(path: string | null) { await initialize(); return createSession(path) },
    async aiLoadSession(id: string) { await initialize(); return loadSession(id) },
    async aiDeleteSession(id: string) { await initialize(); deleteSession(id); return true },
    async aiGetWorkspacePrefs(path: string | null) { await initialize(); return getWorkspaceAiPrefs(path) },
    async aiSetWorkspacePrefs(path: string, partial: { panelVisible?: boolean }) { await initialize(); return path ? setWorkspaceAiPrefs(path, partial) : getWorkspaceAiPrefs(null) },
    async aiContextUsage(id: string) { await initialize(); const s = loadSession(id); return { used: s ? estimateSessionTokens(s) : 0, limit: loadAiSettings().contextWindow } },
    async aiSend(payload: { sessionId: string; text: string; editor: EditorContextPayload; mode?: AgentMode }) { await initialize(); void runAgentTurn({ sessionId: payload.sessionId, userText: payload.text, editor: payload.editor, mode: payload.mode }); return { ok: true } },
    async aiAbort() { abortAi(); return true },
    async aiApplyProposal(payload: { sessionId: string; proposalId: string }) { return applyProposal(payload.sessionId, payload.proposalId) },
    async aiRejectProposal(payload: { sessionId: string; proposalId: string }) { return rejectProposal(payload.sessionId, payload.proposalId) },
    async aiApplyAllProposals(id: string) { return applyAllPending(id) },
    async aiListSkills() { await initialize(); ensureSkillsDir(); return listSkills() },
    async aiSetSkillEnabled(id: string, enabled: boolean) { return setSkillEnabled(id, enabled) },
    async aiRevealSkillsDir() { return revealSkillsDir() },
    async aiImportSkillFolder(source?: Record<string, string>) { return importSkillFolder(source || '') },
    onAiEvent(channel: string, cb: (payload: unknown) => void) { return aiEvents.on(channel, cb) }
  }
}
