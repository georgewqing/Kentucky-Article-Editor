import {
  anyChapterHasSourcePath,
  findChapterBySourcePath,
  findPropTableConflicts,
  isStoryStateEnabled,
  loadStoryState,
  sumDayDelta,
  STORY_STATE_FILE,
  type StoryStateDoc
} from './storyState'
import {
  FORESHADOW_FILE,
  listOpen,
  listOverdue,
  loadForeshadow
} from './foreshadow'
import { compareVoiceStats, loadVoiceAnchor } from './voiceFiles'
import { findGlossaryIssues, loadGlossary } from './glossaryMaterials'
import { proofreadText } from './proofread'
import type { ContinuityIssue } from './voiceFiles'

export type ContinuityAssertion = {
  prop?: string
  holder?: string
  location?: string
  characterStatus?: string
  character?: string
}

export { buildStoryStateL5Summary } from './memoryNudge'

function checkStaleAndLinks(
  doc: StoryStateDoc,
  enabled: boolean,
  focusPaths: string[],
  chapterId?: string
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  if (!enabled) return issues

  if (chapterId) {
    if (!doc.chapters.some((c) => c.id === chapterId)) {
      issues.push({
        severity: 'warn',
        kind: 'story_state_stale',
        path: STORY_STATE_FILE,
        quote: chapterId,
        suggestion: `chapterId ${chapterId} not in story_state.yaml — propose_upsert_story_state.`
      })
    }
  }

  if (!anyChapterHasSourcePath(doc)) {
    issues.push({
      severity: 'info',
      kind: 'story_state_unlinked',
      path: STORY_STATE_FILE,
      quote: '',
      suggestion:
        'Chapters have no sourcePath. Add sourcePath on upsert so continuity can map focus files.'
    })
    return issues
  }

  for (const rel of focusPaths) {
    const hit = findChapterBySourcePath(doc, rel)
    if (!hit) {
      issues.push({
        severity: 'warn',
        kind: 'story_state_stale',
        path: rel,
        quote: '',
        suggestion: `No chapter sourcePath matches ${rel} — propose_upsert_story_state with sourcePath.`
      })
    }
  }
  return issues
}

function checkAssertions(
  doc: StoryStateDoc,
  assertions: ContinuityAssertion[]
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  for (const a of assertions) {
    if (a.prop && a.holder) {
      const cur = doc.current.props[a.prop]
      if (cur === undefined) {
        issues.push({
          severity: 'warn',
          kind: 'assertion_failed',
          path: STORY_STATE_FILE,
          quote: a.prop,
          suggestion: `Asserted ${a.prop} held by ${a.holder}, but prop missing from current.props.`
        })
      } else if (cur !== a.holder) {
        issues.push({
          severity: 'warn',
          kind: 'assertion_failed',
          path: STORY_STATE_FILE,
          quote: `${a.prop}:${cur}`,
          suggestion: `Asserted holder ${a.holder}, table has ${cur}. Upsert state if intentional.`
        })
      }
    }
    if (a.location) {
      if (doc.current.location && doc.current.location !== a.location) {
        issues.push({
          severity: 'warn',
          kind: 'assertion_failed',
          path: STORY_STATE_FILE,
          quote: doc.current.location,
          suggestion: `Asserted location ${a.location}, current is ${doc.current.location}.`
        })
      }
    }
    if (a.character && a.characterStatus) {
      const st = doc.current.characterStatus[a.character]
      if (st === undefined) {
        issues.push({
          severity: 'warn',
          kind: 'unknown_character',
          path: STORY_STATE_FILE,
          quote: a.character,
          suggestion: `Asserted ${a.character}=${a.characterStatus}, but character has no entry in current.characterStatus (unregistered / never upserted).`
        })
      } else if (st !== a.characterStatus) {
        issues.push({
          severity: 'warn',
          kind: 'assertion_failed',
          path: STORY_STATE_FILE,
          quote: String(st),
          suggestion: `Asserted ${a.character}=${a.characterStatus}, table has ${st}.`
        })
      }
    }
  }
  return issues
}

export function runLiteraryContinuity(opts: {
  workspaceRoot: string
  focusPaths: string[]
  aspects: string[]
  chapterId?: string
  assertions?: ContinuityAssertion[]
  readFocusText: (rel: string) => string | null
}): {
  issues: ContinuityIssue[]
  storyStateSummary: string | null
  foreshadowOpenCount: number
  storyEnabled: boolean
} {
  const { workspaceRoot, focusPaths, aspects, chapterId } = opts
  const assertions = Array.isArray(opts.assertions) ? opts.assertions : []
  const issues: ContinuityIssue[] = []

  const storyLoad = loadStoryState(workspaceRoot)
  const fsLoad = loadForeshadow(workspaceRoot)
  const enabled = isStoryStateEnabled(storyLoad.doc, storyLoad.exists)
  const wantsStory =
    aspects.includes('timeline') ||
    aspects.includes('prop') ||
    aspects.includes('foreshadow') ||
    aspects.includes('scene')

  if (wantsStory && !storyLoad.exists) {
    issues.push({
      severity: 'info',
      kind: 'story_state_missing',
      path: STORY_STATE_FILE,
      quote: '',
      suggestion:
        'No story_state.yaml yet (on-demand). Upsert when writing long-form chapters; essays can ignore.'
    })
  }

  if (aspects.includes('timeline') || aspects.includes('prop')) {
    issues.push(...checkStaleAndLinks(storyLoad.doc, enabled, focusPaths, chapterId))
  }

  if (aspects.includes('prop') && enabled) {
    for (const c of findPropTableConflicts(storyLoad.doc)) {
      issues.push({
        severity: 'warn',
        kind: 'prop_table_conflict',
        path: STORY_STATE_FILE,
        quote: c.prop,
        suggestion: `Prop 「${c.prop}」 table conflict: rollup=${c.chapterHolder} vs current=${c.currentHolder} (chapter ${c.chapterId}).`
      })
    }
    if (assertions.length) {
      issues.push(...checkAssertions(storyLoad.doc, assertions))
    }
  }

  if (aspects.includes('timeline') && enabled) {
    const sum = sumDayDelta(storyLoad.doc)
    if (
      storyLoad.doc.chapters.length > 0 &&
      Math.abs(sum - storyLoad.doc.current.dayOffset) > 0.01
    ) {
      // dayOffset may intentionally include pre-chapter baseline; only warn if chapters sum exceeds current oddly
      if (sum > storyLoad.doc.current.dayOffset + 0.01) {
        issues.push({
          severity: 'info',
          kind: 'timeline_day_gap',
          path: STORY_STATE_FILE,
          quote: `sumDayDelta=${sum}, current.dayOffset=${storyLoad.doc.current.dayOffset}`,
          suggestion: 'Chapter dayDelta sum exceeds current.dayOffset — check rollup.'
        })
      }
    }
  }

  if (aspects.includes('foreshadow')) {
    const open = listOpen(fsLoad.doc)
    for (const item of open.slice(0, 40)) {
      issues.push({
        severity: 'info',
        kind: 'foreshadow_unpaid',
        path: FORESHADOW_FILE,
        quote: item.id,
        suggestion: `Open foreshadow 「${item.title}」 (planted ${item.plantedIn || '?'}). Mark resolved when paid off.`
      })
    }
    for (const item of listOverdue(fsLoad.doc, storyLoad.doc)) {
      issues.push({
        severity: 'warn',
        kind: 'foreshadow_overdue',
        path: FORESHADOW_FILE,
        quote: item.id,
        suggestion: `Foreshadow 「${item.title}」 dueBy=${item.dueBy} but still open after later chapters.`
      })
    }
  }

  if (aspects.includes('scene') && storyLoad.doc.scenes?.length) {
    const scene =
      (storyLoad.doc.current.sceneId &&
        storyLoad.doc.scenes.find((s) => s.id === storyLoad.doc.current.sceneId)) ||
      storyLoad.doc.scenes[storyLoad.doc.scenes.length - 1]
    if (scene && scene.present.length) {
      for (const rel of focusPaths) {
        const text = opts.readFocusText(rel)
        if (!text) continue
        // Weak: if a cast id from other scenes appears as honorific speech and not in present — skip heavy NLP.
        // Flag only when present list is non-empty and a known *other* scene character id appears as standalone token... too noisy.
        // Instead: if sourcePath matches and we find characterStatus keys not in present mentioned with 说/道
        for (const [cid] of Object.entries(storyLoad.doc.current.characterStatus)) {
          if (scene.present.includes(cid)) continue
          const re = new RegExp(`${cid}[说道路道问]`)
          if (re.test(text)) {
            issues.push({
              severity: 'warn',
              kind: 'scene_cast_mismatch',
              path: rel,
              quote: cid,
              suggestion: `「${cid}」 speaks in focus but is not in scene ${scene.id} present[].`
            })
          }
        }
      }
      for (const [prop, where] of Object.entries(scene.propsHere)) {
        const cur = storyLoad.doc.current.props[prop]
        if (cur && where && cur !== where && !where.includes(cur)) {
          issues.push({
            severity: 'info',
            kind: 'scene_prop_mismatch',
            path: STORY_STATE_FILE,
            quote: prop,
            suggestion: `Scene ${scene.id} propsHere ${prop}=${where} vs current.props=${cur}.`
          })
        }
      }
    }
  }

  if (aspects.includes('voice')) {
    const anchor = loadVoiceAnchor(workspaceRoot)
    if (anchor.exists) {
      for (const rel of focusPaths) {
        const text = opts.readFocusText(rel)
        if (!text) continue
        issues.push(...compareVoiceStats(text, rel, anchor.doc.default))
      }
    }
  }

  if (aspects.includes('glossary')) {
    const g = loadGlossary(workspaceRoot)
    if (g.exists) {
      for (const rel of focusPaths) {
        const text = opts.readFocusText(rel)
        if (!text) continue
        issues.push(...findGlossaryIssues(text, rel, g.doc))
      }
    }
  }

  if (aspects.includes('proof')) {
    for (const rel of focusPaths) {
      const text = opts.readFocusText(rel)
      if (!text) continue
      issues.push(...proofreadText(text, rel))
    }
  }

  const openCount = listOpen(fsLoad.doc).length
  const summary = enabled
    ? `loc=${storyLoad.doc.current.location || '—'}; day=${storyLoad.doc.current.dayOffset}; props=${Object.keys(storyLoad.doc.current.props).length}; openForeshadow=${openCount}`
    : null

  return {
    issues,
    storyStateSummary: summary,
    foreshadowOpenCount: openCount,
    storyEnabled: enabled
  }
}

export function readerCritiqueSkeleton(opts: {
  workspaceRoot: string
  persona: string
  focusPaths: string[]
  readFocusText: (rel: string) => string | null
}): Record<string, unknown> {
  const files: Array<{ path: string; chars: number; titleHint: string }> = []
  for (const rel of opts.focusPaths.slice(0, 12)) {
    const text = opts.readFocusText(rel)
    if (text == null) continue
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || ''
    files.push({
      path: rel,
      chars: text.length,
      titleHint: firstLine.replace(/^#+\s*/, '').slice(0, 80)
    })
  }
  const g = loadGlossary(opts.workspaceRoot)
  return {
    readOnly: true,
    persona: opts.persona || 'target_reader',
    files,
    glossaryEntryCount: g.doc.entries.length,
    instruction:
      'Skeleton only — do NOT treat this as a finished critique. Read @ focus files in conversation context and write your own issues (pacing/clarity/cliche/logic_gap). No nested LLM in this tool.',
    issues: [] as ContinuityIssue[]
  }
}
