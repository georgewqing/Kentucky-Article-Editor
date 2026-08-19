---
title: Agent loop, tools, chat UX
toolApi: 2026-08-14-a
---

# 04 — Agent, tools, chat

Win authority: `src/main/ai/**`, `src/renderer/src/ai/**`, `src/renderer/src/state/aiStore.ts`.

Deep Win docs: `project-memory/AGENT-TOOL-FEEDBACK.md`, `PACKAGED-AI-UX.md`, `REQ-literary-agent-capability-upgrade.md`, `REQ-indie-game-skills.md`.

## Modes

| Mode | Tools |
|------|--------|
| **Ask** | **None.** `tool_choice: none`. Never execute `tool_call`. `askGuard.ts` strips DSML dumps. |
| **Plan** | Read + search + `create_plan` (no file-mutating propose_* except plan md as designed) |
| **Outline** | Structure / kmind-oriented subset |
| **Agent** | Full tool set; **always auto-write** |

Plan truth = workspace `plans/<slug>.plan.md`. No permanent plan list in the chat header. Markdown toolbar **Build** switches to Agent, binds `planFileRel`, sends execute hint.

## Write policy

- No Accept / Reject in product UI (legacy IPC may still exist on Win — **do not port Accept**).
- `commitProposal`: `status: 'applied'`, upsert `session.proposals`, write disk, emit `ai:proposal`.
- Yellow ● until user saves. Mis-edit → SCM discard or editor undo.
- Do not steal editor focus when Agent writes many files (`applyAiFileEdit`).
- Do **not** open explorer-hidden paths as ghost tabs (`explorerHidden.ts`).

## Streaming / abort / edit last turn

Port `agentLoop.ts` + `aiStore.ts`:

| Behavior | Detail |
|----------|--------|
| Stop | Composer square + Escape; abort in-flight fetch |
| Persist abort | Keep partial assistant; mark `aborted` |
| Stale IPC | `runId` on events; ignore old run |
| Edit | Only **last** user bubble (Cursor rule) |
| Resend | Truncate messages after that user; confirm if files were written |
| Rewind files | `src/shared/rewindFiles.ts` — first `before` per path; new files deleted |
| Retry | Same rewind path, not a duplicate user message |

Connect timeout: **45s until response headers**, then drop the timer so long SSE is not killed (`PACKAGED-AI-UX.md` §3). Empty Base URL → fast error, no infinite spinner.

## Composer UX (match Win)

- Modes + profile switcher at bottom.
- Paperclip + send (same 22px affordance).
- `/` skills menu; `@` workspace file picker (recent tabs, in-menu browse, chips).
- Mounted files go `attachedPaths` (CRITICAL subject).
- Skills chip injects SKILL.md (+ examples/reference when present).
- **Caveman** skill: if enabled, inject every turn; do not `read_skill` it as optional.

Context bar: label + color track; token numbers in popover only.

## Settings (AI)

- Multi-profile: label, baseUrl, model, contextWindow, thinkingLevel high/mid/low, encrypted key.
- **Draft fields + save on blur** — never `upsertProfile` on every keystroke (`PACKAGED-AI-UX.md` §1).
- `Number('')` must not snap context back to 128000.
- thinkingLevel: send `reasoning_effort` (mid → medium); if gateway 400, retry without the field.

## Sessions

- JSON in app-private `data/ai-chats/`.
- List/open **strictly filtered** by workspace id (SAF tree).
- Near-full context → refuse send; **never** silently drop history.
- L5 editor context: active file, selection, `@`, characters summary, Git L5, Design L5 if `design/` exists.

## Tool list (names must match)

Fingerprint every **write** result with `"toolApi": "2026-08-14-a"`.

### Files / workspace

`list_dir`, `read_file`, `propose_write_file`, `propose_text_patch`, `workspace_mkdir`, `workspace_copy`, `workspace_move`, `workspace_delete`, `open_in_editor`, `export_workspace_pdf`

### Dialogue / cast

`read_dialogue`, `propose_update_dialogue_lines`, `propose_append_dialogue_lines`, `propose_dialogue_performance`, `propose_reorder_dialogue_lines`, `propose_set_dialogue_choices`, `layout_dialogue`, `propose_dialogue_graph`, `dialogue_cast_check`, `read_characters`, `lookup_character`, `propose_upsert_character`, `propose_upsert_characters`

### Continuity / kmind

`continuity_check`, `scene_to_kmind`, `kmind_to_scene_outline`, `read_kmind`, `propose_kmind_edit`, `layout_kmind`

### Plan / skills / web

`create_plan`, `update_plan_step`, `list_skills`, `read_skill`, `web_search`, `web_research`, `web_fetch`

### Git (Agent)

`git_status`, `git_diff`, `git_log`, `git_pull`, `git_push`, `git_add`, `git_commit`, `git_remote_add`, `git_remote_remove`

No force. Details: `05-git-storyboard-pdf.md` and Win `AGENT-GIT.md`.

### Literary YAML (`literaryTools.ts`)

`read_story_state`, `propose_upsert_story_state`, `read_foreshadow`, `propose_upsert_foreshadow`, `read_voice_anchor`, `propose_set_voice_anchor`, `read_voice_bank`, `propose_upsert_voice`, `compare_voice`, `read_scene_state`, `propose_upsert_scene`, `list_revisions`, `propose_create_revision`, `propose_restore_revision`, `propose_upsert_volume`, `list_materials`, `search_materials`, `propose_upsert_material`, `read_glossary`, `propose_upsert_glossary`, `reader_critique`, `proofread_check`

Memory files at workspace root, created on demand: `story_state.yaml`, `foreshadow.yaml`, `voice_anchor.yaml`, `voice_bank.yaml`, `glossary.yaml`, `materials/`. `revisions/` hidden in tree.

## Events (renderer)

Keep the same channel names if possible: `ai:session`, `ai:chunk`, `ai:done`, `ai:error`, `ai:proposal`, `ai:gitOp`, `ai:tool`, `ai:plan`, `ai:workspaceOp`, `ai:assistant_start`. Include `runId`.

`ai:workspaceOp`: `openFile`, `refreshTree`, `fsDeleted`, `fsMoved`, `fsCopied` — update tabs/tree.

## Bundled skills

Win `resources/ai-skills/`. Copy-if-missing into `data/ai-skills`. Caveman + literary-voice + 8 design skills. **Do not execute skill scripts.**
