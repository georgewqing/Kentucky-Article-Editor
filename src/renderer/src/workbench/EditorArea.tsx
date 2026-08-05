import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { MonacoTextEditor } from '@/editors/MonacoTextEditor'
import { MarkdownArticleEditor } from '@/editors/MarkdownArticleEditor'
import { MindMapEditor } from '@/editors/MindMapEditor'

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

  const isMarkdown = getPlatform().extname(tab.path) === '.md'

  return (
    <div className="editor-pane">
      {tab.kind === 'mindmap' ? (
        <MindMapEditor tabId={tab.id} />
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
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const splitEnabled = useAppStore((s) => s.splitEnabled)
  const splitTabId = useAppStore((s) => s.splitTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const enableSplit = useAppStore((s) => s.enableSplit)
  const disableSplit = useAppStore((s) => s.disableSplit)
  const setSplitTab = useAppStore((s) => s.setSplitTab)

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
              {tab.dirty ? <span className="tab-dirty">● </span> : null}
              {tab.title}
            </span>
            <button
              type="button"
              className="tab-close"
              title={t('editor.close')}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
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
            <button type="button" disabled={tabs.length < 1} onClick={() => enableSplit()}>
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
