import { Preferences } from '@capacitor/preferences'
import { getAiProfilesPath } from './appBodyPaths'
import { cacheRead, cacheWrite, ensureReady, writeText } from './storage'

export interface AiProfileMeta {
  id: string
  label: string
  baseUrl: string
  model: string
  contextWindow: number
}

export interface AiProfilePublic extends AiProfileMeta {
  hasKey: boolean
}

interface ProfilesFile {
  activeId: string
  profiles: AiProfileMeta[]
}

const DEFAULT_PROFILE: AiProfileMeta = {
  id: 'default',
  label: 'Default',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  contextWindow: 128000
}

const profilesPath = getAiProfilesPath()
const keyCache = new Map<string, string>()
const keyKnown = new Set<string>()
let hydrated = false

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ||
    `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function clampContext(n: number): number {
  return Math.min(2_000_000, Math.max(4096, n))
}

function writeProfiles(data: ProfilesFile): void {
  const text = JSON.stringify(data, null, 2)
  cacheWrite(profilesPath, text)
  void writeText(profilesPath, text)
}

function readProfilesRaw(): ProfilesFile | null {
  try {
    const text = cacheRead(profilesPath)
    if (!text) return null
    const raw = JSON.parse(text) as ProfilesFile
    if (!raw || !Array.isArray(raw.profiles) || !raw.profiles.length) return null
    return raw
  } catch {
    return null
  }
}

export async function hydrateAiProfiles(): Promise<void> {
  if (hydrated) return
  await ensureReady()
  const existing = readProfilesRaw()
  if (existing) {
    for (const profile of existing.profiles) {
      const { value } = await Preferences.get({ key: `ai-key:${profile.id}` })
      if (value?.trim()) {
        keyCache.set(profile.id, value.trim())
        keyKnown.add(profile.id)
      }
    }
  }
  hydrated = true
}

/** Migrate legacy single key + settings into profiles store once. */
export function ensureProfilesMigrated(): ProfilesFile {
  const existing = readProfilesRaw()
  if (existing) {
    if (!existing.profiles.some((p) => p.id === existing.activeId)) {
      existing.activeId = existing.profiles[0].id
      writeProfiles(existing)
    }
    return existing
  }

  let baseUrl = DEFAULT_PROFILE.baseUrl
  let model = DEFAULT_PROFILE.model
  let contextWindow = DEFAULT_PROFILE.contextWindow
  const profile: AiProfileMeta = {
    id: 'default',
    label: 'Default',
    baseUrl,
    model,
    contextWindow
  }
  const file: ProfilesFile = { activeId: profile.id, profiles: [profile] }
  writeProfiles(file)

  return file
}

function loadFile(): ProfilesFile {
  return ensureProfilesMigrated()
}

export function listProfiles(): AiProfilePublic[] {
  const file = loadFile()
  return file.profiles.map((p) => ({
    ...p,
    contextWindow: clampContext(p.contextWindow),
    hasKey: keyKnown.has(p.id)
  }))
}

export function getActiveProfileId(): string {
  return loadFile().activeId
}

export function getActiveProfile(): AiProfilePublic {
  const file = loadFile()
  const p = file.profiles.find((x) => x.id === file.activeId) || file.profiles[0]
  return {
    ...p,
    contextWindow: clampContext(p.contextWindow),
    hasKey: keyKnown.has(p.id)
  }
}

export function setActiveProfile(id: string): AiProfilePublic | null {
  const file = loadFile()
  if (!file.profiles.some((p) => p.id === id)) return null
  file.activeId = id
  writeProfiles(file)
  return getActiveProfile()
}

export function upsertProfile(
  partial: Partial<AiProfileMeta> & { id?: string }
): AiProfilePublic {
  const file = loadFile()
  const id = partial.id && file.profiles.some((p) => p.id === partial.id) ? partial.id : uuid()
  const existing = file.profiles.find((p) => p.id === id)
  const next: AiProfileMeta = {
    id,
    label: (partial.label ?? existing?.label ?? 'Profile').trim() || 'Profile',
    baseUrl: (partial.baseUrl ?? existing?.baseUrl ?? DEFAULT_PROFILE.baseUrl).trim(),
    model: (partial.model ?? existing?.model ?? DEFAULT_PROFILE.model).trim(),
    contextWindow: clampContext(
      typeof partial.contextWindow === 'number'
        ? partial.contextWindow
        : (existing?.contextWindow ?? DEFAULT_PROFILE.contextWindow)
    )
  }
  if (existing) {
    file.profiles = file.profiles.map((p) => (p.id === id ? next : p))
  } else {
    file.profiles.push(next)
  }
  writeProfiles(file)
  return {
    ...next,
    hasKey: keyKnown.has(id)
  }
}

export function deleteProfile(id: string): boolean {
  const file = loadFile()
  if (file.profiles.length <= 1) return false
  if (!file.profiles.some((p) => p.id === id)) return false
  file.profiles = file.profiles.filter((p) => p.id !== id)
  if (file.activeId === id) file.activeId = file.profiles[0].id
  writeProfiles(file)
  keyCache.delete(id)
  keyKnown.delete(id)
  void Preferences.remove({ key: `ai-key:${id}` })
  return true
}

export async function setProfileKey(id: string, plain: string): Promise<boolean> {
  const file = loadFile()
  if (!file.profiles.some((p) => p.id === id)) return false
  const trimmed = plain.trim()
  if (!trimmed) {
    keyCache.delete(id)
    keyKnown.delete(id)
    await Preferences.remove({ key: `ai-key:${id}` })
    return true
  }
  keyCache.set(id, trimmed)
  keyKnown.add(id)
  await Preferences.set({ key: `ai-key:${id}`, value: trimmed })
  return true
}

export async function clearProfileKey(id: string): Promise<void> {
  keyCache.delete(id)
  keyKnown.delete(id)
  await Preferences.remove({ key: `ai-key:${id}` })
}

export function getProfileApiKey(id?: string): string | null {
  const file = loadFile()
  const pid = id || file.activeId
  const key = keyCache.get(pid)
  return key && key.trim() ? key.trim() : null
}

/** Debug / cleanup unused key files (optional). */
export function listKeyFiles(): string[] {
  return [...keyKnown].map((id) => `${id}.bin`)
}
