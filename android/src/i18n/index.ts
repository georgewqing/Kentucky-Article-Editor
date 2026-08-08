import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const LANG_KEY = 'kentucky.locale'

export type AppLocale = 'en' | 'zh-CN'

export function getStoredLocale(): AppLocale {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'en' || stored === 'zh-CN') return stored
  const nav = navigator.language.toLowerCase()
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

export function setStoredLocale(locale: AppLocale): void {
  localStorage.setItem(LANG_KEY, locale)
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN }
  },
  lng: getStoredLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
