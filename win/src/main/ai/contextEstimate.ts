import {
  estimateTokensFromText,
  estimateSessionTokens,
  type ChatSession
} from './chatSessions'
import { loadAiSettings } from './aiSettings'
import { LITERARY_SYSTEM_PROMPT, getWritingToolsForMode, type AgentToolMode } from './tools'
import { skillsCatalogText } from './skills'

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
  mode: AgentToolMode = 'agent'
): ContextUsageBreakdown {
  const settings = loadAiSettings()
  const limit = settings.contextWindow || 128000
  const catalog = skillsCatalogText()
  const styleMemo = (settings.styleMemo || '').trim()

  const systemText = LITERARY_SYSTEM_PROMPT('', mode, {
    skillsCatalog: '', // counted under skills
    webSearchEnabled: settings.webSearchEnabled
  })
  const toolsJson = JSON.stringify(
    getWritingToolsForMode(mode, { webSearchEnabled: settings.webSearchEnabled })
  )

  const buckets: ContextBucket[] = [
    { id: 'system', tokens: estimateTokensFromText(systemText) },
    { id: 'tools', tokens: estimateTokensFromText(toolsJson) },
    {
      id: 'skills',
      tokens: catalog ? estimateTokensFromText(catalog) : 0
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
