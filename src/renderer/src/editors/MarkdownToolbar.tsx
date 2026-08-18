import type { ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  ListTodo,
  CodeSquare,
  Minus,
  Undo2,
  Redo2,
  FileDown,
  FileCode2,
  PenLine
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  editor: Editor | null
  mode: 'wysiwyg' | 'source'
  wordCount: number
  onModeChange: (mode: 'wysiwyg' | 'source') => void
  onRequestLink: () => void
  onExportPdf?: () => void
}

const iconProps = { size: 16, strokeWidth: 1.6 }

function ToolBtn({
  title,
  active,
  disabled,
  onClick,
  children
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={active ? 'active' : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function readToolbarState(editor: Editor | null) {
  if (!editor) {
    return {
      bold: false,
      italic: false,
      strike: false,
      code: false,
      link: false,
      h1: false,
      h2: false,
      h3: false,
      quote: false,
      bullet: false,
      ordered: false,
      task: false,
      codeBlock: false,
      canUndo: false,
      canRedo: false
    }
  }
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
    h1: editor.isActive('heading', { level: 1 }),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    quote: editor.isActive('blockquote'),
    bullet: editor.isActive('bulletList'),
    ordered: editor.isActive('orderedList'),
    task: editor.isActive('taskList'),
    codeBlock: editor.isActive('codeBlock'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo()
  }
}

export function MarkdownToolbar({
  editor,
  mode,
  wordCount,
  onModeChange,
  onRequestLink,
  onExportPdf
}: Props) {
  const { t } = useTranslation()
  const wysiwyg = mode === 'wysiwyg'
  // Re-render on every editor transaction so toggle active states update immediately.
  const active =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => readToolbarState(ed)
    }) ?? readToolbarState(null)

  return (
    <div className="article-toolbar">
      <div className="article-toolbar-group">
        <ToolBtn
          title={t('article.bold')}
          disabled={!wysiwyg}
          active={wysiwyg && active.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.italic')}
          disabled={!wysiwyg}
          active={wysiwyg && active.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.strike')}
          disabled={!wysiwyg}
          active={wysiwyg && active.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.code')}
          disabled={!wysiwyg}
          active={wysiwyg && active.code}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <Code {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.link')}
          disabled={!wysiwyg}
          active={wysiwyg && active.link}
          onClick={onRequestLink}
        >
          <LinkIcon {...iconProps} />
        </ToolBtn>
      </div>

      <div className="article-toolbar-sep" />

      <div className="article-toolbar-group">
        <ToolBtn
          title={t('article.h1')}
          disabled={!wysiwyg}
          active={wysiwyg && active.h1}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.h2')}
          disabled={!wysiwyg}
          active={wysiwyg && active.h2}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.h3')}
          disabled={!wysiwyg}
          active={wysiwyg && active.h3}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.quote')}
          disabled={!wysiwyg}
          active={wysiwyg && active.quote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.bulletList')}
          disabled={!wysiwyg}
          active={wysiwyg && active.bullet}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.orderedList')}
          disabled={!wysiwyg}
          active={wysiwyg && active.ordered}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.taskList')}
          disabled={!wysiwyg}
          active={wysiwyg && active.task}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          <ListTodo {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.codeBlock')}
          disabled={!wysiwyg}
          active={wysiwyg && active.codeBlock}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <CodeSquare {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.hr')}
          disabled={!wysiwyg}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          <Minus {...iconProps} />
        </ToolBtn>
      </div>

      <div className="article-toolbar-sep" />

      <div className="article-toolbar-group">
        <ToolBtn
          title={t('article.undo')}
          disabled={!wysiwyg || !active.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.redo')}
          disabled={!wysiwyg || !active.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 {...iconProps} />
        </ToolBtn>
      </div>

      <div className="article-toolbar-spacer" />

      <span className="article-word-count" title={t('article.wordCount')}>
        {t('article.words', { count: wordCount })}
      </span>

      <div className="article-toolbar-group">
        <ToolBtn title={t('article.exportPdf')} onClick={() => onExportPdf?.()}>
          <FileDown {...iconProps} />
        </ToolBtn>
      </div>

      <div className="article-toolbar-group">
        <ToolBtn
          title={t('article.modeWrite')}
          active={mode === 'wysiwyg'}
          onClick={() => onModeChange('wysiwyg')}
        >
          <PenLine {...iconProps} />
        </ToolBtn>
        <ToolBtn
          title={t('article.modeSource')}
          active={mode === 'source'}
          onClick={() => onModeChange('source')}
        >
          <FileCode2 {...iconProps} />
        </ToolBtn>
      </div>
    </div>
  )
}
