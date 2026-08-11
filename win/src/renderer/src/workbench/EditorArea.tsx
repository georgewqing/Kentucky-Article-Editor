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

  const isMarkdown = getPlatform().extname(tab.path) === '.md'

  return (
    <div className="editor-pane">
      {tab.kind === 'mindmap' ? (
        <MindMapEditor tabId={tab.id} />
      ) : tab.kind === 'dialogue' ? (
        <DialogueEditor tabId={tab.id} />
      ) : tab.kind === 'characters' ? (
        <CharactersEditor tabId={tab.id} />
      ) : isMarkdown ? (
        <MarkdownArticleEditor key={tab.id} tabId={tab.id} />
      ) : (
        <MonacoTextEditor key={tab.id} tabId={tab.id} />
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
        <div className="tab-bar-scroll">
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
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTab(tab.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
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
