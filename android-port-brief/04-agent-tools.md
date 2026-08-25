---
title: Agent loop, tools, chat UX
toolApi: 2026-08-25-a
---

# 04 — Agent, tools, chat

Win authority: `src/main/ai/**`, `src/renderer/src/ai/**`, `src/renderer/src/state/aiStore.ts`.

Deep Win docs: `project-memory/AGENT-TOOL-FEEDBACK.md`, `PACKAGED-AI-UX.md`, `REQ-literary-agent-capability-upgrade.md`, `REQ-indie-game-skills.md`.

## Modes

| Mode | Tools |
|------|--------|
| **Ask** | **None.** `tool_choice: none`. Never execute `tool_call`. `askGuard.ts` strips DSML dumps. |
| **Plan** | Read + search + `create_plan` + `ask_user` + `cite_workspace` + `open_in_editor` (no file-mutating propose_* except plan md as designed) |
| **Outline** | Structure / kmind-oriented subset + `ask_user` + `cite_workspace` + `open_in_editor` |
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

Full `/` and `@` algorithm, DOM, inject rules: [`10-update-ask-csv-links.md`](./10-update-ask-csv-links.md) §3 **Composer**. Copy `AiComposer.tsx` + `FileMountChip.tsx`; port inject in `agentLoop.ts`.

| Piece | Win truth |
|-------|-----------|
| Trigger | Last token `/[^\s]*` or `@[^\s]*` at start or after space. `@` closes `/`. |
| `/` list | Enabled skills except **caveman** (first 4 + show more), then commands `/agent` `/plan` `/outline` `/ask` `/new`. |
| `/` pick skill | Strip token; warm `/{id}` chip; body typed beside it. Do **not** leave `/grill` in the textarea. |
| `/` pick command | Switch mode, or `/new` → new chat. |
| `@` list | Recent = open tabs then tree (24 / search 40 / flatten 400). Browse walks folders. Overlay scroll. |
| `@` pick | **File** → chip + strip `@token`. **Folder / Browse / Up** → navigate only. Folder mounts = paperclip (trailing `/`). |
| Paperclip | In-tree mount; out-of-tree copy to `.kentucky/refs/`. Jail every path. |
| Keyboard | Arrows / Enter / Tab apply; Escape closes; Enter does not send while a menu is open. |
| Menus in DOM | Siblings of `BorderBeam` on `.ai-composer-shell`, **not** inside `.ai-composer`. |
| Payload | `skillId` + `editor.attachedPaths`. UI shows chips; API gets SKILL.md + up to 8 mount bodies. |
| L5 | Mounts = PRIMARY SUBJECT. If any mount, **omit** active-file body. |
| Caveman | If enabled, inject every turn; do not put it in the `/` list; do not `read_skill` it as optional. |

Context bar: label + color track; token numbers in popover only. Do **not** bump `toolApi` for these menus.

## Settings (AI)

- Multi-profile: label, baseUrl, model, contextWindow, thinkingLevel high/mid/low, encrypted key.
- **Draft fields + save on blur** — never `upsertProfile` on every keystroke (`PACKAGED-AI-UX.md` §1).
- `Number('')` must not snap context back to 128000.
- thinkingLevel: send `reasoning_effort` (mid → medium); if gateway 400, retry without the field.

## Sessions

- JSON in app-private `data/ai-chats/`.
- Persist `askCards`, `citeCards`, and in-flight `pendingAsk` (see `10-update-ask-csv-links.md` §3). On load: `hydrateAskCiteFromMessages`; `settleStalePendingAsk` if no waiter.
- List/open **strictly filtered** by workspace id (SAF tree).
- Near-full context → refuse send; **never** silently drop history.
- L5 editor context: active file (body omitted if mounts), selection, leftover `@mentions`, `attachedPaths`, characters summary, Git L5, Design L5 if `design/` exists.

## Tool list (names must match)

Fingerprint every **write** result (and `ask_user` / `cite_workspace`) with `"toolApi": "2026-08-25-a"`.

Delta for this fingerprint: [`10-update-ask-csv-links.md`](./10-update-ask-csv-links.md).

### Files / workspace

`list_dir`, `read_file`, `propose_write_file`, `propose_text_patch`, `workspace_mkdir`, `workspace_copy`, `workspace_move`, `workspace_delete`, `open_in_editor`, `cite_workspace`, `ask_user`, `export_workspace_pdf`

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

Keep the same channel names if possible: `ai:session`, `ai:chunk`, `ai:done`, `ai:error`, `ai:proposal`, `ai:gitOp`, `ai:tool`, `ai:plan`, `ai:workspaceOp`, `ai:assistant_start`, `ai:askUser`, `ai:citeWorkspace`. Include `runId`. Blocking `ask_user` is a Promise in the AI runtime — see `10-update-ask-csv-links.md`. Do not `window.confirm`.

`ai:workspaceOp`: `openFile`, `refreshTree`, `fsDeleted`, `fsMoved`, `fsCopied` — update tabs/tree.

## Bundled skills

Win `resources/ai-skills/`. Copy-if-missing into `data/ai-skills`. Caveman (inject every turn if enabled) + **grill** (no inject; independent of the eight `game-*` toggles) + literary-voice + 8 design skills. **Do not execute skill scripts.**
