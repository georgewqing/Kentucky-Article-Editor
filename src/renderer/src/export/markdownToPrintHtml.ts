import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Markdown.configure({
    html: false,
    tightLists: true,
    bulletListMarker: '-',
    linkify: false,
    breaks: false
  })
]

/** Convert markdown (workspace buffer or disk) to print HTML. */
export function markdownToPrintHtml(md: string): string {
  const ed = new Editor({
    content: '',
    extensions,
    editable: false
  })
  try {
    ed.commands.setContent(md || '', { emitUpdate: false })
    return ed.getHTML()
  } finally {
    ed.destroy()
  }
}
