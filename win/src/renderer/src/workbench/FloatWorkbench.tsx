import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { MonacoTextEditor } from '@/editors/MonacoTextEditor'
import { MarkdownArticleEditor } from '@/editors/MarkdownArticleEditor'
import { MindMapEditor } from '@/editors/MindMapEditor'
import { DialogueEditor } from '@/editors/DialogueEditor'

export function FloatWorkbench() {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs[0])
  const toast = useAppStore((s) => s.toast)

  const isMarkdown = tab ? getPlatform().extname(tab.path) === '.md' : false

  return (
    <div className="app-root float-root">
      <div className="float-titlebar">
        <span className="float-title">
          {tab?.dirty ? <span className="tab-dirty">● </span> : null}
          {tab?.title ?? t('editor.noEditor')}
        </span>
      </div>
      <div className="float-body">
        {!tab ? (
          <div className="editor-empty">{t('editor.noEditor')}</div>
        ) : tab.kind === 'mindmap' ? (
          <MindMapEditor tabId={tab.id} />
        ) : tab.kind === 'dialogue' ? (
          <DialogueEditor tabId={tab.id} />
        ) : isMarkdown ? (
          <MarkdownArticleEditor tabId={tab.id} />
        ) : (
          <MonacoTextEditor tabId={tab.id} />
        )}
      </div>
      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  )
}
