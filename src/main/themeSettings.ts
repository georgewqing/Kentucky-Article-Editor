import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

export type SplashThemeMode = 'dark' | 'light'

export interface SplashThemeSettings {
  themeMode: SplashThemeMode
  accent: string
}

const DEFAULT: SplashThemeSettings = {
  themeMode: 'dark',
  accent: '#88c0d0'
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'kentucky-theme.json')
}

function normalizeAccent(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT.accent
  const a = raw.trim()
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(a)) return a
  return DEFAULT.accent
}

export function readSplashTheme(): SplashThemeSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SplashThemeSettings>
    return {
      themeMode: parsed.themeMode === 'light' ? 'light' : 'dark',
      accent: normalizeAccent(parsed.accent)
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function writeSplashTheme(partial: Partial<SplashThemeSettings>): SplashThemeSettings {
  const current = readSplashTheme()
  const next: SplashThemeSettings = {
    themeMode: partial.themeMode === 'light' ? 'light' : partial.themeMode === 'dark' ? 'dark' : current.themeMode,
    accent: partial.accent !== undefined ? normalizeAccent(partial.accent) : current.accent
  }
  try {
    writeFileSync(settingsPath(), JSON.stringify(next), 'utf8')
  } catch {
    /* ignore disk errors — splash falls back to defaults */
  }
  return next
}

export function splashBackgroundColor(theme: SplashThemeSettings): string {
  return theme.themeMode === 'light' ? '#f3f3f3' : '#141414'
}
