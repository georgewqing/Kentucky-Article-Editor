import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, History, Plus, X } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { useAiStore, type AiProposal, type AiGitOp, type AiChatMessage } from '@/state/aiStore'
import { useSettingsStore } from '@/state/settingsStore'
import { accentTone, CONTEXT_BUCKET_STRENGTH } from '@/theme/applyTheme'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { AiComposer } from './AiComposer'
import { FileMountChip } from './FileMountChip'
import { SimpleMarkdown } from './simpleMarkdown'
import { formatProposalDiff } from './proposalDiff'
import { clipLines } from '@shared/clipLines'

const headerIcon = { size: 16, strokeWidth: 1.75 } as const

function isFileMutatingTool(name: string | null): boolean {
  if (!name) return false
  return (
    name.startsWith('propose_') ||
    name.startsWith('workspace_') ||
    name === 'export_workspace_pdf' ||
    name === 'layout_dialogue' ||
    name === 'layout_kmind' ||
    name === 'scene_to_kmind' ||
    name === 'kmind_to_scene_outline' ||
    name === 'create_plan' ||
    name === 'update_plan_step'
  )
}

function ThinkingMark({ fileWork }: { fileWork?: boolean }) {
  const themeMode = useSettingsStore((s) => s.themeMode)
  return (
    <ThinkingOrb
      state={fileWork ? 'shaping' : 'breathing'}
      size={20}
      theme={themeMode}
      className="ai-thinking-orb"
      aria-hidden
    />
  )
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
  const accent = useSettingsStore((s) => s.accent)
  const themeMode = useSettingsStore((s) => s.themeMode)
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
    return buckets.map((b, i) => {
      const strength = CONTEXT_BUCKET_STRENGTH[b.id] ?? 0.2 + i * 0.15
      return {
        ...b,
        color: accentTone(accent, strength, themeMode),
        pctOfLimit: Math.max(0, (b.tokens / limitSafe) * 100)
      }
    })
  }, [buckets, limitSafe, accent, themeMode])

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

function proposalsForMessage(
  messageId: string,
  proposals: AiProposal[],
  lastAssistantId: string | undefined
): AiProposal[] {
  return proposals.filter((p) => {
    if (p.status !== 'applied') return false
    if (p.messageId === messageId) return true
    return !p.messageId && messageId === lastAssistantId
  })
}

function gitOpsForMessage(
  messageId: string,
  gitOps: AiGitOp[],
  lastAssistantId: string | undefined
): AiGitOp[] {
  return gitOps.filter((op) => {
    if (op.messageId === messageId) return true
    return !op.messageId && messageId === lastAssistantId
  })
}

function GitResultCard({ op }: { op: AiGitOp }) {
  const { t } = useTranslation()
  const [flash, setFlash] = useState(true)

  useEffect(() => {
    const id = window.setTimeout(() => setFlash(false), 2200)
    return () => window.clearTimeout(id)
  }, [op.id])

  const kindLabel =
    op.kind === 'add'
      ? t('ai.gitKindAdd')
      : op.kind === 'commit'
        ? t('ai.gitKindCommit')
        : op.kind === 'remote_remove'
          ? t('ai.gitKindRemoteRemove')
          : t('ai.gitKindRemoteAdd')

  const statusLabel =
    op.status === 'applied'
      ? t('ai.gitStatusApplied')
      : op.status === 'rejected'
        ? t('ai.gitStatusFailed')
        : t('ai.gitStatusPending')

  return (
    <div
      className={`ai-proposal ai-git-op ${op.status}${flash ? ' is-flash' : ''}`}
      data-git-op={op.id}
    >
      <div className="ai-proposal-head ai-git-op-head">
        <span className="ai-proposal-title">
          <strong>
            <span className="ai-git-badge">{t('ai.gitBadge')}</span> {kindLabel}
          </strong>
        </span>
        <span className="ai-proposal-status">{statusLabel}</span>
      </div>
      <p className="ai-proposal-summary">{op.summary}</p>
      {op.detail ? <pre className="ai-proposal-diff ai-git-detail">{op.detail}</pre> : null}
      {op.resultNote ? <p className="ai-git-result">{clipLines(op.resultNote)}</p> : null}
      {op.error ? <p className="ai-git-error">{clipLines(op.error)}</p> : null}
    </div>
  )
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
  const fileWork = agentPhase === 'tool' && isFileMutatingTool(agentToolName)

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
  const proposals = session?.proposals || []
  const gitOps = session?.gitOps || []

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session?.messages, session?.proposals, session?.gitOps, streamBuffer, agentPhase, agentToolName])

  return (
    <aside className="ai-panel" aria-label={t('ai.title')}>
      <header className="ai-panel-header">
        <div className="ai-panel-title">
          <span className="ai-panel-brand">{t('ai.title')}</span>
          <span className="ai-panel-model">{settings?.model || '—'}</span>
        </div>
        <div className="ai-panel-actions">
          <button
            type="button"
            title={t('ai.newChat')}
            aria-label={t('ai.newChat')}
            onClick={() => void newChat()}
          >
            <Plus {...headerIcon} aria-hidden />
          </button>
          <button
            type="button"
            title={t('ai.history')}
            aria-label={t('ai.history')}
            aria-pressed={showHistory}
            className={showHistory ? 'active' : ''}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History {...headerIcon} aria-hidden />
          </button>
          <button
            type="button"
            title={t('ai.close')}
            aria-label={t('ai.close')}
            onClick={() => setPanelVisible(false)}
          >
            <X {...headerIcon} aria-hidden />
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
              <button
                type="button"
                title={t('ai.deleteChat')}
                aria-label={t('ai.deleteChat')}
                onClick={() => void deleteSession(s.id)}
              >
                <X size={14} strokeWidth={1.75} aria-hidden />
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
            const turnGitOps =
              m.role === 'assistant' ? gitOpsForMessage(m.id, gitOps, lastAssistantId) : []
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
                {turnProposals.length > 0 || turnGitOps.length > 0 ? (
                  <div className="ai-msg-proposals">
                    {turnProposals.map((p) => (
                      <AppliedChangeCard key={p.id} proposal={p} />
                    ))}
                    {turnGitOps.map((op) => (
                      <GitResultCard key={op.id} op={op} />
                    ))}
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
              <div className="ai-thinking ai-thinking-inline" aria-live="polite">
                <ThinkingMark fileWork={fileWork} />
                <span>
                  {agentPhase === 'tool' && agentToolName
                    ? t('ai.toolRunning', { name: agentToolName })
                    : t('ai.thinkingMore')}
                </span>
              </div>
            </div>
          ) : null}
          {streaming && !streamBuffer ? (
            <div className="ai-msg ai-msg-assistant ai-msg-activity">
              <div className="ai-msg-role">{t('ai.agent')}</div>
              <div className="ai-thinking" aria-live="polite">
                <ThinkingMark fileWork={fileWork} />
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
