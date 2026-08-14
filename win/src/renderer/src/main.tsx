import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/i18n'
import '@/editors/monacoSetup'
import '@/styles/global.css'
import '@/styles/storyboard-nle.css'
import '@/styles/storyboard-pages.css'
import { useSettingsStore } from '@/state/settingsStore'
import App from './App'

/** Keep splash glow/bar in sync with applyTheme CSS variables. */
function syncBootSplashFromTheme(): void {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  const cs = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim()
    return v || fallback
  }
  const root = document.documentElement
  root.style.setProperty('--boot-bg', pick('--bg-welcome', pick('--bg', '#0A0A0A')))
  root.style.setProperty('--boot-elev', pick('--bg-elev-3', '#1C1C1C'))
  root.style.setProperty('--boot-fg', pick('--fg-bright', '#f0f0f0'))
  root.style.setProperty('--boot-accent', pick('--accent', '#88c0d0'))
  root.style.setProperty('--boot-accent-soft', pick('--accent-soft', 'rgba(136, 192, 208, 0.15)'))
  const dark = document.documentElement.dataset.theme !== 'light'
  root.style.setProperty(
    '--boot-bar-track',
    dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
  )
}

// Apply persisted theme before first paint
useSettingsStore.getState().hydrate()
syncBootSplashFromTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
