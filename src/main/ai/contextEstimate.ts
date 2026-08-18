import {
  estimateTokensFromText,
  estimateSessionTokens,
  type ChatSession
} from './chatSessions'
import { loadAiSettings } from './aiSettings'
import { LITERARY_SYSTEM_PROMPT, getWritingToolsForMode, type AgentToolMode } from './tools'
import { skillsCatalogText, cavemanSystemBlock } from './skills'
import { workspaceHasDesignTree } from './designGddL5'

export type ContextBucketId =
  | 'system'
  | 'tools'
  | 'skills'
  | 'rules'
  | 'conversation'

export type ContextBucket = {
  id: ContextBucketId
  tokens: number
}

export type ContextUsageBreakdown = {
  used: number
  limit: number
  buckets: ContextBucket[]
}

const BUCKET_ORDER: ContextBucketId[] = [
  'system',
  'tools',
  'skills',
  'rules',
  'conversation'
]

/** Estimate fixed + session context the agent typically sends (rough char/4). */
export function estimateContextBreakdown(
  session: ChatSession | null,
  mode: AgentToolMode = 'agent',
  workspaceRoot?: string | null
): ContextUsageBreakdown {
  const settings = loadAiSettings()
  const limit = settings.contextWindow || 128000
  const catalog = skillsCatalogText()
  const caveman = cavemanSystemBlock()
  const styleMemo = (settings.styleMemo || '').trim()

  const systemText = LITERARY_SYSTEM_PROMPT('', mode, {
    skillsCatalog: '', // counted under skills
    cavemanBody: '',
    webSearchEnabled: settings.webSearchEnabled,
    designDiscipline: workspaceHasDesignTree(workspaceRoot || session?.workspacePath || '')
  })
  const toolsJson = JSON.stringify(
    getWritingToolsForMode(mode, { webSearchEnabled: settings.webSearchEnabled }) ?? []
  )
  const skillsText = [catalog, caveman].filter(Boolean).join('\n')

  const buckets: ContextBucket[] = [
    { id: 'system', tokens: estimateTokensFromText(systemText) },
    { id: 'tools', tokens: toolsJson ? estimateTokensFromText(toolsJson) : 0 },
    {
      id: 'skills',
      tokens: skillsText ? estimateTokensFromText(skillsText) : 0
    },
    {
      id: 'rules',
      tokens: styleMemo ? estimateTokensFromText(`Style memo:\n${styleMemo}`) : 0
    },
    {
      id: 'conversation',
      tokens: session ? estimateSessionTokens(session) : 0
    }
  ]

  // Always return every bucket (0 ok) so UI sum === used and order is stable.
  const ordered = BUCKET_ORDER.map((id) => buckets.find((b) => b.id === id)!)
  const used = ordered.reduce((n, b) => n + b.tokens, 0)
  return {
    used,
    limit,
    buckets: ordered.filter((b) => b.tokens > 0)
  }
}
