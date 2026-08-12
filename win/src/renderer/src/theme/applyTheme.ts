export type ThemeMode = 'dark' | 'light'

export const DEFAULT_ACCENT = '#88c0d0'
export const ACCENT_PRESETS = [
  '#88c0d0', // nord frost (default, Cursor-ish)
  '#82aaff', // soft blue
  '#c792ea', // soft purple
  '#c3e88d', // soft green
  '#ffcb6b', // soft amber
  '#f07178', // soft rose
  '#89ddff', // cyan
  '#ffffff' // high contrast accent on dark
] as const

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let T = t
    if (T < 0) T += 1
    if (T > 1) T -= 1
    if (T < 1 / 6) return p + (q - p) * 6 * T
    if (T < 1 / 2) return q
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255
  }
}

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t)
}

function adjustLightness(hex: string, delta: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const rgb = hslToRgb(h, s, clamp(l + delta))
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

function normalizeAccent(accent: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) return accent
  if (/^#[0-9a-fA-F]{3}$/.test(accent)) {
    const h = accent.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  }
  return DEFAULT_ACCENT
}

/**
 * Theme-tinted solid for context meter buckets.
 * `strength` 0 = pale/weak, 1 = vivid/deep — same hue, different weight.
 */
export function accentTone(accent: string, strength: number, mode: ThemeMode = 'dark'): string {
  const safe = normalizeAccent(accent)
  const { r, g, b } = hexToRgb(safe)
  let { h, s, l } = rgbToHsl(r, g, b)
  // Near-gray accents (e.g. white) have no usable hue — borrow a cool cyan carrier.
  if (s < 0.08) {
    h = 195 / 360
    s = 0.4
    l = mode === 'dark' ? 0.72 : 0.45
  }
  const t = clamp(strength)
  if (mode === 'dark') {
    const outS = clamp(0.26 + t * 0.5)
    const outL = clamp(0.72 - t * 0.36)
    const rgb = hslToRgb(h, outS, outL)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  const outS = clamp(0.32 + t * 0.42)
  const outL = clamp(0.62 - t * 0.28)
  const rgb = hslToRgb(h, outS, outL)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

/** Context-usage bucket strength ramp (system → conversation). */
export const CONTEXT_BUCKET_STRENGTH: Record<string, number> = {
  system: 0.12,
  tools: 0.32,
  skills: 0.5,
  rules: 0.68,
  conversation: 0.88
}

export function applyTheme(mode: ThemeMode, accent: string): void {
  const root = document.documentElement
  const safeAccent = normalizeAccent(accent)

  const isDark = mode === 'dark'
  const base = isDark ? '#141414' : '#f3f3f3'
  const elev1 = isDark ? '#1a1a1a' : '#fafafa'
  const elev2 = isDark ? '#1e1e1e' : '#ffffff'
  const elev3 = isDark ? '#242424' : '#eeeeee'
  const elev4 = isDark ? '#2a2a2a' : '#e4e4e4'
  const fg = isDark ? '#d4d4d4' : '#2c2c2c'
  const fgMuted = isDark ? '#8b8b8b' : '#6e6e6e'
  const fgBright = isDark ? '#f0f0f0' : '#111111'
  const border = isDark ? withAlpha('#ffffff', 0.06) : withAlpha('#000000', 0.08)
  const borderSubtle = isDark ? withAlpha('#ffffff', 0.04) : withAlpha('#000000', 0.05)
  const hover = isDark ? withAlpha('#ffffff', 0.05) : withAlpha('#000000', 0.05)
  const selection = withAlpha(safeAccent, isDark ? 0.22 : 0.18)
  const accentHover = adjustLightness(safeAccent, isDark ? 0.08 : -0.08)
  const statusBg = isDark ? mix(base, safeAccent, 0.06) : mix(elev2, safeAccent, 0.08)

  root.dataset.theme = mode
  root.style.setProperty('--bg', base)
  root.style.setProperty('--bg-elev-1', elev1)
  root.style.setProperty('--bg-elev-2', elev2)
  root.style.setProperty('--bg-elev-3', elev3)
  root.style.setProperty('--bg-elev-4', elev4)
  root.style.setProperty('--bg-sidebar', elev1)
  root.style.setProperty('--bg-activity', elev1)
  root.style.setProperty('--bg-editor', elev2)
  root.style.setProperty('--bg-tab', elev1)
  root.style.setProperty('--bg-tab-active', elev2)
  root.style.setProperty('--bg-hover', hover)
  root.style.setProperty('--bg-input', elev3)
  root.style.setProperty('--bg-status', statusBg)
  root.style.setProperty('--bg-welcome', base)
  root.style.setProperty('--bg-selection', selection)
  root.style.setProperty('--border', border)
  root.style.setProperty('--border-subtle', borderSubtle)
  root.style.setProperty('--fg', fg)
  root.style.setProperty('--fg-muted', fgMuted)
  root.style.setProperty('--fg-bright', fgBright)
  root.style.setProperty('--accent', safeAccent)
  root.style.setProperty('--accent-hover', accentHover)
  root.style.setProperty('--accent-soft', withAlpha(safeAccent, 0.15))
  root.style.setProperty('--danger', isDark ? '#f14c4c' : '#c42b2b')
  root.style.setProperty('--dirty', isDark ? '#e2c08d' : '#9a7b2f')
  root.style.setProperty('--status-fg', fg)
  root.style.colorScheme = mode
}
