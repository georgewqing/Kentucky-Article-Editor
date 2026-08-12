import { join, normalize, relative, sep, dirname } from 'path'
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  cpSync,
  renameSync,
  rmSync
} from 'fs'
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
  sanitizeCsvCell,
  type DialogueLine,
  type DialogueChoicesFile,
  type Character,
  type KMindGraphNode
} from './formats'
import { layoutKMindDocument, sanitizeKMindEdges, type KMindRankDir } from './kmindLayout'
import type { FileProposal, GitPendingOp } from './chatSessions'
import { randomUUID } from 'crypto'
import type { ToolDef } from './openaiCompatClient'
import {
  proposalToolNote,
  proposalReviewHint,
  WRITE_GATE_SUMMARY,
  GIT_AGENT_PLAYBOOK,
  TOOL_API_VERSION,
  CHARACTERS_CSV_FORMAT
} from './proposalGate'
import { findGhostCharacterHits } from './ghostNames'
import { listEnabledSkills, loadSkill } from './skills'
import {
  runWebSearch,
  runWebResearch,
  fetchPageExcerpt,
  type WebSearchProvider
} from './webSearch'
import {
  buildPlanMarkdown,
  patchPlanTodoCheckboxes,
  readPlanFile,
  slugifyPlanName,
  stepsFromTodos,
  todosFromLegacySteps,
  writePlanFile,
  type PlanTodoInput
} from './planFiles'
import { docApplyAgentWrite, docApplyExternalWrite, getDoc } from '../documentHub'
import {
  getLiteraryToolDefs,
  isLiteraryTool,
  runLiteraryTool,
  extendContinuityCheck,
  type LiteraryEmitCtx
} from './literaryTools'
import { loadAiSettings } from './aiSettings'
import { memoryToolsDisciplinePrompt, proseMemoryHint } from './memoryNudge'

export function getWritingTools(): ToolDef[] {
  return [
    ...getLiteraryToolDefs(),
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
          'Write full content to a text file. Gate: new/empty → auto; existing .md/.txt prose → Accept. Pass characterId when changing names/voices. Result includes written/pending + reviewHint.',
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
          'Replace an exact substring in a text/markdown file (matches disk or dirty editor buffer). Gate: new/empty → auto; existing prose → Accept. oldText must be copied from read_file (exact bytes). For large structural rewrites of tables/quotes, propose_write_file is also fine. Result includes written/pending + reviewHint.',
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
          'Insert new dialogue lines (speaker = character id). Creates *.dialogue.csv with standard 11-col header if missing. Default append; pass afterId to insert after that line. ≤5 lines may auto-apply. Prefer lines[].id (e.g. d04); if omitted, continues dNN when the file uses that pattern, else stem_speaker_NNN. Result includes addedLineIds — use those for choices, never guess. Does not edit choices. CALL read_voice_bank first for multi-speaker tone.',
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
                  id: {
                    type: 'string',
                    description: 'Optional stable line id (e.g. d04). Prefer setting this for choices.'
                  },
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
          'Reorder *.dialogue.csv rows by id list. CSV first row = opening (Godot). Unspecified ids keep relative order at end — if the new first id differs, opening changes (response includes openingId / openingChanged).',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            order: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Preferred id order; omitted ids append in prior relative order. First id becomes opening.'
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
          'Write sibling *.dialogue.choices.json (v1.3 play graph). options: { text, goto } (empty text = confirm-to-continue), or { text, end: true }. Do not mix empty and labeled text on one line. Empty nodes object deletes the file. merge: updates keys; pass options:[] or null for a key to delete that node (clear stale guesses). replace: full rewrite.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to *.dialogue.csv (not the choices file)' },
            mode: { type: 'string', enum: ['replace', 'merge'] },
            nodes: {
              type: 'object',
              description:
                'Map after_line_id → { options: [{ text, goto?, end? }] }. merge updates keys; options:[] or null deletes that key; replace overwrites all.'
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
        description:
          'Create or update one character row (no delete). ALWAYS auto-writes characters.csv — any batch size, even if other files were edited this turn. No 5-card threshold (≤5 is dialogue LINES only). Prefer propose_upsert_characters for many rows in one call.',
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
        name: 'propose_upsert_characters',
        description:
          'Batch create/update many character rows in ONE write to characters.csv. Always auto-writes. Prefer this over N× propose_upsert_character when adding a cast (5+).',
        parameters: {
          type: 'object',
          properties: {
            characters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  color: { type: 'string' },
                  note: { type: 'string' },
                  model_node: { type: 'string' },
                  operable: { type: 'boolean' }
                },
                required: ['id', 'name', 'model_node']
              }
            },
            summary: { type: 'string' }
          },
          required: ['characters']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'continuity_check',
        description:
          'CALL for continuity / cast / props / foreshadow / voice / glossary / proof passes. Returns issues[] (no full-text dump). Aspects: character, timeline, prop, foreshadow, scene, voice, glossary, proof. Optional chapterId + assertions[] (empty ignored). WARN-only — does not block writes. After chapter writes, prefer aspects including prop+timeline+foreshadow.',
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
              items: {
                type: 'string',
                enum: [
                  'character',
                  'timeline',
                  'prop',
                  'foreshadow',
                  'scene',
                  'voice',
                  'glossary',
                  'proof'
                ]
              }
            },
            chapterId: { type: 'string' },
            assertions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  prop: { type: 'string' },
                  holder: { type: 'string' },
                  location: { type: 'string' },
                  character: { type: 'string' },
                  characterStatus: { type: 'string' }
                }
              },
              description: 'Optional model-proposed assertions checked against story_state table only. [] ignored.'
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
          'Edit a .kmind map (nodes/edges). Auto-writes to disk. Prefer TREE/layered structure. Prefer scene_to_kmind for prose→map. Omit x/y — autoLayout default true. Supports update shape/width/height, removeSubtree, moveSubtree.',
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
                  width: { type: 'number' },
                  height: { type: 'number' },
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
                  width: { type: 'number' },
                  height: { type: 'number' },
                  shape: { type: 'string' },
                  note: { type: 'string' }
                },
                required: ['id']
              }
            },
            removeNodeIds: { type: 'array', items: { type: 'string' } },
            removeSubtree: {
              type: 'array',
              items: { type: 'string' },
              description: 'Root node ids: delete each root and all descendants + all touching edges'
            },
            moveSubtree: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rootId: { type: 'string' },
                  newParentId: { type: 'string', description: 'Attach subtree root under this parent' }
                },
                required: ['rootId', 'newParentId']
              }
            },
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
        name: 'git_status',
        description:
          'WHEN: start of any Git/backup/commit/push task, or after writes — inventory branch, remotes, dirty paths. CALL even in a brand-new chat (do not rely on prior messages). Side effects: may auto-init workspace Git (repoCreated); may append .kentucky/ to .gitignore. Next: git_diff / git_add→git_commit→git_push.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_diff',
        description:
          'WHEN: inspect one file before commit/discard. Show git diff for path. Missing/directory → error. staged=true = --cached only (no untracked full-file fallback).',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative or absolute file path' },
            staged: { type: 'boolean' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_pull',
        description:
          'WHEN: user asks to sync/pull/fetch最新. Pull from configured remote. Fails clearly if no remote. Optional ffOnly. Never invent pull results.',
        parameters: {
          type: 'object',
          properties: {
            remote: { type: 'string', description: 'Remote name (default: git pull with no remote args)' },
            branch: { type: 'string', description: 'Branch (requires remote)' },
            ffOnly: { type: 'boolean', description: 'If true, pass --ff-only' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_push',
        description:
          'WHEN: after commit, or user asks 推送/push/备份到远程. Push to configured remote. Never --force. Optional setUpstream (-u) requires branch. Local-path remotes: auto-create missing bare (`git init --bare`) before push.',
        parameters: {
          type: 'object',
          properties: {
            remote: { type: 'string', description: 'Remote name (default: first remote)' },
            branch: { type: 'string' },
            setUpstream: {
              type: 'boolean',
              description: 'If true, git push -u <remote> <branch> (branch required)'
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_add',
        description:
          'WHEN: stage before commit. git add immediately (auto + highlight card). all=true → add -A; else paths[]. Next: git_commit.',
        parameters: {
          type: 'object',
          properties: {
            all: { type: 'boolean', description: 'If true, git add -A' },
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Workspace-relative paths to stage (ignored if all=true)'
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_commit',
        description:
          'WHEN: user asks 提交/commit/保存版本. git commit -m immediately (auto + highlight card). Stage first via git_add if needed. Next: git_push if remote exists.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' }
          },
          required: ['message']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_remote_add',
        description:
          'WHEN: no remotes / user gives a URL or local bare path. git remote add immediately. URL: https/ssh/git@/file:///local path (spaces OK). Missing local folder → auto git init --bare. Next: git_push.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Remote name (e.g. origin)' },
            url: { type: 'string', description: 'Remote URL or local path to bare/repo' }
          },
          required: ['name', 'url']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_remote_remove',
        description:
          'WHEN: drop a bad/placeholder remote before re-adding. git remote remove immediately (highlight card).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Remote name (e.g. origin)' }
          },
          required: ['name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_log',
        description: 'WHEN: show recent commits. Read-only. Optional maxCount ≤50.',
        parameters: {
          type: 'object',
          properties: {
            maxCount: { type: 'number' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_plan',
        description:
          'Write/replace a Markdown plan at plans/<slug>.plan.md (same slug overwrites). Opens the file. Prefer name + overview + plan body + todos. Checklist truth = ## Todos with `id: … — …` lines only — do NOT duplicate bare checkboxes in ## Plan body (or include the same id: so update_plan_step can sync both). Legacy steps[] still works.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Short plan title; also used as file slug (plans/<slug>.plan.md)'
            },
            overview: { type: 'string', description: '1–2 sentence overview' },
            plan: { type: 'string', description: 'Full markdown plan body under ## Plan' },
            todos: {
              type: 'array',
              description: 'Checklist items',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' }
                },
                required: ['content']
              }
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Legacy: string steps (converted to todos if todos omitted)'
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_plan_step',
        description:
          'Update a plan step status by index (0-based) or id. Updates session mirror and checkbox lines in plans/*.plan.md (preserves plan body). Soft: call when finishing a step; not gated.',
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
        name: 'workspace_mkdir',
        description:
          'Create a directory under the workspace (recursive). Use for archive folders, plans/, etc. Does not use shell.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative directory path' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'workspace_copy',
        description:
          'Copy a file or folder inside the workspace (recursive). For 归档/备份: use this tool directly — do NOT read files and rewrite content with propose_write_file. Overwrites dest if overwrite=true.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            overwrite: { type: 'boolean' }
          },
          required: ['from', 'to']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'workspace_move',
        description:
          'Move or rename a file/folder inside the workspace. For 归档/迁移: call this directly — never read+rewrite. Syncs *.dialogue.csv sidecars and .kmind assets when applicable.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' }
          },
          required: ['from', 'to']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'workspace_delete',
        description:
          'Delete a file or folder inside the workspace (recursive). Only when the user clearly asked to delete/remove/归档后清理原件. Syncs dialogue sidecars. Does not use shell.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
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

function isDialogueCsvAbs(abs: string): boolean {
  return abs.replace(/\\/g, '/').toLowerCase().endsWith('.dialogue.csv')
}

function dialogueMetaAbs(csvAbs: string): string {
  const lower = csvAbs.toLowerCase()
  const idx = lower.lastIndexOf('.dialogue.csv')
  if (idx < 0) return csvAbs + '.dialogue.meta.json'
  return csvAbs.slice(0, idx) + '.dialogue.meta.json'
}

function assetsDirForKmindAbs(kmindAbs: string): string {
  const lower = kmindAbs.toLowerCase()
  const idx = lower.lastIndexOf('.kmind')
  const stem = idx >= 0 ? kmindAbs.slice(0, idx) : kmindAbs
  return stem + '.assets'
}

function syncDialogueSidecarsMain(oldCsv: string, newCsv: string | null): void {
  const stems = dialogueStemPaths(oldCsv)
  const pairs: Array<[string, string | null]> = [
    [dialogueMetaAbs(oldCsv), newCsv ? dialogueMetaAbs(newCsv) : null],
    [stems.choices, newCsv ? dialogueStemPaths(newCsv).choices : null],
    [stems.layout, newCsv ? dialogueStemPaths(newCsv).layout : null]
  ]
  for (const [from, to] of pairs) {
    if (!existsSync(from)) continue
    if (!to) {
      rmSync(from, { force: true })
      continue
    }
    if (existsSync(to)) rmSync(from, { force: true })
    else renameSync(from, to)
  }
}

function assertNotWorkspaceRoot(workspaceRoot: string, abs: string): void {
  const a = normalize(abs).replace(/[/\\]+$/, '').toLowerCase()
  const r = normalize(workspaceRoot).replace(/[/\\]+$/, '').toLowerCase()
  if (a === r) throw new Error('Refusing to modify the workspace root')
}

/** Prefer dirty editor buffer when open (keeps read/patch aligned with what user sees). */
function readWorkspaceText(
  abs: string,
  maxChars = 80_000
): { text: string; source: 'disk' | 'editor_buffer'; truncated: boolean } {
  const hub = getDoc(abs)
  const disk = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
  const raw =
    hub && hub.dirty && hub.content !== disk ? hub.content : disk
  const source: 'disk' | 'editor_buffer' =
    hub && hub.dirty && hub.content !== disk ? 'editor_buffer' : 'disk'
  if (raw.length <= maxChars) return { text: raw, source, truncated: false }
  return {
    text: `${raw.slice(0, maxChars)}\n\n/* truncated: ${raw.length} chars total */`,
    source,
    truncated: true
  }
}

export interface ToolContext {
  workspaceRoot: string
  onProposal: (p: FileProposal) => {
    autoApplied: boolean
    gate?: { reason: string; kind: string; otherTurnPaths: number }
    writeDisk?: boolean
  }
  /** Run an Agent Git write immediately; UI shows a highlight card (no Confirm). */
  onGitOp: (
    op: Omit<GitPendingOp, 'status' | 'messageId' | 'resultNote' | 'error'> & {
      status?: 'pending'
    }
  ) => Promise<GitPendingOp>
  onPlan: (
    steps: Array<{ id: string; text: string; status: 'pending' | 'in_progress' | 'done' }>,
    planFileRel?: string
  ) => void
  onPlanUpdate: (
    patch: Partial<{ id: string; index: number; status: string; text: string }>
  ) => void
  onOpenFile: (relPath: string, line?: number) => void
  /** Notify UI after structural FS changes (refresh tree / close tabs). */
  onWorkspaceFs: (payload: {
    op: 'refreshTree' | 'fsMoved' | 'fsDeleted' | 'fsCopied'
    from?: string
    to?: string
    path?: string
  }) => void
  getPlan: () => Array<{ id: string; text: string; status: string }>
  getPlanFileRel: () => string | null | undefined
  webSearchEnabled: boolean
  webSearchProvider: WebSearchProvider
  webSearchMaxResults: number
}

function emitProposal(ctx: ToolContext, proposal: FileProposal): Record<string, unknown> {
  const committed = ctx.onProposal(proposal)
  const autoApplied = committed.autoApplied
  const reviewHint = proposalReviewHint(proposal, autoApplied)
  const out: Record<string, unknown> = {
    ok: true,
    written: autoApplied,
    pending: !autoApplied,
    writeDisk: committed.writeDisk === true,
    path: proposal.path,
    changeId: proposal.id,
    reviewHint,
    gateDetail: committed.gate || {
      reason: autoApplied ? 'auto' : 'pending',
      kind: proposal.kind || 'other',
      otherTurnPaths: -1
    },
    toolApi: TOOL_API_VERSION,
    uiReview:
      'AiPanel shows −/+ diff on each change card and Apply-all / Reject-all (and per-turn batch). You cannot see the UI — do not claim diff/batch are missing.',
    note: proposalToolNote(autoApplied)
  }
  const ghosts = detectGhostNamesInProse(ctx.workspaceRoot, proposal.after, proposal.path)
  if (ghosts.length) {
    out.ghostCharacterWarnings = ghosts
    out.note =
      String(out.note) +
      ' WARN: prose may reference names missing from characters.csv (see ghostCharacterWarnings). Upsert cast or Accept pending cast first.'
  }
  const mem = proseMemoryHint(ctx.workspaceRoot, proposal.path)
  if (mem) out.memoryHint = mem
  return out
}

/** Heuristic: person-like CJK names in prose missing from cast (not raw {2,4} windows). */
function detectGhostNamesInProse(
  workspaceRoot: string,
  content: string,
  relPath: string
): Array<{ name: string; suggestion: string }> {
  const lower = relPath.replace(/\\/g, '/').toLowerCase()
  if (!lower.endsWith('.md') && !lower.endsWith('.txt')) return []
  const abs = join(workspaceRoot, 'characters.csv')
  const characters = existsSync(abs) ? parseCharactersCsv(readFileSync(abs, 'utf-8')) : []
  const castNames = characters.map((c) => c.name.trim()).filter((n) => n.length >= 2)
  const castIds = new Set(characters.map((c) => c.id.toLowerCase()))
  return findGhostCharacterHits(content, castNames, castIds, { maxHits: 8 }).map((h) => ({
    name: h.name,
    suggestion: `「${h.name}」(${h.reason},×${h.count}) not in characters.csv — propose_upsert_character before more prose.`
  }))
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
  // Prefer continuing d01/d02… when the file already uses that pattern (or is empty).
  const simpleRe = /^d(\d+)$/i
  let preferSimple = existing.length === 0
  let maxSimple = 0
  for (const l of existing) {
    const m = simpleRe.exec(l.id)
    if (m) {
      preferSimple = true
      maxSimple = Math.max(maxSimple, parseInt(m[1], 10) || 0)
    }
  }
  let seq = preferSimple ? maxSimple + 1 : existing.length + 1
  const added: DialogueLine[] = []
  for (const row of incoming) {
    const speaker = String(row.speaker || '').trim()
    const text = String(row.text || '')
    if (!speaker || !text) continue
    let id = String(row.id || '').trim()
    if (!id || used.has(id)) {
      do {
        id = preferSimple
          ? `d${String(seq).padStart(2, '0')}`
          : `${stem}_${speaker}_${String(seq).padStart(3, '0')}`
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

function loadChoicesBeside(absCsv: string): DialogueChoicesFile {
  const { choices } = dialogueStemPaths(absCsv)
  if (!existsSync(choices)) return emptyDialogueChoices()
  return parseDialogueChoices(readFileSync(choices, 'utf-8'))
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
    if (isLiteraryTool(name)) {
      const settings = loadAiSettings()
      const litCtx: LiteraryEmitCtx = {
        workspaceRoot: ctx.workspaceRoot,
        emitProposal: (p) => emitProposal(ctx, { status: 'pending', ...p }),
        resolveWorkspacePath,
        readFocusText: (rel) => {
          try {
            const abs = resolveWorkspacePath(ctx.workspaceRoot, rel)
            if (!existsSync(abs)) return null
            return readWorkspaceText(abs, 120_000).text
          } catch {
            return null
          }
        },
        maxRevisionSnaps: settings.maxRevisionSnaps
      }
      const out = runLiteraryTool(name, args, litCtx)
      if (out != null) return out
    }

    switch (name) {
      case 'list_dir': {
        const rel = typeof args.path === 'string' ? args.path : '.'
        const abs = resolveWorkspacePath(ctx.workspaceRoot, rel === '.' ? '' : rel)
        const target = rel === '.' || rel === '' ? ctx.workspaceRoot : abs
        // Hide VCS / dot machinery (parity with explorer: name.startsWith('.'))
        const entries = readdirSync(target, { withFileTypes: true })
          .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
          .map((d) => ({
            name: d.name,
            type: d.isDirectory() ? 'dir' : 'file'
          }))
        return JSON.stringify({ path: toRel(ctx.workspaceRoot, target) || '.', entries })
      }
      case 'read_file': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs) || !statSync(abs).isFile()) {
          return JSON.stringify({ error: 'File not found' })
        }
        const maxChars = typeof args.maxChars === 'number' ? args.maxChars : 80_000
        const { text, source, truncated } = readWorkspaceText(abs, maxChars)
        return JSON.stringify({
          path,
          content: text,
          source,
          truncated,
          note:
            source === 'editor_buffer'
              ? 'Dirty editor buffer (may differ from last Ctrl+S disk write). Preserves raw Markdown including | tables and > quotes.'
              : 'Raw file bytes from disk (no Markdown folding).'
        })
      }
      case 'propose_write_file': {
        const path = String(args.path || '')
        const content = String(args.content ?? '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = existsSync(abs) ? readWorkspaceText(abs).text : ''
        const ext = path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt')
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: content,
          summary: String(args.summary || `Write ${path}`),
          status: 'pending',
          kind: ext ? 'prose' : 'other'
        }
        return JSON.stringify(emitProposal(ctx, proposal))
      }
      case 'propose_text_patch': {
        const path = String(args.path || '')
        const oldText = String(args.oldText ?? '')
        const newText = String(args.newText ?? '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs) && !getDoc(abs)) {
          return JSON.stringify({ error: 'File not found' })
        }
        const { text: before, source } = readWorkspaceText(abs)
        if (!oldText) {
          return JSON.stringify({ error: 'oldText is empty' })
        }
        if (!before.includes(oldText)) {
          const preview = before.slice(0, 240).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
          return JSON.stringify({
            error: 'oldText not found in file',
            source,
            hint: 'Copy oldText exactly from read_file (same source). Do not rely on memory; tables use | pipes and blockquotes use per-line >.',
            filePreview: preview
          })
        }
        const occurrences = before.split(oldText).length - 1
        const after = before.replace(oldText, newText)
        const ext = path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt')
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Patch ${path}`),
          status: 'pending',
          kind: ext ? 'prose' : 'other'
        }
        const result = emitProposal(ctx, proposal) as Record<string, unknown>
        result.patchSource = source
        result.oldTextOccurrences = occurrences
        if (occurrences > 1) {
          result.note =
            String(result.note || '') +
            ` WARN: oldText matched ${occurrences} times; only the first was replaced. Use a longer unique oldText.`
        }
        return JSON.stringify(result)
      }
      case 'read_dialogue': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs)) return JSON.stringify({ error: 'File not found' })
        const parsed = parseDialogueCsv(readFileSync(abs, 'utf-8'))
        const stems = dialogueStemPaths(abs)
        const choices = existsSync(stems.choices)
          ? parseDialogueChoices(readFileSync(stems.choices, 'utf-8'))
          : emptyDialogueChoices()
        const hasLayout = existsSync(stems.layout)
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
        const before = readFileSync(abs, 'utf-8')
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
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Update dialogue ${path}`),
          status: 'pending',
          kind: perfOnly ? 'dialogue_performance' : 'dialogue',
          changeCount: updates.length
        }
        return JSON.stringify(emitProposal(ctx, proposal))
      }
      case 'propose_append_dialogue_lines': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        let createdHeader = false
        if (!existsSync(abs)) {
          const dir = dirname(abs)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          // Standard 11-col header (serializeDialogueCsv order); empty body.
          writeFileSync(abs, serializeDialogueCsv([]), 'utf-8')
          createdHeader = true
        }
        const before = readFileSync(abs, 'utf-8')
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
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before: createdHeader ? '' : before,
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
        const result = emitProposal(ctx, proposal) as Record<string, unknown>
        result.addedLineIds = added.map((l) => l.id)
        const charsAbs = join(ctx.workspaceRoot, 'characters.csv')
        const castIds = existsSync(charsAbs)
          ? new Set(parseCharactersCsv(readFileSync(charsAbs, 'utf-8')).map((c) => c.id))
          : new Set<string>()
        const unknownSpeakers = Array.from(
          new Set(
            added
              .map((l) => (l.speaker || '').trim())
              .filter((sp) => sp && !castIds.has(sp))
          )
        )
        if (unknownSpeakers.length) {
          result.warnings = [
            `Unregistered speaker id(s): ${unknownSpeakers.join(', ')}. Upsert characters.csv or run dialogue_cast_check.`
          ]
        }
        result.addedLines = added.map((l) => ({ id: l.id, speaker: l.speaker, text: l.text }))
        if (createdHeader) {
          result.createdFile = true
          result.headerNote =
            'Created missing *.dialogue.csv with canonical 11-col header: id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color'
        }
        result.columnOrder =
          'id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color'
        result.idNote =
          'Use addedLineIds for propose_set_dialogue_choices. Do not guess dNN unless you passed lines[].id.'
        return JSON.stringify(result)
      }
      case 'propose_dialogue_performance': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs)) return JSON.stringify({ error: 'File not found' })
        const before = readFileSync(abs, 'utf-8')
        const parsed = parseDialogueCsv(before)
        const updates = (args.updates as Array<Record<string, string>>) || []
        const byId = new Map(parsed.lines.map((l) => [l.id, { ...l }]))
        const warnings: string[] = []
        const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
        for (const u of updates) {
          const cur = byId.get(u.id)
          if (!cur) {
            warnings.push(`unknown line id ${u.id}`)
            continue
          }
          const next = { ...cur }
          if (u.focus_node !== undefined) next.focus_node = u.focus_node
          if (u.emotion !== undefined) next.emotion = u.emotion
          if (u.font_size !== undefined) {
            const fs = String(u.font_size).trim()
            if (!fs || /^\d+(\.\d+)?$/.test(fs)) {
              next.font_size = fs
            } else {
              warnings.push(`font_size rejected for ${u.id}: "${u.font_size}" (need number or empty)`)
            }
          }
          if (u.text_color !== undefined) {
            const tc = String(u.text_color).trim()
            if (!tc || hexColor.test(tc)) {
              next.text_color = tc
            } else {
              warnings.push(
                `text_color rejected for ${u.id}: "${u.text_color}" (need #RGB/#RRGGBB/#RRGGBBAA or empty; not characters.color)`
              )
            }
          }
          byId.set(u.id, next)
        }
        const lines = parsed.lines.map((l) => byId.get(l.id) || l)
        const after = serializeDialogueCsv(lines)
        if (after === before && warnings.length) {
          return JSON.stringify({
            ok: false,
            written: false,
            pending: false,
            warnings,
            error: 'No valid performance field changes',
            toolApi: TOOL_API_VERSION
          })
        }
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Performance fields ${path}`),
          status: 'pending',
          kind: 'dialogue_performance',
          changeCount: updates.length
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          ...(warnings.length ? { warnings } : {})
        })
      }
      case 'propose_reorder_dialogue_lines': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs)) return JSON.stringify({ error: 'File not found' })
        const before = readFileSync(abs, 'utf-8')
        const parsed = parseDialogueCsv(before)
        const openingBefore = parsed.lines[0]?.id || null
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
        const openingAfter = ordered[0]?.id || null
        const openingChanged = Boolean(openingBefore && openingAfter && openingBefore !== openingAfter)
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: serializeDialogueCsv(ordered),
          summary: String(args.summary || `Reorder dialogue ${path}`),
          status: 'pending',
          kind: 'dialogue',
          changeCount: ordered.length
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          openingId: openingAfter,
          openingBefore,
          openingChanged,
          note: openingChanged
            ? `CSV first row is opening: ${openingBefore} → ${openingAfter}. Include the intended opening id first in order if you did not mean to change it.`
            : undefined
        })
      }
      case 'propose_set_dialogue_choices': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs)) return JSON.stringify({ error: 'Dialogue CSV not found' })
        const stems = dialogueStemPaths(abs)
        const mode = String(args.mode || 'replace') === 'merge' ? 'merge' : 'replace'
        const incoming = choicesFromNodesArg(args.nodes)
        let next = incoming
        if (mode === 'merge') {
          const cur = loadChoicesBeside(abs)
          next = { version: 1, nodes: { ...cur.nodes, ...incoming.nodes } }
          // Explicit empty options[] or null on a key clears that node in merge
          if (args.nodes && typeof args.nodes === 'object') {
            for (const [k, v] of Object.entries(args.nodes as Record<string, unknown>)) {
              if (v == null) {
                delete next.nodes[k]
                continue
              }
              if (
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
        const before = existsSync(stems.choices) ? readFileSync(stems.choices, 'utf-8') : ''
        if (before === after) {
          return JSON.stringify({ ok: true, written: false, pending: false, note: 'No choices change' })
        }
        const proposal: FileProposal = {
          id: randomUUID(),
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
          ...emitProposal(ctx, proposal),
          choiceNodeCount: Object.keys(next.nodes).length,
          deletedFile: after === '' && before !== ''
        })
      }
      case 'layout_dialogue': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        if (!existsSync(abs)) return JSON.stringify({ error: 'Dialogue CSV not found' })
        const stems = dialogueStemPaths(abs)
        const parsed = parseDialogueCsv(readFileSync(abs, 'utf-8'))
        const choices = loadChoicesBeside(abs)
        const layout = layoutDialogueGraph(
          parsed.lines.map((l) => l.id).filter(Boolean),
          choices
        )
        const after = serializeDialogueLayout(layout)
        const before = existsSync(stems.layout) ? readFileSync(stems.layout, 'utf-8') : ''
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, stems.layout),
          absPath: stems.layout,
          before,
          after,
          summary: String(args.summary || `Layout dialogue canvas ${path}`),
          status: 'pending',
          kind: 'dialogue_layout'
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          nodeCount: Object.keys(layout.nodes).length
        })
      }
      case 'propose_dialogue_graph': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const mode = String(args.mode || 'replace') === 'append' ? 'append' : 'replace'
        const autoLayout = args.autoLayout !== false
        const stems = dialogueStemPaths(abs)
        const beforeCsv = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
        const existing = beforeCsv ? parseDialogueCsv(beforeCsv).lines : []
        const incoming = (args.lines as Array<Record<string, unknown>>) || []
        const added = allocateLineIds(path, mode === 'append' ? existing : [], incoming)
        const lines = mode === 'append' ? [...existing, ...added] : added
        if (!lines.length) return JSON.stringify({ error: 'No valid lines (need speaker + text)' })

        const choiceList = (args.choices as Array<Record<string, unknown>>) || []
        const choiceFile = emptyDialogueChoices()
        if (mode === 'append') {
          const cur = loadChoicesBeside(abs)
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
          id: randomUUID(),
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
        results.push({ file: 'csv', ...emitProposal(ctx, csvProposal) })

        const choicesAfter = serializeDialogueChoices(choiceFile)
        const choicesBefore = existsSync(stems.choices)
          ? readFileSync(stems.choices, 'utf-8')
          : ''
        if (choicesAfter !== choicesBefore) {
          const chProposal: FileProposal = {
            id: randomUUID(),
            path: toRel(ctx.workspaceRoot, stems.choices),
            absPath: stems.choices,
            before: choicesBefore,
            after: choicesAfter,
            summary: `Choices for ${path}`,
            status: 'pending',
            kind: 'dialogue_choices',
            changeCount: Object.keys(choiceFile.nodes).length
          }
          results.push({ file: 'choices', ...emitProposal(ctx, chProposal) })
        }

        if (autoLayout) {
          const layout = layoutDialogueGraph(
            lines.map((l) => l.id).filter(Boolean),
            choiceFile
          )
          const layoutAfter = serializeDialogueLayout(layout)
          const layoutBefore = existsSync(stems.layout)
            ? readFileSync(stems.layout, 'utf-8')
            : ''
          const layProposal: FileProposal = {
            id: randomUUID(),
            path: toRel(ctx.workspaceRoot, stems.layout),
            absPath: stems.layout,
            before: layoutBefore,
            after: layoutAfter,
            summary: `Layout for ${path}`,
            status: 'pending',
            kind: 'dialogue_layout'
          }
          results.push({ file: 'layout', ...emitProposal(ctx, layProposal) })
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
        const cast = existsSync(charsAbs)
          ? new Set(parseCharactersCsv(readFileSync(charsAbs, 'utf-8')).map((c) => c.id))
          : new Set<string>()
        const parsed = parseDialogueCsv(readFileSync(abs, 'utf-8'))
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
        if (!existsSync(abs)) {
          return JSON.stringify({
            characters: [],
            columns: 'id,name,color,note,model_node,operable',
            formatNote: CHARACTERS_CSV_FORMAT,
            toolApi: TOOL_API_VERSION
          })
        }
        const chars = parseCharactersCsv(readFileSync(abs, 'utf-8'))
        return JSON.stringify({
          characters: chars,
          columns: 'id,name,color,note,model_node,operable',
          formatNote: CHARACTERS_CSV_FORMAT,
          csvNote:
            'Fields are decoded. Raw CSV may show ""…"" around quoted cells (RFC 4180) — that is normal escaping, not corruption.',
          toolApi: TOOL_API_VERSION
        })
      }
      case 'lookup_character': {
        const abs = join(ctx.workspaceRoot, 'characters.csv')
        if (!existsSync(abs)) return JSON.stringify({ found: false, characters: [] })
        const chars = parseCharactersCsv(readFileSync(abs, 'utf-8'))
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
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : 'id,name,color,note,model_node,operable\n'
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
          id: sanitizeCsvCell(String(args.id)),
          name: sanitizeCsvCell(String(args.name || args.id)),
          color: String(args.color || '#88c0d0'),
          note: sanitizeCsvCell(String(args.note || '')),
          model_node: sanitizeCsvCell(String(args.model_node || '')),
          operable
        }
        const idx = list.findIndex((c) => c.id === id)
        if (idx >= 0) list[idx] = row
        else list.push(row)
        const after = serializeCharactersCsv(list)
        const proposal: FileProposal = {
          id: randomUUID(),
          path: 'characters.csv',
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Upsert character ${id}`),
          status: 'pending',
          kind: 'characters'
        }
        const result = emitProposal(ctx, proposal) as Record<string, unknown>
        result.formatNote = CHARACTERS_CSV_FORMAT
        return JSON.stringify(result)
      }
      case 'propose_upsert_characters': {
        const abs = join(ctx.workspaceRoot, 'characters.csv')
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : 'id,name,color,note,model_node,operable\n'
        const list = parseCharactersCsv(before)
        const incoming = (args.characters as Array<Record<string, unknown>>) || []
        if (!incoming.length) return JSON.stringify({ error: 'characters array is empty' })
        const upserted: string[] = []
        for (const item of incoming) {
          const id = String(item.id || '').trim()
          if (!id) continue
          const prev = list.find((c) => c.id === id)
          const operableArg = item.operable
          const operable =
            typeof operableArg === 'boolean'
              ? operableArg
              : typeof operableArg === 'string'
                ? ['1', 'true', 'yes', 'y'].includes(operableArg.trim().toLowerCase())
                : Boolean(prev?.operable)
          const row: Character = {
            id: sanitizeCsvCell(id),
            name: sanitizeCsvCell(String(item.name || id)),
            color: String(item.color || prev?.color || '#88c0d0'),
            note: sanitizeCsvCell(String(item.note ?? prev?.note ?? '')),
            model_node: sanitizeCsvCell(String(item.model_node || prev?.model_node || '')),
            operable
          }
          const idx = list.findIndex((c) => c.id === id)
          if (idx >= 0) list[idx] = row
          else list.push(row)
          upserted.push(id)
        }
        if (!upserted.length) return JSON.stringify({ error: 'No valid character rows (each needs id)' })
        const after = serializeCharactersCsv(list)
        const proposal: FileProposal = {
          id: randomUUID(),
          path: 'characters.csv',
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Upsert ${upserted.length} characters`),
          status: 'pending',
          kind: 'characters',
          changeCount: upserted.length
        }
        const result = emitProposal(ctx, proposal) as Record<string, unknown>
        result.upsertedIds = upserted
        result.formatNote = CHARACTERS_CSV_FORMAT
        return JSON.stringify(result)
      }
      case 'continuity_check': {
        const focusPaths = (args.focusPaths as string[]) || []
        const aspects = (args.aspects as string[]) || ['character', 'timeline', 'prop']
        const charsAbs = join(ctx.workspaceRoot, 'characters.csv')
        const characters = existsSync(charsAbs)
          ? parseCharactersCsv(readFileSync(charsAbs, 'utf-8'))
          : []
        const castIds = new Set(characters.map((c) => c.id.toLowerCase()))
        const castNameList = characters.map((c) => c.name.trim()).filter((n) => n.length >= 2)
        const issues: Array<{
          severity: 'error' | 'warn' | 'info'
          kind: string
          path: string
          quote: string
          suggestion: string
        }> = []
        const filesScanned: Array<{ path: string; chars: number }> = []
        const ghostNames = new Map<
          string,
          { path: string; quote: string; reason: string; confidence: string; count: number }
        >()

        for (const rel of focusPaths.slice(0, 12)) {
          try {
            const abs = resolveWorkspacePath(ctx.workspaceRoot, rel)
            if (!existsSync(abs)) {
              issues.push({
                severity: 'warn',
                kind: 'missing_file',
                path: rel,
                quote: '',
                suggestion: 'Focus path not found on disk.'
              })
              continue
            }
            const text = readFileSync(abs, 'utf-8')
            filesScanned.push({ path: rel, chars: text.length })
            if (aspects.includes('character')) {
              for (const hit of findGhostCharacterHits(text, castNameList, castIds, { maxHits: 16 })) {
                const prev = ghostNames.get(hit.name)
                if (!prev || hit.count > prev.count) {
                  ghostNames.set(hit.name, {
                    path: rel,
                    quote: hit.quote,
                    reason: hit.reason,
                    confidence: hit.confidence,
                    count: hit.count
                  })
                }
              }
            }
          } catch {
            /* skip */
          }
        }

        if (aspects.includes('character')) {
          if (characters.length === 0) {
            issues.push({
              severity: 'error',
              kind: 'empty_cast',
              path: 'characters.csv',
              quote: '',
              suggestion:
                'characters.csv is missing or empty. Names in prose are not registered — upsert cast before trusting continuity.'
            })
          }
          for (const [name, hit] of Array.from(ghostNames.entries())) {
            issues.push({
              severity: 'warn',
              kind: 'ghost_character',
              path: hit.path,
              quote: hit.quote,
              suggestion: `「${name}」(${hit.reason}, ${hit.confidence}, ×${hit.count}) not in characters.csv — propose_upsert_character. Heuristic skips places/chapters/vessels and registered cast.`
            })
          }
          if (ghostNames.size === 0 && characters.length > 0 && filesScanned.length > 0) {
            issues.push({
              severity: 'info',
              kind: 'cast_ok',
              path: 'characters.csv',
              quote: '',
              suggestion:
                'No unmatched person-like name patterns vs registered cast (honorific/surname/role/speech heuristics; not a full NLP parse).'
            })
          }
        }

        const settings = loadAiSettings()
        const litCtx: LiteraryEmitCtx = {
          workspaceRoot: ctx.workspaceRoot,
          emitProposal: (p) => emitProposal(ctx, { status: 'pending', ...p }),
          resolveWorkspacePath,
          readFocusText: (rel) => {
            try {
              const abs = resolveWorkspacePath(ctx.workspaceRoot, rel)
              if (!existsSync(abs)) return null
              return readWorkspaceText(abs, 120_000).text
            } catch {
              return null
            }
          },
          maxRevisionSnaps: settings.maxRevisionSnaps
        }
        return extendContinuityCheck(litCtx, args, issues, {
          readOnly: true,
          castCount: characters.length,
          registeredCast: characters.map((c) => ({
            id: c.id,
            name: c.name,
            note: (c.note || '').slice(0, 120)
          })),
          castNote:
            characters.length === 0
              ? 'characters.csv empty/missing — cast list below is empty; any names in prose are unregistered.'
              : 'registeredCast is ONLY what is on disk now. Names you planned but did not upsert (or only marked dirty without disk write) will NOT appear here.',
          filesScanned,
          ghostHeuristic:
            'Person-like patterns only (老/小/阿、姓+名、职衔、X说/道). Excludes registered cast, chapters (第一章), places (*楼), vessels (*号), function compounds. Not a POS tagger.'
        })
      }
      case 'read_kmind': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const doc = parseKMind(readFileSync(abs, 'utf-8'))
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
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
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
          if (typeof n.width === 'number') node.width = n.width
          if (typeof n.height === 'number') node.height = n.height
          doc.nodes.push(node)
          i += 1
        }
        const skipped: string[] = []
        const updateNodes = (args.updateNodes as Array<Record<string, unknown>>) || []
        for (const u of updateNodes) {
          const id = String(u.id)
          const node = doc.nodes.find((n) => n.id === id)
          if (!node) {
            skipped.push(`updateNodes: unknown id ${id}`)
            continue
          }
          if (typeof u.text === 'string') node.text = u.text
          if (typeof u.x === 'number') node.x = u.x
          if (typeof u.y === 'number') node.y = u.y
          if (typeof u.note === 'string') node.note = u.note
          if (typeof u.width === 'number') node.width = u.width
          if (typeof u.height === 'number') node.height = u.height
          if (typeof u.shape === 'string' && ['rect', 'rounded', 'ellipse'].includes(u.shape)) {
            node.shape = u.shape as KMindGraphNode['shape']
          }
        }
        const collectDescendants = (rootId: string): Set<string> => {
          const out = new Set<string>([rootId])
          let changed = true
          while (changed) {
            changed = false
            for (const e of doc.edges) {
              if (out.has(e.source) && !out.has(e.target)) {
                out.add(e.target)
                changed = true
              }
            }
          }
          return out
        }
        const removeIds = new Set((args.removeNodeIds as string[]) || [])
        for (const root of (args.removeSubtree as string[]) || []) {
          const rid = String(root)
          if (!doc.nodes.some((n) => n.id === rid)) {
            skipped.push(`removeSubtree: unknown root ${rid}`)
            continue
          }
          for (const id of Array.from(collectDescendants(rid))) removeIds.add(id)
        }
        if (removeIds.size) {
          doc.nodes = doc.nodes.filter((n) => !removeIds.has(n.id))
          doc.edges = doc.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target))
        }
        const moves = (args.moveSubtree as Array<{ rootId: string; newParentId: string }>) || []
        for (const m of moves) {
          const rootId = String(m.rootId || '')
          const newParentId = String(m.newParentId || '')
          if (!rootId || !newParentId) {
            skipped.push('moveSubtree: missing rootId or newParentId')
            continue
          }
          const rootOk = doc.nodes.some((n) => n.id === rootId)
          const parentOk = doc.nodes.some((n) => n.id === newParentId)
          if (!rootOk && !parentOk) {
            skipped.push(`moveSubtree: unknown root ${rootId} and unknown parent ${newParentId}`)
            continue
          }
          if (!rootOk) {
            skipped.push(`moveSubtree: unknown root ${rootId}`)
            continue
          }
          if (!parentOk) {
            skipped.push(`moveSubtree: unknown parent ${newParentId} (root ${rootId} ok)`)
            continue
          }
          // Drop edges into the root from old parents; keep subtree internal edges
          doc.edges = doc.edges.filter((e) => e.target !== rootId)
          doc.edges.push({ id: newEdgeId(), source: newParentId, target: rootId })
        }
        const connect = (args.connect as Array<{ source: string; target: string }>) || []
        for (const c of connect) {
          const srcOk = doc.nodes.some((n) => n.id === c.source)
          const tgtOk = doc.nodes.some((n) => n.id === c.target)
          if (!srcOk || !tgtOk) {
            const bits: string[] = []
            if (!srcOk) bits.push(`unknown source ${c.source}`)
            if (!tgtOk) bits.push(`unknown target ${c.target}`)
            skipped.push(`connect: ${bits.join('; ')}`)
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
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Edit mind map ${path}`),
          status: 'pending',
          kind: 'kmind'
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          autoLayout,
          rankdir,
          nodeCount: doc.nodes.length,
          edgeCount: doc.edges.length,
          ...(skipped.length
            ? {
                skipped,
                warnings: skipped,
                note: `${skipped.length} edit op(s) skipped (unknown node ids). Read kmind and retry with valid ids.`
              }
            : {})
        })
      }
      case 'layout_kmind': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        const before = readFileSync(abs, 'utf-8')
        const doc = parseKMind(before)
        sanitizeKMindEdges(doc)
        const rankdir = normalizeRankdir(args.rankdir)
        layoutKMindDocument(doc, { rankdir })
        const after = serializeKMind(doc)
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after,
          summary: String(args.summary || `Re-layout mind map ${path} (${rankdir})`),
          status: 'pending',
          kind: 'kmind_layout'
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          rankdir,
          nodeCount: doc.nodes.length,
          edgeCount: doc.edges.length
        })
      }
      case 'scene_to_kmind': {
        const kmindPath = String(args.kmindPath || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, kmindPath)
        const mode = String(args.mode || 'merge')
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : ''
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
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, abs),
          absPath: abs,
          before,
          after: serializeKMind(doc),
          summary: String(args.summary || `Scene → mind map ${kmindPath}`),
          status: 'pending',
          kind: 'kmind'
        }
        return JSON.stringify({
          ...emitProposal(ctx, proposal),
          nodeCount: doc.nodes.length,
          sourcePath: args.sourcePath || null
        })
      }
      case 'kmind_to_scene_outline': {
        const kmindPath = String(args.kmindPath || '')
        const targetPath = String(args.targetPath || '')
        const kAbs = resolveWorkspacePath(ctx.workspaceRoot, kmindPath)
        const tAbs = resolveWorkspacePath(ctx.workspaceRoot, targetPath)
        if (!existsSync(kAbs)) return JSON.stringify({ error: 'kmind not found' })
        const doc = parseKMind(readFileSync(kAbs, 'utf-8'))
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
        const before = existsSync(tAbs) ? readFileSync(tAbs, 'utf-8') : ''
        if (before.trim().length > 400) {
          return JSON.stringify({
            error:
              'Target already has substantial prose. Refuse overwrite in outline_only mode; pick an empty/new .md path.'
          })
        }
        const proposal: FileProposal = {
          id: randomUUID(),
          path: toRel(ctx.workspaceRoot, tAbs),
          absPath: tAbs,
          before,
          after,
          summary: String(args.summary || `Mind map → outline ${targetPath}`),
          status: 'pending',
          kind: 'prose'
        }
        return JSON.stringify(emitProposal(ctx, proposal))
      }
      case 'create_plan': {
        const name =
          typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Plan'
        const overview = typeof args.overview === 'string' ? args.overview : ''
        const planBody = typeof args.plan === 'string' ? args.plan : ''
        let todos: PlanTodoInput[] = []
        if (Array.isArray(args.todos)) {
          for (const raw of args.todos) {
            if (!raw || typeof raw !== 'object') continue
            const o = raw as Record<string, unknown>
            const content = String(o.content ?? o.text ?? '').trim()
            if (!content) continue
            todos.push({
              id: String(o.id || `p${todos.length + 1}`).trim() || `p${todos.length + 1}`,
              content
            })
          }
        }
        if (!todos.length && Array.isArray(args.steps)) {
          todos = todosFromLegacySteps((args.steps as unknown[]).map((s) => String(s)))
        }
        if (!todos.length) {
          return JSON.stringify({ error: 'create_plan requires todos[] or steps[]' })
        }
        const slug = slugifyPlanName(name)
        const markdown = buildPlanMarkdown({
          title: name,
          overview,
          planBody,
          todos
        })
        const { absPath, relPath } = writePlanFile(ctx.workspaceRoot, slug, markdown)
        docApplyExternalWrite(absPath, markdown)
        const mirror = stepsFromTodos(todos)
        ctx.onPlan(mirror, relPath)
        ctx.onOpenFile(relPath)
        return JSON.stringify({
          ok: true,
          path: relPath,
          absPath,
          count: mirror.length,
          note: 'Plan written to workspace. Tell the user to switch to Agent mode to execute.'
        })
      }
      case 'update_plan_step': {
        ctx.onPlanUpdate({
          id: typeof args.id === 'string' ? args.id : undefined,
          index: typeof args.index === 'number' ? args.index : undefined,
          status: String(args.status),
          text: typeof args.text === 'string' ? args.text : undefined
        })
        const planFileRel = ctx.getPlanFileRel()
        const steps = ctx.getPlan().map((s) => ({
          id: s.id,
          text: s.text,
          status: (s.status === 'done' || s.status === 'in_progress' || s.status === 'pending'
            ? s.status
            : 'pending') as 'pending' | 'in_progress' | 'done'
        }))
        let fileWritten = false
        let contentChanged = false
        if (planFileRel) {
          const raw = readPlanFile(ctx.workspaceRoot, planFileRel)
          if (raw != null) {
            const next = patchPlanTodoCheckboxes(raw, steps)
            contentChanged = next !== raw
            const abs = join(ctx.workspaceRoot, ...planFileRel.replace(/\\/g, '/').split('/'))
            // Always rewrite when linked so DocumentHub / disk stay in sync with mirror.
            writeFileSync(abs, next, 'utf-8')
            docApplyExternalWrite(abs, next)
            fileWritten = true
          }
        }
        return JSON.stringify({
          ok: true,
          planFileRel: planFileRel || null,
          fileWritten,
          contentChanged,
          steps: steps.map((s) => ({ id: s.id, status: s.status })),
          note: planFileRel
            ? contentChanged
              ? 'Plan checkboxes updated (Todos + matching Plan-body lines with same id/text).'
              : 'Mirror updated; file rewritten (checkboxes already matched).'
            : 'No plans/*.plan.md linked; session mirror updated only. Call create_plan first.'
        })
      }
      case 'workspace_mkdir': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        assertNotWorkspaceRoot(ctx.workspaceRoot, abs)
        mkdirSync(abs, { recursive: true })
        ctx.onWorkspaceFs({ op: 'refreshTree' })
        return JSON.stringify({ ok: true, path: toRel(ctx.workspaceRoot, abs) })
      }
      case 'workspace_copy': {
        const from = String(args.from || '')
        const to = String(args.to || '')
        const overwrite = Boolean(args.overwrite)
        const src = resolveWorkspacePath(ctx.workspaceRoot, from)
        const dest = resolveWorkspacePath(ctx.workspaceRoot, to)
        assertNotWorkspaceRoot(ctx.workspaceRoot, src)
        assertNotWorkspaceRoot(ctx.workspaceRoot, dest)
        if (!existsSync(src)) return JSON.stringify({ error: `Source not found: ${from}` })
        if (existsSync(dest) && !overwrite) {
          return JSON.stringify({ error: `Destination exists: ${to} (pass overwrite:true)` })
        }
        const destParent = dirname(dest)
        if (!existsSync(destParent)) mkdirSync(destParent, { recursive: true })
        cpSync(src, dest, { recursive: true, force: overwrite })
        ctx.onWorkspaceFs({
          op: 'fsCopied',
          from: toRel(ctx.workspaceRoot, src),
          to: toRel(ctx.workspaceRoot, dest)
        })
        return JSON.stringify({
          ok: true,
          from: toRel(ctx.workspaceRoot, src),
          to: toRel(ctx.workspaceRoot, dest)
        })
      }
      case 'workspace_move': {
        const from = String(args.from || '')
        const to = String(args.to || '')
        const src = resolveWorkspacePath(ctx.workspaceRoot, from)
        const dest = resolveWorkspacePath(ctx.workspaceRoot, to)
        assertNotWorkspaceRoot(ctx.workspaceRoot, src)
        assertNotWorkspaceRoot(ctx.workspaceRoot, dest)
        if (!existsSync(src)) return JSON.stringify({ error: `Source not found: ${from}` })
        if (existsSync(dest)) return JSON.stringify({ error: `Destination exists: ${to}` })
        const srcKey = normalize(src).replace(/\\/g, '/').toLowerCase()
        const destKey = normalize(dest).replace(/\\/g, '/').toLowerCase()
        if (destKey === srcKey || destKey.startsWith(srcKey + '/')) {
          return JSON.stringify({ error: 'Invalid move: destination is inside source' })
        }
        const destParent = dirname(dest)
        if (!existsSync(destParent)) mkdirSync(destParent, { recursive: true })
        renameSync(src, dest)
        if (isDialogueCsvAbs(src) && isDialogueCsvAbs(dest)) {
          syncDialogueSidecarsMain(src, dest)
        } else if (isDialogueCsvAbs(src)) {
          syncDialogueSidecarsMain(src, null)
        }
        if (src.toLowerCase().endsWith('.kmind')) {
          const oldAssets = assetsDirForKmindAbs(src)
          const newAssets = assetsDirForKmindAbs(dest)
          try {
            if (existsSync(oldAssets) && !existsSync(newAssets)) renameSync(oldAssets, newAssets)
          } catch {
            /* best-effort */
          }
        }
        ctx.onWorkspaceFs({
          op: 'fsMoved',
          from: toRel(ctx.workspaceRoot, src),
          to: toRel(ctx.workspaceRoot, dest)
        })
        return JSON.stringify({
          ok: true,
          from: toRel(ctx.workspaceRoot, src),
          to: toRel(ctx.workspaceRoot, dest)
        })
      }
      case 'workspace_delete': {
        const path = String(args.path || '')
        const abs = resolveWorkspacePath(ctx.workspaceRoot, path)
        assertNotWorkspaceRoot(ctx.workspaceRoot, abs)
        if (!existsSync(abs)) return JSON.stringify({ error: `Not found: ${path}` })
        const wasDialogue = isDialogueCsvAbs(abs)
        rmSync(abs, { recursive: true, force: true })
        if (wasDialogue) syncDialogueSidecarsMain(abs, null)
        ctx.onWorkspaceFs({ op: 'fsDeleted', path: toRel(ctx.workspaceRoot, abs) })
        return JSON.stringify({ ok: true, path: toRel(ctx.workspaceRoot, abs), deleted: true })
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
        const result = await runWebSearch(ctx.webSearchProvider, query, maxResults, {
          enrich: true
        })
        const results = (result.results || []).map((h) => {
          const excerpt = h.excerpt ? h.excerpt.slice(0, 2000) : ''
          let snippet = (h.snippet || '').trim()
          if (!snippet && excerpt && !excerpt.startsWith('(fetch failed')) {
            snippet = excerpt.replace(/\s+/g, ' ').trim().slice(0, 400)
          }
          if (!snippet) {
            snippet = excerpt.startsWith('(fetch failed')
              ? excerpt
              : '(no snippet available — try web_fetch on this URL)'
          }
          return {
            title: h.title || '(untitled)',
            url: h.url,
            snippet,
            excerpt: excerpt || undefined
          }
        })
        return JSON.stringify({
          query: result.query,
          via: result.via,
          error: result.error,
          results,
          note: 'Every hit has a non-empty snippet (SERP, page excerpt, or fallback). Prefer excerpt for facts.'
        })
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
      case 'git_status': {
        const { gitStatusSummary } = await import('../git/gitService')
        const summary = await gitStatusSummary(ctx.workspaceRoot)
        const notes = [
          'Commit/add/remote_add auto-execute (highlight card in chat). Discard remains Source Control UI. git_pull/git_push run immediately (no force).',
          summary.repoCreated
            ? 'Side effect: auto-created Git repo at workspace root (kentucky.autoInit; .git hidden in explorer).'
            : summary.gitignoreUpdated
              ? 'Side effect: appended .kentucky/ to .gitignore (ensureKentuckyGitignore).'
              : 'May auto-init workspace Git if missing, and may append .kentucky/ to .gitignore (not pure read-only).'
        ]
        return JSON.stringify({
          ...summary,
          toolApi: TOOL_API_VERSION,
          note: notes.join(' ')
        })
      }
      case 'git_diff': {
        const { gitDiff } = await import('../git/gitService')
        const path = String(args.path || '')
        const staged = Boolean(args.staged)
        const r = await gitDiff(ctx.workspaceRoot, path, staged)
        return JSON.stringify({ ...r, toolApi: TOOL_API_VERSION })
      }
      case 'git_pull': {
        const { gitPull } = await import('../git/gitService')
        const r = await gitPull(ctx.workspaceRoot, {
          remote: args.remote != null ? String(args.remote) : undefined,
          branch: args.branch != null ? String(args.branch) : undefined,
          ffOnly: Boolean(args.ffOnly)
        })
        return JSON.stringify({ ...r, toolApi: TOOL_API_VERSION })
      }
      case 'git_push': {
        const { gitPush } = await import('../git/gitService')
        const r = await gitPush(ctx.workspaceRoot, {
          remote: args.remote != null ? String(args.remote) : undefined,
          branch: args.branch != null ? String(args.branch) : undefined,
          setUpstream: Boolean(args.setUpstream)
        })
        return JSON.stringify({ ...r, toolApi: TOOL_API_VERSION })
      }
      case 'git_add': {
        const all = Boolean(args.all)
        const paths = Array.isArray(args.paths)
          ? args.paths.map(String).map((p) => p.trim()).filter(Boolean)
          : []
        if (!all && !paths.length) {
          return JSON.stringify({
            ok: false,
            error: 'Provide all=true or non-empty paths[]',
            toolApi: TOOL_API_VERSION
          })
        }
        const summary = all ? 'git add -A' : `git add (${paths.length} path${paths.length === 1 ? '' : 's'})`
        const detail = all
          ? 'Stage all changes in the working tree (respecting .gitignore).'
          : paths.map((p) => `• ${p}`).join('\n')
        const op = await ctx.onGitOp({
          id: randomUUID(),
          kind: 'add',
          summary,
          detail,
          params: all ? { all: true } : { paths }
        })
        return JSON.stringify({
          ok: op.status === 'applied',
          pending: false,
          executed: op.status === 'applied',
          opId: op.id,
          kind: op.kind,
          summary: op.summary,
          resultNote: op.resultNote,
          error: op.error,
          reviewHint:
            op.status === 'applied'
              ? 'Git add executed — see highlight card.'
              : `Git add failed: ${op.error || 'unknown'}`,
          toolApi: TOOL_API_VERSION
        })
      }
      case 'git_commit': {
        const message = String(args.message || '').trim()
        if (!message) {
          return JSON.stringify({
            ok: false,
            error: 'Commit message required',
            toolApi: TOOL_API_VERSION
          })
        }
        const op = await ctx.onGitOp({
          id: randomUUID(),
          kind: 'commit',
          summary: 'git commit',
          detail: message,
          params: { message }
        })
        return JSON.stringify({
          ok: op.status === 'applied',
          pending: false,
          executed: op.status === 'applied',
          opId: op.id,
          kind: op.kind,
          summary: op.summary,
          message,
          resultNote: op.resultNote,
          error: op.error,
          reviewHint:
            op.status === 'applied'
              ? 'Git commit executed — see highlight card.'
              : `Git commit failed: ${op.error || 'unknown'}`,
          toolApi: TOOL_API_VERSION
        })
      }
      case 'git_remote_add': {
        const remote = String(args.name || '').trim()
        const url = String(args.url || '').trim()
        if (!remote || !url) {
          return JSON.stringify({
            ok: false,
            error: 'name and url required',
            toolApi: TOOL_API_VERSION
          })
        }
        const op = await ctx.onGitOp({
          id: randomUUID(),
          kind: 'remote_add',
          summary: `git remote add ${remote}`,
          detail: url,
          params: { remote, url }
        })
        return JSON.stringify({
          ok: op.status === 'applied',
          pending: false,
          executed: op.status === 'applied',
          opId: op.id,
          kind: op.kind,
          summary: op.summary,
          remote,
          url,
          resultNote: op.resultNote,
          error: op.error,
          reviewHint:
            op.status === 'applied'
              ? 'Git remote add executed — see highlight card.'
              : `Git remote add failed: ${op.error || 'unknown'}`,
          toolApi: TOOL_API_VERSION
        })
      }
      case 'git_remote_remove': {
        const remote = String(args.name || '').trim()
        if (!remote) {
          return JSON.stringify({
            ok: false,
            error: 'name required',
            toolApi: TOOL_API_VERSION
          })
        }
        const op = await ctx.onGitOp({
          id: randomUUID(),
          kind: 'remote_remove',
          summary: `git remote remove ${remote}`,
          detail: remote,
          params: { remote }
        })
        return JSON.stringify({
          ok: op.status === 'applied',
          pending: false,
          executed: op.status === 'applied',
          opId: op.id,
          kind: op.kind,
          summary: op.summary,
          remote,
          resultNote: op.resultNote,
          error: op.error,
          reviewHint:
            op.status === 'applied'
              ? 'Git remote remove executed — see highlight card.'
              : `Git remote remove failed: ${op.error || 'unknown'}`,
          toolApi: TOOL_API_VERSION
        })
      }
      case 'git_log': {
        const { gitLog } = await import('../git/gitService')
        const maxCount = typeof args.maxCount === 'number' ? args.maxCount : 20
        const r = await gitLog(ctx.workspaceRoot, { maxCount })
        return JSON.stringify({ ...r, toolApi: TOOL_API_VERSION })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

export function applyProposalToDisk(proposal: FileProposal): void {
  const dir = dirname(proposal.absPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Empty choices sidecar → delete file (protocol: missing file = linear)
  if (
    proposal.after === '' &&
    proposal.absPath.replace(/\\/g, '/').toLowerCase().endsWith('.dialogue.choices.json')
  ) {
    if (existsSync(proposal.absPath)) unlinkSync(proposal.absPath)
    docApplyAgentWrite(proposal.absPath, '', proposal.before)
    return
  }
  writeFileSync(proposal.absPath, proposal.after, 'utf-8')
  // Keep DocumentHub on the RAW bytes (not TipTap-reserialized) so open tabs /
  // subsequent read_file+patch stay format-faithful for tables & blockquotes.
  // Preserve original baseline → yellow dirty until user Ctrl+S.
  docApplyAgentWrite(proposal.absPath, proposal.after, proposal.before)
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
  'git_status',
  'git_diff',
  'git_pull',
  'git_push',
  'git_log',
  'open_in_editor',
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
  'open_in_editor',
  'read_story_state',
  'read_foreshadow',
  'read_voice_anchor',
  'read_voice_bank',
  'compare_voice',
  'read_glossary',
  'list_materials',
  'search_materials',
  'read_scene_state'
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
        'MODE: Plan — research with read-only tools, then write a Markdown plan via create_plan.',
        'create_plan writes plans/<slug>.plan.md (same name/slug overwrites) and opens it. That file is the plan truth — there is no sticky plan list in the chat UI.',
        'Do NOT use propose_write_file / propose_text_patch or other write tools. Only create_plan / update_plan_step may touch plans/*.plan.md.',
        'When the plan is ready, tell the user to switch to Agent mode to execute the plan file.'
      ].join('\n')
    case 'outline':
      return [
        'MODE: Outline — structure only. Prefer scene_to_kmind and kmind_to_scene_outline for prose maps.',
        'For Godot dialogue graphs prefer propose_dialogue_graph / layout_dialogue (structure + branching), not long prose rewrites.',
        'Do not rewrite existing long prose. Outline targets should be new/empty markdown. Keep mind maps as trees.'
      ].join('\n')
    default:
      return [
        'MODE: Agent — full writing tools. All file writes auto-apply to disk immediately (no Accept). Files stay yellow-dirty until the user Ctrl+S. Mistakes: user discards via Source Control. Soft: call update_plan_step as you finish todos.',
        GIT_AGENT_PLAYBOOK
      ].join('\n')
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
    'Workspace structure: use workspace_mkdir / workspace_copy / workspace_move / workspace_delete (Node FS, not shell) for folders and archival moves. Prefer move/copy tools over reading files and rewriting them with propose_write_file.',
    WRITE_GATE_SUMMARY,
    mode === 'agent'
      ? GIT_AGENT_PLAYBOOK
      : mode === 'plan' || mode === 'outline'
        ? 'Git (read/sync in this mode): git_status / git_diff / git_log / git_pull / git_push. For git_add/git_commit/git_remote_* switch to Agent mode. Live “Git (L5)” is in Editor context each turn.'
        : '',
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
    WRITE_GATE_SUMMARY,
    '- Tool results include written/pending + reviewHint + gateDetail + toolApi. If toolApi is missing, the running app is stale — ask user to fully restart Electron.',
    '- Character upserts ALWAYS auto-write (single or batch). Prefer propose_upsert_characters for 5+ rows. There is NO "5 cards → pending" rule; ≤5 applies only to dialogue LINE edits.',
    '- New files, empty-file writes, layout_kmind/layout_dialogue, and dialogue ≤5 lines may auto-write.',
    '- Existing prose/kmind, dialogue performance batches, and multi-file content turns need Accept.',
    '- If pending: tell the user to Accept/Reject on the card. If written: say it was written. Never invent an Apply step outside the card.',
    '- Do not mass-delete prose unless the user explicitly asks.',
    '- Prose write/patch results may include memoryHint — follow it in the same turn when present (upsert story state / foreshadow).',
    '',
    memoryToolsDisciplinePrompt(),
    '',
    'Literary workflow:',
    '- Cast: characters.csv is 6 columns (id,name,color,note,model_node,operable). read_characters returns decoded fields; raw ""quotes"" in the CSV file are RFC 4180 escaping, not corruption.',
    '- Before renaming voices/appearance, call read_characters or lookup_character; explain conflicts before proposing prose edits.',
    '- Continuity / 人设 / contradiction checks → continuity_check (structured issues, not full-text dump). Only write after the user asks to apply fixes.',
    '- Watch for ghost characters: prose names missing from characters.csv (often pending Accept on cast cards). See also memoryHint / ghostCharacterWarnings on prose writes.',
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
