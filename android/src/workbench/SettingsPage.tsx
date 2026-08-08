import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/state/settingsStore'
import { ACCENT_PRESETS } from '@/theme/applyTheme'
import i18n, { setStoredLocale, type AppLocale } from '@/i18n'

export function SettingsPage() {
  const { t } = useTranslation()
  const themeMode = useSettingsStore((s) => s.themeMode)
  const accent = useSettingsStore((s) => s.accent)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const setAccent = useSettingsStore((s) => s.setAccent)
  const setFontSize = useSettingsStore((s) => s.setFontSize)

  const setLang = (locale: AppLocale) => {
    setStoredLocale(locale)
    void i18n.changeLanguage(locale)
  }

  return (
    <div className="settings-page">
      <h1>{t('settings.title')}</h1>
      <p className="settings-desc">{t('settings.desc')}</p>

      <section className="settings-section">
        <h2>{t('settings.appearance')}</h2>
        <div className="settings-row">
          <label>{t('settings.theme')}</label>
          <div className="theme-toggle">
            <button
              type="button"
              className={themeMode === 'dark' ? 'active' : ''}
              onClick={() => setThemeMode('dark')}
            >
              {t('settings.dark')}
            </button>
            <button
              type="button"
              className={themeMode === 'light' ? 'active' : ''}
              onClick={() => setThemeMode('light')}
            >
              {t('settings.light')}
            </button>
          </div>
        </div>

        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <label>{t('settings.accent')}</label>
          <div className="accent-presets">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`accent-swatch ${accent.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                style={{ background: c === '#ffffff' ? '#ddd' : c }}
                title={c}
                onClick={() => setAccent(c)}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#88c0d0'}
              onChange={(e) => setAccent(e.target.value)}
              title={t('settings.customAccent')}
            />
          </div>
        </div>

        <div className="settings-row">
          <label>{t('settings.fontSize')}</label>
          <div className="font-stepper">
            <button type="button" onClick={() => setFontSize(fontSize - 1)}>
              −
            </button>
            <span>{fontSize}px</span>
            <button type="button" onClick={() => setFontSize(fontSize + 1)}>
              +
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('settings.language')}</h2>
        <div className="settings-row">
          <label>{t('status.language')}</label>
          <div className="theme-toggle">
            <button
              type="button"
              className={i18n.language === 'zh-CN' ? 'active' : ''}
              onClick={() => setLang('zh-CN')}
            >
              中文
            </button>
            <button
              type="button"
              className={i18n.language === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
