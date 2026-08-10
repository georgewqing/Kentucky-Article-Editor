import { join, normalize, relative, sep, isAbsolute } from './pathUtil'
import {
  parseDialogueCsv,
  serializeDialogueCsv,
  parseCharactersCsv,
  serializeCharactersCsv,
  parseKMind,
  serializeKMind,
  parseDialogueChoices,
  serializeDialogueChoices,
  serializeDialogueLayout,
  layoutDialogueGraph,
  summarizeDialogueGraph,
  emptyDialogueLine,
  emptyDialogueChoices,
  dialogueStemPaths,
  newNodeId,
  newEdgeId,
  type DialogueLine,
  type DialogueChoicesFile,
  type Character,
  type KMindGraphNode
} from './formats'
import { layoutKMindDocument, sanitizeKMindEdges, type KMindRankDir } from './kmindLayout'
import type { FileProposal } from './chatSessions'
import type { ToolDef } from './openaiCompatClient'
import { proposalToolNote } from './proposalGate'
import { listEnabledSkills, loadSkill } from './skills'
import {
  runWebSearch,
  runWebResearch,
  fetchPageExcerpt,
  type WebSearchProvider
} from './webSearch'

export function getWritingTools(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_dir',
        description: 'List files and folders under a workspace-relative path (default ".").',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path from workspace root' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a text file in the workspace. Large files are truncated.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            maxChars: { type: 'number' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_write_file',
        description:
          'Write full content to a text file. Prose (.md/.txt) requires user Accept. Pass characterId when changing names/voices.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            summary: { type: 'string' },
            characterId: { type: 'string', description: 'Related cast id when editing names/voice' }
          },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_text_patch',
        description:
          'Replace an exact substring in a text file. Prose requires user Accept. Pass characterId when changing names/voices.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            oldText: { type: 'string' },
            newText: { type: 'string' },
            summary: { type: 'string' },
            characterId: { type: 'string' }
          },
          required: ['path', 'oldText', 'newText']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_dialogue',
        description:
          'Parse a *.dialogue.csv as a Godot v1.3 dialogue graph: lines, choices options (empty text = confirm-to-continue), empty-text chains, layout presence, warnings. Prefer this before editing.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_update_dialogue_lines',
        description:
          'Update dialogue lines by id (partial fields). ≤5 lines may auto-apply; more require Accept. Prefer propose_dialogue_performance for focus/font/color/emotion batches. Does not edit choices.json.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            updates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  speaker: { type: 'string' },
                  note: { type: 'string' },
                  emotion: { type: 'string' },
                  scene: { type: 'string' },
                  condition: { type: 'string' },
                  audio: { type: 'string' },
                  focus_node: { type: 'string' },
                  font_size: { type: 'string' },
                  text_color: { type: 'string' }
                },
                required: ['id']
              }
            },
            summary: { type: 'string' }
          },
          required: ['path', 'updates']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_append_dialogue_lines',
        description:
          'Insert new dialogue lines (speaker = character id). Default append at end; pass afterId to insert after that line (sequence). ≤5 may auto-apply. Generates stable ids. Does not edit choices.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            afterId: {
              type: 'string',
              description: 'Insert after this line id; omit to append at end'
            },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  speaker: { type: 'string', description: 'Character id from characters.csv' },
                  text: { type: 'string' },
                  emotion: { type: 'string' },
                  note: { type: 'string' },
                  scene: { type: 'string' }
                },
                required: ['speaker', 'text']
              }
            },
            summary: { type: 'string' }
          },
          required: ['path', 'lines']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_dialogue_performance',
        description:
          'Batch-update performance fields (focus_node, font_size, text_color, emotion). text_color empty = engine default body color — do NOT use characters.color. Always requires Accept.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            updates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  focus_node: { type: 'string' },
                  font_size: { type: 'string' },
                  text_color: {
                    type: 'string',
                    description:
                      'Body text hex (#RGB/#RRGGBB/#RRGGBBAA) or empty for engine default. Not characters.color.'
                  },
                  emotion: { type: 'string' }
                },
                required: ['id']
              }
            },
            summary: { type: 'string' }
          },
          required: ['path', 'updates']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_reorder_dialogue_lines',
        description:
          'Reorder *.dialogue.csv rows by id list (linear play order when no choices). Requires Accept if large / multi-file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            order: {
              type: 'array',
              items: { type: 'string' },
              description: 'Id order; unspecified ids keep relative order at end'
            },
            summary: { type: 'string' }
          },
          required: ['path', 'order']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_set_dialogue_choices',
        description:
          'Write sibling *.dialogue.choices.json (v1.3 play graph). options: { text, goto } (text:\"\" = confirm-to-continue), or { text, end: true }. Do not mix empty and labeled text on one line. Empty nodes deletes the file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to *.dialogue.csv (not the choices file)' },
            mode: { type: 'string', enum: ['replace', 'merge'] },
            nodes: {
              type: 'object',
              description:
                'Map after_line_id → { options: [{ text, goto?, end? }] }. merge updates keys; replace overwrites all.'
            },
            summary: { type: 'string' }
          },
          required: ['path', 'nodes']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'layout_dialogue',
        description:
          'Auto-layout Kentucky *.dialogue.layout.json from CSV + choices (branch-aware). Godot ignores layout. Usually auto-writes. Call after graph edits so the canvas looks tidy.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to *.dialogue.csv' },
            summary: { type: 'string' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_dialogue_graph',
        description:
          'Build/replace a full Godot v1.3 dialogue graph: CSV lines + choices.json + layout.json. Every continue is an option (text:\"\" for silent next; labeled text for player choices; end:true for End). speaker = character id. Do not omit choices for linear scripts.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '*.dialogue.csv path (created if missing)' },
            mode: {
              type: 'string',
              enum: ['replace', 'append'],
              description: 'replace = rewrite lines+choices; append = add lines then merge choices'
            },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Optional stable id; auto-generated if omitted' },
                  speaker: { type: 'string' },
                  text: { type: 'string' },
                  note: { type: 'string' },
                  emotion: { type: 'string' },
                  scene: { type: 'string' },
                  condition: { type: 'string' },
                  audio: { type: 'string' },
                  focus_node: { type: 'string' },
                  font_size: { type: 'string' },
                  text_color: { type: 'string' }
                },
                required: ['speaker', 'text']
              }
            },
            choices: {
              type: 'array',
              description: 'Branching after a line id',
              items: {
                type: 'object',
                properties: {
                  after: { type: 'string', description: 'Line id after which options appear' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        goto: { type: 'string' },
                        end: { type: 'boolean' }
                      },
                      required: ['text']
                    }
                  }
                },
                required: ['after', 'options']
              }
            },
            autoLayout: {
              type: 'boolean',
              description: 'Write branch-aware layout.json (default true)'
            },
            summary: { type: 'string' }
          },
          required: ['path', 'lines']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'dialogue_cast_check',
        description:
          'Read-only: list dialogue speaker ids missing from characters.csv (orphans). Does not write files.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_characters',
        description: 'Read workspace characters.csv',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'lookup_character',
        description: 'Look up one character by id or exact/fuzzy name from characters.csv.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_upsert_character',
        description: 'Create or update a character row (no delete). Single-row upsert usually auto-applies.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            color: { type: 'string' },
            note: { type: 'string' },
            model_node: { type: 'string' },
            operable: {
              type: 'boolean',
              description:
                'true = player-operable (empty-text waits confirm); false/omit on create = NPC auto-advance. On update, omit keeps previous.'
            },
            summary: { type: 'string' }
          },
          required: ['id', 'name', 'model_node']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'continuity_check',
        description:
          'Read-only continuity audit vs characters.csv and focus files. Returns issues only — never writes. Prefer this when the user asks to check contradictions / 人设 / continuity.',
        parameters: {
          type: 'object',
          properties: {
            focusPaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Workspace-relative prose paths to check (defaults to empty = tell user to @ files)'
            },
            aspects: {
              type: 'array',
              items: { type: 'string', enum: ['character', 'timeline', 'prop'] }
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'scene_to_kmind',
        description:
          'Build/update a .kmind tree from prose (theme hub → beats → leaves). Requires Accept. Prefer TREE, not dense meshes. Uses autoLayout.',
        parameters: {
          type: 'object',
          properties: {
            sourcePath: { type: 'string' },
            kmindPath: { type: 'string' },
            mode: { type: 'string', enum: ['merge', 'replace_subtree'] },
            rootText: { type: 'string' },
            beats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  note: { type: 'string' },
                  children: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { text: { type: 'string' }, note: { type: 'string' } },
                      required: ['text']
                    }
                  }
                },
                required: ['text']
              }
            },
            summary: { type: 'string' }
          },
          required: ['kmindPath', 'beats']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'kmind_to_scene_outline',
        description:
          'Export a .kmind tree to a Markdown outline file (outline_only). Requires Accept. Does not overwrite long prose unless target is empty/new.',
        parameters: {
          type: 'object',
          properties: {
            kmindPath: { type: 'string' },
            targetPath: { type: 'string' },
            mode: { type: 'string', enum: ['outline_only'] },
            summary: { type: 'string' }
          },
          required: ['kmindPath', 'targetPath']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_kmind',
        description: 'Read a .kmind mind map as a compact summary.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_kmind_edit',
        description:
          'Edit a .kmind map (nodes/edges). Requires Accept. Prefer TREE/layered structure. Prefer scene_to_kmind for prose→map. Omit x/y — autoLayout default true.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            addNodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  shape: {
                    type: 'string',
                    description: 'ellipse=hub/theme; rounded=beat; rect=character/fact'
                  },
                  note: { type: 'string' }
                },
                required: ['text']
              }
            },
            updateNodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  note: { type: 'string' }
                },
                required: ['id']
              }
            },
            removeNodeIds: { type: 'array', items: { type: 'string' } },
            connect: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  target: { type: 'string' }
                },
                required: ['source', 'target']
              }
            },
            autoLayout: {
              type: 'boolean',
              description: 'Run layered layout after edit (default true). Set false only to keep manual positions.'
            },
            rankdir: {
              type: 'string',
              description: 'Layout direction: LR (default, good for timelines), TB, RL, BT'
            },
            summary: { type: 'string' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'layout_kmind',
        description:
          'Re-layout an existing .kmind with Sugiyama/dagre. Usually auto-applies (layout-only). Does not change node text.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            rankdir: {
              type: 'string',
              description: 'LR (default), TB, RL, or BT'
            },
            summary: { type: 'string' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_skills',
        description: 'List enabled agent skills (id, name, description). Call read_skill before following a skill.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_skill',
        description:
          'Load full SKILL.md instructions for an enabled skill. Optionally include reference.md / examples.md.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional extra files: reference.md, examples.md'
            }
          },
          required: ['id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Single web search query (requires Settings → web search on). Returns titles, URLs, snippets, and page excerpts for top hits. Cite sources; do not invent URLs.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            maxResults: { type: 'number' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_research',
        description:
          'Multi-query research: auto-split a question (or use queries[]), search each query in sequence, merge/dedupe, report overlap and shallow conflicts. Prefer for factual multi-angle questions. Includes page excerpts on top merged hits.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional explicit queries; if omitted, auto-split from question'
            },
            maxQueries: { type: 'number' },
            maxResults: { type: 'number' }
          },
          required: ['question']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description:
          'Fetch a single http(s) page and return readable text excerpt (requires web search enabled). Use when search snippets/excerpts lack the needed facts.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            maxChars: { type: 'number' }
          },
          required: ['url']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_plan',
        description: 'Replace the session task plan with new steps.',
        parameters: {
          type: 'object',
          properties: {
            steps: { type: 'array', items: { type: 'string' } }
          },
          required: ['steps']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_plan_step',
        description: 'Update a plan step status by index (0-based) or id.',
        parameters: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            text: { type: 'string' }
          },
          required: ['status']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'open_in_editor',
        description: 'Ask the UI to open a workspace file (optional 1-based line).',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            line: { type: 'number' }
          },
          required: ['path']
        }
      }
    }
  ]
}

export interface WorkspaceIo {
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<void>
  deleteFile?(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  listDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  join(...parts: string[]): string
}
let workspaceIo: WorkspaceIo | null = null
export function setWorkspaceIo(io: WorkspaceIo): void { workspaceIo = io }
export function getWorkspaceIo(): WorkspaceIo {
  if (!workspaceIo) throw new Error('Workspace IO is not configured')
  return workspaceIo
}
function uuid(): string {
  return globalThis.crypto?.randomUUID?.() || `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePathError'
  }
}

export function resolveWorkspacePath(workspaceRoot: string, relOrAbs: string): string {
  const root = normalize(workspaceRoot)
  const candidate = normalize(
    relOrAbs.includes(':') || relOrAbs.startsWith('/') || relOrAbs.startsWith('\\')
      ? relOrAbs
      : join(root, relOrAbs)
  )
  const rel = relative(root, candidate)
  if (rel.startsWith('..') || rel === '..' || (rel !== '' && rel.split(sep).includes('..'))) {
    throw new WorkspacePathError('Path escapes workspace')
  }
  return candidate
}

function toRel(workspaceRoot: string, abs: string): string {
  return relative(workspaceRoot, abs).split(sep).join('/')
}

async function readText(abs: string, maxChars = 80_000): Promise<string> {
  const raw = (await getWorkspaceIo().readFile(abs)) ?? ''
  if (raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars)}\n\n/* truncated: ${raw.length} chars total */`
}

export interface ToolContext {
  workspaceRoot: string
  onProposal: (p: FileProposal) => { autoApplied: boolean } | Promise<{ autoApplied: boolean }>
  onPlan: (steps: Array<{ id: string; text: string; status: 'pending' | 'in_progress' | 'done' }>) => void
  onPlanUpdate: (
    patch: Partial<{ id: string; index: number; status: string; text: string }>
  ) => void
  onOpenFile: (relPath: string, line?: number) => void
  getPlan: () => Array<{ id: string; text: string; status: string }>
  webSearchEnabled: boolean
  webSearchProvider: WebSearchProvider
  webSearchMaxResults: number
}

async function emitProposal(
  ctx: ToolContext,
  proposal: FileProposal
): Promise<Record<string, unknown>> {
  const result = await ctx.onProposal(proposal)
  const autoApplied = Boolean(result?.autoApplied)
  return {
    ok: true,
    written: autoApplied,
    pending: !autoApplied,
    path: proposal.path,
    changeId: proposal.id,
    note: proposalToolNote(autoApplied)
  }
}

function normalizeChoiceOptions(
  options: unknown
): Array<{ text: string; goto: string; end?: boolean }> {
  if (!Array.isArray(options)) return []
  const out: Array<{ text: string; goto: string; end?: boolean }> = []
  for (const raw of options) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    // v1.3: empty text is valid (confirm-to-continue / end)
    const text = typeof o.text === 'string' ? o.text.trim() : String(o.text || '').trim()
    if (o.end === true) {
      out.push({ text, goto: '', end: true })
      continue
    }
    const goto = String(o.goto || '').trim()
    if (!goto) continue
    out.push({ text, goto })
  }
  return out
}

/** Fill missing outs with empty-text continue to next CSV row (v1.3 linear). */
function fillEmptyTextContinues(
  lines: DialogueLine[],
  choiceFile: DialogueChoicesFile
): void {
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]?.id
    const b = lines[i + 1]?.id
    if (!a || !b) continue
    if ((choiceFile.nodes[a]?.options || []).length > 0) continue
    choiceFile.nodes[a] = { options: [{ text: '', goto: b }] }
  }
}

function choicesFromNodesArg(nodesArg: unknown): DialogueChoicesFile {
  const file = emptyDialogueChoices()
  if (!nodesArg || typeof nodesArg !== 'object') return file
  for (const [after, node] of Object.entries(nodesArg as Record<string, unknown>)) {
    const id = String(after || '').trim()
    if (!id || !node || typeof node !== 'object') continue
    const options = normalizeChoiceOptions((node as { options?: unknown }).options)
    if (options.length) file.nodes[id] = { options }
  }
  return file
}

function allocateLineIds(
  path: string,
  existing: DialogueLine[],
  incoming: Array<Record<string, unknown>>
): DialogueLine[] {
  const used = new Set(existing.map((l) => l.id).filter(Boolean))
  const stem =
    path
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.dialogue\.csv$/i, '') || 'line'
  let seq = existing.length + 1
  const added: DialogueLine[] = []
  for (const row of incoming) {
    const speaker = String(row.speaker || '').trim()
    const text = String(row.text || '')
    if (!speaker || !text) continue
    let id = String(row.id || '').trim()
    if (!id || used.has(id)) {
      do {
        id = `${stem}_${speaker}_${String(seq).padStart(3, '0')}`
        seq += 1
      } while (used.has(id))
    }
    used.add(id)
    added.push(
      emptyDialogueLine({
        id,
        speaker,
        text,
        emotion: String(row.emotion || ''),
        note: String(row.note || ''),
        scene: String(row.scene || ''),
        condition: String(row.condition || ''),
        audio: String(row.audio || ''),
        focus_node: String(row.focus_node || ''),
        font_size: String(row.font_size || ''),
        text_color: String(row.text_color || '')
      })
    )
  }
  return added
}

async function loadChoicesBeside(absCsv: string): Promise<DialogueChoicesFile> {
  const { choices } = dialogueStemPaths(absCsv)
  const raw = await getWorkspaceIo().readFile(choices)
  return raw === null ? emptyDialogueChoices() : parseDialogueChoices(raw)
}

export async function runTool(
  name: string,
  argsJson: string,
  ctx: ToolContext
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argsJson || '{}') as Record<string, unknown>
  } catch {
    return JSON.stringify({ error: 'Invalid JSON arguments' })
  }

  try {
    const io = getWorkspaceIo()
    switch (name) {
      case 'list_dir': {
        const rel = typeof args.path === 'string' ? args.path : '.'
        const abs = resolveWorkspacePath(ctx.workspaceRoot, rel === '.' ? '' : rel)
        const target = rel === '.' || rel === '' ? ctx.workspaceRoot : abs
        const entries = (await io.listDir(target)).map((entry) => ({
          name: entry.name,
          type: entry.isDirectory ? 'dir' : 'file'
        }))
        return JSON.stringify({ path: toRel(ctx.workspaceRoot, target) || '.', entries })
      }
      case 'read_file': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!(await io.exists(abs))) {
          return JSON.stringify({ error: 'File not found' })
        }
        const maxChars = typeof args.maxChars === 'number' ? args.maxChars : 80_000
        return JSON.stringify({ path, content: await readText(abs, maxChars) })
      }
      case 'propose_write_file': {
        const path = String(args.path || '')
        const content = String(args.content ?? '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = (await io.readFile(abs)) ?? ''
        const ext = path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt')
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: content,
          summary: String(args.summary || `Write ${path}`),
          status: 'pending',
          kind: ext ? 'prose' : 'other'
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'propose_text_patch': {
        const path = String(args.path || '')
        const oldText = String(args.oldText ?? '')
        const newText = String(args.newText ?? '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        if (!before.includes(oldText)) {
          return JSON.stringify({ error: 'oldText not found in file' })
        }
        const after = before.replace(oldText, newText)
        const ext = path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt')
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Patch ${path}`),
          status: 'pending',
          kind: ext ? 'prose' : 'other'
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'read_dialogue': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(raw)
        const stems = dialogueStemPaths(abs)
        const choicesRaw = await io.readFile(stems.choices)
        const choices = choicesRaw === null ? emptyDialogueChoices() : parseDialogueChoices(choicesRaw)
        const hasLayout = await io.exists(stems.layout)
        const graph = summarizeDialogueGraph(parsed.lines, choices)
        return JSON.stringify({
          path,
          protocol: 'v1.3',
          count: parsed.lines.length,
          openingId: graph.openingId,
          lines: parsed.lines.map((l) => ({
            id: l.id,
            speaker: l.speaker,
            text: l.text.slice(0, 200)
          })),
          choices: graph.choiceNodes,
          sequenceChains: graph.sequenceChains,
          hasLayout,
          warnings: graph.warnings,
          note:
            'Disk truth = CSV + choices.json (play graph). layout.json is Kentucky-only. Empty option text = confirm-to-continue; labeled options = UI; end:true ends. CSV row order is not play order (opening = first CSV row).'
        })
      }
      case 'propose_update_dialogue_lines': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(before)
        const updates = (args.updates as Array<Record<string, string>>) || []
        const byId = new Map(parsed.lines.map((l) => [l.id, { ...l }]))
        let perfOnly = true
        for (const u of updates) {
          const cur = byId.get(u.id)
          if (!cur) continue
          const next: DialogueLine = { ...cur }
          for (const key of [
            'text',
            'speaker',
            'note',
            'emotion',
            'scene',
            'condition',
            'audio',
            'focus_node',
            'font_size',
            'text_color'
          ] as const) {
            if (u[key] !== undefined) (next as unknown as Record<string, string>)[key] = u[key]
          }
          if (
            u.text !== undefined ||
            u.speaker !== undefined ||
            u.note !== undefined ||
            u.scene !== undefined ||
            u.condition !== undefined ||
            u.audio !== undefined
          ) {
            perfOnly = false
          }
          byId.set(u.id, next)
        }
        const lines = parsed.lines.map((l) => byId.get(l.id) || l)
        const after = serializeDialogueCsv(lines)
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Update dialogue ${path}`),
          status: 'pending',
          kind: perfOnly ? 'dialogue_performance' : 'dialogue',
          changeCount: updates.length
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'propose_append_dialogue_lines': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(before)
        const incoming = (args.lines as Array<Record<string, unknown>>) || []
        const added = allocateLineIds(path, parsed.lines, incoming)
        const afterId = typeof args.afterId === 'string' ? args.afterId.trim() : ''
        let lines: DialogueLine[]
        if (afterId) {
          const idx = parsed.lines.findIndex((l) => l.id === afterId)
          if (idx < 0) return JSON.stringify({ error: `afterId not found: ${afterId}` })
          lines = [
            ...parsed.lines.slice(0, idx + 1),
            ...added,
            ...parsed.lines.slice(idx + 1)
          ]
        } else {
          lines = [...parsed.lines, ...added]
        }
        const after = serializeDialogueCsv(lines)
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(
            args.summary ||
              (afterId
                ? `Insert ${added.length} dialogue lines after ${afterId}`
                : `Append ${added.length} dialogue lines`)
          ),
          status: 'pending',
          kind: 'dialogue',
          changeCount: added.length
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'propose_dialogue_performance': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(before)
        const updates = (args.updates as Array<Record<string, string>>) || []
        const byId = new Map(parsed.lines.map((l) => [l.id, { ...l }]))
        for (const u of updates) {
          const cur = byId.get(u.id)
          if (!cur) continue
          const next = { ...cur }
          for (const key of ['focus_node', 'font_size', 'text_color', 'emotion'] as const) {
            if (u[key] !== undefined) next[key] = u[key]
          }
          byId.set(u.id, next)
        }
        const lines = parsed.lines.map((l) => byId.get(l.id) || l)
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: serializeDialogueCsv(lines),
          summary: String(args.summary || `Performance fields ${path}`),
          status: 'pending',
          kind: 'dialogue_performance',
          changeCount: updates.length
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'propose_reorder_dialogue_lines': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(before)
        const order = (args.order as string[]) || []
        const byId = new Map(parsed.lines.map((l) => [l.id, l]))
        const seen = new Set<string>()
        const ordered: DialogueLine[] = []
        for (const id of order) {
          const line = byId.get(id)
          if (!line || seen.has(id)) continue
          ordered.push(line)
          seen.add(id)
        }
        for (const line of parsed.lines) {
          if (!seen.has(line.id)) ordered.push(line)
        }
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: serializeDialogueCsv(ordered),
          summary: String(args.summary || `Reorder dialogue ${path}`),
          status: 'pending',
          kind: 'dialogue',
          changeCount: ordered.length
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'propose_set_dialogue_choices': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!(await io.exists(abs))) return JSON.stringify({ error: 'Dialogue CSV not found' })
        const stems = dialogueStemPaths(abs)
        const mode = String(args.mode || 'replace') === 'merge' ? 'merge' : 'replace'
        const incoming = choicesFromNodesArg(args.nodes)
        let next = incoming
        if (mode === 'merge') {
          const cur = await loadChoicesBeside(abs)
          next = { version: 1, nodes: { ...cur.nodes, ...incoming.nodes } }
          // Explicit empty options array on a key clears that node in merge
          if (args.nodes && typeof args.nodes === 'object') {
            for (const [k, v] of Object.entries(args.nodes as Record<string, unknown>)) {
              if (
                v &&
                typeof v === 'object' &&
                Array.isArray((v as { options?: unknown }).options) &&
                (v as { options: unknown[] }).options.length === 0
              ) {
                delete next.nodes[k]
              }
            }
          }
        }
        const after = serializeDialogueChoices(next)
        const before = (await io.readFile(stems.choices)) ?? ''
        if (before === after) {
          return JSON.stringify({ ok: true, written: false, pending: false, note: 'No choices change' })
        }
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, stems.choices),
          absPath: stems.choices,
          before,
          after,
          summary: String(args.summary || `Set dialogue choices for ${path}`),
          status: 'pending',
          kind: 'dialogue_choices',
          changeCount: Object.keys(next.nodes).length
        }
        return JSON.stringify({
          ...(await emitProposal(ctx, proposal)),
          choiceNodeCount: Object.keys(next.nodes).length,
          deletedFile: after === '' && before !== ''
        })
      }
      case 'layout_dialogue': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ error: 'Dialogue CSV not found' })
        const stems = dialogueStemPaths(abs)
        const parsed = parseDialogueCsv(raw)
        const choices = await loadChoicesBeside(abs)
        const layout = layoutDialogueGraph(
          parsed.lines.map((l) => l.id).filter(Boolean),
          choices
        )
        const after = serializeDialogueLayout(layout)
        const before = (await io.readFile(stems.layout)) ?? ''
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, stems.layout),
          absPath: stems.layout,
          before,
          after,
          summary: String(args.summary || `Layout dialogue canvas ${path}`),
          status: 'pending',
          kind: 'dialogue_layout'
        }
        return JSON.stringify({
          ...(await emitProposal(ctx, proposal)),
          nodeCount: Object.keys(layout.nodes).length
        })
      }
      case 'propose_dialogue_graph': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const mode = String(args.mode || 'replace') === 'append' ? 'append' : 'replace'
        const autoLayout = args.autoLayout !== false
        const stems = dialogueStemPaths(abs)
        const beforeCsv = (await io.readFile(abs)) ?? ''
        const existing = beforeCsv ? parseDialogueCsv(beforeCsv).lines : []
        const incoming = (args.lines as Array<Record<string, unknown>>) || []
        const added = allocateLineIds(path, mode === 'append' ? existing : [], incoming)
        const lines = mode === 'append' ? [...existing, ...added] : added
        if (!lines.length) return JSON.stringify({ error: 'No valid lines (need speaker + text)' })

        const choiceList = (args.choices as Array<Record<string, unknown>>) || []
        const choiceFile = emptyDialogueChoices()
        if (mode === 'append') {
          const cur = await loadChoicesBeside(abs)
          choiceFile.nodes = { ...cur.nodes }
        }
        for (const ch of choiceList) {
          const after = String(ch.after || '').trim()
          const options = normalizeChoiceOptions(ch.options)
          if (!after || !options.length) continue
          choiceFile.nodes[after] = { options }
        }
        fillEmptyTextContinues(lines, choiceFile)

        const results: Record<string, unknown>[] = []
        const csvProposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before: beforeCsv,
          after: serializeDialogueCsv(lines),
          summary: String(
            args.summary ||
              (mode === 'append'
                ? `Append ${added.length} lines to dialogue graph`
                : `Replace dialogue graph (${lines.length} lines)`)
          ),
          status: 'pending',
          kind: 'dialogue',
          changeCount: mode === 'append' ? added.length : lines.length
        }
        results.push({ file: 'csv', ...(await emitProposal(ctx, csvProposal)) })

        const choicesAfter = serializeDialogueChoices(choiceFile)
        const choicesBefore = (await io.readFile(stems.choices)) ?? ''
        if (choicesAfter !== choicesBefore) {
          const chProposal: FileProposal = {
            id: uuid(),
            path: toRel(ctx.workspaceRoot, stems.choices),
            absPath: stems.choices,
            before: choicesBefore,
            after: choicesAfter,
            summary: `Choices for ${path}`,
            status: 'pending',
            kind: 'dialogue_choices',
            changeCount: Object.keys(choiceFile.nodes).length
          }
          results.push({ file: 'choices', ...(await emitProposal(ctx, chProposal)) })
        }

        if (autoLayout) {
          const layout = layoutDialogueGraph(
            lines.map((l) => l.id).filter(Boolean),
            choiceFile
          )
          const layoutAfter = serializeDialogueLayout(layout)
          const layoutBefore = (await io.readFile(stems.layout)) ?? ''
          const layProposal: FileProposal = {
            id: uuid(),
            path: toRel(ctx.workspaceRoot, stems.layout),
            absPath: stems.layout,
            before: layoutBefore,
            after: layoutAfter,
            summary: `Layout for ${path}`,
            status: 'pending',
            kind: 'dialogue_layout'
          }
          results.push({ file: 'layout', ...(await emitProposal(ctx, layProposal)) })
        }

        const graph = summarizeDialogueGraph(lines, choiceFile)
        return JSON.stringify({
          ok: true,
          path,
          mode,
          lineCount: lines.length,
          choiceNodeCount: Object.keys(choiceFile.nodes).length,
          openingId: graph.openingId,
          sequenceChains: graph.sequenceChains,
          warnings: graph.warnings,
          writes: results,
          note: 'Open the *.dialogue.csv tab to see the node canvas. Accept any pending csv card; choices/layout usually auto-write with it.'
        })
      }
      case 'dialogue_cast_check': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const charsAbs = join(ctx.workspaceRoot, 'characters.csv')
        const charsRaw = await io.readFile(charsAbs)
        const cast = charsRaw !== null
          ? new Set(parseCharactersCsv(charsRaw).map((c) => c.id))
          : new Set<string>()
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(raw)
        const orphans = parsed.lines
          .filter((l) => l.speaker && !cast.has(l.speaker))
          .map((l) => ({ id: l.id, speaker: l.speaker, text: l.text.slice(0, 80) }))
        return JSON.stringify({
          path,
          knownCharacters: cast.size,
          orphanCount: orphans.length,
          orphans,
          note: 'Read-only. Suggest propose_upsert_character or fix speaker ids; do not silently rewrite.'
        })
      }
      case 'read_characters': {
        const abs = join(ctx.workspaceRoot, 'characters.csv')
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ characters: [] })
        const chars = parseCharactersCsv(raw)
        return JSON.stringify({ characters: chars })
      }
      case 'lookup_character': {
        const abs = join(ctx.workspaceRoot, 'characters.csv')
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ found: false, characters: [] })
        const chars = parseCharactersCsv(raw)
        const id = typeof args.id === 'string' ? args.id.trim() : ''
        const name = typeof args.name === 'string' ? args.name.trim().toLowerCase() : ''
        let found = id ? chars.find((c) => c.id === id) : undefined
        if (!found && name) {
          found =
            chars.find((c) => c.name.toLowerCase() === name) ||
            chars.find((c) => c.name.toLowerCase().includes(name))
        }
        return JSON.stringify({ found: Boolean(found), character: found || null })
      }
      case 'propose_upsert_character': {
        const abs = join(ctx.workspaceRoot, 'characters.csv')
        const before = (await io.readFile(abs)) ?? 'id,name,color,note,model_node,operable\n'
        const list = parseCharactersCsv(before)
        const id = String(args.id)
        const prev = list.find((c) => c.id === id)
        const operableArg = args.operable
        const operable =
          typeof operableArg === 'boolean'
            ? operableArg
            : typeof operableArg === 'string'
              ? ['1', 'true', 'yes', 'y'].includes(operableArg.trim().toLowerCase())
              : Boolean(prev?.operable)
        const row: Character = {
          id,
          name: String(args.name || id),
          color: String(args.color || '#88c0d0'),
          note: String(args.note || ''),
          model_node: String(args.model_node || ''),
          operable
        }
        const idx = list.findIndex((c) => c.id === id)
        if (idx >= 0) list[idx] = row
        else list.push(row)
        const after = serializeCharactersCsv(list)
        const proposal: FileProposal = {
          id: uuid(),
          path: 'characters.csv',
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Upsert character ${id}`),
          status: 'pending',
          kind: 'characters'
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'continuity_check': {
        const focusPaths = (args.focusPaths as string[]) || []
        const aspects = (args.aspects as string[]) || ['character', 'timeline', 'prop']
        const charsAbs = join(ctx.workspaceRoot, 'characters.csv')
        const charsRaw = await io.readFile(charsAbs)
        const characters = charsRaw !== null
          ? parseCharactersCsv(charsRaw)
          : []
        const excerpts: Array<{ path: string; text: string }> = []
        for (const rel of focusPaths.slice(0, 6)) {
          try {
            const abs = resolveWorkspacePath(ctx.workspaceRoot, rel)
            if (!(await io.exists(abs))) continue
            excerpts.push({ path: rel, text: await readText(abs, 24_000) })
          } catch {
            /* skip */
          }
        }
        return JSON.stringify({
          readOnly: true,
          aspects,
          characters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            note: (c.note || '').slice(0, 200)
          })),
          excerpts,
          instruction:
            'Analyze cast vs excerpts for contradictions. Reply to the user with a structured issue list (severity, quote, suggestion). Do NOT call write tools in this step unless the user already asked to apply fixes.'
        })
      }
      case 'read_kmind': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const raw = await io.readFile(abs)
        if (raw === null) return JSON.stringify({ error: 'File not found' })
        const doc = parseKMind(raw)
        return JSON.stringify({
          path,
          nodes: doc.nodes.map((n) => ({
            id: n.id,
            text: n.text,
            x: n.x,
            y: n.y,
            note: n.note
          })),
          edges: doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
        })
      }
      case 'propose_kmind_edit': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = (await io.readFile(abs)) ?? ''
        const doc = before
          ? parseKMind(before)
          : {
              version: 2 as const,
              nodes: [] as KMindGraphNode[],
              edges: [] as Array<{ id: string; source: string; target: string }>,
              viewport: { x: 0, y: 0, zoom: 1 }
            }
        const addNodes = (args.addNodes as Array<Record<string, unknown>>) || []
        let i = 0
        for (const n of addNodes) {
          const id = typeof n.id === 'string' && n.id ? n.id : newNodeId()
          const node: KMindGraphNode = {
            id,
            text: String(n.text || 'Node'),
            shape: (n.shape as KMindGraphNode['shape']) || 'rounded',
            x: typeof n.x === 'number' ? n.x : 120 + (i % 4) * 220,
            y: typeof n.y === 'number' ? n.y : 100 + Math.floor(i / 4) * 140,
            width: 160,
            height: 56
          }
          if (typeof n.note === 'string') node.note = n.note
          doc.nodes.push(node)
          i += 1
        }
        const updateNodes = (args.updateNodes as Array<Record<string, unknown>>) || []
        for (const u of updateNodes) {
          const id = String(u.id)
          const node = doc.nodes.find((n) => n.id === id)
          if (!node) continue
          if (typeof u.text === 'string') node.text = u.text
          if (typeof u.x === 'number') node.x = u.x
          if (typeof u.y === 'number') node.y = u.y
          if (typeof u.note === 'string') node.note = u.note
        }
        const removeIds = new Set((args.removeNodeIds as string[]) || [])
        if (removeIds.size) {
          doc.nodes = doc.nodes.filter((n) => !removeIds.has(n.id))
          doc.edges = doc.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target))
        }
        const connect = (args.connect as Array<{ source: string; target: string }>) || []
        for (const c of connect) {
          if (!doc.nodes.some((n) => n.id === c.source) || !doc.nodes.some((n) => n.id === c.target)) {
            continue
          }
          doc.edges.push({
            id: newEdgeId(),
            source: c.source,
            target: c.target
          })
        }
        sanitizeKMindEdges(doc)
        const autoLayout = args.autoLayout !== false
        const rankdir = normalizeRankdir(args.rankdir)
        if (autoLayout) {
          layoutKMindDocument(doc, { rankdir })
        }
        const after = serializeKMind(doc)
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Edit mind map ${path}`),
          status: 'pending',
          kind: 'kmind'
        }
        return JSON.stringify({
          ...(await emitProposal(ctx, proposal)),
          autoLayout,
          rankdir,
          nodeCount: doc.nodes.length,
          edgeCount: doc.edges.length
        })
      }
      case 'layout_kmind': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = await io.readFile(abs)
        if (before === null) return JSON.stringify({ error: 'File not found' })
        const doc = parseKMind(before)
        sanitizeKMindEdges(doc)
        const rankdir = normalizeRankdir(args.rankdir)
        layoutKMindDocument(doc, { rankdir })
        const after = serializeKMind(doc)
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Re-layout mind map ${path} (${rankdir})`),
          status: 'pending',
          kind: 'kmind_layout'
        }
        return JSON.stringify({
          ...(await emitProposal(ctx, proposal)),
          rankdir,
          nodeCount: doc.nodes.length,
          edgeCount: doc.edges.length
        })
      }
      case 'scene_to_kmind': {
        const kmindPath = String(args.kmindPath || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, kmindPath)
        const mode = String(args.mode || 'merge')
        const before = (await io.readFile(abs)) ?? ''
        const doc =
          before && mode === 'merge'
            ? parseKMind(before)
            : {
                version: 2 as const,
                nodes: [] as KMindGraphNode[],
                edges: [] as Array<{ id: string; source: string; target: string }>,
                viewport: { x: 0, y: 0, zoom: 1 }
              }
        if (mode === 'replace_subtree') {
          doc.nodes = []
          doc.edges = []
        }
        const rootText = String(args.rootText || '场景')
        const rootId = newNodeId('hub')
        doc.nodes.push({
          id: rootId,
          text: rootText,
          shape: 'ellipse',
          x: 0,
          y: 0,
          width: 180,
          height: 56
        })
        const beats = (args.beats as Array<Record<string, unknown>>) || []
        for (const beat of beats) {
          const beatId = newNodeId('beat')
          doc.nodes.push({
            id: beatId,
            text: String(beat.text || 'Beat'),
            shape: 'rounded',
            x: 0,
            y: 0,
            width: 160,
            height: 56,
            note: typeof beat.note === 'string' ? beat.note : undefined
          })
          doc.edges.push({ id: newEdgeId(), source: rootId, target: beatId })
          const children = (beat.children as Array<Record<string, unknown>>) || []
          for (const ch of children) {
            const leafId = newNodeId('leaf')
            doc.nodes.push({
              id: leafId,
              text: String(ch.text || 'Point'),
              shape: 'rect',
              x: 0,
              y: 0,
              width: 140,
              height: 48,
              note: typeof ch.note === 'string' ? ch.note : undefined
            })
            doc.edges.push({ id: newEdgeId(), source: beatId, target: leafId })
          }
        }
        sanitizeKMindEdges(doc)
        layoutKMindDocument(doc, { rankdir: 'LR' })
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: serializeKMind(doc),
          summary: String(args.summary || `Scene → mind map ${kmindPath}`),
          status: 'pending',
          kind: 'kmind'
        }
        return JSON.stringify({
          ...(await emitProposal(ctx, proposal)),
          nodeCount: doc.nodes.length,
          sourcePath: args.sourcePath || null
        })
      }
      case 'kmind_to_scene_outline': {
        const kmindPath = String(args.kmindPath || '')
        const targetPath = String(args.targetPath || '')
        const kAbs = resolveWorkspacePath(ctx.workspaceRoot, kmindPath)
        const tAbs = resolveWorkspacePath(ctx.workspaceRoot, targetPath)
        const kRaw = await io.readFile(kAbs)
        if (kRaw === null) return JSON.stringify({ error: 'kmind not found' })
        const doc = parseKMind(kRaw)
        const children = new Map<string, string[]>()
        const incoming = new Set<string>()
        for (const e of doc.edges) {
          const list = children.get(e.source) || []
          list.push(e.target)
          children.set(e.source, list)
          incoming.add(e.target)
        }
        const roots = doc.nodes.filter((n) => !incoming.has(n.id))
        const byId = new Map(doc.nodes.map((n) => [n.id, n]))
        const lines: string[] = [`# Outline from ${kmindPath}`, '']
        const walk = (id: string, depth: number): void => {
          const n = byId.get(id)
          if (!n) return
          const hashes = '#'.repeat(Math.min(6, depth + 1))
          lines.push(`${hashes} ${n.text}`)
          if (n.note) lines.push('', n.note, '')
          for (const c of children.get(id) || []) walk(c, depth + 1)
        }
        for (const r of roots) walk(r.id, 0)
        if (!roots.length) {
          for (const n of doc.nodes) lines.push(`## ${n.text}`)
        }
        const after = lines.join('\n').trim() + '\n'
        const before = (await io.readFile(tAbs)) ?? ''
        if (before.trim().length > 400) {
          return JSON.stringify({
            error:
              'Target already has substantial prose. Refuse overwrite in outline_only mode; pick an empty/new .md path.'
          })
        }
        const proposal: FileProposal = {
          id: uuid(),
          path: toRel(ctx.workspaceRoot, tAbs),
          absPath: tAbs,
          before,
          after,
          summary: String(args.summary || `Mind map → outline ${targetPath}`),
          status: 'pending',
          kind: 'prose'
        }
        return JSON.stringify(await emitProposal(ctx, proposal))
      }
      case 'create_plan': {
        const steps = (args.steps as string[]) || []
        ctx.onPlan(
          steps.map((text, idx) => ({
            id: `p${idx}_${uuid().slice(0, 8)}`,
            text,
            status: idx === 0 ? 'in_progress' : 'pending'
          }))
        )
        return JSON.stringify({ ok: true, count: steps.length })
      }
      case 'update_plan_step': {
        ctx.onPlanUpdate({
          id: typeof args.id === 'string' ? args.id : undefined,
          index: typeof args.index === 'number' ? args.index : undefined,
          status: String(args.status),
          text: typeof args.text === 'string' ? args.text : undefined
        })
        return JSON.stringify({ ok: true })
      }
      case 'open_in_editor': {
        const path = String(args.path || '')
        resolveWorkspacePath(ctx.workspaceRoot, path)
        ctx.onOpenFile(path, typeof args.line === 'number' ? args.line : undefined)
        return JSON.stringify({ ok: true })
      }
      case 'list_skills': {
        return JSON.stringify({
          skills: listEnabledSkills().map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description
          }))
        })
      }
      case 'read_skill': {
        const id = String(args.id || '')
        const files = Array.isArray(args.files) ? args.files.map(String) : undefined
        const loaded = loadSkill(id, files)
        return JSON.stringify(loaded)
      }
      case 'web_search': {
        if (!ctx.webSearchEnabled) {
          return JSON.stringify({
            error: 'Web search is disabled. Enable it in Settings → AI → Web search.'
          })
        }
        const query = String(args.query || '')
        const maxResults =
          typeof args.maxResults === 'number' ? args.maxResults : ctx.webSearchMaxResults
        const result = await runWebSearch(ctx.webSearchProvider, query, maxResults)
        return JSON.stringify(result)
      }
      case 'web_research': {
        if (!ctx.webSearchEnabled) {
          return JSON.stringify({
            error: 'Web search is disabled. Enable it in Settings → AI → Web search.'
          })
        }
        const question = String(args.question || '')
        const queries = Array.isArray(args.queries) ? args.queries.map(String) : undefined
        const research = await runWebResearch({
          provider: ctx.webSearchProvider,
          question,
          queries,
          maxQueries: typeof args.maxQueries === 'number' ? args.maxQueries : 3,
          maxResults:
            typeof args.maxResults === 'number' ? args.maxResults : ctx.webSearchMaxResults
        })
        return JSON.stringify(research)
      }
      case 'web_fetch': {
        if (!ctx.webSearchEnabled) {
          return JSON.stringify({
            error: 'Web search is disabled. Enable it in Settings → AI → Web search.'
          })
        }
        const url = String(args.url || '')
        const maxChars = typeof args.maxChars === 'number' ? args.maxChars : 4000
        const page = await fetchPageExcerpt(url, Math.min(12_000, Math.max(500, maxChars)))
        return JSON.stringify(page)
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

export async function applyProposalToDisk(proposal: FileProposal): Promise<void> {
  const io = getWorkspaceIo()
  // Empty choices sidecar → delete file (protocol: missing file = linear)
  if (
    proposal.after === '' &&
    proposal.absPath.replace(/\\/g, '/').toLowerCase().endsWith('.dialogue.choices.json')
  ) {
    if (await io.exists(proposal.absPath)) {
      if (io.deleteFile) await io.deleteFile(proposal.absPath)
      else await io.writeFile(proposal.absPath, '')
    }
    return
  }
  await io.writeFile(proposal.absPath, proposal.after)
}

export type AgentToolMode = 'ask' | 'plan' | 'outline' | 'agent'

const PLAN_TOOLS = new Set([
  'list_dir',
  'read_file',
  'read_dialogue',
  'read_characters',
  'lookup_character',
  'read_kmind',
  'create_plan',
  'update_plan_step',
  'continuity_check',
  'dialogue_cast_check',
  'list_skills',
  'read_skill',
  'web_search',
  'web_research',
  'web_fetch',
  'open_in_editor'
])

const OUTLINE_TOOLS = new Set([
  'list_dir',
  'read_file',
  'read_dialogue',
  'read_characters',
  'lookup_character',
  'read_kmind',
  'scene_to_kmind',
  'kmind_to_scene_outline',
  'layout_kmind',
  'layout_dialogue',
  'propose_dialogue_graph',
  'propose_set_dialogue_choices',
  'propose_reorder_dialogue_lines',
  'propose_append_dialogue_lines',
  'continuity_check',
  'dialogue_cast_check',
  'list_skills',
  'read_skill',
  'open_in_editor'
])

export type WritingToolsOpts = {
  webSearchEnabled?: boolean
}

export function getWritingToolsForMode(
  mode: AgentToolMode,
  opts: WritingToolsOpts = {}
): ToolDef[] | undefined {
  if (mode === 'ask') return undefined
  let all = getWritingTools()
  if (!opts.webSearchEnabled) {
    all = all.filter(
      (t) =>
        t.function.name !== 'web_search' &&
        t.function.name !== 'web_research' &&
        t.function.name !== 'web_fetch'
    )
  }
  if (mode === 'agent') return all
  const allow = mode === 'plan' ? PLAN_TOOLS : OUTLINE_TOOLS
  return all.filter((t) => allow.has(t.function.name))
}

export function modeSystemPrefix(mode: AgentToolMode): string {
  switch (mode) {
    case 'ask':
      return [
        'MODE: Ask — conversation only. You have NO tools. Do not claim you edited files. Answer craft questions; suggest what the user could do in Agent/Outline mode.'
      ].join('\n')
    case 'plan':
      return [
        'MODE: Plan — research with read-only tools and maintain a task plan via create_plan / update_plan_step.',
        'Do NOT write or patch any files. When the plan is ready, tell the user to switch to Agent mode to execute.'
      ].join('\n')
    case 'outline':
      return [
        'MODE: Outline — structure only. Prefer scene_to_kmind and kmind_to_scene_outline for prose maps.',
        'For Godot dialogue graphs prefer propose_dialogue_graph / layout_dialogue (structure + branching), not long prose rewrites.',
        'Do not rewrite existing long prose. Outline targets should be new/empty markdown. Keep mind maps as trees.'
      ].join('\n')
    default:
      return 'MODE: Agent — full writing tools with review rules as below.'
  }
}

export function LITERARY_SYSTEM_PROMPT(
  styleMemo: string,
  mode: AgentToolMode = 'agent',
  extras?: { skillsCatalog?: string; webSearchEnabled?: boolean }
): string {
  const webOn = Boolean(extras?.webSearchEnabled)
  return [
    modeSystemPrefix(mode),
    '',
    'You are KENTUCKY Writing Agent — a literary assistant inside a local writing app.',
    'Help with fiction, scripts, dialogue CSV, outlines, and mind maps.',
    'Prefer Chinese or English to match the user. Be concise and craft-focused.',
    'Never run shell commands. Stay inside the opened workspace for file edits.',
    webOn
      ? 'Web search tools are ENABLED. Prefer web_research / web_search; results include snippet + excerpt (fetched page text). If facts are still missing, call web_fetch on the best URL. Cite title+URL from tool results only — never invent sources.'
      : 'Web search is DISABLED in settings. Do not claim you searched the web; answer from context/knowledge and suggest enabling Web search in Settings if needed.',
    '',
    'Skills:',
    '- When a listed skill matches the task, call read_skill(id) and follow it before improvising.',
    '- Skills are instruction markdown only — never expect to run skill scripts.',
    extras?.skillsCatalog?.trim() ? extras.skillsCatalog.trim() : '',
    '',
    'Writes & review (CRITICAL):',
    '- Prose (.md/.txt) and kmind content edits to existing non-empty files, multi-file turns, and dialogue performance batches need user Accept on the change card.',
    '- New files, writing into empty files, single character upsert, layout_kmind, layout_dialogue, and small dialogue edits (≤5 lines) may auto-write; tool results say written vs pending.',
    '- If pending: tell the user to Accept/Reject on the card. If written: say it was written. Never invent an Apply step outside the card.',
    '- Do not mass-delete prose unless the user explicitly asks.',
    '',
    'Literary workflow:',
    '- Cast table is injected as context. Before renaming voices/appearance, call read_characters or lookup_character; explain conflicts before proposing prose edits.',
    '- Continuity / 人设 / contradiction checks → continuity_check (read-only report first). Only write after the user asks to apply fixes.',
    '- Prose → mind map: scene_to_kmind. Mind map → outline md: kmind_to_scene_outline. Prefer these over dumping raw kmind JSON.',
    '',
    'Dialogue graph (Godot protocol v1.3 — CRITICAL):',
    '- Disk truth: *.dialogue.csv (11 cols) + sibling *.dialogue.choices.json (play graph) + Kentucky-only *.dialogue.layout.json. speaker = character id.',
    '- Always call read_dialogue before graph edits (returns choices, empty-text chains as sequenceChains, warnings).',
    '- New / full scripts → propose_dialogue_graph (csv + choices + layout). Linear continues MUST be options with text:\"\". Labeled text = player choices. end:true = End. Never omit choices to mean “linear CSV order”.',
    '- Do not mix empty-text and labeled options on the same line.',
    '- Patch lines only → propose_update_dialogue_lines / propose_append_dialogue_lines (afterId inserts near that id in CSV) / propose_reorder_dialogue_lines.',
    '- Patch options only → propose_set_dialogue_choices. Empty nodes deletes choices file (isolated lines with no outs).',
    '- After structural edits, call layout_dialogue if layout was not already written (canvas coordinates; Godot ignores).',
    '- Playback follows options.goto / end only; CSV first row = opening. Unreachable lines (no path from opening via options) will not play.',
    '- text_color is body text color for Godot UI: leave empty for engine default (usually white). NEVER copy characters.color into text_color (character color is Kentucky canvas badge only).',
    '- Opening speaker may be operable; if the user wants NPC speech immediately on enter, opening speaker should be non-operable.',
    '- Performance fields → propose_dialogue_performance. Cast orphans → dialogue_cast_check.',
    '',
    'When editing .kmind, prefer scene_to_kmind or propose_kmind_edit. To fix a tangled map, call layout_kmind.',
    '',
    'Mind map readability (CRITICAL — follow strictly):',
    '1. Prefer a TREE or layered DAG: one root/theme → hubs → leaves. Never build a dense mesh.',
    '2. Do NOT connect every character to every scene. Put characters under a 人物 hub and beats under a 情节/时间线 hub.',
    '3. Link a character to a scene only when that beat is mainly about them (at most 1–2 character edges per beat). Prefer notes for secondary mentions.',
    '4. Prefer parent→child edges over cross-links. Put details in node.note instead of extra edges.',
    '5. Omit x/y coordinates — the app auto-layouts with Sugiyama/dagre (default LR). Keep autoLayout true unless the user asks to preserve positions.',
    '6. Shapes: ellipse = hub/theme; rounded = story beat; rect = character or fact. Keep node text short; details go in notes.',
    '7. If an existing map is tangled, call layout_kmind first, or rebuild with a clean tree then layout.',
    styleMemo.trim() ? `Author style memo:\n${styleMemo.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeRankdir(value: unknown): KMindRankDir {
  const v = String(value || 'LR').toUpperCase()
  if (v === 'TB' || v === 'BT' || v === 'RL' || v === 'LR') return v
  return 'LR'
}
