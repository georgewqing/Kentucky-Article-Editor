import { create } from 'zustand'
import {
  applyTheme,
  DEFAULT_ACCENT,
  type ThemeMode
} from '@/theme/applyTheme'

const SETTINGS_KEY = 'kentucky.settings'

export interface AppSettings {
  themeMode: ThemeMode
  accent: string
  fontSize: number
}

interface SettingsState extends AppSettings {
  hydrated: boolean
  setThemeMode: (mode: ThemeMode) => void
  setAccent: (accent: string) => void
  setFontSize: (n: number) => void
  hydrate: () => void
}

function persist(partial: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(partial))
}

function readStored(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      return { themeMode: 'dark', accent: DEFAULT_ACCENT, fontSize: 14 }
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      themeMode: parsed.themeMode === 'light' ? 'light' : 'dark',
      accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULT_ACCENT,
      fontSize:
        typeof parsed.fontSize === 'number'
          ? Math.min(24, Math.max(11, parsed.fontSize))
          : 14
    }
  } catch {
    return { themeMode: 'dark', accent: DEFAULT_ACCENT, fontSize: 14 }
  }
}

function snapshot(s: SettingsState): AppSettings {
  return {
    themeMode: s.themeMode,
    accent: s.accent,
    fontSize: s.fontSize
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeMode: 'dark',
  accent: DEFAULT_ACCENT,
  fontSize: 14,
  hydrated: false,

  hydrate: () => {
    const stored = readStored()
    applyTheme(stored.themeMode, stored.accent)
    set({ ...stored, hydrated: true })
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
    persist(snapshot(get()))
  }
}))
