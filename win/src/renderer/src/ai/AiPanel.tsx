import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAiStore, type AiProposal, type AiChatMessage } from '@/state/aiStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { AiComposer } from './AiComposer'
import { FileMountChip } from './FileMountChip'
import { SimpleMarkdown } from './simpleMarkdown'
import { formatProposalDiff } from './proposalDiff'

/** Low-saturation cool slate ramp (light → deep). */
const BUCKET_COLORS: Record<string, string> = {
  system: '#8a9aa8',
  tools: '#6f8798',
  skills: '#5a7d8c',
  rules: '#4a6e80',
  conversation: '#3d5a6c'
}

function formatTokens(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) {
    const k = n / 1000
    return `${k.toFixed(1).replace(/\.0$/, '')}K`
  }
  return n.toLocaleString()
}

function UserMessageBody({ message }: { message: AiChatMessage }) {
  const paths = message.attachedPaths || []
  const skillId = message.skillId
  const boilerplate =
    skillId &&
    message.content.trim() === `Follow skill /${skillId} for this request.`
  const text = boilerplate ? '' : message.content
  const hasChips = Boolean(skillId) || paths.length > 0

  return (
    <div className="ai-msg-user-content">
      {hasChips ? (
        <div className="ai-msg-user-chips">
          {skillId ? (
            <span className="ai-skill-chip ai-skill-chip-msg">/{skillId}</span>
          ) : null}
          {paths.map((path) => (
            <FileMountChip key={path} path={path} variant="message" />
          ))}
        </div>
      ) : null}
      {text ? <div className="ai-msg-user-text">{text}</div> : null}
    </div>
  )
}

function ContextBar() {
  const { t } = useTranslation()
  const usedStore = useAiStore((s) => s.contextUsed)
  const limit = useAiStore((s) => s.contextLimit)
  const buckets = useAiStore((s) => s.contextBuckets)
  const refreshContextUsage = useAiStore((s) => s.refreshContextUsage)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Prefer sum of buckets so header and legend never disagree.
  const used = useMemo(() => {
    if (!buckets.length) return usedStore
    return buckets.reduce((n, b) => n + b.tokens, 0)
  }, [buckets, usedStore])

  const limitSafe = Math.max(1, limit)
  const pct = Math.min(100, Math.round((used / limitSafe) * 100))
  const level = pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : ''

  useEffect(() => {
    if (!open) return
    void refreshContextUsage()
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, refreshContextUsage])

  // Segment widths are % of the FULL window (limit), not % of used —
  // leftover track = free capacity (matches Cursor / user expectation).
  const stacked = useMemo(() => {
    return buckets.map((b) => ({
      ...b,
      color: BUCKET_COLORS[b.id] || '#64748b',
      pctOfLimit: Math.max(0, (b.tokens / limitSafe) * 100)
    }))
  }, [buckets, limitSafe])

  return (
    <div className={`ai-context-bar ${level}`} ref={rootRef}>
      <button
        type="button"
        className="ai-context-trigger"
        aria-expanded={open}
        title={t('ai.contextUsageTitle')}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="ai-context-meta">
          <span>{t('ai.context')}</span>
          <span>
            {used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)
          </span>
        </div>
        <div className="ai-context-track" aria-hidden>
          {stacked.length > 0 ? (
            stacked.map((b) => (
              <div
                key={b.id}
                className="ai-context-seg"
                style={{ width: `${b.pctOfLimit}%`, background: b.color }}
                title={`${b.id}: ${b.tokens.toLocaleString()}`}
              />
            ))
          ) : (
            <div className="ai-context-fill" style={{ width: `${pct}%` }} />
          )}
        </div>
      </button>

      {open ? (
        <div className="ai-context-popover" role="dialog" aria-label={t('ai.contextUsageTitle')}>
          <div className="ai-context-popover-head">
            <strong>{t('ai.contextUsageTitle')}</strong>
            <span>
              {t('ai.contextUsageFull', { pct })} · {used.toLocaleString()} / {limit.toLocaleString()}{' '}
              {t('ai.contextTokens')}
            </span>
          </div>
          <div className="ai-context-popover-track" aria-hidden>
            {stacked.map((b) => (
              <div
                key={b.id}
                className="ai-context-seg"
                style={{ width: `${b.pctOfLimit}%`, background: b.color }}
              />
            ))}
          </div>
          <ul className="ai-context-legend">
            {stacked.map((b) => (
              <li key={b.id}>
                <span className="ai-context-dot" style={{ background: b.color }} />
                <span className="ai-context-legend-label">
                  {t(`ai.contextBucket.${b.id}`, { defaultValue: b.id })}
                </span>
                <span className="ai-context-legend-tokens" title={b.tokens.toLocaleString()}>
                  {formatTokens(b.tokens)}
                </span>
              </li>
            ))}
            <li className="ai-context-legend-free">
              <span className="ai-context-dot is-free" />
              <span className="ai-context-legend-label">{t('ai.contextBucket.free')}</span>
              <span className="ai-context-legend-tokens">
                {formatTokens(Math.max(0, limit - used))}
              </span>
            </li>
          </ul>
          <p className="ai-context-hint">{t('ai.contextUsageHint')}</p>
        </div>
      ) : null}
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
            {formatProposalDiff(proposal.before, proposal.after, 32)}
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
  const diff = useMemo(
    () => formatProposalDiff(proposal.before, proposal.after),
    [proposal.before, proposal.after]
  )

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
      {expanded ? <pre className="ai-proposal-diff">{diff}</pre> : null}
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
  const rejectAll = useAiStore((s) => s.rejectAll)
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

      <div className="ai-messages-wrap">
        <div className="ai-messages kentucky-overlay-scroll" ref={listRef}>
          {messages.map((m) => {
            const turnProposals =
              m.role === 'assistant' ? proposalsForMessage(m.id, proposals, lastAssistantId) : []
            return (
              <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
                <div className="ai-msg-role">{m.role === 'user' ? t('ai.you') : t('ai.agent')}</div>
                <div className="ai-msg-body">
                  {m.role === 'assistant' ? (
                    <SimpleMarkdown text={m.content} />
                  ) : (
                    <UserMessageBody message={m} />
                  )}
                </div>
                {turnProposals.length > 0 ? (
                  <div className="ai-msg-proposals">
                    {turnProposals.some((p) => p.status === 'pending') ? (
                      <div className="ai-msg-proposals-bar">
                        <button
                          type="button"
                          className="ai-btn-apply"
                          onClick={() => void applyAll(m.id)}
                        >
                          {t('ai.applyAllTurn')}
                        </button>
                        <button
                          type="button"
                          className="ai-btn-reject"
                          onClick={() => void rejectAll(m.id)}
                        >
                          {t('ai.rejectAllTurn')}
                        </button>
                      </div>
                    ) : null}
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
          <div className="ai-pending-bar-actions">
            <button type="button" className="ai-btn-apply" onClick={() => void applyAll()}>
              {t('ai.applyAll')}
            </button>
            <button type="button" className="ai-btn-reject" onClick={() => void rejectAll()}>
              {t('ai.rejectAll')}
            </button>
          </div>
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
