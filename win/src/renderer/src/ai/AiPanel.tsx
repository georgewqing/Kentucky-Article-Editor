import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAiStore, type AiProposal } from '@/state/aiStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { AiComposer } from './AiComposer'
import { SimpleMarkdown } from './simpleMarkdown'

function ContextBar() {
  const { t } = useTranslation()
  const used = useAiStore((s) => s.contextUsed)
  const limit = useAiStore((s) => s.contextLimit)
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  const level = pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : ''
  return (
    <div className={`ai-context-bar ${level}`}>
      <div className="ai-context-meta">
        <span>{t('ai.context')}</span>
        <span>
          {used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="ai-context-track">
        <div className="ai-context-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Auto-written change summary — yellow/blue match tab marks. Collapsed by default. */
function AppliedChangeCard({ proposal }: { proposal: AiProposal }) {
  const { t } = useTranslation()
  const streaming = useAiStore((s) => s.streaming)
  const [expanded, setExpanded] = useState(false)
  const wasStreaming = useRef(streaming)

  useEffect(() => {
    if (wasStreaming.current && !streaming) setExpanded(false)
    wasStreaming.current = streaming
  }, [streaming])

  const base = proposal.path.split(/[/\\]/).pop() || proposal.path
  const isNew = !proposal.before

  return (
    <div
      className={`ai-proposal applied ${isNew ? 'is-new' : 'is-modified'} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
    >
      <button
        type="button"
        className="ai-proposal-head"
        aria-expanded={expanded}
        title={expanded ? t('ai.collapseChange') : t('ai.expandChange')}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="ai-proposal-title">
          {expanded ? (
            <ChevronDown size={14} className="ai-proposal-chevron" aria-hidden />
          ) : (
            <ChevronRight size={14} className="ai-proposal-chevron" aria-hidden />
          )}
          <strong title={proposal.path}>
            <span className={isNew ? 'tab-new' : 'tab-dirty'}>● </span>
            {base}
          </strong>
        </span>
        <span className="ai-proposal-status">
          {isNew ? t('editor.tabNew') : t('ai.statusApplied')}
        </span>
      </button>
      {expanded ? (
        <>
          <p className="ai-proposal-summary">{proposal.summary}</p>
          <pre className="ai-proposal-diff">
            {proposal.after.slice(0, 400)}
            {proposal.after.length > 400 ? '\n…' : ''}
          </pre>
        </>
      ) : proposal.summary ? (
        <p className="ai-proposal-summary ai-proposal-summary-collapsed">{proposal.summary}</p>
      ) : null}
    </div>
  )
}

function PendingChangeCard({ proposal }: { proposal: AiProposal }) {
  const { t } = useTranslation()
  const applyProposal = useAiStore((s) => s.applyProposal)
  const rejectProposal = useAiStore((s) => s.rejectProposal)
  const [expanded, setExpanded] = useState(true)
  const base = proposal.path.split(/[/\\]/).pop() || proposal.path
  const isNew = !proposal.before

  return (
    <div className={`ai-proposal pending ${isNew ? 'is-new' : 'is-modified'} is-expanded`}>
      <button
        type="button"
        className="ai-proposal-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="ai-proposal-title">
          {expanded ? (
            <ChevronDown size={14} className="ai-proposal-chevron" aria-hidden />
          ) : (
            <ChevronRight size={14} className="ai-proposal-chevron" aria-hidden />
          )}
          <strong title={proposal.path}>{base}</strong>
        </span>
        <span className="ai-proposal-status">{t('ai.statusPending')}</span>
      </button>
      {proposal.summary ? <p className="ai-proposal-summary">{proposal.summary}</p> : null}
      {expanded ? (
        <pre className="ai-proposal-diff">
          {proposal.after.slice(0, 800)}
          {proposal.after.length > 800 ? '\n…' : ''}
        </pre>
      ) : null}
      <div className="ai-proposal-actions">
        <button type="button" className="ai-btn-apply" onClick={() => void applyProposal(proposal.id)}>
          {t('ai.apply')}
        </button>
        <button type="button" className="ai-btn-reject" onClick={() => void rejectProposal(proposal.id)}>
          {t('ai.reject')}
        </button>
      </div>
    </div>
  )
}

function proposalsForMessage(
  messageId: string,
  proposals: AiProposal[],
  lastAssistantId: string | undefined
): AiProposal[] {
  return proposals.filter((p) => {
    if (p.status !== 'applied' && p.status !== 'pending') return false
    if (p.messageId === messageId) return true
    return !p.messageId && messageId === lastAssistantId
  })
}

export function AiPanel() {
  const { t } = useTranslation()
  const session = useAiStore((s) => s.session)
  const sessions = useAiStore((s) => s.sessions)
  const streaming = useAiStore((s) => s.streaming)
  const streamBuffer = useAiStore((s) => s.streamBuffer)
  const agentPhase = useAiStore((s) => s.agentPhase)
  const agentToolName = useAiStore((s) => s.agentToolName)
  const error = useAiStore((s) => s.error)
  const settings = useAiStore((s) => s.settings)
  const hydrate = useAiStore((s) => s.hydrate)
  const showHistory = useAiStore((s) => s.showHistory)
  const setShowHistory = useAiStore((s) => s.setShowHistory)
  const newChat = useAiStore((s) => s.newChat)
  const openSession = useAiStore((s) => s.openSession)
  const deleteSession = useAiStore((s) => s.deleteSession)
  const retryLast = useAiStore((s) => s.retryLast)
  const setPanelVisible = useAiStore((s) => s.setPanelVisible)
  const listRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(listRef)
  useOverlayScroll(historyRef)

  // HMR / partial reloads can reset the store; reload from disk instead of showing a false "no key".
  useEffect(() => {
    if (!settings) void hydrate()
  }, [settings, hydrate])

  const messages = useMemo(
    () => (session?.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant'),
    [session?.messages]
  )
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.id,
    [messages]
  )
  const applyAll = useAiStore((s) => s.applyAll)
  const proposals = session?.proposals || []
  const pendingCount = proposals.filter((p) => p.status === 'pending').length

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session?.messages, session?.proposals, streamBuffer, agentPhase, agentToolName])

  return (
    <aside className="ai-panel" aria-label={t('ai.title')}>
      <header className="ai-panel-header">
        <div className="ai-panel-title">
          <span className="ai-panel-brand">{t('ai.title')}</span>
          <span className="ai-panel-model">{settings?.model || '—'}</span>
        </div>
        <div className="ai-panel-actions">
          <button type="button" title={t('ai.newChat')} onClick={() => void newChat()}>
            +
          </button>
          <button
            type="button"
            title={t('ai.history')}
            className={showHistory ? 'active' : ''}
            onClick={() => setShowHistory(!showHistory)}
          >
            ≡
          </button>
          <button type="button" title={t('ai.close')} onClick={() => setPanelVisible(false)}>
            ×
          </button>
        </div>
      </header>

      <ContextBar />

      {showHistory ? (
        <div className="ai-history kentucky-overlay-scroll" ref={historyRef}>
          {sessions.map((s) => (
            <div key={s.id} className="ai-history-item">
              <button type="button" className="ai-history-open" onClick={() => void openSession(s.id)}>
                <span>{s.title}</span>
                <small>{s.workspacePath ? s.workspacePath.split(/[/\\]/).pop() : '—'}</small>
              </button>
              <button type="button" onClick={() => void deleteSession(s.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!settings ? (
        <div className="ai-empty">
          <p>{t('ai.loading')}</p>
        </div>
      ) : !settings.hasApiKey ? (
        <div className="ai-empty">
          <p>{t('ai.needKey')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void import('@/state/appStore').then(({ useAppStore }) => {
                useAppStore.getState().setActiveView('settings')
              })
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('kentucky:open-ai-settings'))
              }, 50)
            }}
          >
            {t('ai.openSettings')}
          </button>
        </div>
      ) : null}

      {session?.plan && session.plan.length > 0 ? (
        <div className="ai-plan">
          <div className="ai-plan-title">{t('ai.plan')}</div>
          <ul>
            {session.plan.map((step) => (
              <li key={step.id} className={step.status}>
                <span className="ai-plan-check">{step.status === 'done' ? '✓' : '○'}</span>
                {step.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ai-messages-wrap">
        <div className="ai-messages kentucky-overlay-scroll" ref={listRef}>
          {messages.map((m) => {
            const turnProposals =
              m.role === 'assistant' ? proposalsForMessage(m.id, proposals, lastAssistantId) : []
            return (
              <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
                <div className="ai-msg-role">{m.role === 'user' ? t('ai.you') : t('ai.agent')}</div>
                <div className="ai-msg-body">
                  {m.role === 'assistant' ? <SimpleMarkdown text={m.content} /> : m.content}
                </div>
                {turnProposals.length > 0 ? (
                  <div className="ai-msg-proposals">
                    {turnProposals.map((p) =>
                      p.status === 'pending' ? (
                        <PendingChangeCard key={p.id} proposal={p} />
                      ) : (
                        <AppliedChangeCard key={p.id} proposal={p} />
                      )
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
          {streaming && streamBuffer ? (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-role">{t('ai.agent')}</div>
              <div className="ai-msg-body ai-msg-streaming">
                <SimpleMarkdown text={streamBuffer} />
              </div>
              {agentPhase === 'tool' || agentPhase === 'thinking' ? (
                <div className="ai-thinking ai-thinking-inline" aria-live="polite">
                  <span className="ai-thinking-spinner" aria-hidden />
                  <span>
                    {agentPhase === 'tool' && agentToolName
                      ? t('ai.toolRunning', { name: agentToolName })
                      : t('ai.thinkingMore')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {streaming && !streamBuffer ? (
            <div className="ai-msg ai-msg-assistant ai-msg-activity">
              <div className="ai-msg-role">{t('ai.agent')}</div>
              <div className="ai-thinking" aria-live="polite">
                <span className="ai-thinking-spinner" aria-hidden />
                <span>
                  {agentPhase === 'tool' && agentToolName
                    ? t('ai.toolRunning', { name: agentToolName })
                    : t('ai.thinking')}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {pendingCount > 0 && !streaming ? (
        <div className="ai-pending-bar">
          <span>{t('ai.pendingProposals', { count: pendingCount })}</span>
          <button type="button" onClick={() => void applyAll()}>
            {t('ai.applyAll')}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="ai-error">
          <span>{error}</span>
          <button type="button" onClick={() => void retryLast()}>
            {t('ai.retry')}
          </button>
        </div>
      ) : null}

      <AiComposer />
    </aside>
  )
}
