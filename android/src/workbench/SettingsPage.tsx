import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/state/settingsStore'
import { useAiStore, type AiProfileView, type AiSkillView } from '@/state/aiStore'
import { ACCENT_PRESETS } from '@/theme/applyTheme'
import i18n, { setStoredLocale, type AppLocale } from '@/i18n'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'

export function SettingsPage() {
  const { t } = useTranslation()
  const pageRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(pageRef)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const accent = useSettingsStore((s) => s.accent)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const uiScale = useSettingsStore((s) => s.uiScale)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const setAccent = useSettingsStore((s) => s.setAccent)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const setUiScale = useSettingsStore((s) => s.setUiScale)
  const ai = useAiStore((s) => s.settings)
  const profiles = useAiStore((s) => s.profiles)
  const hydrateAi = useAiStore((s) => s.hydrate)
  const saveSettings = useAiStore((s) => s.saveSettings)
  const setActiveProfile = useAiStore((s) => s.setActiveProfile)
  const upsertProfile = useAiStore((s) => s.upsertProfile)
  const deleteProfile = useAiStore((s) => s.deleteProfile)
  const setProfileKey = useAiStore((s) => s.setProfileKey)
  const listSkills = useAiStore((s) => s.listSkills)
  const setSkillEnabled = useAiStore((s) => s.setSkillEnabled)
  const revealSkillsDir = useAiStore((s) => s.revealSkillsDir)
  const importSkillFolder = useAiStore((s) => s.importSkillFolder)
  const [keyDraft, setKeyDraft] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [aiSection] = useState(true)
  const [skills, setSkills] = useState<AiSkillView[]>([])
  const [skillMsg, setSkillMsg] = useState<string | null>(null)

  const editing: AiProfileView | null =
    profiles.find((p) => p.id === (editId || ai?.activeProfileId)) || profiles[0] || null

  const refreshSkills = async (): Promise<void> => {
    const list = await listSkills()
    setSkills(list)
  }

  useEffect(() => {
    if (!ai) void hydrateAi()
  }, [ai, hydrateAi])

  useEffect(() => {
    if (ai) void refreshSkills()
  }, [ai?.activeProfileId])

  useEffect(() => {
    if (editing) setEditId(editing.id)
  }, [editing?.id])

  useEffect(() => {
    const onOpen = (): void => {
      document.getElementById('settings-ai')?.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('kentucky:open-ai-settings', onOpen)
    return () => window.removeEventListener('kentucky:open-ai-settings', onOpen)
  }, [])

  const setLang = (locale: AppLocale) => {
    setStoredLocale(locale)
    void i18n.changeLanguage(locale)
  }

  return (
    <div className="settings-page kentucky-overlay-scroll" ref={pageRef}>
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
          <label>{t('settings.uiScale')}</label>
          <div className="ui-scale-control">
            <div className="font-stepper">
              <button type="button" onClick={() => setUiScale(uiScale - 0.05)}>
                −
              </button>
              <span>{Math.round(uiScale * 100)}%</span>
              <button type="button" onClick={() => setUiScale(uiScale + 0.05)}>
                +
              </button>
            </div>
            <button
              type="button"
              className="settings-reset-button"
              onClick={() => setUiScale(1)}
              disabled={uiScale === 1}
            >
              {t('settings.resetScale')}
            </button>
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

      {aiSection && ai ? (
        <section className="settings-section" id="settings-ai">
          <h2>{t('settings.ai')}</h2>
          <p className="settings-desc">{t('settings.aiDesc')}</p>

          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label>{t('settings.profiles')}</label>
            <div className="settings-key-block">
              <div className="theme-toggle" style={{ flexWrap: 'wrap' }}>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={p.id === editing?.id ? 'active' : ''}
                    onClick={() => {
                      setEditId(p.id)
                      void setActiveProfile(p.id)
                      setKeyDraft('')
                    }}
                  >
                    {p.label}
                    {!p.hasKey ? '*' : ''}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    void upsertProfile({
                      label: t('settings.newProfile'),
                      baseUrl: 'https://api.openai.com/v1',
                      model: 'gpt-4o-mini',
                      contextWindow: 128000
                    }).then((p) => {
                      if (p) {
                        setEditId(p.id)
                        void setActiveProfile(p.id)
                      }
                    })
                  }}
                >
                  + {t('settings.addProfile')}
                </button>
              </div>
            </div>
          </div>

          {editing ? (
            <>
              <div className="settings-row">
                <label>{t('settings.profileLabel')}</label>
                <input
                  className="settings-input"
                  value={editing.label}
                  onChange={(e) =>
                    void upsertProfile({ id: editing.id, label: e.target.value })
                  }
                />
              </div>
              <div className="settings-row">
                <label>{t('settings.aiBaseUrl')}</label>
                <input
                  className="settings-input"
                  value={editing.baseUrl}
                  onChange={(e) =>
                    void upsertProfile({ id: editing.id, baseUrl: e.target.value })
                  }
                />
              </div>
              <div className="settings-row">
                <label>{t('settings.aiModel')}</label>
                <input
                  className="settings-input"
                  value={editing.model}
                  onChange={(e) =>
                    void upsertProfile({ id: editing.id, model: e.target.value })
                  }
                />
              </div>
              <div className="settings-row">
                <label>{t('settings.aiContextWindow')}</label>
                <input
                  className="settings-input"
                  type="number"
                  value={editing.contextWindow}
                  onChange={(e) =>
                    void upsertProfile({
                      id: editing.id,
                      contextWindow: Number(e.target.value) || 128000
                    })
                  }
                />
              </div>
              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <label>{t('settings.aiKey')}</label>
                <div className="settings-key-block">
                  <span className="settings-key-status">
                    {editing.hasKey ? t('settings.aiKeySaved') : t('settings.aiKeyMissing')}
                  </span>
                  <input
                    className="settings-input"
                    type="password"
                    placeholder={t('settings.aiKeyPlaceholder')}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                  <div className="theme-toggle">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        void setProfileKey(editing.id, keyDraft).then(() => setKeyDraft(''))
                      }}
                    >
                      {t('settings.aiKeySave')}
                    </button>
                    <button type="button" onClick={() => void setProfileKey(editing.id, '')}>
                      {t('settings.aiKeyClear')}
                    </button>
                    {profiles.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          void deleteProfile(editing.id).then(() => setEditId(null))
                        }}
                      >
                        {t('settings.deleteProfile')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="settings-row">
            <label>{t('settings.aiAgent')}</label>
            <div className="theme-toggle">
              <button
                type="button"
                className={ai.agentEnabled ? 'active' : ''}
                onClick={() => void saveSettings({ agentEnabled: true })}
              >
                {t('settings.on')}
              </button>
              <button
                type="button"
                className={!ai.agentEnabled ? 'active' : ''}
                onClick={() => void saveSettings({ agentEnabled: false })}
              >
                {t('settings.off')}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>{t('settings.aiApplyMode')}</label>
            <div className="theme-toggle">
              <button
                type="button"
                className={ai.applyWritesToDisk ? 'active' : ''}
                onClick={() => void saveSettings({ applyWritesToDisk: true })}
              >
                {t('settings.aiApplyDisk')}
              </button>
              <button
                type="button"
                className={!ai.applyWritesToDisk ? 'active' : ''}
                onClick={() => void saveSettings({ applyWritesToDisk: false })}
              >
                {t('settings.aiApplyDirty')}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>{t('settings.aiForceReview')}</label>
            <div className="theme-toggle">
              <button
                type="button"
                className={ai.forceReviewAllWrites ? 'active' : ''}
                onClick={() => void saveSettings({ forceReviewAllWrites: true })}
              >
                {t('settings.on')}
              </button>
              <button
                type="button"
                className={!ai.forceReviewAllWrites ? 'active' : ''}
                onClick={() => void saveSettings({ forceReviewAllWrites: false })}
              >
                {t('settings.off')}
              </button>
            </div>
          </div>
          <p className="settings-hint">{t('settings.aiReviewHint')}</p>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <label>{t('settings.aiStyleMemo')}</label>
            <textarea
              className="settings-input settings-textarea"
              rows={3}
              value={ai.styleMemo}
              onChange={(e) => void saveSettings({ styleMemo: e.target.value })}
            />
          </div>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>{t('settings.webSearch')}</h3>
          <p className="settings-hint">{t('settings.webSearchDesc')}</p>
          <div className="settings-row">
            <label>{t('settings.webSearch')}</label>
            <div className="theme-toggle">
              <button
                type="button"
                className={ai.webSearchEnabled ? 'active' : ''}
                onClick={() => void saveSettings({ webSearchEnabled: true })}
              >
                {t('settings.on')}
              </button>
              <button
                type="button"
                className={!ai.webSearchEnabled ? 'active' : ''}
                onClick={() => void saveSettings({ webSearchEnabled: false })}
              >
                {t('settings.off')}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>{t('settings.webSearchProvider')}</label>
            <select
              className="settings-input"
              value={ai.webSearchProvider || 'duckduckgo'}
              onChange={(e) =>
                void saveSettings({
                  webSearchProvider: e.target.value as
                    | 'duckduckgo'
                    | 'bing'
                    | 'brave'
                    | 'tavily'
                })
              }
            >
              <option value="duckduckgo">DuckDuckGo (+ Bing fallback)</option>
              <option value="bing">Bing</option>
              <option value="brave">Brave (soon)</option>
              <option value="tavily">Tavily (soon)</option>
            </select>
          </div>
          <p className="settings-hint">{t('settings.webSearchProviderHint')}</p>
          <div className="settings-row">
            <label>{t('settings.webSearchMaxResults')}</label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={10}
              value={ai.webSearchMaxResults ?? 5}
              onChange={(e) =>
                void saveSettings({
                  webSearchMaxResults: Math.min(10, Math.max(1, Number(e.target.value) || 5))
                })
              }
            />
          </div>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>{t('settings.skills')}</h3>
          <p className="settings-hint">{t('settings.skillsDesc')}</p>
          <div className="theme-toggle" style={{ marginBottom: 12 }}>
            <button type="button" onClick={() => void revealSkillsDir()}>
              {t('settings.skillsOpenFolder')}
            </button>
            <button
              type="button"
              onClick={() => {
                void importSkillFolder().then((r) => {
                  setSkillMsg(r.ok ? `Imported: ${r.id}` : r.error || 'Import failed')
                  void refreshSkills()
                })
              }}
            >
              {t('settings.skillsImport')}
            </button>
          </div>
          {skillMsg ? <p className="settings-hint">{skillMsg}</p> : null}
          {skills.length === 0 ? (
            <p className="settings-hint">{t('settings.skillsEmpty')}</p>
          ) : (
            <div className="settings-key-block">
              {skills.map((s) => (
                <div
                  key={s.id}
                  className="settings-row"
                  style={{ alignItems: 'flex-start', marginBottom: 8 }}
                >
                  <label style={{ minWidth: 120 }}>
                    <strong>{s.name || s.id}</strong>
                    <div style={{ fontSize: 'var(--ui-font-sm)', opacity: 0.75 }}>{s.id}</div>
                  </label>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--ui-font-base)', marginBottom: 6 }}>
                      {s.description}
                    </div>
                    <div className="theme-toggle">
                      <button
                        type="button"
                        className={s.enabled ? 'active' : ''}
                        onClick={() => {
                          void setSkillEnabled(s.id, true).then(setSkills)
                        }}
                      >
                        {t('settings.skillsEnabled')}
                      </button>
                      <button
                        type="button"
                        className={!s.enabled ? 'active' : ''}
                        onClick={() => {
                          void setSkillEnabled(s.id, false).then(setSkills)
                        }}
                      >
                        {t('settings.skillsDisabled')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
