import { app, nativeTheme } from 'electron'
import { DARK_BG, DARK_ELEV_3, LIGHT_BG } from '../shared/theme'
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
  return theme.themeMode === 'light' ? LIGHT_BG : DARK_BG
}

export const TITLEBAR_OVERLAY_MAIN = 30
export const TITLEBAR_OVERLAY_FLOAT = 32

/** Windows DWM caption / caption-button colors. Call before creating windows. */
export function applyNativeThemeSource(theme: SplashThemeSettings = readSplashTheme()): void {
  nativeTheme.themeSource = theme.themeMode === 'light' ? 'light' : 'dark'
}

export function titleBarOverlayFor(
  theme: SplashThemeSettings,
  isFloat: boolean
): { color: string; symbolColor: string; height: number } {
  const dark = theme.themeMode !== 'light'
  return {
    color: splashBackgroundColor(theme),
    symbolColor: dark ? '#f0f0f0' : '#111111',
    height: isFloat ? TITLEBAR_OVERLAY_FLOAT : TITLEBAR_OVERLAY_MAIN
  }
}

/** Hex accent → CSS vars for the splash window (injected from main; no reliance on stale boot-theme.js). */
export function splashThemeCssVars(theme: SplashThemeSettings): Record<string, string> {
  const accent = normalizeAccent(theme.accent)
  const dark = theme.themeMode !== 'light'
  const h = accent.replace('#', '')
  const full =
    h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.padStart(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return {
    bootTheme: dark ? 'dark' : 'light',
    '--boot-bg': dark ? DARK_BG : LIGHT_BG,
    '--boot-elev': dark ? DARK_ELEV_3 : '#eeeeee',
    '--boot-fg': dark ? '#f0f0f0' : '#111111',
    '--boot-accent': accent,
    '--boot-accent-soft': `rgba(${r}, ${g}, ${b}, 0.22)`,
    '--boot-bar-track': dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
  }
}
