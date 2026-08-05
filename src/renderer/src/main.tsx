import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/i18n'
import '@/editors/monacoSetup'
import '@/styles/global.css'
import { useSettingsStore } from '@/state/settingsStore'
import App from './App'

// Apply persisted theme before first paint
useSettingsStore.getState().hydrate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
