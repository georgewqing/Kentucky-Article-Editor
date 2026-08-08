import type { FileProposal } from './chatSessions'
import type { AiPublicSettings } from './aiSettings'

export type ProposalKind =
  | 'prose'
  | 'characters'
  | 'dialogue'
  | 'dialogue_performance'
  | 'kmind'
  | 'kmind_layout'
  | 'other'

export type FileProposalEx = FileProposal & {
  kind?: ProposalKind
  /** Dialogue lines touched / appended */
  changeCount?: number
}

function extOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() || ''
  const i = base.lastIndexOf('.')
  return i >= 0 ? base.slice(i).toLowerCase() : ''
}

function inferKind(p: FileProposalEx): ProposalKind {
  if (p.kind) return p.kind
  const rel = p.path.replace(/\\/g, '/').toLowerCase()
  if (rel === 'characters.csv' || rel.endsWith('/characters.csv')) return 'characters'
  if (rel.endsWith('.dialogue.csv')) return 'dialogue'
  if (rel.endsWith('.kmind')) return 'kmind'
  const ext = extOf(rel)
  if (ext === '.md' || ext === '.txt') return 'prose'
  return 'other'
}

/**
 * G3 gate: whether this proposal may auto-apply (no Accept).
 * `turnPaths` = absolute paths already written/proposed in this user turn (including current).
 */
export function shouldAutoApply(
  proposal: FileProposalEx,
  turnPaths: Set<string>,
  settings: AiPublicSettings
): boolean {
  if (settings.forceReviewAllWrites) return false
  // New file or writing into an empty file: no review (even in multi-file turns).
  if (!proposal.before.trim()) return true
  if (turnPaths.size >= 2) return false

  const kind = inferKind(proposal)
  switch (kind) {
    case 'prose':
    case 'kmind':
    case 'dialogue_performance':
    case 'other':
      return false
    case 'characters':
      return true
    case 'kmind_layout':
      return true
    case 'dialogue': {
      const n = typeof proposal.changeCount === 'number' ? proposal.changeCount : 99
      return n <= 5
    }
    default:
      return false
  }
}

export function proposalToolNote(autoApplied: boolean): string {
  if (autoApplied) {
    return 'Already written to the workspace. Summarize as written; do not ask the user to Apply.'
  }
  return 'Change is PENDING review. Tell the user to Accept or Reject it on the change card in the agent panel. Do not claim it was already written.'
}
