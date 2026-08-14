import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { MonacoTextEditor } from '@/editors/MonacoTextEditor'
import { MarkdownArticleEditor } from '@/editors/MarkdownArticleEditor'
import { MindMapEditor } from '@/editors/MindMapEditor'
import { DialogueEditor } from '@/editors/DialogueEditor'
import { StoryboardEditor } from '@/editors/StoryboardEditor'
import { ImagePreviewEditor } from '@/editors/ImagePreviewEditor'
import { VideoPreviewEditor } from '@/editors/VideoPreviewEditor'
import { PdfPreviewEditor } from '@/editors/PdfPreviewEditor'
import { ToastLayer } from './ToastLayer'

export function FloatWorkbench() {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs[0])

  const isMarkdown = tab ? getPlatform().extname(tab.path) === '.md' : false

  return (
    <div className="app-root float-root">
      <div className="float-titlebar">
        <span className="float-title">
          {tab?.isNew ? (
            <span className="tab-new">● </span>
          ) : tab?.dirty ? (
            <span className="tab-dirty">● </span>
          ) : null}
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
        ) : tab.kind === 'storyboard' ? (
          <StoryboardEditor key={tab.id} tabId={tab.id} />
        ) : tab.kind === 'image' ? (
          <ImagePreviewEditor tabId={tab.id} />
        ) : tab.kind === 'video' ? (
          <VideoPreviewEditor tabId={tab.id} />
        ) : tab.kind === 'pdf' ? (
          <PdfPreviewEditor tabId={tab.id} />
        ) : isMarkdown ? (
          <MarkdownArticleEditor key={tab.id} tabId={tab.id} />
        ) : (
          <MonacoTextEditor key={tab.id} tabId={tab.id} />
        )}
      </div>
      <ToastLayer />
    </div>
  )
}
