import { getAiSettingsPath } from './appBodyPaths'
import { cacheRead, cacheWrite, writeText } from './storage'
import {
  ensureProfilesMigrated,
  getActiveProfile,
  getProfileApiKey,
  setProfileKey,
  clearProfileKey,
  getActiveProfileId,
  upsertProfile,
  setActiveProfile
} from './aiProfiles'

export type AgentMode = 'ask' | 'plan' | 'outline' | 'agent'

export type WebSearchProvider = 'duckduckgo' | 'bing' | 'brave' | 'tavily'

export interface AiPublicSettings {
  baseUrl: string
  model: string
  contextWindow: number
  agentEnabled: boolean
  applyWritesToDisk: boolean
  /** When true, never auto-apply (overrides G3 auto kinds). */
  forceReviewAllWrites: boolean
  temperature: number
  styleMemo: string
  panelWidth: number
  panelVisible: boolean
  /** Composer mode */
  agentMode: AgentMode
  activeProfileId: string
  /** Web search master switch (default off). */
  webSearchEnabled: boolean
  webSearchProvider: WebSearchProvider
  webSearchMaxResults: number
  /**
   * Enabled skill folder ids. `null` = all skills enabled.
   * Empty array = none enabled.
   */
  enabledSkillIds: string[] | null
}

const DEFAULTS: Omit<AiPublicSettings, 'baseUrl' | 'model' | 'contextWindow' | 'activeProfileId'> & {
  baseUrl: string
  model: string
  contextWindow: number
} = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  contextWindow: 128000,
  agentEnabled: true,
  applyWritesToDisk: false,
  forceReviewAllWrites: false,
  temperature: 0.7,
  styleMemo: '',
  panelWidth: 380,
  panelVisible: false,
  agentMode: 'agent',
  webSearchEnabled: false,
  webSearchProvider: 'duckduckgo',
  webSearchMaxResults: 5,
  enabledSkillIds: null
}

function loadGlobalRaw(): Partial<AiPublicSettings> {
  try {
    const value = cacheRead(getAiSettingsPath())
    return value ? (JSON.parse(value) as Partial<AiPublicSettings>) : {}
  } catch {
    return {}
  }
}

function writeGlobal(partial: Record<string, unknown>): void {
  const cur = loadGlobalRaw()
  const next = { ...cur, ...partial }
  // Keep file lean: profile-owned fields still written for backward compat / migration
  const text = JSON.stringify(next, null, 2)
  cacheWrite(getAiSettingsPath(), text)
  void writeText(getAiSettingsPath(), text)
}

export function loadAiSettings(): AiPublicSettings {
  ensureProfilesMigrated()
  const raw = loadGlobalRaw()
  const profile = getActiveProfile()
  const mode = raw.agentMode
  const agentMode: AgentMode =
    mode === 'ask' || mode === 'plan' || mode === 'outline' || mode === 'agent' ? mode : 'agent'
  const providerRaw = raw.webSearchProvider
  const webSearchProvider: WebSearchProvider =
    providerRaw === 'brave' ||
    providerRaw === 'tavily' ||
    providerRaw === 'duckduckgo' ||
    providerRaw === 'bing'
      ? providerRaw
      : 'duckduckgo'
  let enabledSkillIds: string[] | null = null
  if (Array.isArray(raw.enabledSkillIds)) {
    enabledSkillIds = raw.enabledSkillIds.map(String)
  } else if (raw.enabledSkillIds === null) {
    enabledSkillIds = null
  }
  return {
    baseUrl: profile.baseUrl,
    model: profile.model,
    contextWindow: profile.contextWindow,
    agentEnabled: raw.agentEnabled !== false,
    applyWritesToDisk: Boolean(raw.applyWritesToDisk),
    forceReviewAllWrites: Boolean(raw.forceReviewAllWrites),
    temperature:
      typeof raw.temperature === 'number'
        ? Math.min(2, Math.max(0, raw.temperature))
        : DEFAULTS.temperature,
    styleMemo: typeof raw.styleMemo === 'string' ? raw.styleMemo : '',
    panelWidth:
      typeof raw.panelWidth === 'number'
        ? Math.min(640, Math.max(280, raw.panelWidth))
        : DEFAULTS.panelWidth,
    panelVisible: Boolean(raw.panelVisible),
    agentMode,
    activeProfileId: profile.id,
    webSearchEnabled: Boolean(raw.webSearchEnabled),
    webSearchProvider,
    webSearchMaxResults:
      typeof raw.webSearchMaxResults === 'number'
        ? Math.min(10, Math.max(1, raw.webSearchMaxResults))
        : DEFAULTS.webSearchMaxResults,
    enabledSkillIds
  }
}

export function saveAiSettings(partial: Partial<AiPublicSettings>): AiPublicSettings {
  ensureProfilesMigrated()
  const globalKeys: (keyof AiPublicSettings)[] = [
    'agentEnabled',
    'applyWritesToDisk',
    'forceReviewAllWrites',
    'temperature',
    'styleMemo',
    'panelWidth',
    'panelVisible',
    'agentMode',
    'webSearchEnabled',
    'webSearchProvider',
    'webSearchMaxResults',
    'enabledSkillIds'
  ]
  const globalPatch: Record<string, unknown> = {}
  for (const k of globalKeys) {
    if (partial[k] !== undefined) globalPatch[k] = partial[k]
  }
  if (Object.keys(globalPatch).length) writeGlobal(globalPatch)

  // Profile-owned fields update the active profile
  if (
    partial.baseUrl !== undefined ||
    partial.model !== undefined ||
    partial.contextWindow !== undefined
  ) {
    const active = getActiveProfile()
    upsertProfile({
      id: active.id,
      label: active.label,
      baseUrl: partial.baseUrl ?? active.baseUrl,
      model: partial.model ?? active.model,
      contextWindow: partial.contextWindow ?? active.contextWindow
    })
  }

  if (partial.activeProfileId) {
    setActiveProfile(partial.activeProfileId)
  }

  return loadAiSettings()
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey()?.trim())
}

export async function setApiKey(plain: string): Promise<boolean> {
  ensureProfilesMigrated()
  return setProfileKey(getActiveProfileId(), plain)
}

export async function clearApiKey(): Promise<void> {
  ensureProfilesMigrated()
  await clearProfileKey(getActiveProfileId())
}

export function getApiKey(): string | null {
  ensureProfilesMigrated()
  return getProfileApiKey()
}
