---
title: Win gotchas that will recur on Android
win: project-memory/gotchas.md
---

# 09 — Win gotchas to not regress

Full list: Win `project-memory/gotchas.md`. This file is the subset that **will** bite a greenfield Android port. If you “simplify” any of these, you will desync from Win files or paint false dirty dots.

## Files / explorer

- Explorer-hidden paths (`revisions/`, dotfiles) must not be opened as **background tabs**. Hidden dirty tabs made the **folder** show a yellow dot while the visible tree looked clean.
- `.yaml` / `.yml` **are** visible (literary memory). `revisions/` at workspace **root** is hidden.
- Dialogue sidecars nest **visually** under the csv; on disk they are siblings. Rename/move/delete must move all four.
- Reveal-in-Files: **file** → highlight the file; **folder** → open that folder (do not reveal the parent).

## Editors

- Markdown WYSIWYG copy → **plain speech**, not `**markdown**`.
- `propose_text_patch` + TipTap: do not destroy tables or `>` quotes (Win already fixed; keep the tests).
- Markdown links: click underline **without drag** jumps; drag-select does not. Chat autolink only `[text](rel)` and backtick `` `rel.md:12` `` — never bare `foo.md:12`. TipTap **must not** use `target=_blank`. Resolve relative href next to the **current file**, then workspace root. WebView `shouldOverrideUrlLoading` / new-window: **do not** send the WebView origin (`/ch.md`) to Custom Tabs. True `https://` only. Agent jump = `open_in_editor` (same `lineFlash` as 链接到段落); optional `snippet`.
- Agent markdown paint (blue added / yellow modified) is **not** `lineFlash` and **not** tab dirty. `agentEditSpans.ts` never-grows on user insert. Save clears. Do not bring back whole-line `.monaco-agent-change`.
- Generic CSV (`CsvTableEditor`): not `*.dialogue.csv` / `characters.csv`. Parse fail → source + banner. Do not flip kind while the user is typing.
- Mind map: **panning the viewport is not dirty**. Flush viewport **before** save or the next open jumps.
- Dialogue: if the graph is not fully loaded, **do not** `writeFile` an empty CSV (wipes Godot lines).
- Characters: `speaker` stores **id**, not display name. `text_color` empty ≠ character color.

## Storyboard

- `persistDoc`: disk + `tab.content` together. Only `writeFile` → next Save restores the **open-time** empty timeline.
- Drag/scrub: `persist: false` until mouse-up.
- After clip **reorder**, `repackVideoClipStartsMut`. Calling `packVideoClipsMut` again is wrong.
- Camera diamonds = `storedCameraKeys` only. Do not inject t=0/t=1 identity keys.
- Import does **not** put slices on V1.

## Agent / settings

- Settings inputs: **local React state**; `upsertProfile` **on blur**. Keystroke-save regenerated profile ids and looked like “can’t type”.
- `Number('')` on empty context-window field must not coerce to `128000`.
- 45s timer is **TCP/headers only**. After the stream starts, do not abort for “timeout”.
- Empty Base URL → immediate error, not a spinner until 45s.
- Ask mode: even if the model emits `tool_call`, **do not run it**. Grill mounted in Ask → tell user to switch Plan/Agent; **no** option card and no fake numbered buttons.
- `ask_user` pending: disable Send; Stop / session switch / rewrite-resend must cancel the Promise (`cancelled`). Persist `session.pendingAsk` while waiting. Process death → cancelled read-only card, not a live Confirm. Load: `hydrateAskCiteFromMessages`. Rewind must drop ask/cite cards for truncated turns.
- Ask card CSS: `.ai-ask-card` tokens `--ask: #ff7a00`. Unselected chips are **outline**. Do **not** mix ≥14% orange into the card fill (reads as brown). Do **not** use `--accent`. Do **not** apply `.ai-tool-block.is-pending` opacity to the ask card.
- Same tool step: run non-`ask_user` tools first; only one `ask_user`; 9th call this turn → error.
- `cite_workspace` never focuses the editor; missing files still render a chip.
- Applied-change card: the **filename** is its own button (`openWorkspaceAbs` + first changed line). The `edit` tag folds the diff. Do **not** wrap the whole `>_` head in one `<button>` (nested buttons, and the title would not jump). Do **not** treat this click as cite (no focus).
- Stop: persist partial assistant as `aborted`; ignore late chunks via `runId`.
- Edit last user: truncate following messages; if that turn wrote files, confirm then restore first `before` / delete new files (`src/shared/rewindFiles.ts`).
- Agent writes many files: **do not** focus-steal the active tab.
- `commitProposal` must upsert `session.proposals` with `applied` or the UI has no change cards.
- Composer `/` `@` menus belong on `.ai-composer-shell` as **siblings of** the border beam, not inside `.ai-composer` (empty popover / beam bleed).
- Slash pick must **strip** `/grill` from the textarea and use `composerSkillId`. Leaving `/grill` in the draft looks like a command to the user and double-parses on send.
- `@` folder row **navigates**; it does not mount. Folder chips need trailing `/`. Paperclip copies out-of-tree files into `.kentucky/refs/`.
- With `attachedPaths`, omit the active-file body from L5 or the model inventories the open tab instead of the chip.

## Git

- `findGitRoot` / ensure: **only** `<workspace>/.git` as a **directory**.
- Opening a subfolder of a repo creates a **nested** repo. That is intended.
- Do not reject remote URLs because they contain **spaces**.
- Empty commit → `Nothing to commit` / `Nothing staged`, not `Command failed`.
- After `remote_remove` + `remote_add`, push needs `setUpstream`.

## Security

- `joinPath` eating `..` in the renderer is **not** the sandbox. Native/plugin must still refuse.
- Preview/import paths from `.kyboard` JSON can be `../..`. Jail them.
- Do not open the user’s home / storage root as workspace.

## Host

- Win: after main/preload/protocol changes, **full quit** Electron (Ctrl+R is not enough). Android equivalent: rebuild native plugins / full app restart, not only WebView reload, after jail/bridge/`toolApi` changes (`2026-08-25-a`).
