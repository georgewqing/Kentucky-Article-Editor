import { join } from './pathUtil'

export function getAppBodyRoot(): string {
  return 'kentucky-data'
}

export function getDataDir(): string {
  return join(getAppBodyRoot(), 'data')
}

export function getAiChatsDir(): string {
  return join(getDataDir(), 'ai-chats')
}

export function getAiSettingsPath(): string {
  return join(getDataDir(), 'ai-settings.json')
}

export function getAiKeyPath(): string {
  return join(getDataDir(), 'ai-key.bin')
}

export function getAiProfilesPath(): string {
  return join(getDataDir(), 'ai-profiles.json')
}

export function getAiKeysDir(): string {
  return join(getDataDir(), 'ai-keys')
}

export function getAiWorkspacePrefsPath(): string {
  return join(getDataDir(), 'ai-workspace-prefs.json')
}

/** Global Cursor-style agent skills: data/ai-skills/<id>/SKILL.md */
export function getAiSkillsDir(): string {
  return join(getDataDir(), 'ai-skills')
}

/** Reserved for Brave/Tavily API keys (not used by DuckDuckGo). */
export function getAiSearchKeysDir(): string {
  return join(getDataDir(), 'ai-search-keys')
}
