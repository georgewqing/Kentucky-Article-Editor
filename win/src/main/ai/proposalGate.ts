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
  | 'other'

export type FileProposalEx = FileProposal & {
  kind?: ProposalKind
  /** Dialogue lines touched / appended */
  changeCount?: number
}

/** Bump when write-gate / tool result shape changes — agents can detect stale main process. */
export const TOOL_API_VERSION = '2026-08-11-g'

function extOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() || ''
  const i = base.lastIndexOf('.')
  return i >= 0 ? base.slice(i).toLowerCase() : ''
}

function inferKind(p: FileProposalEx): ProposalKind {
  if (p.kind) return p.kind
  const rel = p.path.replace(/\\/g, '/').toLowerCase()
  if (rel === 'characters.csv' || rel.endsWith('/characters.csv')) return 'characters'
  if (rel.endsWith('.dialogue.choices.json')) return 'dialogue_choices'
  if (rel.endsWith('.dialogue.layout.json')) return 'dialogue_layout'
  if (rel.endsWith('.dialogue.csv')) return 'dialogue'
  if (rel.endsWith('.kmind')) return 'kmind'
  const ext = extOf(rel)
  if (ext === '.md' || ext === '.txt') return 'prose'
  return 'other'
}

export { inferKind }

function pathKey(abs: string): string {
  return abs.replace(/\//g, '\\').toLowerCase()
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
 * When auto-applied, whether to write disk immediately.
 * Cast / small dialogue / layouts must hit disk even if user setting is "mark dirty only",
 * otherwise continuity_check and Godot see stale files (ghost cast).
 */
export function shouldPersistAutoToDisk(
  proposal: FileProposalEx,
  settings: AiPublicSettings
): boolean {
  if (settings.applyWritesToDisk) return true
  if (!proposal.before.trim()) return true
  const kind = inferKind(proposal)
  if (kind === 'characters') return true
  if (kind === 'kmind_layout' || kind === 'dialogue_layout') return true
  if (kind === 'dialogue_choices') return true
  if (kind === 'dialogue') {
    const n = typeof proposal.changeCount === 'number' ? proposal.changeCount : 99
    return n <= 5
  }
  return false
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
 * G3 gate: whether this proposal may auto-apply (no Accept).
 * `turnPaths` = absolute paths already committed earlier in this user turn (NOT including current).
 *
 * There is NO "N character cards → pending" threshold. The only `≤5` rule is dialogue LINE count.
 * Character upserts always auto (unless forceReviewAllWrites).
 */
export function decideAutoApply(
  proposal: FileProposalEx,
  turnPaths: Set<string>,
  settings: AiPublicSettings
): GateDecision {
  const kind = inferKind(proposal)
  const selfKey = pathKey(proposal.absPath)
  const otherTurnPaths = Array.from(turnPaths).filter((p) => p !== selfKey).length

  if (settings.forceReviewAllWrites) {
    return { auto: false, reason: 'force_review_all_writes', kind, otherTurnPaths }
  }
  if (!proposal.before.trim()) {
    return { auto: true, reason: 'new_or_empty_file', kind, otherTurnPaths }
  }
  if (kind === 'kmind_layout' || kind === 'dialogue_layout') {
    return { auto: true, reason: 'layout_only', kind, otherTurnPaths }
  }
  // Cast ALWAYS auto — not blocked by multi-file turns or batch size.
  if (kind === 'characters') {
    return { auto: true, reason: 'character_upsert', kind, otherTurnPaths }
  }

  if (kind === 'dialogue_choices') {
    const csv = siblingDialogueCsvPath(proposal.absPath)
    if (csv && turnPaths.has(pathKey(csv))) {
      return { auto: true, reason: 'choices_with_sibling_dialogue', kind, otherTurnPaths }
    }
  }

  if (otherTurnPaths >= 1) {
    return { auto: false, reason: 'multi_file_turn', kind, otherTurnPaths }
  }

  switch (kind) {
    case 'prose':
      return { auto: false, reason: 'existing_prose', kind, otherTurnPaths }
    case 'kmind':
      return { auto: false, reason: 'existing_kmind', kind, otherTurnPaths }
    case 'dialogue_performance':
      return { auto: false, reason: 'dialogue_performance', kind, otherTurnPaths }
    case 'dialogue_choices':
      return { auto: false, reason: 'dialogue_choices_alone', kind, otherTurnPaths }
    case 'other':
      return { auto: false, reason: 'existing_other', kind, otherTurnPaths }
    case 'dialogue': {
      const n = typeof proposal.changeCount === 'number' ? proposal.changeCount : 99
      if (n <= 5) return { auto: true, reason: 'small_dialogue_edit', kind, otherTurnPaths }
      return { auto: false, reason: 'large_dialogue_edit', kind, otherTurnPaths }
    }
    default:
      return { auto: false, reason: 'policy', kind, otherTurnPaths }
  }
}

export function shouldAutoApply(
  proposal: FileProposalEx,
  turnPaths: Set<string>,
  settings: AiPublicSettings
): boolean {
  return decideAutoApply(proposal, turnPaths, settings).auto
}

/** Stable hint for the model + UI about why Accept is/isn't needed. */
export function proposalReviewHint(proposal: FileProposalEx, autoApplied: boolean): string {
  if (autoApplied) {
    const kind = inferKind(proposal)
    if (!proposal.before.trim()) return 'auto: new_or_empty_file'
    if (kind === 'characters') return 'auto: character_upsert'
    if (kind === 'kmind_layout' || kind === 'dialogue_layout') return 'auto: layout_only'
    if (kind === 'dialogue') return 'auto: small_dialogue_edit'
    return 'auto'
  }
  if (!proposal.before.trim()) return 'review: unexpected'
  const kind = inferKind(proposal)
  if (kind === 'prose') return 'review: existing_prose'
  if (kind === 'kmind') return 'review: existing_kmind'
  if (kind === 'dialogue_performance') return 'review: dialogue_performance'
  if (kind === 'dialogue') return 'review: large_or_multi_file_dialogue'
  return 'review: multi_file_or_policy'
}

export function proposalToolNote(autoApplied: boolean): string {
  if (autoApplied) {
    return 'Already written to the workspace. Summarize as written; do not ask the user to Apply.'
  }
  return 'Change is PENDING review. Tell the user to Accept or Reject it on the change card in the agent panel. Do not claim it was already written.'
}

/** One-line rules for tool descriptions / system prompt. */
export const WRITE_GATE_SUMMARY =
  'Write gate: new/empty auto; character upserts ALWAYS auto (any batch size, even with other files this turn); dialogue ≤5 LINES auto; layout auto; existing prose/kmind/performance/multi-file → Accept. Results include written/pending/reviewHint/gateDetail/toolApi. No "5 character cards" threshold — ≤5 is dialogue lines only. UI: change cards show text diff (−/+) and Apply-all / Reject-all — agents cannot see the panel; do not re-report missing diff/batch as tool bugs.'


export const CHARACTERS_CSV_FORMAT =
  'characters.csv columns: id,name,color,note,model_node,operable (6). operable=true means player-confirm on empty text.'
