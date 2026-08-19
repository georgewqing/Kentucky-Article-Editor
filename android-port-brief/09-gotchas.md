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
- Ask mode: even if the model emits `tool_call`, **do not run it**.
- Stop: persist partial assistant as `aborted`; ignore late chunks via `runId`.
- Edit last user: truncate following messages; if that turn wrote files, confirm then restore first `before` / delete new files (`src/shared/rewindFiles.ts`).
- Agent writes many files: **do not** focus-steal the active tab.
- `commitProposal` must upsert `session.proposals` with `applied` or the UI has no change cards.

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

- Win: after main/preload/protocol changes, **full quit** Electron (Ctrl+R is not enough). Android equivalent: rebuild native plugins / full app restart, not only WebView reload, after jail/bridge changes.
