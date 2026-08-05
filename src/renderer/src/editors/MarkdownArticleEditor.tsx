import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { MarkdownToolbar } from './MarkdownToolbar'
import { countArticleWords } from './wordCount'
import { SOFT_MONACO_OPTIONS, defineKentuckyMonacoThemes } from './softMonaco'

function getMarkdownFromEditor(ed: { storage: object }): string {
  const md = (ed.storage as { markdown?: { getMarkdown?: () => string } }).markdown
  return md?.getMarkdown?.() ?? ''
}

type Mode = 'wysiwyg' | 'source'

export function MarkdownArticleEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)

  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const lastMdRef = useRef('')
  const applyingRef = useRef(false)

  const placeholder = t('article.placeholder')

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'article-code-block' } }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'article-link' }
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    [placeholder]
  )

  const editor = useEditor({
    extensions,
    content: tab?.content ?? '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'article-prose',
        spellcheck: 'true'
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (applyingRef.current) return
      const md = getMarkdownFromEditor(ed)
      lastMdRef.current = md
      updateTabContent(tabId, md)
    }
  })

  // Load tab content into TipTap when tab switches or external content changes while in wysiwyg.
  useEffect(() => {
    if (!tab || !editor) return
    if (mode !== 'wysiwyg') return
    if (tab.content === lastMdRef.current) return
    applyingRef.current = true
    editor.commands.setContent(tab.content || '')
    lastMdRef.current = tab.content
    queueMicrotask(() => {
      applyingRef.current = false
    })
  }, [tab?.id, tab?.content, editor, mode, tab])

  useEffect(() => {
    if (tab) lastMdRef.current = tab.content
  }, [tab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const wordCount = useMemo(
    () => countArticleWords(tab?.content ?? ''),
    [tab?.content]
  )

  const onModeChange = useCallback(
    (next: Mode) => {
      if (!tab) return
      if (next === mode) return
      if (next === 'source' && editor) {
        const md = getMarkdownFromEditor(editor)
        lastMdRef.current = md
        if (md !== tab.content) updateTabContent(tabId, md)
      }
      if (next === 'wysiwyg' && editor) {
        applyingRef.current = true
        editor.commands.setContent(tab.content || '')
        lastMdRef.current = tab.content
        queueMicrotask(() => {
          applyingRef.current = false
        })
      }
      setMode(next)
      setLinkOpen(false)
    },
    [mode, editor, tab, tabId, updateTabContent]
  )

  const openLinkDialog = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    setLinkUrl(prev ?? '')
    setLinkOpen(true)
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkOpen(false)
  }, [editor, linkUrl])

  if (!tab) return null

  return (
    <div className="article-host">
      <MarkdownToolbar
        editor={editor}
        mode={mode}
        wordCount={wordCount}
        onModeChange={onModeChange}
        onRequestLink={openLinkDialog}
      />

      {linkOpen ? (
        <form
          className="article-link-form"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            autoFocus
            type="url"
            placeholder={t('article.linkPlaceholder')}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLinkOpen(false)
            }}
          />
          <button type="submit" className="btn-primary">
            {t('article.linkApply')}
          </button>
          <button
            type="button"
            onClick={() => {
              editor?.chain().focus().extendMarkRange('link').unsetLink().run()
              setLinkOpen(false)
            }}
          >
            {t('article.linkRemove')}
          </button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            {t('explorer.cancel')}
          </button>
        </form>
      ) : null}

      <div className="article-body">
        {mode === 'wysiwyg' ? (
          <EditorContent
            editor={editor}
            style={{ fontSize }}
            className="article-editor"
          />
        ) : (
          <div className="monaco-host article-source">
            <Editor
              height="100%"
              theme={themeMode === 'light' ? 'kentucky-light' : 'kentucky-dark'}
              language="markdown"
              value={tab.content}
              path={`${tab.path}#source`}
              onChange={(value) => {
                const next = value ?? ''
                lastMdRef.current = next
                updateTabContent(tabId, next)
              }}
              beforeMount={defineKentuckyMonacoThemes}
              options={{
                ...SOFT_MONACO_OPTIONS,
                fontSize
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
