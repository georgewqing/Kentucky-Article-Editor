/**
 * Literary memory tools (M1–M4) — schemas + handlers.
 * Wired from tools.ts runTool / getWritingTools.
 */
import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import type { FileProposal } from './chatSessions'
import { TOOL_API_VERSION } from './proposalGate'
import type { ToolDef } from './openaiCompatClient'
import {
  STORY_STATE_FILE,
  loadStoryState,
  serializeStoryState,
  upsertChapter,
  upsertScene,
  emptyStoryState
} from './storyState'
import {
  FORESHADOW_FILE,
  loadForeshadow,
  serializeForeshadow,
  upsertForeshadowItem,
  listOpen,
  emptyForeshadow
} from './foreshadow'
import {
  VOICE_ANCHOR_FILE,
  VOICE_BANK_FILE,
  loadVoiceAnchor,
  loadVoiceBank,
  serializeVoiceAnchor,
  serializeVoiceBank,
  upsertVoice,
  compareVoiceStats,
  emptyVoiceAnchor,
  emptyVoiceBank,
  mergeVoiceAnchorBlock,
  voiceAnchorSchemaHint
} from './voiceFiles'
import {
  GLOSSARY_FILE,
  MATERIALS_DIR,
  MATERIALS_INDEX,
  loadGlossary,
  serializeGlossary,
  upsertGlossaryEntry,
  searchMaterials,
  loadMaterialsIndex,
  serializeMaterialsIndex,
  upsertMaterialIndexEntry,
  emptyGlossary
} from './glossaryMaterials'
import {
  loadManifest,
  createRevisionSnapshot,
  listSnapshotFiles,
  upsertVolume,
  serializeManifest
} from './revisions'
import { proofreadText } from './proofread'
import {
  runLiteraryContinuity,
  readerCritiqueSkeleton,
  type ContinuityAssertion
} from './literaryContinuity'
import { asStringArray, asStringRecord } from './yamlUtil'

export type LiteraryEmitCtx = {
  workspaceRoot: string
  emitProposal: (
    proposal: Omit<FileProposal, 'status'> & { status?: FileProposal['status'] }
  ) => Record<string, unknown>
  resolveWorkspacePath: (root: string, rel: string) => string
  readFocusText: (rel: string) => string | null
  maxRevisionSnaps: number
}

export const LITERARY_READ_TOOLS = new Set([
  'read_story_state',
  'read_foreshadow',
  'read_voice_anchor',
  'read_voice_bank',
  'compare_voice',
  'read_glossary',
  'list_materials',
  'search_materials',
  'list_revisions',
  'reader_critique',
  'proofread_check',
  'read_scene_state'
])

export const LITERARY_WRITE_TOOLS = new Set([
  'propose_upsert_story_state',
  'propose_upsert_foreshadow',
  'propose_set_voice_anchor',
  'propose_upsert_voice',
  'propose_upsert_glossary',
  'propose_upsert_material',
  'propose_upsert_scene',
  'propose_create_revision',
  'propose_restore_revision',
  'propose_upsert_volume'
])

export function getLiteraryToolDefs(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'read_story_state',
        description:
          'CALL BEFORE writing/editing a long-form chapter: read current props/location/dayOffset (+ optional chapterId). On-demand YAML; empty if missing. Prefer this over inventing holdings from chat.',
        parameters: {
          type: 'object',
          properties: {
            chapterId: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_story_state',
        description:
          'CALL AFTER finishing a chapter/beat (same turn as the prose write when possible). Merge into story_state.yaml; roll up current. ALWAYS auto-writes. Pass chapter.id + sourcePath=prose path. Essays: skip.',
        parameters: {
          type: 'object',
          properties: {
            chapter: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                sourcePath: { type: 'string' },
                castAppeared: { type: 'array', items: { type: 'string' } },
                castNew: { type: 'array', items: { type: 'string' } },
                propsNew: { type: 'array', items: { type: 'string' } },
                propsAt: { type: 'object', additionalProperties: { type: 'string' } },
                dayDelta: { type: 'number' },
                locations: { type: 'array', items: { type: 'string' } },
                foreshadowPlanted: { type: 'array', items: { type: 'string' } },
                foreshadowResolved: { type: 'array', items: { type: 'string' } },
                characterStatus: { type: 'object', additionalProperties: { type: 'string' } },
                notes: { type: 'string' }
              },
              required: ['id']
            },
            rollup: { type: 'boolean' }
          },
          required: ['chapter']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_foreshadow',
        description: 'CALL when checking unpaid plot threads. Read foreshadow.yaml; filter status open|resolved|dropped|all.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['open', 'resolved', 'dropped', 'all'] }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_foreshadow',
        description:
          'CALL when planting or resolving a foreshadow/thread. Upsert foreshadow.yaml. ALWAYS auto-writes. Empty/unknown fields ignored.',
        parameters: {
          type: 'object',
          properties: {
            item: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                plantedIn: { type: 'string' },
                plantNote: { type: 'string' },
                dueBy: { type: 'string' },
                resolvedIn: { type: 'string' },
                status: { type: 'string', enum: ['open', 'resolved', 'dropped'] }
              },
              required: ['id']
            }
          },
          required: ['item']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_voice_anchor',
        description:
          'CALL before style checks. Read voice_anchor.yaml.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_set_voice_anchor',
        description:
          'CALL after chapter-1 tone is set (or user asks). Write/merge voice_anchor.yaml. ALWAYS auto-writes. Nested keys under default/byPov: person|tense|sentence|metaphorDensity|lexicon|notes (NOT narrator — use notes; narrator alias→notes). Example: {default:{person:"third",tense:"past",sentence:"短句",notes:"冷静旁白"}}.',
        parameters: {
          type: 'object',
          properties: {
            default: {
              type: 'object',
              description: 'Default narrator/style block',
              properties: {
                person: { type: 'string', description: 'e.g. first|third|second' },
                tense: { type: 'string', description: 'e.g. past|present' },
                sentence: { type: 'string', description: 'e.g. 短句 / 长句' },
                metaphorDensity: { type: 'string' },
                lexicon: { type: 'string' },
                notes: { type: 'string', description: 'Free-form tone notes (use this, not narrator)' },
                narrator: {
                  type: 'string',
                  description: 'Alias for notes only — prefer notes'
                }
              }
            },
            byPov: {
              type: 'object',
              description: 'Map povId → same block shape as default',
              additionalProperties: { type: 'object' }
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_voice_bank',
        description: 'CALL BEFORE multi-character dialogue. Read voice_bank.yaml (not characters.csv).',
        parameters: {
          type: 'object',
          properties: { characterId: { type: 'string' } }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_voice',
        description:
          'CALL when locking a character speech style. Upsert one voice_bank entry by characterId. ALWAYS auto-writes.',
        parameters: {
          type: 'object',
          properties: {
            characterId: { type: 'string' },
            catchphrases: { type: 'array', items: { type: 'string' } },
            sentenceLength: { type: 'string' },
            particles: { type: 'array', items: { type: 'string' } },
            metaphorDomain: { type: 'array', items: { type: 'string' } }
          },
          required: ['characterId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'compare_voice',
        description:
          'CALL after a POV chapter if style drift is a concern. Thin stats vs voice_anchor. Returns issues[]. No nested LLM, no full-text dump.',
        parameters: {
          type: 'object',
          properties: {
            focusPaths: { type: 'array', items: { type: 'string' } },
            characterId: { type: 'string' }
          },
          required: ['focusPaths']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_scene_state',
        description:
          'CALL when scene-level who/where/light matters. Read scenes[] from story_state.yaml. Optional sceneId.',
        parameters: {
          type: 'object',
          properties: { sceneId: { type: 'string' } }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_scene',
        description:
          'CALL after establishing a scene beat. Upsert scenes[] in story_state.yaml; sets current.sceneId by default. ALWAYS auto-writes.',
        parameters: {
          type: 'object',
          properties: {
            scene: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                chapterId: { type: 'string' },
                sourcePath: { type: 'string' },
                when: { type: 'string' },
                where: { type: 'string' },
                present: { type: 'array', items: { type: 'string' } },
                light: { type: 'string' },
                propsHere: { type: 'object', additionalProperties: { type: 'string' } },
                exits: { type: 'array', items: { type: 'string' } },
                notes: { type: 'string' }
              },
              required: ['id']
            },
            setCurrent: { type: 'boolean' }
          },
          required: ['scene']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_revisions',
        description:
          'CALL before restore/create when checking available snapshots. List revisions/manifest.yaml (file snapshots, not Git).',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_revision',
        description:
          'CALL BEFORE a risky chapter rewrite. Snapshot paths under revisions/snaps/. Fails at maxRevisionSnaps. Auto-writes manifest.',
        parameters: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' } },
            label: { type: 'string' },
            note: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_restore_revision',
        description:
          'CALL to roll back to a prior snapshot. Existing prose needs Accept. Do not silently discard dirty buffers.',
        parameters: {
          type: 'object',
          properties: {
            snapshotId: { type: 'string' }
          },
          required: ['snapshotId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_volume',
        description: 'Upsert a volume label/chapterIds in revisions/manifest.yaml. Auto-writes.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            chapterIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_materials',
        description: 'List materials/index.yaml entries (or materials/ filenames).',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_materials',
        description: 'CALL when needing imagery/archetype refs. Search by query/tag; short snippets only.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            tag: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_material',
        description:
          'Write materials/<slug>.md (prose gate) and update materials/index.yaml (auto). Prefer short reference notes.',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            content: { type: 'string' }
          },
          required: ['slug', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_glossary',
        description:
          'CALL when checking name consistency. Read glossary.yaml.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_glossary',
        description:
          'CALL when adding/fixing a term translation. Upsert glossary.yaml. ALWAYS auto-writes.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            zh: { type: 'string' },
            en: { type: 'string' },
            aliases: { type: 'array', items: { type: 'string' } },
            kind: { type: 'string' }
          },
          required: ['id', 'zh']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'reader_critique',
        description:
          'Skeleton only for reader/editor critique (persona + file meta). No nested LLM; no chapter dump. Critique in chat after @ files.',
        parameters: {
          type: 'object',
          properties: {
            persona: { type: 'string', enum: ['target_reader', 'picky_editor'] },
            focusPaths: { type: 'array', items: { type: 'string' } }
          },
          required: ['focusPaths']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'proofread_check',
        description:
          'CALL before publication polish. Local heuristic quotes/punct/typos to issues[]. Not a full spellchecker.',
        parameters: {
          type: 'object',
          properties: {
            focusPaths: { type: 'array', items: { type: 'string' } }
          },
          required: ['focusPaths']
        }
      }
    }
  ]
}

export function isLiteraryTool(name: string): boolean {
  return LITERARY_READ_TOOLS.has(name) || LITERARY_WRITE_TOOLS.has(name)
}

export function runLiteraryTool(
  name: string,
  args: Record<string, unknown>,
  ctx: LiteraryEmitCtx
): string | null {
  const root = ctx.workspaceRoot

  switch (name) {
    case 'read_story_state': {
      const { doc, exists } = loadStoryState(root)
      const chapterId = args.chapterId != null ? String(args.chapterId) : ''
      const chapter = chapterId ? doc.chapters.find((c) => c.id === chapterId) : undefined
      return JSON.stringify({
        exists,
        enabled: exists && doc.chapters.length >= 1,
        current: doc.current,
        chapterCount: doc.chapters.length,
        chapter: chapter || null,
        chapterIds: doc.chapters.map((c) => c.id),
        toolApi: TOOL_API_VERSION
      })
    }
    case 'propose_upsert_story_state': {
      const ch = (args.chapter || {}) as Record<string, unknown>
      const id = String(ch.id || '').trim()
      if (!id) return JSON.stringify({ ok: false, error: 'chapter.id required' })
      const loaded = loadStoryState(root)
      const abs = join(root, STORY_STATE_FILE)
      const before = loaded.text
      let doc = loaded.exists ? loaded.doc : emptyStoryState()
      doc = upsertChapter(
        doc,
        {
          id,
          ...(ch.sourcePath != null ? { sourcePath: String(ch.sourcePath) } : {}),
          ...(ch.castAppeared !== undefined ? { castAppeared: asStringArray(ch.castAppeared) } : {}),
          ...(ch.castNew !== undefined ? { castNew: asStringArray(ch.castNew) } : {}),
          ...(ch.propsNew !== undefined ? { propsNew: asStringArray(ch.propsNew) } : {}),
          ...(ch.propsAt !== undefined ? { propsAt: asStringRecord(ch.propsAt) } : {}),
          ...(ch.dayDelta !== undefined
            ? { dayDelta: typeof ch.dayDelta === 'number' ? ch.dayDelta : Number(ch.dayDelta) || 0 }
            : {}),
          ...(ch.locations !== undefined ? { locations: asStringArray(ch.locations) } : {}),
          ...(ch.foreshadowPlanted !== undefined
            ? { foreshadowPlanted: asStringArray(ch.foreshadowPlanted) }
            : {}),
          ...(ch.foreshadowResolved !== undefined
            ? { foreshadowResolved: asStringArray(ch.foreshadowResolved) }
            : {}),
          ...(ch.characterStatus !== undefined
            ? { characterStatus: asStringRecord(ch.characterStatus) }
            : {}),
          ...(ch.notes !== undefined ? { notes: String(ch.notes) } : {})
        },
        { rollup: args.rollup !== false }
      )
      const after = serializeStoryState(doc)
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: STORY_STATE_FILE,
          absPath: abs,
          before,
          after,
          summary: `Upsert story chapter ${id}`,
          kind: 'story_state'
        })
      )
    }
    case 'read_foreshadow': {
      const { doc, exists } = loadForeshadow(root)
      const status = String(args.status || 'all')
      const items =
        status === 'all' ? doc.items : doc.items.filter((i) => i.status === status)
      return JSON.stringify({
        exists,
        openCount: listOpen(doc).length,
        items,
        toolApi: TOOL_API_VERSION
      })
    }
    case 'propose_upsert_foreshadow': {
      const item = (args.item || {}) as Record<string, unknown>
      const id = String(item.id || '').trim()
      if (!id) return JSON.stringify({ ok: false, error: 'item.id required' })
      const loaded = loadForeshadow(root)
      const abs = join(root, FORESHADOW_FILE)
      let doc = loaded.exists ? loaded.doc : emptyForeshadow()
      doc = upsertForeshadowItem(doc, {
        id,
        title: item.title != null ? String(item.title) : undefined,
        plantedIn: item.plantedIn != null ? String(item.plantedIn) : undefined,
        plantNote: item.plantNote != null ? String(item.plantNote) : undefined,
        dueBy: item.dueBy != null ? String(item.dueBy) : undefined,
        resolvedIn: item.resolvedIn != null ? String(item.resolvedIn) : undefined,
        status:
          item.status === 'resolved' || item.status === 'dropped' || item.status === 'open'
            ? item.status
            : undefined
      })
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: FORESHADOW_FILE,
          absPath: abs,
          before: loaded.text,
          after: serializeForeshadow(doc),
          summary: `Upsert foreshadow ${id}`,
          kind: 'foreshadow'
        })
      )
    }
    case 'read_voice_anchor': {
      const { doc, exists } = loadVoiceAnchor(root)
      return JSON.stringify({
        exists,
        ...doc,
        schemaHint: voiceAnchorSchemaHint(),
        toolApi: TOOL_API_VERSION
      })
    }
    case 'propose_set_voice_anchor': {
      const loaded = loadVoiceAnchor(root)
      const abs = join(root, VOICE_ANCHOR_FILE)
      let doc = loaded.exists ? loaded.doc : emptyVoiceAnchor()
      // Nested default preferred; also accept top-level style fields (common agent mistake).
      let defaultPatch: unknown = args.default
      if (
        (defaultPatch == null || typeof defaultPatch !== 'object') &&
        (args.person != null ||
          args.tense != null ||
          args.sentence != null ||
          args.notes != null ||
          args.narrator != null ||
          args.lexicon != null ||
          args.metaphorDensity != null)
      ) {
        defaultPatch = {
          person: args.person,
          tense: args.tense,
          sentence: args.sentence,
          metaphorDensity: args.metaphorDensity,
          lexicon: args.lexicon,
          notes: args.notes,
          narrator: args.narrator
        }
      }
      if (defaultPatch && typeof defaultPatch === 'object') {
        doc = { ...doc, default: mergeVoiceAnchorBlock(doc.default, defaultPatch) }
      }
      if (args.byPov && typeof args.byPov === 'object') {
        const nextByPov = { ...doc.byPov }
        for (const [k, v] of Object.entries(args.byPov as Record<string, unknown>)) {
          nextByPov[k] = mergeVoiceAnchorBlock(nextByPov[k] || {}, v)
        }
        doc = { ...doc, byPov: nextByPov }
      }
      const written = ctx.emitProposal({
        id: cryptoRandom(),
        path: VOICE_ANCHOR_FILE,
        absPath: abs,
        before: loaded.text,
        after: serializeVoiceAnchor(doc),
        summary: 'Set voice anchor',
        kind: 'voice_anchor'
      }) as Record<string, unknown>
      return JSON.stringify({
        ...written,
        default: doc.default,
        byPov: doc.byPov,
        schemaHint: voiceAnchorSchemaHint()
      })
    }
    case 'read_voice_bank': {
      const { doc, exists } = loadVoiceBank(root)
      const cid = args.characterId != null ? String(args.characterId) : ''
      return JSON.stringify({
        exists,
        voice: cid ? doc.voices[cid] || null : undefined,
        voices: cid ? undefined : doc.voices,
        toolApi: TOOL_API_VERSION
      })
    }
    case 'propose_upsert_voice': {
      const characterId = String(args.characterId || '').trim()
      if (!characterId) return JSON.stringify({ ok: false, error: 'characterId required' })
      const loaded = loadVoiceBank(root)
      const abs = join(root, VOICE_BANK_FILE)
      let doc = loaded.exists ? loaded.doc : emptyVoiceBank()
      doc = upsertVoice(doc, {
        characterId,
        catchphrases: asStringArray(args.catchphrases),
        sentenceLength: args.sentenceLength != null ? String(args.sentenceLength) : undefined,
        particles: asStringArray(args.particles),
        metaphorDomain: asStringArray(args.metaphorDomain)
      })
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: VOICE_BANK_FILE,
          absPath: abs,
          before: loaded.text,
          after: serializeVoiceBank(doc),
          summary: `Upsert voice ${characterId}`,
          kind: 'voice_bank'
        })
      )
    }
    case 'compare_voice': {
      const focusPaths = (args.focusPaths as string[]) || []
      const anchor = loadVoiceAnchor(root)
      const bank = loadVoiceBank(root)
      const cid = args.characterId != null ? String(args.characterId) : ''
      const voice = cid ? bank.doc.voices[cid] : undefined
      const issues = []
      for (const rel of focusPaths.slice(0, 12)) {
        const text = ctx.readFocusText(rel)
        if (!text) continue
        issues.push(...compareVoiceStats(text, rel, anchor.doc.default, voice))
      }
      return JSON.stringify({
        readOnly: true,
        issues,
        toolApi: TOOL_API_VERSION,
        instruction: 'Present issues[]; no full-text dump. Deep craft judgment is yours after reading @ files.'
      })
    }
    case 'read_scene_state': {
      const { doc, exists } = loadStoryState(root)
      const sceneId = args.sceneId != null ? String(args.sceneId) : ''
      const scenes = doc.scenes || []
      return JSON.stringify({
        exists,
        currentSceneId: doc.current.sceneId || null,
        scene: sceneId ? scenes.find((s) => s.id === sceneId) || null : null,
        scenes: sceneId ? undefined : scenes,
        toolApi: TOOL_API_VERSION
      })
    }
    case 'propose_upsert_scene': {
      const scene = (args.scene || {}) as Record<string, unknown>
      const id = String(scene.id || '').trim()
      if (!id) return JSON.stringify({ ok: false, error: 'scene.id required' })
      const loaded = loadStoryState(root)
      const abs = join(root, STORY_STATE_FILE)
      let doc = loaded.exists ? loaded.doc : emptyStoryState()
      doc = upsertScene(
        doc,
        {
          id,
          chapterId: scene.chapterId != null ? String(scene.chapterId) : undefined,
          sourcePath: scene.sourcePath != null ? String(scene.sourcePath) : undefined,
          when: scene.when != null ? String(scene.when) : undefined,
          where: scene.where != null ? String(scene.where) : undefined,
          present: asStringArray(scene.present),
          light: scene.light != null ? String(scene.light) : undefined,
          propsHere: asStringRecord(scene.propsHere),
          exits: asStringArray(scene.exits),
          notes: scene.notes != null ? String(scene.notes) : undefined
        },
        { setCurrent: args.setCurrent !== false }
      )
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: STORY_STATE_FILE,
          absPath: abs,
          before: loaded.text,
          after: serializeStoryState(doc),
          summary: `Upsert scene ${id}`,
          kind: 'story_state'
        })
      )
    }
    case 'list_revisions': {
      const m = loadManifest(root)
      return JSON.stringify({ ...m, toolApi: TOOL_API_VERSION })
    }
    case 'propose_create_revision': {
      let paths = ((args.paths as string[]) || []).map((p) => p.replace(/\\/g, '/'))
      if (!paths.length) {
        paths = [STORY_STATE_FILE, FORESHADOW_FILE]
        const story = loadStoryState(root)
        const last = story.doc.chapters[story.doc.chapters.length - 1]
        if (last?.sourcePath) paths.push(last.sourcePath)
      }
      const created = createRevisionSnapshot(root, paths, {
        label: args.label != null ? String(args.label) : undefined,
        note: args.note != null ? String(args.note) : undefined,
        maxSnaps: ctx.maxRevisionSnaps
      })
      if (!created.ok) {
        return JSON.stringify({ ok: false, error: created.error, toolApi: TOOL_API_VERSION })
      }
      const abs = join(root, 'revisions/manifest.yaml')
      const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
      const after = serializeManifest(created.manifest)
      return JSON.stringify({
        ...ctx.emitProposal({
          id: cryptoRandom(),
          path: 'revisions/manifest.yaml',
          absPath: abs,
          before,
          after,
          summary: `Create revision ${created.id}`,
          kind: 'revision_meta'
        }),
        snapshotId: created.id,
        paths
      })
    }
    case 'propose_restore_revision': {
      const snapshotId = String(args.snapshotId || '').trim()
      if (!snapshotId) return JSON.stringify({ ok: false, error: 'snapshotId required' })
      const files = listSnapshotFiles(root, snapshotId)
      if (!files.length) {
        return JSON.stringify({ ok: false, error: `Snapshot not found: ${snapshotId}` })
      }
      const results = []
      for (const f of files) {
        const abs = ctx.resolveWorkspacePath(root, f.rel)
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
        const kind =
          f.rel.replace(/\\/g, '/') === STORY_STATE_FILE
            ? 'story_state'
            : f.rel.replace(/\\/g, '/') === FORESHADOW_FILE
              ? 'foreshadow'
              : f.rel.endsWith('.md') || f.rel.endsWith('.txt')
                ? 'prose'
                : 'other'
        results.push(
          ctx.emitProposal({
            id: cryptoRandom(),
            path: f.rel,
            absPath: abs,
            before,
            after: f.content,
            summary: `Restore ${snapshotId} �?${f.rel}`,
            kind: kind as FileProposal['kind']

          })
        )
      }
      return JSON.stringify({
        ok: true,
        snapshotId,
        restored: results.length,
        results,
        toolApi: TOOL_API_VERSION,
        instruction:
          'Prose restores may be pending Accept �?tell user to Accept cards. Dirty buffers sync via docApplyExternalWrite on accept.'
      })
    }
    case 'propose_upsert_volume': {
      const id = String(args.id || '').trim()
      if (!id) return JSON.stringify({ ok: false, error: 'id required' })
      const abs = join(root, 'revisions/manifest.yaml')
      const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
      let m = loadManifest(root)
      m = upsertVolume(m, {
        id,
        label: args.label != null ? String(args.label) : undefined,
        chapterIds: asStringArray(args.chapterIds)
      })
      const after = serializeManifest(m)
      mkdirSync(dirname(abs), { recursive: true })
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: 'revisions/manifest.yaml',
          absPath: abs,
          before,
          after,
          summary: `Upsert volume ${id}`,
          kind: 'revision_meta'
        })
      )
    }
    case 'list_materials': {
      const idx = loadMaterialsIndex(root)
      return JSON.stringify({ entries: idx.entries, toolApi: TOOL_API_VERSION })
    }
    case 'search_materials': {
      const hits = searchMaterials(root, String(args.query || ''), args.tag != null ? String(args.tag) : undefined)
      return JSON.stringify({ hits, toolApi: TOOL_API_VERSION })
    }
    case 'propose_upsert_material': {
      const slug = String(args.slug || '')
        .replace(/[^\w\u4e00-\u9fff-]+/g, '_')
        .slice(0, 64)
      if (!slug) return JSON.stringify({ ok: false, error: 'slug required' })
      const rel = `${MATERIALS_DIR}/${slug}.md`
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
      const content = String(args.content || '')
      const proseResult = ctx.emitProposal({
        id: cryptoRandom(),
        path: rel,
        absPath: abs,
        before,
        after: content,
        summary: `Upsert material ${slug}`,
        kind: 'prose'
      })
      const idxAbs = join(root, MATERIALS_INDEX)
      const idxBefore = existsSync(idxAbs) ? readFileSync(idxAbs, 'utf-8') : ''
      let idx = loadMaterialsIndex(root)
      idx = upsertMaterialIndexEntry(idx, {
        title: args.title != null ? String(args.title) : slug,
        tags: asStringArray(args.tags),
        path: rel
      })
      const idxResult = ctx.emitProposal({
        id: cryptoRandom(),
        path: MATERIALS_INDEX,
        absPath: idxAbs,
        before: idxBefore,
        after: serializeMaterialsIndex(idx),
        summary: `Update materials index for ${slug}`,
        kind: 'materials_index'
      })
      return JSON.stringify({ prose: proseResult, index: idxResult, toolApi: TOOL_API_VERSION })
    }
    case 'read_glossary': {
      const { doc, exists } = loadGlossary(root)
      return JSON.stringify({ exists, ...doc, toolApi: TOOL_API_VERSION })
    }
    case 'propose_upsert_glossary': {
      const id = String(args.id || '').trim()
      if (!id) return JSON.stringify({ ok: false, error: 'id required' })
      const loaded = loadGlossary(root)
      const abs = join(root, GLOSSARY_FILE)
      let doc = loaded.exists ? loaded.doc : emptyGlossary()
      doc = upsertGlossaryEntry(doc, {
        id,
        zh: String(args.zh || id),
        en: args.en != null ? String(args.en) : undefined,
        aliases: asStringArray(args.aliases),
        kind: args.kind != null ? String(args.kind) : undefined
      })
      return JSON.stringify(
        ctx.emitProposal({
          id: cryptoRandom(),
          path: GLOSSARY_FILE,
          absPath: abs,
          before: loaded.text,
          after: serializeGlossary(doc),
          summary: `Upsert glossary ${id}`,
          kind: 'glossary'
        })
      )
    }
    case 'reader_critique': {
      return JSON.stringify({
        ...readerCritiqueSkeleton({
          workspaceRoot: root,
          persona: String(args.persona || 'target_reader'),
          focusPaths: (args.focusPaths as string[]) || [],
          readFocusText: ctx.readFocusText
        }),
        toolApi: TOOL_API_VERSION
      })
    }
    case 'proofread_check': {
      const focusPaths = (args.focusPaths as string[]) || []
      const issues = []
      for (const rel of focusPaths.slice(0, 12)) {
        const text = ctx.readFocusText(rel)
        if (!text) continue
        issues.push(...proofreadText(text, rel))
      }
      return JSON.stringify({
        readOnly: true,
        issues,
        toolApi: TOOL_API_VERSION
      })
    }
    default:
      return null
  }
}

export function extendContinuityCheck(
  ctx: LiteraryEmitCtx,
  args: Record<string, unknown>,
  baseIssues: unknown[],
  envelope: Record<string, unknown>
): string {
  const focusPaths = (args.focusPaths as string[]) || []
  const aspects = (args.aspects as string[]) || ['character', 'timeline', 'prop']
  const chapterId = args.chapterId != null ? String(args.chapterId) : undefined
  const assertions = Array.isArray(args.assertions)
    ? (args.assertions as ContinuityAssertion[])
    : []
  const lit = runLiteraryContinuity({
    workspaceRoot: ctx.workspaceRoot,
    focusPaths,
    aspects,
    chapterId,
    assertions,
    readFocusText: ctx.readFocusText
  })
  const issues = [...(baseIssues as object[]), ...lit.issues]
  return JSON.stringify({
    ...envelope,
    aspects,
    issues,
    storyStateSummary: lit.storyStateSummary,
    foreshadowOpenCount: lit.foreshadowOpenCount,
    storyEnabled: lit.storyEnabled,
    toolApi: TOOL_API_VERSION,
    instruction:
      'Present issues[] (severity / path / quote / suggestion). Never dump chapter bodies. Story/prop conflicts are warnings only — upsert state explicitly for intentional reversals. Empty assertions[] ignored.'
  })
}

function cryptoRandom(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
