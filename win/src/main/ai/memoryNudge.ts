import { isStoryStateEnabled, loadStoryState } from './storyState'
import { listOpen, loadForeshadow } from './foreshadow'

/** System-prompt block: when to call memory tools (anti-forget). */
export function memoryToolsDisciplinePrompt(): string {
  return [
    'Story memory tools (CRITICAL — do not skip on long-form fiction):',
    '1. BEFORE writing/editing a chapter beat: call read_story_state (and read_foreshadow if plot threads matter). Never invent who holds which prop from chat memory alone.',
    '2. AFTER finishing a chapter (or a large beat that moves props/cast/time): call propose_upsert_story_state with chapter.id + sourcePath=that file. Same turn if possible.',
    '3. When planting or paying off a thread: propose_upsert_foreshadow (status open|resolved). Before finale/revision pass: continuity_check with aspects including foreshadow.',
    '4. Before multi-character dialogue: read_voice_bank; after a POV chapter if style matters: compare_voice or continuity_check aspect voice.',
    '5. Before a risky rewrite: propose_create_revision on the chapter + story_state/foreshadow. Restore via propose_restore_revision (prose may need Accept).',
    '6. Essays / one-off notes: do NOT create story_state scaffolding. Skip memory tools unless the user asks.',
    '7. Conflicts from continuity_check are WARN-only — fix by explicit upsert (intentional reversals) or by editing prose; never claim the write was blocked.',
    'Tool names: read_story_state, propose_upsert_story_state, read_foreshadow, propose_upsert_foreshadow, read_scene_state, propose_upsert_scene, read_voice_anchor, propose_set_voice_anchor, read_voice_bank, propose_upsert_voice, compare_voice, continuity_check, list/search_materials, read/propose_upsert_glossary, proofread_check, reader_critique, list_revisions, propose_create_revision, propose_restore_revision.'
  ].join('\n')
}

/**
 * Attach to prose write/patch tool results (not reviewHint — model-only nudge).
 * Enabled workspace → remind upsert; disabled → light optional hint for long md only.
 */
export function proseMemoryHint(
  workspaceRoot: string,
  relPath: string
): string | null {
  const rel = relPath.replace(/\\/g, '/')
  const lower = rel.toLowerCase()
  if (!lower.endsWith('.md') && !lower.endsWith('.txt')) return null
  if (lower.includes('/plans/') || lower.endsWith('.plan.md')) return null
  if (lower.startsWith('materials/')) return null

  const { doc, exists } = loadStoryState(workspaceRoot)
  const enabled = isStoryStateEnabled(doc, exists)
  if (enabled) {
    return (
      `MEMORY: story_state is ENABLED. If "${rel}" was a chapter/beat write, call propose_upsert_story_state now ` +
      `(chapter.id + sourcePath="${rel}") and update foreshadow if threads moved. Then optionally continuity_check aspects=["prop","timeline","foreshadow"].`
    )
  }

  // Light optional — only for paths that look like chapters
  if (/ch\d+|第.+章|chapter/i.test(rel) || /\/chapters?\//i.test(rel)) {
    return (
      `MEMORY: No story_state enabled yet. If this is multi-chapter fiction, after the beat call ` +
      `propose_upsert_story_state (with sourcePath="${rel}") to turn on continuity guards. Skip for essays.`
    )
  }
  return null
}

/** L5 line when enabled — counts only + call-to-action (≤~200 chars for counts; CTA may add a bit). */
export function buildStoryStateL5Summary(workspaceRoot: string): string | null {
  const { doc, exists } = loadStoryState(workspaceRoot)
  if (!isStoryStateEnabled(doc, exists)) return null
  const { doc: fsDoc } = loadForeshadow(workspaceRoot)
  const openCount = listOpen(fsDoc).length
  const propCount = Object.keys(doc.current.props || {}).length
  const loc = (doc.current.location || '—').slice(0, 32)
  const counts =
    `Story state ON: loc=${loc}; day=${doc.current.dayOffset}; props=${propCount}; openForeshadow=${openCount}.`
  // Prefer keeping the CTA even if counts must shrink (anti-forget).
  const cta = ' Before write: read_story_state. After chapter: propose_upsert_story_state+sourcePath.'
  const budget = 220
  if (counts.length + cta.length <= budget) return counts + cta
  const keep = Math.max(40, budget - cta.length - 1)
  return counts.slice(0, keep) + '…' + cta
}
