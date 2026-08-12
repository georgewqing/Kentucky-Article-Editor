import type { FileProposal } from './chatSessions'
import type { AiPublicSettings } from './aiSettings'
import { siblingDialogueCsvPath } from './formats'

export type ProposalKind =
  | 'prose'
  | 'characters'
  | 'dialogue'
  | 'dialogue_performance'
  | 'dialogue_choices'
  | 'dialogue_layout'
  | 'kmind'
  | 'kmind_layout'
  | 'story_state'
  | 'foreshadow'
  | 'voice_anchor'
  | 'voice_bank'
  | 'glossary'
  | 'materials_index'
  | 'revision_meta'
  | 'other'

export type FileProposalEx = FileProposal & {
  kind?: ProposalKind
  /** Dialogue lines touched / appended */
  changeCount?: number
}

/** Bump when write-gate / tool result shape changes — agents can detect stale main process. */
export const TOOL_API_VERSION = '2026-08-12-l'

const MEMORY_KINDS = new Set<ProposalKind>([
  'story_state',
  'foreshadow',
  'voice_anchor',
  'voice_bank',
  'glossary',
  'materials_index',
  'revision_meta'
])

function extOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() || ''
  const i = base.lastIndexOf('.')
  return i >= 0 ? base.slice(i).toLowerCase() : ''
}

function inferKind(p: FileProposalEx): ProposalKind {
  if (p.kind) return p.kind
  const rel = p.path.replace(/\\/g, '/').toLowerCase()
  if (rel === 'characters.csv' || rel.endsWith('/characters.csv')) return 'characters'
  if (rel === 'story_state.yaml' || rel.endsWith('/story_state.yaml')) return 'story_state'
  if (rel === 'foreshadow.yaml' || rel.endsWith('/foreshadow.yaml')) return 'foreshadow'
  if (rel === 'voice_anchor.yaml' || rel.endsWith('/voice_anchor.yaml')) return 'voice_anchor'
  if (rel === 'voice_bank.yaml' || rel.endsWith('/voice_bank.yaml')) return 'voice_bank'
  if (rel === 'glossary.yaml' || rel.endsWith('/glossary.yaml')) return 'glossary'
  if (rel === 'materials/index.yaml' || rel.endsWith('/materials/index.yaml')) return 'materials_index'
  if (rel === 'revisions/manifest.yaml' || rel.endsWith('/revisions/manifest.yaml'))
    return 'revision_meta'
  if (rel.endsWith('.dialogue.choices.json')) return 'dialogue_choices'
  if (rel.endsWith('.dialogue.layout.json')) return 'dialogue_layout'
  if (rel.endsWith('.dialogue.csv')) return 'dialogue'
  if (rel.endsWith('.kmind')) return 'kmind'
  const ext = extOf(rel)
  if (ext === '.md' || ext === '.txt') return 'prose'
  return 'other'
}

export { inferKind, MEMORY_KINDS }

function pathKey(abs: string): string {
  return abs.replace(/\//g, '\\').toLowerCase()
}

/** plans/*.plan.md checkbox updates must not poison multi_file_turn (Soft, not gated). */
function isPlanPathKey(key: string): boolean {
  const n = key.replace(/\\/g, '/')
  return n.includes('/plans/') && n.endsWith('.plan.md')
}

/** Paths that count toward multi_file_turn telemetry (excludes plan Soft writes). */
export function countOtherContentPaths(turnPaths: Set<string>, absPath: string): number {
  const selfKey = pathKey(absPath)
  return Array.from(turnPaths).filter((p) => p !== selfKey && !isPlanPathKey(p)).length
}

/** True if this turn already touched a different absolute path. */
export function turnHasOtherPath(turnPaths: Set<string>, absPath: string): boolean {
  const key = pathKey(absPath)
  for (const p of Array.from(turnPaths)) {
    if (p !== key) return true
  }
  return false
}

/**
 * Agent always writes disk (Git working tree = truth). Setting applyWritesToDisk ignored.
 */
export function shouldPersistAutoToDisk(
  _proposal: FileProposalEx,
  _settings: AiPublicSettings
): boolean {
  return true
}

export type GateDecision = {
  auto: boolean
  /** Stable machine-readable reason */
  reason: string
  kind: ProposalKind
  /** Other distinct paths already in this turn (excludes current) */
  otherTurnPaths: number
}

/**
 * Always auto-apply (Cursor-like). forceReviewAllWrites is ignored (legacy).
 * reason/kind kept for telemetry + tool results.
 */
export function decideAutoApply(
  proposal: FileProposalEx,
  turnPaths: Set<string>,
  _settings: AiPublicSettings
): GateDecision {
  const kind = inferKind(proposal)
  const otherTurnPaths = countOtherContentPaths(turnPaths, proposal.absPath)

  if (!proposal.before.trim()) {
    return { auto: true, reason: 'new_or_empty_file', kind, otherTurnPaths }
  }
  if (kind === 'kmind_layout' || kind === 'dialogue_layout') {
    return { auto: true, reason: 'layout_only', kind, otherTurnPaths }
  }
  if (kind === 'characters') {
    return { auto: true, reason: 'character_upsert', kind, otherTurnPaths }
  }
  if (MEMORY_KINDS.has(kind)) {
    return { auto: true, reason: 'memory_yaml_upsert', kind, otherTurnPaths }
  }
  if (kind === 'dialogue_choices') {
    const csv = siblingDialogueCsvPath(proposal.absPath)
    if (csv && turnPaths.has(pathKey(csv))) {
      return { auto: true, reason: 'choices_with_sibling_dialogue', kind, otherTurnPaths }
    }
  }
  if (kind === 'dialogue') {
    const n = typeof proposal.changeCount === 'number' ? proposal.changeCount : 99
    if (n <= 5) return { auto: true, reason: 'small_dialogue_edit', kind, otherTurnPaths }
    return { auto: true, reason: 'dialogue_auto', kind, otherTurnPaths }
  }
  if (otherTurnPaths >= 1) {
    return { auto: true, reason: 'multi_file_auto', kind, otherTurnPaths }
  }
  return { auto: true, reason: 'always_auto', kind, otherTurnPaths }
}

export function shouldAutoApply(
  proposal: FileProposalEx,
  turnPaths: Set<string>,
  settings: AiPublicSettings
): boolean {
  return decideAutoApply(proposal, turnPaths, settings).auto
}

/** Stable hint for the model + UI. */
export function proposalReviewHint(proposal: FileProposalEx, autoApplied: boolean): string {
  if (autoApplied) {
    const kind = inferKind(proposal)
    if (!proposal.before.trim()) return 'auto: new_or_empty_file'
    if (kind === 'characters') return 'auto: character_upsert'
    if (MEMORY_KINDS.has(kind)) return 'auto: memory_yaml_upsert'
    if (kind === 'kmind_layout' || kind === 'dialogue_layout') return 'auto: layout_only'
    if (kind === 'dialogue') return 'auto: dialogue'
    return 'auto'
  }
  return 'auto: unexpected_pending'
}

export function proposalToolNote(autoApplied: boolean): string {
  if (autoApplied) {
    return 'Already written to the workspace (disk). File is marked dirty until the user saves (Ctrl+S). Summarize as written; do not ask to Accept/Apply. Mistakes: user can discard via Source Control or undo.'
  }
  return 'Unexpected pending state — treat as written if disk matches.'
}

/** One-line rules for tool descriptions / system prompt. */
export const WRITE_GATE_SUMMARY =
  'Write gate: ALL agent file writes auto-apply and ALWAYS hit disk immediately (Git working tree). Yellow dirty = unsaved vs last Ctrl+S baseline — not Accept. No Accept/Reject cards for files. Results include written/pending/reviewHint/gateDetail/toolApi. Story conflicts are WARN-only. UI shows readonly change cards with diff. Git: workspace auto-inits; all git_* execute immediately (no force; no Confirm); write ops → highlight card + toast; local remote paths auto bare-init on add/push.'

/** Standing Git instructions — apply in every chat (plus live Git L5 each turn). */
export const GIT_AGENT_PLAYBOOK = [
  'Git tools (CRITICAL — use in every new chat; do not wait for prior conversation memory):',
  '- Prefer git_* tools over guessing. Live snapshot is under Editor context as “Git (L5)”.',
  '- Inventory: git_status. Detail: git_diff(path). History: git_log. Sync: git_pull / git_push.',
  '- Save work: git_add(all=true|paths[]) → git_commit(message) → git_push (optional setUpstream+branch). All auto; highlight cards appear in chat.',
  '- Remotes: git_remote_add(name,url) accepts https/ssh/file/local paths (spaces OK); missing local bare auto-creates. git_remote_remove(name) drops bad remotes.',
  '- Never --force. Never claim success unless the tool result says ok/executed. File discard stays in Source Control UI.',
  '- User intent cues (备份/提交/推送/同步/remote/裸仓/commit/push) → call matching git_* in this turn.'
].join('\n')

export const CHARACTERS_CSV_FORMAT =
  'characters.csv columns: id,name,color,note,model_node,operable (6). operable=true means player-confirm on empty text.'
