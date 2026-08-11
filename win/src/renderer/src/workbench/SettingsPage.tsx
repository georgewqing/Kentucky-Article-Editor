import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/state/settingsStore'
import { useAiStore, type AiProfileView, type AiSkillView } from '@/state/aiStore'
import { ACCENT_PRESETS } from '@/theme/applyTheme'
import i18n, { setStoredLocale, type AppLocale } from '@/i18n'
import { SegmentedControl } from './SegmentedControl'

export function SettingsPage() {
  const { t } = useTranslation()
  const themeMode = useSettingsStore((s) => s.themeMode)
  const accent = useSettingsStore((s) => s.accent)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const setAccent = useSettingsStore((s) => s.setAccent)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
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
    <div className="settings-page">
      <div className="settings-page-inner">
        <header className="settings-header">
          <h1>{t('settings.title')}</h1>
          <p className="settings-lead">{t('settings.desc')}</p>
        </header>

        <section className="settings-card">
          <header className="settings-card-head">
            <h2>{t('settings.appearance')}</h2>
          </header>
          <div className="settings-card-body">
            <div className="settings-field settings-field--inline">
              <span className="settings-label">{t('settings.theme')}</span>
              <SegmentedControl
                aria-label={t('settings.theme')}
                value={themeMode}
                onChange={(mode) => setThemeMode(mode)}
                options={[
                  { value: 'dark' as const, label: t('settings.dark') },
                  { value: 'light' as const, label: t('settings.light') }
                ]}
              />
            </div>

            <div className="settings-field">
              <span className="settings-label">{t('settings.accent')}</span>
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

            <div className="settings-field settings-field--inline">
              <span className="settings-label">{t('settings.fontSize')}</span>
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
          </div>
        </section>

        <section className="settings-card">
          <header className="settings-card-head">
            <h2>{t('settings.language')}</h2>
          </header>
          <div className="settings-card-body">
            <div className="settings-field settings-field--inline">
              <span className="settings-label">{t('status.language')}</span>
              <SegmentedControl
                aria-label={t('status.language')}
                value={(i18n.language === 'zh-CN' ? 'zh-CN' : 'en') as AppLocale}
                onChange={setLang}
                options={[
                  { value: 'zh-CN' as const, label: '中文' },
                  { value: 'en' as const, label: 'EN' }
                ]}
              />
            </div>
          </div>
        </section>

        {aiSection && ai ? (
          <section className="settings-card" id="settings-ai">
            <header className="settings-card-head">
              <h2>{t('settings.ai')}</h2>
              <p className="settings-card-desc">{t('settings.aiDesc')}</p>
            </header>

            <div className="settings-group">
              <h3 className="settings-group-title">{t('settings.profiles')}</h3>
              <div className="settings-card-body">
                <div className="settings-field">
                  <span className="settings-label">{t('settings.profiles')}</span>
                  <div className="settings-profile-bar">
                    <div className="theme-toggle settings-profile-pills" role="group">
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
                    </div>
                    <button
                      type="button"
                      className="settings-btn-ghost"
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

                {editing ? (
                  <>
                    <div className="settings-field">
                      <label className="settings-label" htmlFor="settings-profile-label">
                        {t('settings.profileLabel')}
                      </label>
                      <input
                        id="settings-profile-label"
                        className="settings-input"
                        value={editing.label}
                        onChange={(e) =>
                          void upsertProfile({ id: editing.id, label: e.target.value })
                        }
                      />
                    </div>
                    <div className="settings-field">
                      <label className="settings-label" htmlFor="settings-base-url">
                        {t('settings.aiBaseUrl')}
                      </label>
                      <input
                        id="settings-base-url"
                        className="settings-input"
                        value={editing.baseUrl}
                        onChange={(e) =>
                          void upsertProfile({ id: editing.id, baseUrl: e.target.value })
                        }
                      />
                    </div>
                    <div className="settings-field-row">
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="settings-model">
                          {t('settings.aiModel')}
                        </label>
                        <input
                          id="settings-model"
                          className="settings-input"
                          value={editing.model}
                          onChange={(e) =>
                            void upsertProfile({ id: editing.id, model: e.target.value })
                          }
                        />
                      </div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="settings-context">
                          {t('settings.aiContextWindow')}
                        </label>
                        <input
                          id="settings-context"
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
                    </div>
                    <div className="settings-field">
                      <span className="settings-label">{t('settings.aiKey')}</span>
                      <div className="settings-key-block">
                        <span
                          className={`settings-key-status ${editing.hasKey ? 'is-ok' : 'is-warn'}`}
                        >
                          {editing.hasKey ? t('settings.aiKeySaved') : t('settings.aiKeyMissing')}
                        </span>
                        <input
                          className="settings-input"
                          type="password"
                          placeholder={t('settings.aiKeyPlaceholder')}
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          autoComplete="off"
                        />
                        <div className="settings-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => {
                              void setProfileKey(editing.id, keyDraft).then(() => setKeyDraft(''))
                            }}
                          >
                            {t('settings.aiKeySave')}
                          </button>
                          <button
                            type="button"
                            className="settings-btn-ghost"
                            onClick={() => void setProfileKey(editing.id, '')}
                          >
                            {t('settings.aiKeyClear')}
                          </button>
                          {profiles.length > 1 ? (
                            <button
                              type="button"
                              className="settings-btn-danger"
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
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">{t('settings.aiAgent')}</h3>
              <div className="settings-card-body">
                <div className="settings-field settings-field--inline">
                  <span className="settings-label">{t('settings.aiAgent')}</span>
                  <SegmentedControl
                    aria-label={t('settings.aiAgent')}
                    value={ai.agentEnabled}
                    onChange={(on) => void saveSettings({ agentEnabled: on })}
                    options={[
                      { value: true, label: t('settings.on') },
                      { value: false, label: t('settings.off') }
                    ]}
                  />
                </div>
                <div className="settings-field settings-field--inline">
                  <div className="settings-label-stack">
                    <span className="settings-label">{t('settings.aiApplyMode')}</span>
                  </div>
                  <SegmentedControl
                    aria-label={t('settings.aiApplyMode')}
                    value={ai.applyWritesToDisk}
                    onChange={(on) => void saveSettings({ applyWritesToDisk: on })}
                    options={[
                      { value: true, label: t('settings.aiApplyDisk') },
                      { value: false, label: t('settings.aiApplyDirty') }
                    ]}
                  />
                </div>
                <div className="settings-field settings-field--inline settings-field--stack-sm">
                  <div className="settings-label-stack">
                    <span className="settings-label">{t('settings.aiForceReview')}</span>
                    <p className="settings-hint">{t('settings.aiReviewHint')}</p>
                  </div>
                  <SegmentedControl
                    aria-label={t('settings.aiForceReview')}
                    value={ai.forceReviewAllWrites}
                    onChange={(on) => void saveSettings({ forceReviewAllWrites: on })}
                    options={[
                      { value: true, label: t('settings.on') },
                      { value: false, label: t('settings.off') }
                    ]}
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-label" htmlFor="settings-style-memo">
                    {t('settings.aiStyleMemo')}
                  </label>
                  <textarea
                    id="settings-style-memo"
                    className="settings-input settings-textarea"
                    rows={4}
                    value={ai.styleMemo}
                    onChange={(e) => void saveSettings({ styleMemo: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">{t('settings.webSearch')}</h3>
              <p className="settings-group-desc">{t('settings.webSearchDesc')}</p>
              <div className="settings-card-body">
                <div className="settings-field settings-field--inline">
                  <span className="settings-label">{t('settings.webSearch')}</span>
                  <SegmentedControl
                    aria-label={t('settings.webSearch')}
                    value={ai.webSearchEnabled}
                    onChange={(on) => void saveSettings({ webSearchEnabled: on })}
                    options={[
                      { value: true, label: t('settings.on') },
                      { value: false, label: t('settings.off') }
                    ]}
                  />
                </div>
                <div className="settings-field-row">
                  <div className="settings-field">
                    <label className="settings-label" htmlFor="settings-web-provider">
                      {t('settings.webSearchProvider')}
                    </label>
                    <select
                      id="settings-web-provider"
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
                    <p className="settings-hint">{t('settings.webSearchProviderHint')}</p>
                  </div>
                  <div className="settings-field">
                    <label className="settings-label" htmlFor="settings-web-max">
                      {t('settings.webSearchMaxResults')}
                    </label>
                    <input
                      id="settings-web-max"
                      className="settings-input"
                      type="number"
                      min={1}
                      max={10}
                      value={ai.webSearchMaxResults ?? 5}
                      onChange={(e) =>
                        void saveSettings({
                          webSearchMaxResults: Math.min(
                            10,
                            Math.max(1, Number(e.target.value) || 5)
                          )
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">{t('settings.skills')}</h3>
              <p className="settings-group-desc">{t('settings.skillsDesc')}</p>
              <div className="settings-card-body">
                <div className="settings-actions">
                  <button
                    type="button"
                    className="settings-btn-ghost"
                    onClick={() => void revealSkillsDir()}
                  >
                    {t('settings.skillsOpenFolder')}
                  </button>
                  <button
                    type="button"
                    className="settings-btn-ghost"
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
                  <p className="settings-empty">{t('settings.skillsEmpty')}</p>
                ) : (
                  <ul className="settings-skill-list">
                    {skills.map((s) => (
                      <li key={s.id} className="settings-skill-item">
                        <div className="settings-skill-meta">
                          <strong className="settings-skill-name">{s.name || s.id}</strong>
                          <span className="settings-skill-id">{s.id}</span>
                          {s.description ? (
                            <p className="settings-skill-desc">{s.description}</p>
                          ) : null}
                        </div>
                        <SegmentedControl
                          aria-label={s.name || s.id}
                          value={s.enabled}
                          onChange={(on) => {
                            void setSkillEnabled(s.id, on).then(setSkills)
                          }}
                          options={[
                            { value: true, label: t('settings.skillsEnabled') },
                            { value: false, label: t('settings.skillsDisabled') }
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
