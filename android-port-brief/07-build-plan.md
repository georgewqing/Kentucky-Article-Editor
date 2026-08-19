---
title: Phased build plan + definition of done
---

# 07 — Build plan

Create the Android app in a **sibling folder** (example `Kentucky-Android/`), empty git, own `package.json`. Copy Win renderer in slices. Do not resume any older Android tree.

Keep `BOARD.md` in the Android repo with these exact phase ids. A phase is done only if IO **persists** (no stub that pretends to save).

Win snapshot to match: package **0.3.2**, `toolApi` **`2026-08-14-a`**.

## Suggested repo layout (Android)

```
Kentucky-Android/
  android/                 Capacitor / Gradle
  src/renderer/            copied from Win src/renderer/src
  src/shared/              copied from Win src/shared
  src/common/              copied from Win src/common
  src/ai-runtime/          port of Win src/main/ai (no Electron, no Node fs)
  src/git-runtime/         isomorphic-git + SAF adapter
  src/storyboard-runtime/  PNG + ffmpeg/MediaCodec
  src/platform-android/    implements Platform
  resources/ai-skills/     copy of Win resources/ai-skills
  project-memory/          BOARD.md + gaps vs Win
  android-port-brief/      optional copy of this pack (or git submodule / sibling Win clone)
```

Copy **by hand**. Never `file:` import from the Win tree at runtime.

## Phase P0 — Host + open folder

**Goal:** WebView boots Kentucky chrome and opens a SAF tree.

- Capacitor (or equivalent) app; tablet layout; zh-CN + en shell strings.
- Implement `Platform.openFolder` / `reportWorkspace` / `readDir` / `readFile` / `writeFile` / `joinPath` helpers.
- Unsafe-root rejection.
- Persist tree URI permission.
- Welcome page + “open folder”.
- Explorer lists allowed extensions (including yaml/yml). Hide `.git`, `node_modules`, workspace-root `revisions`.

**DoD**

```
[ ] Cold start → welcome
[ ] Pick a project subfolder → tree shows files
[ ] Pick storage root / obvious dump dir → Toast, no workspace
[ ] Permission survives process death
[ ] Renderer has zero Electron imports
```

## Phase P1 — Tabs, Markdown, DocumentHub, settings

**Goal:** Writer can edit `.md` / `.txt` and not lose buffers.

- DocumentHub in-process (`docOpen` … `docEvict`, dirty vs `originalContent`).
- Tabs, dirty **yellow**, new **blue**, unsaved in-app dialogs.
- TipTap WYSIWYG + Monaco source; word count; spellcheck off.
- Settings: theme, accent, font, locale. Persist theme for splash if you have one.
- Recent workspaces ≤ 6.
- Keyboard: Ctrl+S / W / B / O / `,`.
- Overlay scrollbars / Cursor-like chrome.

**DoD**

```
[ ] Edit md, kill app, reopen → disk has last save only; unsaved asked on close
[ ] Yellow until explicit save; Agent not wired yet
[ ] Copy from WYSIWYG pastes plain speech
[ ] zh-CN / en switch
```

## Phase P2 — kmind + dialogue + characters + media preview

**Goal:** Same on-disk bytes as Win for creative formats.

- `.kmind` v2 React Flow; viewport not dirty; flush viewport before save; sibling `*.assets/`.
- Dialogue graph + sidecars; Godot **v1.3**; rename/move/delete syncs sidecars.
- `characters.csv` editor.
- Read-only `.png` / `.mp4` / `.pdf` preview (not DocumentHub).
- Explorer display names / nested dialogue sidecars.

**DoD**

```
[ ] Round-trip kmind / dialogue / characters with Win (copy folder to desktop, open in Electron)
[ ] Empty CSV not written on incomplete dialogue load
[ ] PNG zoom/pan; MP4 plays; PDF pages render
```

## Phase P3 — Agent runtime + tools + chat UX

**Goal:** Same agent product as Win 0.3.2 (minus git/storyboard/pdf if still stubbed — those have later phases, but **tool names** for files/dialogue/literary must exist).

- Port `agentLoop`, `tools`, `literaryTools`, `proposalGate` (`TOOL_API_VERSION` unchanged), `askGuard`, `openaiCompatClient`, `chatSessions`, `skills`, `planFiles`.
- App-private `data/` + Keystore keys.
- Ask / Plan / Outline / Agent. Ask = no tools. Agent = always write.
- Stop + abort persist; edit **last** user bubble only; rewind files with confirm (`src/shared/rewindFiles.ts`).
- `@` picker, `/` skills, Caveman every-turn inject, context bar.
- Settings: multi-profile, **draft-on-blur**, 45s **connect** timeout only.
- `ai:workspaceOp` updates tree/tabs. Hidden paths (`story_state.yaml` is **visible**; `revisions/` is **not**) must not spawn ghost yellow tabs.

**DoD**

```
[ ] Ask cannot write
[ ] Agent write on disk immediately; explorer yellow until user save
[ ] toolApi 2026-08-14-a on write results
[ ] Stop leaves partial assistant
[ ] Edit last user + confirm restores/deletes files from that turn
[ ] Sessions isolated per workspace
[ ] Empty base URL fails fast; long stream is not killed at 45s
```

Stub git/storyboard/pdf tools with clear errors until P4–P6 if needed — do not silently no-op writes.

## Phase P4 — Git

**Goal:** isomorphic-git product parity (HTTPS first).

- `gitEnsure` at opened root only.
- SCM pane + Agent `git_*`.
- Default gitignore; no force; escape wording; foreign `.git` file.
- Git L5 + playbook.

**DoD:** Win `AGENT-GIT.md` §9 list, translated to SAF (storage root instead of `C:\`).

## Phase P5 — Storyboard

**Goal:** Blank sheet, slice, NLE, MP4 on device.

- Copy schema + editor.
- `persistDoc` + flush-before-save.
- Bundled ffmpeg or MediaCodec. No `ffmpeg-static`.
- Caps: 15 min, PNG limits, layout clamp.

**DoD:** Win `STORYBOARD.md` acceptance that does not require `git.exe` / Electron dialogs. Round-trip `.kyboard` with Win.

## Phase P6 — PDF export + remaining Platform

**Goal:** `exportPdf` without `printToPDF`. Agent `export_workspace_pdf` for `.md`.

- HTML ≤ 2MB, PDF ≤ 50MB.
- kmind landscape bitmap page (UI).
- `showItemInFolder` / `openExternal`.
- `newMainWindow` / `newFloatWindow`: explicit unsupported until a later optional phase.

## Phase P7 — Tablet polish + security pass

- Two-pane workbench (tree + editor, AI drawer). Hardware keyboard + touch.
- No phone chrome.
- Run `06-security-and-data.md` checklist.
- Run Win `AGENT-TOOL-TEST-BASELINE.md` / `SESSION-TOOL-FEEDBACK.md` smokes that apply.
- Android `project-memory/` lists remaining gaps vs Win (multi-window, SSH remotes, …).

**Product “Kentucky on tablet”** = P0–P7 DoD in `00-mission.md` plus this file. Shipping a subset is fine **internally**; do not call it feature-complete Kentucky.

## Copy order (renderer)

1. `platform/index.ts` (interface) + a stub Android impl.
2. `theme/`, `styles/global.css`, `i18n/`.
3. `workbench/` (shell without AI/SCM).
4. `editors/Markdown*`, `monacoSetup.ts`.
5. `state/appStore.ts` (strip Electron-only).
6. Remaining editors.
7. `ai/` + `state/aiStore.ts` after P3 runtime exists.

## What “ignore previous Android” means

If the other machine has `Kentucky for Android/` with Capacitor 0.3.0 / BOARD / `src/ai-runtime`: **do not open it as the project**. You may read it for ideas only if the user asks. Default: empty sibling.

## Machine setup (other device)

1. Clone Win: `https://github.com/CCFOX12/Kentucky-Article-Editor` (this repo).
2. Read `android-port-brief/README.md` → `AGENTS.md` → numbered files.
3. Create empty Android repo next to it.
4. Keep Win clone **read-only reference** while coding Android.
5. When Win `main` moves, re-copy renderer/shared/ai; do not bump `TOOL_API_VERSION` unless the protocol changed.
