import { existsSync, readdirSync, statSync } from 'fs'
import { resolveWorkspacePath } from './workspacePath'

/** Hard-convention markers: any one means this workspace is a game-design tree. */
const DESIGN_MARKERS = [
  'design/gdd.md',
  'design/concept.md',
  'design/systems',
  'design/narrative',
  'design/levels',
  'design/balance',
  'design/marketing'
]

const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', 'release', 'data', 'dev-data'])
const DIALOGUE_CSV_EXT = '.dialogue.csv'
const DIALOGUE_SCAN_MAX_DEPTH = 2
const DIALOGUE_SCAN_MAX_HITS = 8
const DIALOGUE_SCAN_MAX_READDIR = 80
const L5_BUDGET = 420

export function workspaceHasDesignTree(workspaceRoot: string | null | undefined): boolean {
  const root = String(workspaceRoot || '').trim()
  if (!root) return false
  for (const rel of DESIGN_MARKERS) {
    try {
      const abs = resolveWorkspacePath(root, rel)
      if (!existsSync(abs)) continue
      return true
    } catch {
      /* skip */
    }
  }
  return false
}

/**
 * Standing rules when the workspace has design/ — same role as GIT_AGENT_PLAYBOOK.
 * Injected into the system prompt so the agent does not wait for /game-* mount.
 */
export const DESIGN_AGENT_PLAYBOOK = [
  'Design folder (CRITICAL — this workspace has design/; follow even without a /game-* skill):',
  '- Living spec is design/gdd.md (活 GDD). Scratch pitch is design/concept.md — never treat concept as the live spec.',
  '- Playable dialogue → *.dialogue.csv + characters.csv (speaker = character id). Use propose_dialogue_graph / read_dialogue. Do not leave the only copy of spoken lines in markdown.',
  '- After dialogue writes: dialogue_cast_check. Follow Godot v1.3 (empty-text continue vs labeled choices; do not mix on one line).',
  '- Numbers → design/balance/*.csv only; cite table+column in prose; mark 待原型验证. Never invent stats in markdown.',
  '- Proper nouns: read glossary.yaml and characters.csv before writing lore. Conflicts: two options, do not paper over.',
  '- Store copy: English Steam vs Chinese domestic in separate sections. No gdd.md → mark 未对齐 GDD 的对话草稿; with GDD, do not invent systems.',
  '- Job-specific depth: mount /game-brainstorm /game-gdd /game-narrative /game-systems /game-numbers /game-levels /game-store /game-consistency (and follow examples.md when present).',
  '- PDF of GDD/markdown into the workspace: export_workspace_pdf(path) (no save dialog; default sibling stem.pdf).'
].join('\n')

function probeFile(root: string, rel: string): boolean {
  try {
    const abs = resolveWorkspacePath(root, rel)
    return existsSync(abs) && statSync(abs).isFile()
  } catch {
    return false
  }
}

/** Shallow find of *.dialogue.csv (root + 2 levels). Names only — no file bodies. */
function collectDialogueCsv(root: string): string[] {
  const out: string[] = []
  let reads = 0
  const walk = (rel: string, depth: number): void => {
    if (out.length >= DIALOGUE_SCAN_MAX_HITS || reads >= DIALOGUE_SCAN_MAX_READDIR) return
    if (depth > DIALOGUE_SCAN_MAX_DEPTH) return
    let abs: string
    try {
      abs = resolveWorkspacePath(root, rel || '.')
    } catch {
      return
    }
    let names: string[]
    try {
      names = readdirSync(abs)
      reads += 1
    } catch {
      return
    }
    for (const name of names) {
      if (out.length >= DIALOGUE_SCAN_MAX_HITS) return
      if (name.startsWith('.')) continue
      const childRel = rel ? `${rel.replace(/\\/g, '/')}/${name}` : name
      let childAbs: string
      try {
        childAbs = resolveWorkspacePath(root, childRel)
      } catch {
        continue
      }
      let st
      try {
        st = statSync(childAbs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name.toLowerCase())) continue
        walk(childRel, depth + 1)
      } else if (name.toLowerCase().endsWith(DIALOGUE_CSV_EXT)) {
        out.push(childRel.replace(/\\/g, '/'))
      }
    }
  }
  walk('', 0)
  return out
}

/**
 * Editor L5 when the workspace has a design/ tree.
 * Reports which convention files actually exist (gdd, concept, cast, glossary, dialogue csv).
 * Presence only — never dumps file bodies.
 */
export function buildDesignL5Summary(
  workspaceRoot: string | null | undefined
): string | null {
  if (!workspaceHasDesignTree(workspaceRoot)) return null
  const root = String(workspaceRoot || '').trim()

  const present: string[] = []
  const missing: string[] = []
  const flag = (rel: string): boolean => {
    if (probeFile(root, rel)) {
      present.push(rel)
      return true
    }
    missing.push(rel)
    return false
  }

  const hasGdd = flag('design/gdd.md')
  flag('design/concept.md')
  const hasCast = flag('characters.csv')
  const hasGlossary = flag('glossary.yaml')

  const dialogues = collectDialogueCsv(root)
  if (dialogues.length) {
    const sample = dialogues.slice(0, 3).join(', ')
    present.push(
      dialogues.length <= 3
        ? `*.dialogue.csv (${sample})`
        : `${dialogues.length}×*.dialogue.csv (${sample}, …)`
    )
  } else {
    missing.push('*.dialogue.csv')
  }

  const cta: string[] = []
  if (hasGdd) {
    cta.push('Before systems/numbers/levels: read_file design/gdd.md')
  } else {
    cta.push('No living GDD (design/gdd.md missing)')
  }
  const loreBits: string[] = []
  if (hasGlossary) loreBits.push('glossary.yaml')
  if (hasCast) loreBits.push('characters.csv')
  if (loreBits.length) cta.push(`Lore: read ${loreBits.join(' + ')} first`)
  if (dialogues.length) {
    cta.push('Dialogue: read_dialogue on those csv (not markdown)')
  }

  const line1 =
    `Design (L5): present: ${present.length ? present.join('; ') : '(design/ tree only)'}.` +
    (missing.length ? ` Missing: ${missing.join(', ')}.` : '')
  let text = `${line1} ${cta.join('. ')}.`
  if (text.length > L5_BUDGET) text = text.slice(0, L5_BUDGET - 1) + '…'
  return text
}
