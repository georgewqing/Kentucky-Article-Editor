import { create } from 'zustand'
import {
  applyTheme,
  DEFAULT_ACCENT,
  type ThemeMode
} from '@/theme/applyTheme'
import { getPlatform } from '@/platform'

const SETTINGS_KEY = 'kentucky.settings'
const SETTINGS_VERSION = 2
const DEFAULT_UI_SCALE = 1

function clampUiScale(value: number): number {
  return Math.round(Math.min(1.3, Math.max(0.9, value)) * 100) / 100
}

function applyUiScale(value: number): void {
  document.documentElement.style.setProperty('--ui-scale', clampUiScale(value).toString())
}

export interface AppSettings {
  settingsVersion: number
  themeMode: ThemeMode
  accent: string
  fontSize: number
  uiScale: number
}

interface SettingsState extends AppSettings {
  hydrated: boolean
  setThemeMode: (mode: ThemeMode) => void
  setAccent: (accent: string) => void
  setFontSize: (n: number) => void
  setUiScale: (n: number) => void
  hydrate: () => void
}

function persistLocal(partial: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(partial))
}

/** Mirror theme into main-process userData for the startup splash window. */
function syncSplashTheme(partial: AppSettings): void {
  try {
    void getPlatform().persistTheme({
      themeMode: partial.themeMode,
      accent: partial.accent
    })
  } catch {
    /* browser stub / preload not ready */
  }
}

function persist(partial: AppSettings): void {
  persistLocal(partial)
  syncSplashTheme(partial)
}

function readStored(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      return {
        settingsVersion: SETTINGS_VERSION,
        themeMode: 'dark',
        accent: DEFAULT_ACCENT,
        fontSize: 14,
        uiScale: DEFAULT_UI_SCALE
      }
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      settingsVersion: SETTINGS_VERSION,
      themeMode: parsed.themeMode === 'light' ? 'light' : 'dark',
      accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULT_ACCENT,
      fontSize:
        typeof parsed.fontSize === 'number'
          ? Math.min(24, Math.max(11, parsed.fontSize))
          : 14,
      uiScale:
        typeof parsed.uiScale === 'number'
          ? clampUiScale(parsed.uiScale)
          : DEFAULT_UI_SCALE
    }
  } catch {
    return {
      settingsVersion: SETTINGS_VERSION,
      themeMode: 'dark',
      accent: DEFAULT_ACCENT,
      fontSize: 14,
      uiScale: DEFAULT_UI_SCALE
    }
  }
}

function snapshot(s: SettingsState): AppSettings {
  return {
    settingsVersion: SETTINGS_VERSION,
    themeMode: s.themeMode,
    accent: s.accent,
    fontSize: s.fontSize,
    uiScale: s.uiScale
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settingsVersion: SETTINGS_VERSION,
  themeMode: 'dark',
  accent: DEFAULT_ACCENT,
  fontSize: 14,
  uiScale: DEFAULT_UI_SCALE,
  hydrated: false,

  hydrate: () => {
    const stored = readStored()
    applyTheme(stored.themeMode, stored.accent)
    applyUiScale(stored.uiScale)
    set({ ...stored, hydrated: true })
    persistLocal(stored)
    // Migrate existing localStorage theme so next cold-start splash matches.
    syncSplashTheme(stored)
  },

  setThemeMode: (themeMode) => {
    set({ themeMode })
    const next = snapshot(get())
    persist(next)
    applyTheme(next.themeMode, next.accent)
  },

  setAccent: (accent) => {
    set({ accent })
    const next = snapshot(get())
    persist(next)
    applyTheme(next.themeMode, next.accent)
  },

  setFontSize: (n) => {
    const fontSize = Math.min(24, Math.max(11, n))
    set({ fontSize })
    persistLocal(snapshot(get()))
  },

  setUiScale: (n) => {
    const uiScale = clampUiScale(n)
    set({ uiScale })
    applyUiScale(uiScale)
    persistLocal(snapshot(get()))
  }
}))
