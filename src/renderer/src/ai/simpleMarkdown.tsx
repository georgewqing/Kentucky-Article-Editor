import type { ReactNode, MouseEvent } from 'react'
import { looksLikePathLineCite } from '@shared/articleLine'
import { openWorkspaceHref } from '@/workbench/workspaceLinks'

function renderBoldAndBreaks(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const body = heading ? heading[2] : line
    const chunks = body.split(/(\*\*[^*]+\*\*)/g)
    chunks.forEach((chunk, ci) => {
      if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
        nodes.push(<strong key={`${keyBase}-${li}-${ci}`}>{chunk.slice(2, -2)}</strong>)
      } else if (chunk) {
        nodes.push(<span key={`${keyBase}-${li}-${ci}`}>{chunk}</span>)
      }
    })
    if (li < lines.length - 1) nodes.push(<br key={`${keyBase}-br-${li}`} />)
  })
  return nodes
}

function WorkspaceChip({
  href,
  children
}: {
  href: string
  children: ReactNode
}): ReactNode {
  const onClick = (e: MouseEvent): void => {
    e.preventDefault()
    void openWorkspaceHref(href)
  }
  return (
    <button type="button" className="ai-ws-link" onClick={onClick}>
      {children}
    </button>
  )
}

function renderInlines(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(...renderBoldAndBreaks(text.slice(last, m.index), `${keyBase}-t${n}`))
    }
    if (m[1] != null && m[2] != null) {
      nodes.push(
        <WorkspaceChip key={`${keyBase}-a${n}`} href={m[2]}>
          {m[1]}
        </WorkspaceChip>
      )
    } else if (m[3] != null) {
      const code = m[3]
      if (looksLikePathLineCite(code)) {
        nodes.push(
          <WorkspaceChip key={`${keyBase}-c${n}`} href={code}>
            <code>{code}</code>
          </WorkspaceChip>
        )
      } else {
        nodes.push(<code key={`${keyBase}-c${n}`}>{code}</code>)
      }
    }
    last = m.index + m[0].length
    n++
  }
  if (last < text.length) {
    nodes.push(...renderBoldAndBreaks(text.slice(last), `${keyBase}-t${n}`))
  }
  return nodes
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
        return <span key={i}>{renderInlines(part, `p${i}`)}</span>
      })}
    </>
  )
}
