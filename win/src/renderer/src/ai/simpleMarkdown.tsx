import type { ReactNode } from 'react'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Lightweight Markdown → React for AI chat (no extra dependency). */
export function SimpleMarkdown({ text }: { text: string }): ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const body = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
          return (
            <pre key={i}>
              <code>{body}</code>
            </pre>
          )
        }
        const html = escapeHtml(part)
          .replace(/^### (.+)$/gm, '<strong>$1</strong>')
          .replace(/^## (.+)$/gm, '<strong>$1</strong>')
          .replace(/^# (.+)$/gm, '<strong>$1</strong>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br/>')
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </>
  )
}
