import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

/**
 * App body root: next to the packaged exe (portable), or win/dev-data in development.
 * Never use app.getPath('userData') for AI chats/settings (often on C:).
 */
export function getAppBodyRoot(): string {
  if (!app.isPackaged) {
    // electron-vite: __dirname is out/main → ../../dev-data under win/
    return join(__dirname, '../../dev-data')
  }
  return dirname(process.execPath)
}

export function getDataDir(): string {
  const dir = join(getAppBodyRoot(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getAiChatsDir(): string {
  const dir = join(getDataDir(), 'ai-chats')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
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
  const dir = join(getDataDir(), 'ai-keys')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getAiWorkspacePrefsPath(): string {
  return join(getDataDir(), 'ai-workspace-prefs.json')
}

/** Global Cursor-style agent skills: data/ai-skills/<id>/SKILL.md */
export function getAiSkillsDir(): string {
  const dir = join(getDataDir(), 'ai-skills')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Reserved for Brave/Tavily API keys (not used by DuckDuckGo). */
export function getAiSearchKeysDir(): string {
  const dir = join(getDataDir(), 'ai-search-keys')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
