import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CiteLink } from '@shared/agentAsk'
import { openWorkspaceHref } from '@/workbench/workspaceLinks'

export function CiteWorkspaceCard({ links }: { links: CiteLink[] }): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="ai-tool-block">
      <div className="ai-tool-block-head">
        <span className="ai-tool-prompt" aria-hidden>
          &gt;_
        </span>
        <span className="ai-tool-block-title">{t('ai.citeTitle')}</span>
        <span className="ai-tool-block-tag">{t('ai.toolTagCite')}</span>
      </div>
      <div className="ai-cite-links">
        {links.map((link, i) => {
          const href = link.line ? `${link.path}:${link.line}` : link.path
          const label = link.label || href
          return (
            <button
              key={`${link.path}-${i}`}
              type="button"
              className={`ai-cite-chip${link.exists ? '' : ' is-missing'}`}
              onClick={() => void openWorkspaceHref(href)}
              title={link.exists ? href : t('ai.citeMissing')}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
