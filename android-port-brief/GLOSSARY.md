---
title: Glossary for receiving AIs
---

# Glossary

| Term | Meaning |
|------|---------|
| **Win** | This Electron repo (`Kentucky-Article-Editor`), source of truth. |
| **Android / tablet app** | New independent project. Not this git tree. |
| **SAF** | Android Storage Access Framework. User picks a **directory tree**; persist URI permission. That tree = workspace. |
| **`Platform`** | TS interface in `src/renderer/src/platform/index.ts`. Renderer may only call this. |
| **DocumentHub** | Single authority for open text buffers (`content` vs `originalContent`, `dirty`, `rev`). Media previews are **not** in the hub. |
| **dirty / yellow** | Buffer ≠ last **user** save (or git reload baseline). Agent writes bump `content` and keep the old baseline → tab yellow until Ctrl+S. **Not** the pale yellow Agent-replaced **substring** in the article. |
| **new / blue** | File created in this session, not yet a “normal saved” file in the Win sense. **Not** the pale blue Agent-**inserted** substring in the article. |
| **Agent edit span** | `{ start, end, kind: 'added' \| 'modified' }` on `tab.content` (UTF-16). Blue = insert hunk, yellow = replace hunk. User typing never creates/grows. Save clears. See `10-update-ask-csv-links.md` §3. |
| **`toolApi` / `TOOL_API_VERSION`** | Fingerprint on Agent **write** tool JSON (also `ask_user` / `cite_workspace`). Current **`2026-08-25-a`**. Do not bump unless request/response **shape** changes. |
| **`ask_user`** | Blocking multiple-choice tool (Plan/Outline/Agent only). One card, ≤3 questions, Confirm once. Not Ask mode. Persist answered cards + in-flight `pendingAsk`. Process kill → cancelled read-only. Orange `#ff7a00` (see `10-update-ask-csv-links.md` §3). |
| **`cite_workspace`** | Chat cite chips. Does **not** steal the editor tab. Optional `snippet` resolves to `line`. Missing files still show `exists: false`. |
| **`open_in_editor`** | Same jump as mind-map 链接到段落 (`openFile` + `lineFlash`). `snippet` or 1-based `line`. Does steal the tab. Do not invent a second jump tool. |
| **Applied change card** | Chat summary of an auto-written file (`AppliedChangeCard`). Yellow/blue **basename** click → open that file at the first changed line. Tag `edit` folds the diff. User click **may** steal focus. See `10-update-ask-csv-links.md` §3. |
| **`articleLine.ts`** | Shared matcher: `looksLikePathLineCite`, `resolveJumpLine`. Not `csvTable.ts`. |
| **grill** | Bundled skill `resources/ai-skills/grill`. Independent of the eight `game-*` skills. Not injected every turn. |
| **Ask / Plan / Outline / Agent** | Chat modes. Ask = zero tools. Agent = full tools + auto-write. |
| **Accept** | Deleted product behavior. Do not port. |
| **L5** | Compact per-turn context: active file, selection, `@`, characters summary, Git L5, optional Design L5. |
| **Caveman** | Bundled skill; if enabled, injected **every** turn; do not `read_skill` it as optional. **Not** in the `/` skills list. |
| **`/` menu** | Composer last-token `/…` popover: enabled skills (except caveman) + `/agent` `/plan` `/outline` `/ask` `/new`. Skill pick → warm chip, token stripped. See `10-update-ask-csv-links.md` §3. |
| **`@` menu** | Composer last-token `@…` popover: recent tabs, search, in-menu browse. File pick → `attachedPaths` chip. Folder rows navigate. |
| **`attachedPaths`** | Workspace-relative mounts on the user turn (folders end `/`). CRITICAL subject; cap 8 injected. Not leftover `@path` in the textarea. |
| **copy-if-missing** | Install bundled `SKILL.md` only when the user does not already have that id. |
| **Godot v1.3** | Dialogue on-disk protocol. See `extras/godot-kentucky-dialogue/README.md`. |
| **sidecars** | `*.dialogue.choices.json`, `*.dialogue.layout.json`, `*.dialogue.meta.json` next to the csv. |
| **`.kyboard`** | Storyboard project JSON + sibling `*.kyboard.assets/`. Schema v1 additive. |
| **`persistDoc`** | Storyboard: write JSON to disk **and** update the editor tab buffer so Save cannot clobber. |
| **isomorphic-git** | Pure-JS git. Android must not shell out to `git.exe`. |
| **walk-up** | Searching parent folders for `.git`. **Forbidden.** |
| **foreign `.git`** | `.git` is a **file** (worktree pointer). Do not treat as a normal repo dir. |
| **app-private `data/`** | Chats, keys, skills, AI settings. Win: next to exe. Android: `getFilesDir()`. Never inside the novel. |
| **unsafe workspace** | Opening a root that would let Agent destroy “the computer” (drive root, home, storage root). Toast and refuse. |
| **dialog allowlist** | Paths the user picked in a system picker this session; only those may be imported/exported outside the tree. |
| **greenfield** | Start empty. Ignore `../Kentucky for Android/` or any Capacitor tree that already exists. |
