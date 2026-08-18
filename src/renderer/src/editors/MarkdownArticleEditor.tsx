import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { useTranslation } from 'react-i18next'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useAiStore } from '@/state/aiStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { MarkdownToolbar } from './MarkdownToolbar'
import { registerMdHtmlGetter, exportPathToPdf } from '@/export/exportPdf'
import { countArticleWords } from './wordCount'
import { markdownToPrintHtml } from '@/export/markdownToPrintHtml'
import { SOFT_MONACO_OPTIONS, defineKentuckyMonacoThemes } from './softMonaco'
import { bindMonacoLinePick, resolveArticleLineEl } from './monacoLineNav'

function getMarkdownFromEditor(ed: { storage: object }): string {
  const md = (ed.storage as { markdown?: { getMarkdown?: () => string } }).markdown
  return md?.getMarkdown?.() ?? ''
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/** Workspace plans/*.plan.md produced by Plan mode. */
function isWorkspacePlanFile(filePath: string): boolean {
  const n = filePath.replace(/\\/g, '/').toLowerCase()
  return n.includes('/plans/') && n.endsWith('.plan.md')
}

/** True when the plan has checklist items and every one is checked. */
function planTodosAllDone(md: string): boolean {
  const lines = md.split(/\r?\n/)
  const todos = lines.filter((l) => /^\s*-\s+\[[ xX]\]/.test(l))
  if (todos.length === 0) return false
  return todos.every((l) => /^\s*-\s+\[[xX]\]/.test(l))
}

type Mode = 'wysiwyg' | 'source'

type FlashOverlay = { top: number; height: number }

export function MarkdownArticleEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const lineFlash = useAppStore((s) => s.lineFlash)
  const clearLineFlash = useAppStore((s) => s.clearLineFlash)
  const showToast = useAppStore((s) => s.showToast)
  const linePickSession = useAppStore((s) => s.linePickSession)
  const confirmLinePick = useAppStore((s) => s.confirmLinePick)
  const cancelLinePick = useAppStore((s) => s.cancelLinePick)
  const executePlanFile = useAiStore((s) => s.executePlanFile)
  const aiStreaming = useAiStore((s) => s.streaming)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)

  const picking = Boolean(tab && linePickSession?.targetPath === tab.path)
  const flashForTab =
    tab && lineFlash && pathsEqual(lineFlash.path, tab.path) ? lineFlash : null

  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [flashOverlay, setFlashOverlay] = useState<FlashOverlay | null>(null)
  const lastMdRef = useRef('')
  const applyingRef = useRef(false)
  /** After open/AI sync, TipTap may reparse; only serialize back after real user edits. */
  const hydratedRef = useRef(false)
  const monacoRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  useOverlayScroll(scrollerRef)
  const [monacoTick, setMonacoTick] = useState(0)
  const appliedFlashNonce = useRef<number | null>(null)

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
      // GFM tables — without these, tiptap-markdown drops `|` on setContent→getMarkdown
      // (AI propose_text_patch / write sync was corrupting tables & doubling **).
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'article-table' }
      }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: false
      })
    ],
    [placeholder]
  )

  const editor = useEditor({
    extensions,
    // Load via onCreate + emitUpdate:false so open never false-dirties via getMarkdown.
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'article-prose',
        spellcheck: 'false'
      }
    },
    onCreate: ({ editor: ed }) => {
      applyingRef.current = true
      hydratedRef.current = false
      const initial = tab?.content ?? ''
      ed.commands.setContent(initial, { emitUpdate: false })
      lastMdRef.current = initial
      queueMicrotask(() => {
        applyingRef.current = false
        hydratedRef.current = true
      })
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (applyingRef.current || !hydratedRef.current) return
      if (!transaction.docChanged) return
      // setContent / hydration uses addToHistory: false — never treat as user edit.
      if (transaction.getMeta('addToHistory') === false) return
      const md = getMarkdownFromEditor(ed)
      if (md === lastMdRef.current) return
      lastMdRef.current = md
      updateTabContent(tabId, md)
    }
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!picking)
  }, [editor, picking])

  useEffect(() => {
    if (!tab?.path || !editor) return
    return registerMdHtmlGetter(tab.path, () => {
      if (mode === 'source') return markdownToPrintHtml(tab.content)
      return editor.getHTML()
    })
  }, [tab?.path, tab?.content, editor, mode])

  useEffect(() => {
    if (!picking || !tab || !editor) return
    if (mode === 'source') return
    // Line-pick needs source mode; do not push TipTap serialization into a clean tab.
    if (tab.dirty) {
      const md = getMarkdownFromEditor(editor)
      lastMdRef.current = md
      if (md !== tab.content) updateTabContent(tabId, md)
    }
    setMode('source')
    setLinkOpen(false)
  }, [picking, mode, tab, editor, tabId, updateTabContent])

  useEffect(() => {
    if (!tab || !editor) return
    if (mode !== 'wysiwyg') return
    if (tab.content === lastMdRef.current) return
    applyingRef.current = true
    hydratedRef.current = false
    editor.commands.setContent(tab.content || '', { emitUpdate: false })
    lastMdRef.current = tab.content
    queueMicrotask(() => {
      applyingRef.current = false
      hydratedRef.current = true
    })
  }, [tab?.id, tab?.content, editor, mode, tab])

  useEffect(() => {
    hydratedRef.current = false
    if (tab) lastMdRef.current = tab.content
  }, [tab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jump highlight: persistent overlay (survives TipTap DOM rebuilds).
  useEffect(() => {
    if (!flashForTab || !tab || !editor) return
    if (mode !== 'wysiwyg') {
      setMode('wysiwyg')
      return
    }
    if (appliedFlashNonce.current === flashForTab.nonce) return

    let cancelled = false
    let attempt = 0

    const place = (): boolean => {
      const scroller = scrollerRef.current
      if (!scroller) return false
      const lines = tab.content.split(/\r?\n/)
      if (flashForTab.line > lines.length) {
        showToast(t('mindmap.lineNotFound'), 'info')
        clearLineFlash()
        return true
      }
      const el = resolveArticleLineEl(editor, tab.content, flashForTab.line)
      if (!el) return false

      el.scrollIntoView({ behavior: 'auto', block: 'center' })
      const er = el.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      const top = er.top - sr.top + scroller.scrollTop
      const height = Math.max(er.height, 28)
      setFlashOverlay({ top, height })
      appliedFlashNonce.current = flashForTab.nonce
      return true
    }

    const tick = (): void => {
      if (cancelled) return
      if (place()) return
      attempt += 1
      if (attempt >= 24) {
        // Fallback: proportional scroll + full-width band.
        const scroller = scrollerRef.current
        if (scroller) {
          const lines = Math.max(tab.content.split(/\r?\n/).length, 1)
          const ratio = (flashForTab.line - 1) / Math.max(lines - 1, 1)
          const top = ratio * Math.max(scroller.scrollHeight - 40, 0)
          scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3)
          setFlashOverlay({ top, height: 36 })
          appliedFlashNonce.current = flashForTab.nonce
        } else {
          showToast(t('mindmap.lineNotFound'), 'info')
          clearLineFlash()
        }
        return
      }
      window.setTimeout(tick, 50)
    }

    const id = window.setTimeout(tick, 80)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [
    flashForTab,
    tab,
    editor,
    mode,
    showToast,
    t,
    clearLineFlash
  ])

  // Clear overlay on real user interaction (after a short arm delay).
  useEffect(() => {
    if (!flashOverlay) return
    let armed = false
    const armId = window.setTimeout(() => {
      armed = true
    }, 500)

    const dismiss = (): void => {
      if (!armed) return
      setFlashOverlay(null)
      clearLineFlash()
      appliedFlashNonce.current = null
    }

    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('keydown', dismiss, true)
    return () => {
      window.clearTimeout(armId)
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('keydown', dismiss, true)
    }
  }, [flashOverlay, clearLineFlash])

  useEffect(() => {
    const ed = monacoRef.current
    if (!ed) return
    ed.updateOptions({
      readOnly: picking,
      domReadOnly: picking,
      contextmenu: !picking,
      cursorStyle: picking ? 'underline' : 'line'
    })
  }, [picking, monacoTick, mode])

  useEffect(() => {
    const ed = monacoRef.current
    if (!ed || !picking || mode !== 'source') return
    return bindMonacoLinePick(ed, (line) => confirmLinePick(line))
  }, [picking, confirmLinePick, mode, monacoTick])

  const wordCount = useMemo(
    () => countArticleWords(tab?.content ?? ''),
    [tab?.content]
  )

  const onModeChange = useCallback(
    (next: Mode) => {
      if (!tab || picking) return
      if (next === mode) return
      if (next === 'source' && editor) {
        // Only serialize TipTap → store when already dirty; otherwise open/mode-flip
        // false-dirties from getMarkdown normalization.
        if (tab.dirty) {
          const md = getMarkdownFromEditor(editor)
          lastMdRef.current = md
          if (md !== tab.content) updateTabContent(tabId, md)
        }
      }
      if (next === 'wysiwyg' && editor) {
        applyingRef.current = true
        hydratedRef.current = false
        editor.commands.setContent(tab.content || '', { emitUpdate: false })
        lastMdRef.current = tab.content
        queueMicrotask(() => {
          applyingRef.current = false
          hydratedRef.current = true
        })
      }
      setMode(next)
      setLinkOpen(false)
    },
    [mode, editor, tab, tabId, updateTabContent, picking]
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

  const planDone = isWorkspacePlanFile(tab.path) && planTodosAllDone(tab.content || '')
  const planBtnDisabled = aiStreaming || planDone

  return (
    <div className={`article-host ${picking ? 'line-pick-active' : ''}`}>
      {tab && isWorkspacePlanFile(tab.path) && !picking ? (
        <div className={`plan-build-banner${planDone ? ' is-done' : ''}`}>
          <div className="plan-build-banner-text">
            <strong>{t('ai.planFileBannerTitle')}</strong>
            <span>
              {planDone ? t('ai.planFileBannerDoneHint') : t('ai.planFileBannerHint')}
            </span>
          </div>
          <button
            type="button"
            className={`btn-primary plan-build-btn${planDone ? ' is-done' : ''}`}
            disabled={planBtnDisabled}
            onClick={() => void executePlanFile(tab.path)}
          >
            {planDone ? t('ai.executePlanDone') : t('ai.executePlan')}
          </button>
        </div>
      ) : null}

      {!picking ? (
        <MarkdownToolbar
          editor={editor}
          mode={mode}
          wordCount={wordCount}
          onModeChange={onModeChange}
          onRequestLink={openLinkDialog}
          onExportPdf={() => {
            if (tab?.path) void exportPathToPdf(tab.path)
          }}
        />
      ) : null}

      {picking ? (
        <div className="line-pick-banner">
          <span>{t('mindmap.pickLineHint')}</span>
          <button type="button" onClick={() => cancelLinePick()}>
            {t('explorer.cancel')}
          </button>
        </div>
      ) : null}

      {linkOpen && !picking ? (
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
          <div className="article-editor kentucky-overlay-scroll" ref={scrollerRef} style={{ fontSize }}>
            {flashOverlay ? (
              <div
                className="article-line-flash-overlay"
                style={{ top: flashOverlay.top, height: flashOverlay.height }}
              />
            ) : null}
            <EditorContent editor={editor} />
          </div>
        ) : (
          <div className="monaco-host article-source">
            <div className="monaco-host-body">
              <Editor
                height="100%"
                theme={themeMode === 'light' ? 'kentucky-light' : 'kentucky-dark'}
                language="markdown"
                value={tab.content}
                path={`${tab.path}#source`}
                onMount={(ed) => {
                  monacoRef.current = ed
                  ed.updateOptions({
                    readOnly: picking,
                    domReadOnly: picking,
                    contextmenu: !picking,
                    cursorStyle: picking ? 'underline' : 'line'
                  })
                  setMonacoTick((n) => n + 1)
                }}
                onChange={(value) => {
                  if (picking) return
                  const next = value ?? ''
                  lastMdRef.current = next
                  updateTabContent(tabId, next)
                }}
                beforeMount={defineKentuckyMonacoThemes}
                options={{
                  ...SOFT_MONACO_OPTIONS,
                  fontSize,
                  readOnly: picking,
                  domReadOnly: picking,
                  contextmenu: !picking,
                  cursorStyle: picking ? 'underline' : 'line'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
