---
title: MUST / NEVER — keep this file open while coding
---

# 08 — Invariants

If a sentence here conflicts with an old Android folder or a Win `changelog.md` anecdote, **this file + Win `product-decisions.md` + current Win source win**.

## MUST

| ID | Rule |
|----|------|
| M1 | Android is a **new** app. Ignore prior port progress. |
| M2 | UI talks to disk/Git/AI/media **only** through `Platform` (`src/renderer/src/platform/index.ts`). |
| M3 | Copy renderer/shared; **rewrite** Electron main. No runtime import from the Win tree. |
| M4 | Workspace = one SAF tree. Jail every path. Escape error: `Path escapes workspace: <full>`. |
| M5 | Refuse dangerous workspace roots (storage root / “the whole device”). Toast `errors.unsafeWorkspace`. |
| M6 | `openWorkspace`: `reportWorkspace` **before** `readDir` / `gitEnsure`. |
| M7 | Agent **Ask** = no tools (`tool_choice: none` + refuse execution). |
| M8 | Agent **Agent-mode** = write disk immediately. No Accept/Reject product UI. |
| M9 | Dirty **yellow** = unsaved vs last explicit user save / git reload. New file **blue**. |
| M10 | `commitProposal`: `status: 'applied'`, upsert `session.proposals`, write disk, emit `ai:proposal`. |
| M11 | `TOOL_API_VERSION` stays **`2026-08-25-a`** unless the tool JSON protocol changes. Write / `ask_user` / `cite_workspace` results include `"toolApi": "2026-08-25-a"`. |
| M12 | Confirmations: in-app dialogs only. |
| M13 | Sessions/keys/skills live in **app-private** `data/`, never in the novel tree. Keys = Keystore. |
| M14 | Chat list/open **filtered by this workspace id**. |
| M15 | Git init **only** at opened root `.git` directory. No walk-up. No force. |
| M16 | Godot dialogue protocol **v1.3**. `speaker` = character **id**. |
| M17 | `.kyboard` schema v1 **additive only**. `persistDoc` = disk **and** `tab.content`. Reorder → `repackVideoClipStartsMut`. |
| M18 | UTF-8 text. Round-trip bytes with Win for md/kmind/dialogue/kyboard/yaml. |
| M19 | Stream connect timeout **45s to headers**, then do not kill SSE. |
| M20 | AI settings persist **on blur**, not every keystroke. |
| M21 | Copy from Markdown WYSIWYG = human speech, not Markdown source. |
| M22 | Tablet layout. Hardware keyboard shortcuts where Win has Ctrl+*. |
| M23 | zh-CN + en UI. |
| M24 | After each slice: Android `BOARD.md` + `project-memory/` gaps. Do not mark done if IO is a stub. |
| M25 | Hidden explorer rules: hide dotfiles, `node_modules`, `dist`, `out`, workspace-root `revisions`. **Show** `.yaml`/`.yml`. Do not open hidden paths as ghost tabs. |
| M26 | Stop generation persists partial assistant (`aborted`). Edit **only the last** user bubble. Rewind uses `src/shared/rewindFiles.ts`. |
| M27 | Near-full context → refuse send; never silently drop history. |
| M28 | Skills: copy-if-missing; Caveman injects every turn when enabled; **never execute** skill scripts. |
| M29 | Web search **off** by default. `web_fetch` rejects private IPs. |
| M30 | PDF/HTML size caps; storyboard export ≤ 15 min; PNG/layout clamps. |
| M31 | `ask_user` is Plan/Outline/Agent only. One card ≤3 questions, one Confirm; pending disables Send. Host = Promise + UI callback, never `window.confirm` / `ipcMain`. Persist answered `askCards` and in-flight `pendingAsk`. Process kill → cancelled read-only card. Chrome: `#ff7a00` per `10-update-ask-csv-links.md` §3, not `--accent`. |
| M32 | `cite_workspace` must not steal the active editor. `open_in_editor` (and user clicks, including the **applied-change card filename**) may — same `lineFlash` as mind-map 链接到段落 (`articleLine.ts` `snippet`; change cards use `computeChangeRanges` first line). Agent multi-file writes still must not flash the current tab. |
| M33 | Generic CSV table must not hijack `*.dialogue.csv` or `characters.csv`. Extensionless sniff is strict (LICENSE stays text). |
| M34 | Bundled `grill` is not part of the eight `game-*` skills and is not caveman-injected. |
| M35 | Composer **`/`** opens the Win skills+commands popover (not a native `<select>`). Picking a skill → chip + strip `/token`. **`@`** opens the Win file popover; file → `attachedPaths` chip; folder rows navigate. Jail in SAF. With mounts, omit active-tab body. Spec: `10-update-ask-csv-links.md` §3 Composer. |
| M36 | Agent markdown paint: **added** pale blue, **modified** pale yellow, UTF-16 spans in `agentEditSpans.ts`. User edits never create spans and never grow them; save/discard/rewind clears. Not tab-dirty yellow, not `lineFlash`. |

## NEVER

| ID | Rule |
|----|------|
| N1 | Never merge Capacitor/Gradle into this Win repo unless the user asks. |
| N2 | Never `require('fs')` / Node APIs from renderer. |
| N3 | Never `window.confirm` / `window.prompt`. |
| N4 | Never add `framer-motion` or `ffmpeg-static`. |
| N5 | Never ship a phone layout as the product. |
| N6 | Never bump `TOOL_API_VERSION` for host-only ports. |
| N7 | Never implement Agent Accept cards. |
| N8 | Never git `--force` / `--force-with-lease` / arbitrary argv / Shell tool. |
| N9 | Never walk up to a parent `.git`. |
| N10 | Never treat a `.git` **file** as a repo to init-over or operate as parent. |
| N11 | Never auto-lay storyboard clips onto V1; never in-app draw sheets. |
| N12 | Never inject camera identity bookends; diamonds = stored keys only. |
| N13 | Never `packVideoClipsMut` after a reorder. |
| N14 | Never `printToPDF` / puppeteer as the Android PDF path. |
| N15 | Never put API keys in the workspace or logcat. |
| N16 | Never execute skill `scripts/`. |
| N17 | Never silently drop chat history to “make room”. |
| N18 | Never use `MANAGE_EXTERNAL_STORAGE` as the primary workspace mechanism (SAF tree is the product). |
| N19 | Never load arbitrary `file://` / `content://` for preview. |
| N20 | Never write empty `*.dialogue.csv` because the editor was not ready. |
| N21 | Never steal editor focus when Agent writes many files. |
| N22 | Never open `revisions/` (or other explorer-hidden paths) as background tabs that paint yellow folder dots. |
| N23 | Never let `Number('')` snap context window back to 128000 on settings blur. |
| N24 | Never call `upsertProfile` on every keystroke. |
| N25 | Never invent jpg/webp/webm/mov workspace preview, command palette, cloud sync, or billing UI. |
| N26 | Never replace composer `/` or `@` with only a native `<select>` / full-screen sheet. |
| N27 | Never grow Agent edit highlights onto user insertions, paint user typing, or restore whole-line `.monaco-agent-change`. |

## Locked product (do not silently overturn)

Full tables: Win `project-memory/product-decisions.md`.

Short list:

- Local folder workspace; no `.kentucky` project file as the app identity.
- Weak coupling: article ↔ mind map **not** auto-synced.
- No Markdown split preview.
- Cursor-like chrome; dark `#0A0A0A`; no PR-island storyboard skin.
- Save ≠ commit.
- Multi-window DocumentHub is Win-shaped; Android P1 is **one** WebView hub.
- Ask = zero tools. Grill on Ask → tell user to switch mode; no fake option buttons.
- `grill` toggle independent of `game-*`.
- `ask_user` cards persist in session JSON; bright orange `#ff7a00`.
- Relative `ch.md` stays in-app (no Custom Tabs). `open_in_editor` = 链接到段落, not a second jump tool.
- Composer `/` and `@` match Win popovers; skill = chip not leftover `/id`; mounts = `attachedPaths` CRITICAL.
- Agent prose paint: blue added / yellow modified; save clears; user inserts unmarked.
- Applied-change card **filename** click opens that file (user gesture); tag `edit` only folds the diff.

## Win files to keep in the other-device editor

Pin these while implementing the matching slice:

```
android-port-brief/08-invariants.md
project-memory/product-decisions.md
src/renderer/src/platform/index.ts
src/main/ai/proposalGate.ts
src/shared/rewindFiles.ts
src/shared/agentAsk.ts
src/shared/articleLine.ts
src/shared/csvTable.ts
src/shared/agentEditSpans.ts
src/shared/kyboardSchema.ts
src/renderer/src/ai/AiComposer.tsx
android-port-brief/10-update-ask-csv-links.md
extras/godot-kentucky-dialogue/README.md
project-memory/PACKAGED-AI-UX.md
project-memory/AGENT-GIT.md
project-memory/STORYBOARD.md
project-memory/SECURITY-AUDIT.md
```
