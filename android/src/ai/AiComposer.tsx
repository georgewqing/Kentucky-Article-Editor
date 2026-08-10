import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, ArrowUp, Square, ChevronDown, Infinity } from 'lucide-react'
import { useAiStore, type AgentMode } from '@/state/aiStore'
import { getPlatform } from '@/platform'

const MODES: AgentMode[] = ['agent', 'plan', 'outline', 'ask']

export function AiComposer() {
  const { t } = useTranslation()
  const draft = useAiStore((s) => s.draft)
  const setDraft = useAiStore((s) => s.setDraft)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const streaming = useAiStore((s) => s.streaming)
  const agentMode = useAiStore((s) => s.agentMode)
  const setAgentMode = useAiStore((s) => s.setAgentMode)
  const profiles = useAiStore((s) => s.profiles)
  const settings = useAiStore((s) => s.settings)
  const setActiveProfile = useAiStore((s) => s.setActiveProfile)
  const attachments = useAiStore((s) => s.composerAttachments)
  const removeAttachment = useAiStore((s) => s.removeComposerAttachment)
  const pickAttachments = useAiStore((s) => s.pickComposerAttachments)

  const [modeOpen, setModeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const activeProfile =
    profiles.find((p) => p.id === settings?.activeProfileId) || profiles[0] || null

  useEffect(() => {
    if (!modeOpen && !profileOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setModeOpen(false)
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [modeOpen, profileOpen])

  const openManageProfiles = (): void => {
    setProfileOpen(false)
    void import('@/state/appStore').then(({ useAppStore }) => {
      useAppStore.getState().setActiveView('settings')
    })
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kentucky:open-ai-settings'))
    }, 50)
  }

  return (
    <div className="ai-composer" ref={rootRef}>
      {attachments.length > 0 ? (
        <div className="ai-composer-chips">
          {attachments.map((path) => (
            <span key={path} className="ai-composer-chip" title={path}>
              <span className="ai-composer-chip-name">{getPlatform().basename(path)}</span>
              <button
                type="button"
                className="ai-composer-chip-x"
                aria-label={t('ai.removeAttachment')}
                onClick={() => removeAttachment(path)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        className="ai-composer-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('ai.composerPlaceholder')}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
      />

      <div className="ai-composer-toolbar">
        <div className="ai-composer-toolbar-left">
          <div className="ai-composer-menu-wrap">
            <button
              type="button"
              className="ai-composer-pill"
              aria-expanded={modeOpen}
              onClick={() => {
                setModeOpen((v) => !v)
                setProfileOpen(false)
              }}
            >
              <Infinity size={14} aria-hidden />
              <span>{t(`ai.mode.${agentMode}`)}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
            {modeOpen ? (
              <div className="ai-composer-menu" role="menu">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitem"
                    className={m === agentMode ? 'active' : ''}
                    onClick={() => {
                      setAgentMode(m)
                      setModeOpen(false)
                    }}
                  >
                    <span>{t(`ai.mode.${m}`)}</span>
                    <small>{t(`ai.modeHint.${m}`)}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ai-composer-menu-wrap">
            <button
              type="button"
              className="ai-composer-model"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((v) => !v)
                setModeOpen(false)
              }}
            >
              <span>{activeProfile?.label || activeProfile?.model || t('ai.noProfile')}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
            {profileOpen ? (
              <div className="ai-composer-menu ai-composer-menu-wide" role="menu">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    className={p.id === activeProfile?.id ? 'active' : ''}
                    onClick={() => {
                      void setActiveProfile(p.id)
                      setProfileOpen(false)
                    }}
                  >
                    <span>
                      {p.label}
                      {!p.hasKey ? ` · ${t('ai.noKey')}` : ''}
                    </span>
                    <small>{p.model}</small>
                  </button>
                ))}
                <button type="button" role="menuitem" className="ai-composer-manage" onClick={openManageProfiles}>
                  {t('ai.manageProfiles')}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ai-composer-toolbar-right">
          <button
            type="button"
            className="ai-composer-icon-btn"
            title={t('ai.attachFiles')}
            aria-label={t('ai.attachFiles')}
            onClick={() => void pickAttachments()}
          >
            <Paperclip size={16} aria-hidden />
          </button>
          {streaming ? (
            <button
              type="button"
              className="ai-composer-send is-stop"
              title={t('ai.stop')}
              aria-label={t('ai.stop')}
              onClick={() => void abort()}
            >
              <Square size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="ai-composer-send"
              title={t('ai.send')}
              aria-label={t('ai.send')}
              disabled={!draft.trim()}
              onClick={() => void send()}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
