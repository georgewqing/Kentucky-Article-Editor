import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { MonacoTextEditor } from '@/editors/MonacoTextEditor'
import { MarkdownArticleEditor } from '@/editors/MarkdownArticleEditor'
import { MindMapEditor } from '@/editors/MindMapEditor'
import { DialogueEditor } from '@/editors/DialogueEditor'
import { CharactersEditor } from '@/editors/CharactersEditor'

function EditorPane({ tabId }: { tabId: string | null }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => (tabId ? s.tabs.find((x) => x.id === tabId) : undefined))

  if (!tab) {
    return (
      <div className="editor-pane">
        <div className="editor-empty">{t('editor.noEditor')}</div>
      </div>
    )
  }

  const isMarkdown =
    getPlatform().extname(tab.path) === '.md' ||
    /\.md\.txt$/i.test(tab.path.replace(/\\/g, '/'))

  return (
    <div className="editor-pane">
      {tab.kind === 'mindmap' ? (
        <MindMapEditor tabId={tab.id} />
      ) : tab.kind === 'dialogue' ? (
        <DialogueEditor tabId={tab.id} />
      ) : tab.kind === 'characters' ? (
        <CharactersEditor tabId={tab.id} />
      ) : isMarkdown ? (
        <MarkdownArticleEditor tabId={tab.id} />
      ) : (
        <MonacoTextEditor tabId={tab.id} />
      )}
    </div>
  )
}

export function EditorArea() {
  const { t } = useTranslation()
  const [compactLayout, setCompactLayout] = useState(() =>
    window.matchMedia('(max-width: 1100px)').matches
  )
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const splitEnabled = useAppStore((s) => s.splitEnabled)
  const splitTabId = useAppStore((s) => s.splitTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const enableSplit = useAppStore((s) => s.enableSplit)
  const disableSplit = useAppStore((s) => s.disableSplit)
  const setSplitTab = useAppStore((s) => s.setSplitTab)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)')
    const update = (): void => setCompactLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (compactLayout && splitEnabled) disableSplit()
  }, [compactLayout, splitEnabled, disableSplit])

  const onTabClick = (id: string, isSplitPane: boolean) => {
    if (isSplitPane) setSplitTab(id)
    else setActiveTab(id)
  }

  return (
    <section className="editor-area">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id, false)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (splitEnabled) setSplitTab(tab.id)
            }}
          >
            <span className="tab-title">
              {tab.isNew ? (
                <span className="tab-new" title={t('editor.tabNew')}>
                  ●{' '}
                </span>
              ) : tab.dirty ? (
                <span className="tab-dirty" title={t('editor.tabDirty')}>
                  ●{' '}
                </span>
              ) : null}
              {tab.title}
            </span>
            <button
              type="button"
              className="tab-close"
              title={t('editor.close')}
              aria-label={`${t('editor.close')} ${tab.title}`}
              onPointerDown={(e) => {
                // Keep the parent tab from taking ownership before the close click.
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(tab.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="tab-bar-spacer" />
        <div className="tab-bar-actions">
          {splitEnabled ? (
            <button type="button" onClick={disableSplit}>
              {t('editor.closeSplit')}
            </button>
          ) : (
            <button
              type="button"
              disabled={tabs.length < 1 || compactLayout}
              title={compactLayout ? t('editor.splitNeedsWideScreen') : undefined}
              onClick={() => enableSplit()}
            >
              {t('editor.splitEditor')}
            </button>
          )}
        </div>
      </div>
      <div className="editors-split">
        <EditorPane tabId={activeTabId} />
        {splitEnabled ? <EditorPane tabId={splitTabId} /> : null}
      </div>
    </section>
  )
}
