import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getDataDir, getAiKeyPath, getAiSettingsPath } from './appBodyPaths'

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

function profilesPath(): string {
  return join(getDataDir(), 'ai-profiles.json')
}

function keysDir(): string {
  const dir = join(getDataDir(), 'ai-keys')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function keyPath(id: string): string {
  return join(keysDir(), `${id}.bin`)
}

function clampContext(n: number): number {
  return Math.min(2_000_000, Math.max(4096, n))
}

function writeProfiles(data: ProfilesFile): void {
  writeFileSync(profilesPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function readProfilesRaw(): ProfilesFile | null {
  try {
    if (!existsSync(profilesPath())) return null
    const raw = JSON.parse(readFileSync(profilesPath(), 'utf-8')) as ProfilesFile
    if (!raw || !Array.isArray(raw.profiles) || !raw.profiles.length) return null
    return raw
  } catch {
    return null
  }
}

function encryptWrite(path: string, plain: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(path, safeStorage.encryptString(plain))
  } else {
    writeFileSync(path, Buffer.from(plain, 'utf-8'))
  }
}

function decryptRead(path: string): string | null {
  try {
    if (!existsSync(path)) return null
    const buf = readFileSync(path)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf)
      } catch {
        return buf.toString('utf-8')
      }
    }
    return buf.toString('utf-8')
  } catch {
    return null
  }
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
  try {
    if (existsSync(getAiSettingsPath())) {
      const s = JSON.parse(readFileSync(getAiSettingsPath(), 'utf-8')) as Record<string, unknown>
      if (typeof s.baseUrl === 'string' && s.baseUrl) baseUrl = s.baseUrl
      if (typeof s.model === 'string' && s.model) model = s.model
      if (typeof s.contextWindow === 'number') contextWindow = clampContext(s.contextWindow)
    }
  } catch {
    /* ignore */
  }

  const profile: AiProfileMeta = {
    id: 'default',
    label: 'Default',
    baseUrl,
    model,
    contextWindow
  }
  const file: ProfilesFile = { activeId: profile.id, profiles: [profile] }
  writeProfiles(file)

  const legacyKey = getAiKeyPath()
  if (existsSync(legacyKey) && !existsSync(keyPath(profile.id))) {
    try {
      const buf = readFileSync(legacyKey)
      writeFileSync(keyPath(profile.id), buf)
    } catch {
      /* ignore */
    }
  }
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
    hasKey: Boolean(decryptRead(keyPath(p.id))?.trim())
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
    hasKey: Boolean(decryptRead(keyPath(p.id))?.trim())
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
  const id = partial.id && file.profiles.some((p) => p.id === partial.id) ? partial.id : randomUUID()
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
    hasKey: Boolean(decryptRead(keyPath(id))?.trim())
  }
}

export function deleteProfile(id: string): boolean {
  const file = loadFile()
  if (file.profiles.length <= 1) return false
  if (!file.profiles.some((p) => p.id === id)) return false
  file.profiles = file.profiles.filter((p) => p.id !== id)
  if (file.activeId === id) file.activeId = file.profiles[0].id
  writeProfiles(file)
  const kp = keyPath(id)
  if (existsSync(kp)) unlinkSync(kp)
  return true
}

export function setProfileKey(id: string, plain: string): boolean {
  const file = loadFile()
  if (!file.profiles.some((p) => p.id === id)) return false
  const trimmed = plain.trim()
  const kp = keyPath(id)
  if (!trimmed) {
    if (existsSync(kp)) unlinkSync(kp)
    return true
  }
  encryptWrite(kp, trimmed)
  return true
}

export function clearProfileKey(id: string): void {
  const kp = keyPath(id)
  if (existsSync(kp)) unlinkSync(kp)
}

export function getProfileApiKey(id?: string): string | null {
  const file = loadFile()
  const pid = id || file.activeId
  const key = decryptRead(keyPath(pid))
  return key && key.trim() ? key.trim() : null
}

/** Debug / cleanup unused key files (optional). */
export function listKeyFiles(): string[] {
  try {
    return readdirSync(keysDir()).filter((f) => f.endsWith('.bin'))
  } catch {
    return []
  }
}
