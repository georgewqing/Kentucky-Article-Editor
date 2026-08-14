import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { askConfirm } from '@/state/confirmDialogStore'

type GitFile = {
  path: string
  relPath: string
  index: string
  worktree: string
  untracked: boolean
}

type StatusPayload = {
  repoRoot: string | null
  branch: string | null
  files: GitFile[]
  error: string | null
}

export function ScmPane() {
  const { t } = useTranslation()
  const workspacePath = useAppStore((s) => s.workspacePath)
  const showToast = useAppStore((s) => s.showToast)
  const closeTab = useAppStore((s) => s.closeTab)
  const tabs = useAppStore((s) => s.tabs)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const bodyRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(bodyRef)

  const [probe, setProbe] = useState<{ ok: boolean; version: string | null; error: string | null } | null>(
    null
  )
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [message, setMessage] = useState('')
  const [diffText, setDiffText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!workspacePath) return
    const p = await getPlatform().gitProbe()
    setProbe(p)
    if (!p.ok) {
      setStatus(null)
      return
    }
    const st = (await getPlatform().gitStatus(workspacePath)) as StatusPayload
    setStatus(st)
  }, [workspacePath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!workspacePath) {
    return (
      <div className="scm-pane">
        <div className="sidebar-title">{t('scm.title')}</div>
        <p className="settings-hint">{t('scm.needWorkspace')}</p>
      </div>
    )
  }

  const onInit = async () => {
    setBusy(true)
    try {
      const r = await getPlatform().gitInit(workspacePath)
      if (!r.ok) showToast(r.error || t('scm.initFailed'), 'error')
      else showToast(t('scm.initOk'), 'info')
      await refresh()
      await refreshTree()
    } finally {
      setBusy(false)
    }
  }

  const onSelect = async (f: GitFile) => {
    setSelected(f.relPath)
    const d = (await getPlatform().gitDiff(workspacePath, f.relPath)) as {
      ok: boolean
      diff: string
      error?: string
    }
    setDiffText(d.ok ? d.diff : d.error || '')
  }

  const onDiscard = async (f: GitFile) => {
    if (f.untracked) {
      const ok = await askConfirm({
        title: t('explorer.delete'),
        message: t('scm.confirmDeleteUntracked', { path: f.relPath }),
        confirmLabel: t('explorer.delete'),
        danger: true
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = (await getPlatform().gitDiscard(workspacePath, f.path, {
        untrackedConfirmed: f.untracked
      })) as { ok: boolean; deleted?: boolean; error?: string }
      if (!r.ok) {
        showToast(r.error || t('scm.discardFailed'), 'error')
        return
      }
      // Close tab if deleted; otherwise hub reload broadcasts
      if (r.deleted) {
        const tab = tabs.find(
          (x) => x.path.replace(/\\/g, '/').toLowerCase() === f.path.replace(/\\/g, '/').toLowerCase()
        )
        if (tab) await closeTab(tab.id, true)
      }
      useAppStore.getState().clearAgentChangeRanges(f.path)
      await refresh()
      await refreshTree()
      setDiffText('')
      setSelected(null)
    } finally {
      setBusy(false)
    }
  }

  const onStage = async (f: GitFile) => {
    await getPlatform().gitStage(workspacePath, [f.relPath])
    await refresh()
  }

  const onCommit = async () => {
    const msg = message.trim()
    if (!msg) {
      showToast(t('scm.emptyMessage'), 'error')
      return
    }
    setBusy(true)
    try {
      const r = (await getPlatform().gitCommit(workspacePath, msg)) as {
        ok: boolean
        error?: string
      }
      if (!r.ok) showToast(r.error || t('scm.commitFailed'), 'error')
      else {
        setMessage('')
        showToast(t('scm.commitOk'), 'info')
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scm-pane">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <GitBranch size={14} aria-hidden /> {t('scm.title')}
        </div>
        <button type="button" className="icon-btn" onClick={() => void refresh()} disabled={busy} title={t('scm.refresh')}>
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="sidebar-body kentucky-overlay-scroll" ref={bodyRef}>
        {probe && !probe.ok ? (
          <div className="scm-block">
            <p className="settings-hint">{probe.error || t('scm.gitMissing')}</p>
            <p className="settings-hint">{t('scm.gitPathHint')}</p>
          </div>
        ) : null}

        {probe?.ok && status && !status.repoRoot ? (
          <div className="scm-block">
            <p className="settings-hint">{t('scm.notRepo')}</p>
            <button type="button" className="ai-btn-apply" disabled={busy} onClick={() => void onInit()}>
              {t('scm.init')}
            </button>
          </div>
        ) : null}

        {status?.repoRoot ? (
          <>
            <div className="scm-block scm-meta">
              <div>
                {t('scm.branch')}: <strong>{status.branch || '—'}</strong>
              </div>
              {status.repoRoot.replace(/\\/g, '/').toLowerCase() !==
              workspacePath.replace(/\\/g, '/').toLowerCase() ? (
                <div className="settings-hint">
                  {t('scm.repoRoot')}: {status.repoRoot}
                </div>
              ) : null}
              {status.error ? <div className="settings-hint">{status.error}</div> : null}
            </div>

            <div className="scm-block">
              <div className="scm-section-title">{t('scm.changes')}</div>
              {status.files.length === 0 ? (
                <p className="settings-hint">{t('scm.clean')}</p>
              ) : (
                <ul className="scm-file-list">
                  {status.files.map((f) => (
                    <li key={f.relPath} className={selected === f.relPath ? 'active' : ''}>
                      <button type="button" className="scm-file-btn" onClick={() => void onSelect(f)}>
                        <span className="scm-letter">
                          {f.untracked ? '?' : f.worktree !== ' ' ? f.worktree : f.index}
                        </span>
                        <span className="scm-path" title={f.relPath}>
                          {f.relPath}
                        </span>
                      </button>
                      <div className="scm-file-actions">
                        {!f.untracked || f.index === 'A' ? (
                          <button type="button" onClick={() => void onStage(f)} disabled={busy}>
                            {t('scm.stage')}
                          </button>
                        ) : (
                          <button type="button" onClick={() => void onStage(f)} disabled={busy}>
                            {t('scm.stage')}
                          </button>
                        )}
                        <button type="button" onClick={() => void onDiscard(f)} disabled={busy}>
                          {t('scm.discard')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {diffText ? (
              <div className="scm-block">
                <div className="scm-section-title">{t('scm.diff')}</div>
                <pre className="scm-diff">{diffText}</pre>
              </div>
            ) : null}

            <div className="scm-block scm-commit">
              <textarea
                className="settings-input settings-textarea"
                rows={3}
                placeholder={t('scm.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                type="button"
                className="ai-btn-apply"
                disabled={busy || !message.trim()}
                onClick={() => void onCommit()}
              >
                {t('scm.commit')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
