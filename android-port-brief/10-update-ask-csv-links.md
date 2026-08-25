---
title: Incremental update — ask_user, CSV, links, composer / @, save-all, agent edit highlights, change-card title jump
audience: Agents on https://github.com/CCFOX12/Kentucky-for-Android
win_version: 0.3.2
toolApi: 2026-08-25-a
win_changelog: §184–§186 (+ composer / @ from §71/§78/§101)
created: 2026-08-25
win_repo: https://github.com/CCFOX12/Kentucky-Article-Editor
android_repo: https://github.com/CCFOX12/Kentucky-for-Android
---

# 10 — Incremental update: Ask picker, CSV, links, composer `/` `@`, Save All, Agent edit highlights, change-card title jump

This file is the **delta** after Win changelog **§184–§186**, plus composer **`/`** / **`@`**, explorer **Save All**, **Agent markdown highlights**, and **click the applied-change card filename** to open that file.

**Copy this file only** to the Android clone for this round. Do **not** require `08-invariants.md`, `09-gotchas.md`, or `GLOSSARY.md` to implement the delta — every lock, gotcha, term, CSS token, and i18n string for this slice is below. Pair it with the **Win source paths** in the catalog (copy renderer / rewrite IO). `toolApi` stays **`2026-08-25-a`**.

| Win changelog | What it added |
|---------------|----------------|
| **§184** | `ask_user` (persist + orange card), generic CSV table, `cite_workspace`, chat/article workspace links, bundled `grill` |
| **§185** | Relative article links must **not** toast “missing” **and** open Custom Tabs. Sibling-then-root resolve. TipTap `target: null`. Host must not `openExternal` the WebView origin. |
| **§186** | Agent **`open_in_editor(path, snippet or line)`** is the same jump as mind-map **链接到段落** (`openFile` + `lineFlash`). Do not invent a second jump tool. Matcher: `src/shared/articleLine.ts`. |
| **§71 / §78 / §101** | Composer **`/`** pops a skills + commands list (skill becomes a warm chip, not leftover `/id` in the textarea). Composer **`@`** pops a workspace file picker (recent tabs, in-menu browse, chips). Mounts inject as `attachedPaths` CRITICAL; when mounts exist, omit the active-tab body. |
| **Explorer Save All** | Folder-pane action row: Lucide `SaveAll` between New Dialogue and Refresh. Calls `saveAllDirtyTabs` (every dirty editor tab via existing `saveTab`). `SIDEBAR_MIN_WIDTH` **212**. Not a `toolApi` change. |
| **Agent edit highlights** | After an Agent write, **added** sentences/paragraphs get a pale **blue** background; **replaced** text gets pale **yellow**. Only Agent text is marked. User inserts do not grow the mark; deletes shrink it. User save / discard / rewind clears. Not a `toolApi` change. Replaces the old whole-line gray `monaco-agent-change`. |
| **Applied-change title jump** | Chat `AppliedChangeCard`: the yellow/blue **basename** in the `>_` header is a button. Click → open that workspace file and `lineFlash` the **first changed line** in `after`. Tag `edit` still folds the unified diff. Git cards stay whole-head fold. Not a `toolApi` change. |

**This Win repo still only maintains the desktop app.** `toolApi` stays **`2026-08-25-a`** (`snippet` is an optional extra field; do not invent a host-only bump).

| Do | Do not |
|----|--------|
| Copy / port from the Win paths below | Push commits to Kentucky-for-Android from this clone |
| Match `toolApi: 2026-08-25-a` | Merge Android `src/` into this Electron tree |
| Keep Ask = **zero tools** | Overwrite Android files that already exist unless the Android repo asks you to |
| Block on `ask_user` with a Promise + UI callback | Use `window.confirm` / `window.prompt` |
| Cite without stealing editor focus | Open `file://` / `content:` that leaves the SAF tree |
| Jump sentences with `open_in_editor` | A second jump tool, or drive the mind-map line-pick split UI from the Agent |
| Let a **user click** on the change-card filename open that file | Treat that click like `cite_workspace` (no focus), or wrap filename + fold in one `<button>` |

Fingerprint: Win `src/main/ai/proposalGate.ts` `TOOL_API_VERSION` is **`2026-08-25-a`**. After native/bridge/`toolApi` changes, **full app restart** (WebView reload is not enough).

### Terms (so this file stands alone)

| Term | Meaning in this delta |
|------|------------------------|
| **Applied change card** | Chat card for an auto-written file (`AppliedChangeCard` in `AiPanel.tsx`). Header: `>_` + basename + tag `edit`. Only `status === 'applied'` proposals render. |
| **Title jump** | User click on that **basename** → open the file + `lineFlash` first changed line. **May** steal editor focus. |
| **`cite_workspace`** | Cite **chips**. Must **not** steal the editor tab. |
| **`open_in_editor`** | Agent tool. Same jump as mind-map 链接到段落. **Does** steal the tab. Do not invent a second jump tool. |
| **Tab dirty yellow** | Unsaved vs last **user** save. Card title uses `var(--dirty)` for existing files. |
| **Tab new blue** | Session-new file. Card title uses solid `#6cb6ff` when `!proposal.before`. |
| **Agent edit paint** | Pale **blue** added / pale **yellow** modified **inside the article** (`#6cb6ff` 28% / `#e8c44a` 32% mixes). **Not** the card title colors. Save clears paint. |
| **`lineFlash`** | Temporary **accent** jump overlay (WYSIWYG `.article-line-flash-overlay`, source `.kmind-line-flash`). Title jump uses this, not Agent paint. |
| **`openWorkspaceAbs`** | Jail + exists + (Win float) then `openFile`. Change-card titles call this. Do not `openFile` raw from the card. |
| **`computeChangeRanges`** | 1-based line ranges in **`after`**. First `startLine` is the title-jump target. Not `articleLine.resolveJumpLine` (no snippet). |

---

## 1. Update catalog (Win paths)

Each row: what landed on Win, and what Android should do. **Copy renderer** means adapt imports and `getPlatform()` only. **Rewrite IO** means Capacitor + SAF (or equivalent); do not call Node `fs` / `ipcMain`.

| Win path | What this round did | Android action |
|----------|---------------------|----------------|
| `src/main/ai/proposalGate.ts` | `TOOL_API_VERSION = '2026-08-25-a'` | **Copy contract.** Emit this string on write and on `ask_user` / `cite_workspace` / `open_in_editor` results. |
| `src/shared/agentAsk.ts` | `ask_user` limits + Other `__other__`; `cite_workspace` ≤4; optional `snippet` on parse; `PendingAskSnapshot`; card `status: 'answered' \| 'cancelled'` | **Copy shared.** Keep constants identical. Persist cards **without** requiring `snippet` (resolve to `line` at cite time). |
| `src/shared/articleLine.ts` | `normalizeSearchText`, `looksLikePathLineCite` (chat `` `path.md:12` ``), `resolveJumpLine` (`line` + `snippet`) | **Copy shared.** Chat backticks import **this**, not `csvTable`. Do **not** copy `splitPathLineCite` (deleted). |
| `src/shared/agentEditSpans.ts` | UTF-16 spans `{ start, end, kind: 'added' \| 'modified' }`; `spansFromAgentWrite`; `mapSpansThroughUserEdit`; `mergeAgentWriteSpans`; `agentEditPathKey` | **Copy shared.** Source of truth for highlights. Do **not** keep 1-based `startLine`/`endLine` ranges. |
| `src/shared/csvTable.ts` | RFC 4180-ish parse/serialize; **strict** extensionless sniff only | **Copy shared.** Disk stays UTF-8; keep the original delimiter. **No** path:line helpers here. |
| `src/main/ai/tools.ts` | `ask_user`, `cite_workspace`, `open_in_editor` (`snippet` preferred); all three in Plan/Outline (Ask still empty tools) | **Port names + JSON.** Ask: `tool_choice: none` + refuse (`askGuard.ts`). Snippet match uses **dirty editor buffer** when open (`readWorkspaceText`). |
| `src/main/ai/registerAiIpc.ts` | `ai:answerAskUser`; `sessionForSender` runs `settleStalePendingAsk` | **No Electron IPC.** Same settle whenever a session is loaded for UI. |
| `src/preload/index.ts` + `src/renderer/src/platform/index.ts` | `aiAnswerAskUser` on `Platform` | Add to Android `Platform`; renderer **only** via `getPlatform()`. |
| `src/main/ai/chatSessions.ts` | Persist `askCards` / `citeCards` / `pendingAsk`; `hydrateAskCiteFromMessages`; rewind drops cards for truncated assistant ids | **Copy contract.** |
| `src/renderer/src/ai/AskUserCard.tsx` | ≤3 questions, chips + Other, **one Confirm**; numbered prompts; `aria-pressed`; cancelled hint; confirm footer | **Copy renderer.** |
| `src/renderer/src/ai/CiteWorkspaceCard.tsx` | Chips; missing still shown; click `openWorkspaceHref` **without** `fromAbs`; **no** `setActiveTab` | **Copy renderer.** |
| `src/renderer/src/ai/AiPanel.tsx` | Pending + history cards; Send disabled while pending; no duplicate pending card; sent-user **skill chip** + **mount chips**; hide boilerplate `Follow skill /id…`; **`AppliedChangeCard` filename → `openWorkspaceAbs`**; `ToolBlock` splits title vs fold when `onTitleClick` is set | **Copy renderer.** See §3 Applied-change title jump. |
| `src/renderer/src/ai/AiComposer.tsx` | **`/`** skills+commands popover; **`@`** file picker; skill chip; paperclip; FileTree drop | **Copy renderer.** See §3 Composer. Token parsers, apply handlers, and menu DOM live here. |
| `src/renderer/src/ai/FileMountChip.tsx` | Composer vs message chip; trailing `/` = folder | **Copy renderer.** |
| `src/renderer/src/workbench/dnd.ts` | `KENTUCKY_PATH_MIME = application/x-kentucky-path` | **Copy** if FileTree→composer drag exists; tablet HTML5 DnD is optional. `@` + paperclip must still work without drag. |
| `src/renderer/src/state/aiStore.ts` | `pendingAsk`; restore on `openSession`; `ai:askUser` / `ai:citeWorkspace`; `ai:workspaceOp` openFile + **line**; `composerSkillId`; `composerAttachments`; `send()` `skillId` + `attachedPaths` | **Copy renderer**; wire events from the in-app runtime. |
| `src/main/ai/agentLoop.ts` | Same-batch: non-`ask_user` first, then **one** blocking `ask_user`; cap 8/turn; persist `pendingAsk` before wait; `settleStalePendingAsk`; `ai:workspaceOp` `{ op: 'openFile', path, line }`; **`readWorkspaceMention` / `expandUserMountsForApi` / `buildMountedFilesHint`**; omit active-file body when mounts exist; inject SKILL.md for `skillId` | **Must rewrite host.** In-process `Promise` for ask. `openFile` must pass `line` into the same `lineFlash` as the mind-map jump. Mounts + skills: see §3 Composer (this is not UI-only). |
| `src/renderer/src/ai/simpleMarkdown.tsx` | React nodes. Clickable `[label](rel)` and `` `rel.md:12` `` via `looksLikePathLineCite` from **`articleLine.ts`**. Never autolink bare `foo.md:12` | **Copy renderer.** |
| `src/renderer/src/ai/proposalDiff.ts` | `formatProposalDiff`; **`computeChangeRanges(before, after)`** → 1-based line ranges in **`after`** (single outer hunk) | **Copy renderer.** First `startLine` is the jump target for the change-card title. |
| `src/shared/clipLines.ts` | Change-card summary: first 4 lines / 360 chars then `…` | **Copy shared** if missing. Change cards pass `expandable` **unset**, so this clip is the only truncation. |
| `src/renderer/src/workbench/workspaceLinks.ts` | `openWorkspaceHref` / `hrefFromAnchor` / **`openWorkspaceAbs`**; shared float-other-file + `openFile({ line })` | **Copy, jail in native.** See §3 Workspace jumps + Applied-change title jump. |
| `src/renderer/src/editors/MarkdownArticleEditor.tsx` | Click underline without drag (≤4px); `auxclick` middle-button; `hrefFromAnchor`; `{ fromAbs: current path }`; Link `target: null`, `autolink: false`; insert `type="text"`; **`AgentEditHighlight`** + source-mode `syncMonacoAgentSpans` | **Copy renderer.** Jump = overlay `.article-line-flash-overlay` (not a class on TipTap nodes). Agent paint = **inline** blue/yellow, different from the jump overlay. |
| `src/renderer/src/editors/agentEditHighlight.ts` | TipTap plugin + markdown-offset → PM; never-grow `ReplaceStep` map; `syncMonacoAgentSpans` | **Copy renderer.** |
| `src/renderer/src/editors/MonacoTextEditor.tsx` | Decorations from `AgentEditSpan` (`inlineClassName` added/modified), not whole-line gray | **Copy renderer.** |
| `src/renderer/src/editors/monacoLineNav.ts` | `normalizeSearchText` from `articleLine.ts`; Monaco flash class `.kmind-line-flash` (source mode / `.txt` only) | **Copy renderer.** Jump flash ≠ Agent edit paint. |
| `src/main/ipcSandbox.ts` | App-shell `will-navigate` only; `setWindowOpenHandler` must **not** `openExternal` the WebView origin | **Rewrite host.** See §3 WebView. |
| `src/renderer/src/editors/CsvTableEditor.tsx` | Grid + source toggle; large table source-first; parse fail → banner + source | **Copy renderer.** Persist like other text. |
| `src/renderer/src/state/appStore.ts` | `EditorKind: 'csv'`; dialogue / `characters.csv` **first**; `openFile(..., { line })` → `lineFlash`; **`saveAllDirtyTabs`**; `SIDEBAR_MIN_WIDTH = 212`; **`agentChangeRanges` is `AgentEditSpan[]`**; `applyAiFileEdit` → `mergeAgentWriteSpans`; `updateTabContent` → `mapSpansThroughUserEdit`; clear on save / discard / hub-clean / rewind | **Copy renderer.** |
| `src/renderer/src/workbench/Sidebar.tsx` | Explorer action row: `SaveAll` icon after New Dialogue, before Refresh; disabled with no workspace or no dirty editors | **Copy renderer.** Same `actionIcon` `{ size: 14, strokeWidth: 2 }`. Do not invent a filled/floppy-only icon. |
| `src/renderer/src/workbench/EditorArea.tsx` + `FloatWorkbench.tsx` | `kind === 'csv'` → `CsvTableEditor` | **Copy renderer.** Float N/A if none. |
| `src/renderer/src/workbench/FileTree.tsx` | Letter icon `CSV` for `.csv` | **Copy renderer.** |
| `src/renderer/src/styles/global.css` | `.csv-table*`; `.ai-ask-*`; `.article-line-flash-overlay`; `.monaco-editor .kmind-line-flash`; slash/`@` menus; `.sidebar { min-width: 212px }`; **`.article-agent-added` / `.article-agent-modified` / `.monaco-agent-added` / `.monaco-agent-modified`**; **`button.ai-tool-block-title`** (underline on hover) + **`button.ai-tool-block-fold`** | **Copy CSS.** Do **not** restore `.monaco-agent-change` or `.article-prose .kmind-line-flash`. Agent paint is **not** `--accent`. |
| `src/renderer/src/i18n/locales/zh-CN.json` + `en.json` | `csv.*`, `ai.ask*` (`askCancelled`, `askConfirmHint`), `ai.cite*`, `errors.link*`, `article.linkPlaceholder`; **`ai.slash*` / `ai.at*` / `ai.removeSkill` / `ai.removeAttachment` / `ai.attachFiles`**; **`explorer.saveAll`** (`保存全部` / `Save All`); **`ai.openEditedFile`** (`打开 {{name}}` / `Open {{name}}`); **`ai.expandChange` / `ai.collapseChange`** on the `edit` fold control | **Copy locales.** |
| `resources/ai-skills/grill/SKILL.md` | Bundled grill | **Ship**; copy-if-missing into app-private `data/ai-skills/grill/`. |
| `src/main/ai/skills.ts` | `GRILL_SKILL_ID` in `BUNDLED_SKILL_IDS` **not** `BUNDLED_GAME_SKILL_IDS` | **Port.** Turning off the eight `game-*` ids must **leave** `grill` on. |
| `resources/ai-skills/game-brainstorm/SKILL.md` | Scope cuts **must** call `ask_user` | **Ship** with the game octet. |

### Tool JSON (must match Win)

**`ask_user`**

- Args: optional `title`; `questions[]` each `{ id, prompt, options[{id,label}], recommendedId? }`.
- Limits: 1–3 questions; ≤8 options each; UI always offers Other (`__other__` + non-empty text).
- Result: `{ ok, cancelled, answers[], toolApi }` or `{ error, toolApi }`.
- Modes: Plan, Outline, Agent. **Not Ask.**
- Same model step: execute other tools first; at most one `ask_user`; 9th call this **turn** → error (“stop asking; conclude or act”).
- Session JSON: `askCards[]` with `status: 'answered' | 'cancelled'`; optional `pendingAsk: { askId, messageId, title?, questions[] }` while the waiter is live.

**`cite_workspace`**

- Args: `links: [{ path, line?, snippet?, label? }]` ≤4.
- At execute time: resolve `snippet` → `line` with `articleLine.resolveJumpLine` (prefer dirty buffer). Store **`line`** on the card; do not require persisting `snippet`.
- Missing path: still return a card with `exists: false`. Click → toast. **Do not** steal editor focus.
- Modes: Plan, Outline, Agent. **Not Ask.** Result includes `toolApi`.

**`open_in_editor`**

- WHEN: the user should **see that file / sentence now** (“打开这段”, quote a line). Same pipeline as mind-map **链接到段落**: `openFile` + `lineFlash` (WYSIWYG overlay, or Monaco `.kmind-line-flash` in source).
- Args: `path`; optional `line` (1-based); optional `snippet` (preferred over guessing line numbers). Matcher: `articleLine.ts`. Snippet miss → tool **error**, do not jump to line 1.
- This **does** focus the tab. Result: `{ ok, path, line, focused: true, toolApi }`.
- **Do not** invent `jump_to_paragraph` / call the human line-pick split UI. Prompt: do not only paste `[text](path)`.

---

## 2. Product locks (do not silently overturn)

| Lock | Win truth |
|------|-----------|
| Ask | Still **zero tools**. `getWritingToolsForMode('ask')` is empty; `tool_choice: none`; even if the model emits `tool_call`, do not run it. |
| Grill on Ask | Composer may send. Reply must tell the user to switch to **Plan or Agent**. **Forbidden:** numbered Markdown that pretends to be clickable options. **No** `ask_user` card in Ask. |
| `ask_user` | Blocking multiple-choice. One card; ≤3 questions; single-select + Other; **one Confirm**; pending → **Send disabled**; Stop cancels. Facts on disk → `read_file` / `list_dir`. Mounted `/grill` **must** use this tool. Chrome **`#ff7a00`**, not `--accent`. |
| Ask session JSON | Answered cards persist. In-flight `pendingAsk` is written. **Process** kill → read-only `cancelled` (`ai.askCancelled`), no Confirm. WebView-only reload: live Confirm **only if** the AI waiter still exists. |
| Cite vs open | `cite_workspace` = chips, no focus steal. `open_in_editor` = 链接到段落 jump. User clicks on `[text](rel)` / backtick / TipTap underline / **applied-change card filename** **may** change tabs. Agent multi-file writes still **must not** flash the current tab. |
| Applied-change title | Filename in `AppliedChangeCard` is a **separate** button (`onTitleClick` → `openWorkspaceAbs` + first changed line). Tag `edit` folds the extra diff. **Do not** make the whole `>_` head one toggle button (nested buttons, and the title would not jump). Git result cards stay whole-head fold. |
| Article insert | Workspace-relative paths. Insert field is **text**, not `type="url"`. Placeholder admits `chapter.md` **or** `https://`. |
| CSV | Generic tables only. `*.dialogue.csv` and `characters.csv` stay Godot / cast. First row = header. Strict extensionless sniff. `LICENSE` / `Makefile` stay text. |
| Grill vs game octet | `grill` is bundled and welcomed when unseen. **Not** one of the eight `game-*`. Disabling those eight must not disable grill. Not caveman-injected. |
| Composer `/` | Typing `/` at a token start pops **Skills then Commands**. Picking a skill → warm `/{id}` chip + strip the `/query` from the textarea. Picking `/agent` `/plan` `/outline` `/ask` switches mode. `/new` starts a new chat. **Not** a native `<select>`. |
| Composer `@` | Typing `@` pops a workspace file list (recent tabs, search, in-menu browse). Picking a **file** → mount chip + strip the `@token`. Folders in the menu **navigate**; folder **mounts** come from paperclip (or tree drop). Paths jail in SAF. |
| Mounts vs open tab | `attachedPaths` are the PRIMARY SUBJECT. When any mount exists, **omit** the active-file body from L5 (Ask: never `read_file` it either). Cap **8** mounts injected. |
| Explorer Save All | Folder-pane toolbar: Lucide **`SaveAll`**, same stroke as FilePlus / Refresh. Saves **all dirty editor tabs** (not the whole SAF tree, not clean tabs). Disabled when nothing is dirty. Ctrl+S still saves the **active** tab only. |
| Agent edit highlights | Pale **blue** = Agent **added** text. Pale **yellow** = Agent **replaced** text. Only Agent writes create marks. User typing never paints. Inserts inside a mark are **unmarked**; deletes shrink the mark. User save / discard / rewind / git discard of that file clears. Distinct from tab dirty-yellow and from `lineFlash` jump overlay. |
| Float window | Win: workspace link to **another** file in the float workbench → toast. Android without float: **N/A**. |

---

## 3. Platform differences

### Blocking `ask_user` (no `ipcMain`)

Win: `agentLoop` emits `ai:askUser`, then `await waitForAskUser(...)`; renderer `invoke('ai:answerAskUser')`.

Android: same Promise shape inside the AI runtime:

1. Model returns `ask_user` (after other tools in that step).
2. Runtime stores `resolve` keyed by `sessionId` + `askId`.
3. UI shows `AskUserCard`; Confirm calls `platform.answerAskUser(...)`.
4. Runtime resumes with the JSON tool result.
5. Abort / Stop / edit-resend / switch chat: `resolve({ cancelled: true })`. Persist answered cards and in-flight `pendingAsk`. After a **process** restart, leftover pending → cancelled read-only card. `hydrateAskCiteFromMessages` on load. Rewind last user turn must drop `askCards` / `citeCards` / `pendingAsk` for removed assistant ids.

Do **not** block the UI thread with a native modal. Do **not** `window.confirm`.

### Ask card chrome (copy Win CSS + structure)

Win source: `AskUserCard.tsx` + `global.css` `.ai-ask-*`. Do **not** invent a second look. Mixing amber `#ff8a1a` at 14% into dark chrome read as **muddy brown** — forbidden.

**Tokens (scoped on `.ai-ask-card`, not `--accent`):**

| Token | Value | Use |
|-------|--------|-----|
| `--ask` | `#ff7a00` | Selected fill, Confirm, left bar, ASK pill |
| `--ask-bright` | `#ff9a3a` | Unselected border, question index |
| `--ask-hot` | `#ffc078` | Hover Confirm, recommended label |
| `--ask-ink` | `#1a0c00` | Text on solid orange |
| `--ask-line` | `color-mix(in srgb, var(--ask) 22%, var(--border))` | Header / footer hairline |

**Layout**

1. Card: `border-radius` from `.ai-tool-block` (8px). Background = **6%** orange into `--bg-elev-2` (not 14%). Left inset bar `3px` `--ask`. Pending: `opacity: 1` (do not inherit `.ai-tool-block.is-pending { opacity: 0.85 }`). Cancelled: `opacity: 0.88; filter: saturate(0.82)`.
2. Header `.ai-ask-head`: `>_` muted orange; **title is `--fg-bright`**. Tag is a solid orange pill, `uppercase`, 10px, `--ask-ink`. Hairline under the header.
3. Body gap **16px**. Prompt **600**, 13px. More than one question → tabular index `1` `2` `3` in `--ask-bright`.
4. Chips: **outline only** until selected. Selected = solid `--ask` / `--ask-ink`. Recommended = inner pill `推荐`, **not** a dashed border. `aria-pressed`. Press: `scale(0.97)`. Keyboard: `focus-visible` 2px orange ring.
5. Other: full-width field, 8px radius, orange focus ring.
6. Footer: hairline + **right-aligned** Confirm. Disabled = muted orange wash, not 0.4 opacity. `title` = `ai.askConfirmHint` until every question is answered.

**Motion:** press feedback only. `prefers-reduced-motion: reduce` → no scale/transition.

**Do not:** ag-grid, framer-motion, painting every label orange, dashed “recommended” borders, mixing >8% orange into the card fill.

### Workspace jumps (SAF)

Win source: `workspaceLinks.ts`, TipTap click in `MarkdownArticleEditor.tsx`, `appStore.openFile` + `lineFlash`, host navigation lock.

**Do not** let a relative `ch.md` leave the app as Custom Tabs. Win bug: TipTap default `target=_blank` + host `openExternal` on **any** http URL, including the WebView origin (`http://localhost:5173/ch.md` in dev). Symptom: toast `errors.linkMissing` **and** the system browser.

| Rule | Win truth |
|------|-----------|
| TipTap `<a>` | `openOnClick: false`, **`target: null`**, `rel: null`, `autolink: false`. Insert dialog `type="text"` (`article.linkPlaceholder`). |
| Click | `preventDefault` + `stopPropagation` (also **middle-click** `auxclick`). Read `getAttribute('href')` (`hrefFromAnchor`), not `a.href`. Pass `{ fromAbs: current article path }`. |
| Resolve order | 1) next to **current file** 2) workspace / SAF **root**. First `exists` wins. Stay in the jail. Chat / cite chips: **no** `fromAbs` (already workspace-relative). |
| Fragments | `#L12` → line. `#heading` stripped (not part of the filename). |
| Fake https | `https://foo.md` and `https://docs/a.md` (hostname has no dot) are **workspace paths**. Real hosts → Custom Tabs. |
| App / WebView origin | Pathname of the WebView origin is a **mis-resolved relative link**. Treat as workspace rel. **Never** Custom Tabs. |
| Reject | `file:`, `javascript:`, `data:`, `content:` that leaves the tree, drive-letter / leading `/`, `..` out of jail. |
| Missing | Toast `errors.linkMissing`. Do **not** also open a browser. |
| Highlight | Markdown WYSIWYG: overlay `.article-line-flash-overlay`. Source / `.txt`: Monaco `.kmind-line-flash`. **Do not** put `kmind-line-flash` on TipTap DOM (redraw wipes it). |
| Agent | `open_in_editor` / cite `snippet` → same `openFile({ line })`. Matcher `articleLine.resolveJumpLine`. Prefer dirty DocumentHub text. |
| Change-card filename | User click → `openWorkspaceAbs(proposal.absPath, { line })` with `line` from `computeChangeRanges`. Jail + exists + float-other-file same as `openWorkspaceHref`. **This may steal focus** (it is a user click, not `cite_workspace`). |

### WebView navigation (rewrite `ipcSandbox`)

Win: `will-navigate` only allows **app shell** pages (`/`, `index.html`, `splash.html`, `pdf-print.html`). `setWindowOpenHandler` **denies** everything; `openExternal` only for **foreign** `http:`/`https:`; **never** the Vite / WebView origin.

Android:

- `shouldOverrideUrlLoading` / `window.open` / `target=_blank`: relative `ch.md` and the WebView’s own origin → **in-app**, not Custom Tabs.
- Allow top-level navigation only for the app shell (the Capacitor/WebView entry HTML), not `/chapter.md`.
- True `https://example.com` → existing `openExternal` / Custom Tabs.

### Composer `/` skills and `@` files (Android still missing)

Win source of truth: `src/renderer/src/ai/AiComposer.tsx` (tokens, menus, apply), `FileMountChip.tsx`, `aiStore.ts` (`composerSkillId`, `composerAttachments`, `send`), `src/main/ai/agentLoop.ts` (`readWorkspaceMention`, `expandUserMountsForApi`, `buildMountedFilesHint`, skill injection), `global.css` (`.ai-slash-menu`, `.ai-at-menu`, `.ai-skill-chip`, `.ai-mount-chip`).

This is **not** a new `toolApi`. Do not bump `TOOL_API_VERSION`. The send payload already has `skillId` and `editor.attachedPaths`.

**Do not** replace these popovers with a native Android `<select>`, AutocompleteTextView, or a full-screen picker as the product. Copy the composer-anchored list so it looks and behaves like Win. Hardware keyboard: arrows / Enter / Tab / Escape. Soft keyboard: typing `/` or `@` in the same textarea is the trigger (Win has **no** extra slash toolbar button). If `keydown` `isComposing` is true, do not treat Enter as apply/send.

#### Tokens (mutually exclusive)

Copy these parsers. Last token only; must be at start-of-string or after whitespace. Trailing query has **no spaces**.

```
slash:  /(?:^|[\s])(\/[^\s]*)$/   →  { start, query: token.slice(1).toLowerCase() }
at:     /(?:^|[\s])(@[^\s]*)$/    →  { start, query: token.slice(1).toLowerCase() }
```

| Rule | Win truth |
|------|-----------|
| `@` wins | If `atToken` is set, close slash (and mode / profile menus). |
| Open | `slashToken` without `@` → `slashOpen`. `atToken` → `atOpen`. |
| Close | Token gone; click outside `.ai-composer-shell`; Escape. |
| IME | `/` and `@` are ordinary characters. Do not require a hardware keyboard, but support one. |

#### `/` menu — what the user sees

Constants: `SLASH_SKILL_PREVIEW = 4`.

1. Popover sits **above** the composer (`position: absolute; left: 0; right: 0; bottom: calc(100% + 6px)`). Opaque `--bg-elev-4`, 12px radius, border, shadow. `role="listbox"`, `aria-label` = `ai.slashMenu`.
2. **Skills** section first (`ai.slashSkills`). Rows: `/{id}` + one-line description. Source: `platform.aiListSkills()` / `listSkills()`, keep `enabled && id !== 'caveman'` (Caveman is every-turn inject, not a slash pick). Filter `id` / `name` by `query`. Show **4**, then `ai.slashShowMore` with the remaining count. Expanding does not close the menu.
3. **Commands** always below (`ai.slashCommands`), after a hairline: `/agent` `/plan` `/outline` `/ask` `/new` (`ai.slashNewChat`). Filter by id/label. These are **not** skills.
4. Empty match → `ai.slashEmpty`.
5. Active row: `.ai-slash-item.active` (`--bg-hover`). Keyboard: ArrowUp/Down wrap; Enter (no Shift) and Tab apply; Escape closes (does **not** abort a stream). While the menu is open, Enter must **not** send the chat.

**Apply skill** (`applySlashItem` kind `skill`):

- Strip the `/token` from `draft` (`draft.slice(0, slashToken.start).trimEnd()`).
- `setComposerSkillId(id)` → warm capsule `.ai-skill-chip` showing `/{id}` with × (`ai.removeSkill`).
- **Do not** leave `/grill` (or any id) in the textarea. The user types the request **next to** the chip.
- One skill at a time; picking another replaces the chip.

**Apply command:**

- `/agent` `/plan` `/outline` `/ask` → `setAgentMode`; strip the token.
- `/new` → `newChat()` and clear draft.

Send with a skill chip and empty textarea is allowed: body becomes `Follow skill /${id} for this request.` The **user bubble** hides that boilerplate (`AiPanel`) and shows the chip. The model still receives the skill body (below).

Fallback if the user types a whole line `/grill do this` **without** using the menu: `send()` still parses `^/([A-Za-z0-9._-]+)(?:\s+…)?$` and mounts that id (not `agent|plan|outline|ask|new`). Prefer the chip path.

#### `@` menu — what the user sees

Constants: `AT_RECENT_PREVIEW = 24`, `AT_SEARCH_PREVIEW = 40`, `AT_TREE_CAP = 400`.

Same popover chrome as slash, extra class `.ai-at-menu` (`max-height: min(420px, 55vh)`, overlay scrollbar via `useOverlayScroll`).

| State | Section title | Rows |
|-------|---------------|------|
| Just typed `@` | `ai.atRecent` | Open tabs first (score +10), then flattened tree, cap 24. Last row: **Browse** (`__browse__`, `ai.atBrowse`, folder-stack icon + chevron). |
| Typed `@ch` | `ai.atMenu` | Same pool, scored, cap 40. Score: exact name/rel 100, prefix 80, name includes 60, rel includes 40; drop 0. |
| After Browse / folder | Current folder name (or `ai.atBrowse` at root) | **Up** (`ai.atUp` / `ai.atBack` at root) then children: dirs first, then files, name sort. Filter by remaining query. |

**Row UI:** icon (file / folder / browse / up) + name + optional parent hint (ellipsis if long) + chevron on folder/browse. Empty → `ai.atEmpty`. Loading `readDir` → `ai.loading`.

**Apply (`applyAtItem`) — this is easy to get wrong:**

| Kind | Click / Enter |
|------|----------------|
| `browse` | Enter browse at workspace root. **Do not** mount. |
| `up` | `atBrowseRel = parentRel`. **Do not** mount. |
| `folder` | Enter that folder (`setAtBrowseRel`). **Do not** mount. Folder chips are **not** created from `@` navigation. |
| `file` | `addComposerAttachment(rel)`; strip `@token` from draft; close menu. Rel has **no** trailing `/`. |

Folder **mounts** (trailing `/` on the chip): paperclip `pickComposerAttachments` and (on Win) FileTree drop. `@` is for **files** + **walking** folders.

**Chips:** `.ai-composer-mounts` above the textarea. Folder chip if path ends `/` (`FileMountChip` `is-dir`). × removes (`ai.removeAttachment`). Dedup by lowercase path without trailing slash. Send allowed with chips and empty text.

**Paperclip:** `platform.openContextFiles(workspace)`. Inside tree → mount rel (dir + `/`). **Outside** tree → copy into workspace `.kentucky/refs/` then mount that rel (Agent stays jailed). No workspace → `ai.attachNeedWorkspace`. Android: SAF picker must stay inside the tree **or** copy-in the same way. Never mount a raw `content://` the Agent cannot read.

**Drag (optional on tablet):** FileTree sets `application/x-kentucky-path`. Composer drop → workspace-relative path; dirs keep `/`. Absolute paths outside the tree are ignored (unlike paperclip, drop does **not** copy-in). If HTML5 DnD is broken on the WebView, skip drag; `@` + paperclip are enough.

**Jail:** every `@` / chip / paperclip path must resolve inside the SAF tree. `readDir` when the in-memory tree has no `children` yet (Win does this for browse).

#### DOM / CSS gotcha (do not “simplify”)

```
.ai-composer-shell          position: relative
  BorderBeam.ai-composer-beam
    .ai-composer            (inner; drop target)
  .ai-slash-menu            ← sibling of the beam, child of the shell
  .ai-slash-menu.ai-at-menu
```

- Menus **must not** be inside `.ai-composer` / the beam. A `position: relative` child there made an **empty box** with no items (Win changelog). Beam bleed: menus need opaque background + `isolation: isolate`.
- `z-index` on `.ai-composer-shell > .ai-slash-menu` (~30–40), above the beam.

#### What is sent (must match Win or the model ignores the chip)

| Channel | Contract |
|---------|----------|
| User bubble UI | Short `content` + skill chip + mount chips. **Not** the injected bodies. |
| `send()` payload | `skillId`; `editor.attachedPaths` (workspace-relative, `/` separators; folders end `/`). Leftover `@foo.md` in the text is a **mention** only (`mentionedPaths`); chips are the product. |
| Session message | Persist `skillId` and `attachedPaths` on that user turn (edit-last-user keeps them). |
| Skill inject (`agentLoop`) | `loadSkill(id, ['examples.md', 'reference.md'])`. CRITICAL: follow SKILL.md for the whole turn; leftover `/…` in user text is **literal**. Ask mode: cannot `read_skill`; body is still injected. Load fail → tell the user; do not invent instructions. |
| Mount inject | `buildMountedFilesHint` + `expandUserMountsForApi` (UI still shows the short text). File → body. Folder → shallow listing ≤48, skip `.git` / `node_modules`, skip root `revisions/`. Cap **8** mounts. Deixis 这个/该文件夹/this → **these** paths, not a workspace survey. |
| Active tab | If `attachedPaths.length > 0`, still name `Active file:` but **omit** its body. Ask: no `read_file` hint. Other modes: “use `read_file` if you still need the open tab.” |

`aiSend` / Android runtime must accept `skillId` and `editor.attachedPaths` the same as Win `Platform.aiSend`.

#### i18n keys to copy

`ai.slashMenu`, `ai.slashSkills`, `ai.slashCommands`, `ai.slashShowMore`, `ai.slashEmpty`, `ai.slashNewChat`, `ai.atMenu`, `ai.atRecent`, `ai.atBrowse`, `ai.atEmpty`, `ai.atUp`, `ai.atBack`, `ai.attachFiles`, `ai.removeSkill`, `ai.removeAttachment`, `ai.modeHint.agent|plan|outline|ask`.

Change-card title jump (also copy; values in §3 Applied-change): `ai.openEditedFile`, `ai.expandChange`, `ai.collapseChange`, `ai.toolTagFile`, `errors.noWorkspace`, `errors.linkMissing`, `errors.linkFloatOtherFile`.

### Explorer Save All

Win source: `src/renderer/src/workbench/Sidebar.tsx` (button), `src/renderer/src/state/appStore.ts` `saveAllDirtyTabs` / `saveTab` / `SIDEBAR_MIN_WIDTH`.

This is **not** a `toolApi` change. Do not add a native Android “save workspace” that walks the SAF tree.

**Toolbar (left → right, all Lucide outline 14px `strokeWidth: 2`):**

`FilePlus` · `FolderPlus` · `Waypoints` · `Clapperboard` · `MessagesSquare` · **`SaveAll`** · `RefreshCw`

Place Save All **after** New Dialogue and **before** Refresh. Same 26×26 hit target (`.sidebar-actions button`). `title` / `aria-label` = `explorer.saveAll`.

| Rule | Win truth |
|------|-----------|
| What it saves | Every **open editor tab** with `dirty === true`, except media preview kinds (`image` / `video` / `pdf`). |
| How | Sequential `saveTab(id)` — same path as Ctrl+S: mind-map **flush viewport**, dialogue sidecar flush, storyboard `flushStoryboardForSave`, then DocumentHub `docPatch` + `docSave`. |
| Failure | Stop the loop; keep remaining dirty tabs dirty. Toast is already `errors.saveFailed` inside `saveTab`. |
| Disabled | No workspace, **or** no dirty non-media tab. Clicking a disabled control is a no-op. |
| Not this button | Ctrl+S (active tab only). File menu Save. Agent auto-write (already on disk; yellow until **user** save — this button is that user save for every dirty tab). Saving the whole folder / git commit. |
| Width | `SIDEBAR_MIN_WIDTH` and `.sidebar { min-width }` are **212** so seven 26px buttons + 8px pad still fit. Do not leave min-width at 184 (clips Refresh). |

**Do not:** a different icon family, a filled save glyph, putting Save All on the activity bar, rewriting files that are not dirty (timestamp churn).

### Agent edit highlights (markdown)

Win source of truth:

| Layer | Path |
|-------|------|
| Diff + remap | `src/shared/agentEditSpans.ts` |
| Store | `appStore.agentChangeRanges` — `Record<pathKey, AgentEditSpan[]>` |
| WYSIWYG | `editors/agentEditHighlight.ts` `AgentEditHighlight` + `MarkdownArticleEditor.tsx` |
| Source / `.txt` | `syncMonacoAgentSpans` in `MarkdownArticleEditor` (source mode) and `MonacoTextEditor.tsx` |
| CSS | `.article-agent-added` / `.article-agent-modified` / `.monaco-agent-added` / `.monaco-agent-modified` |

This is **not** a `toolApi` change. It is **not** `lineFlash` / 链接到段落 (that overlay is accent, one line, dismisses on click). It is **not** the explorer **tab dirty yellow** (unsaved vs last user save).

#### What the user sees

| Kind | When the Agent… | Fill (copy these mixes) |
|------|-----------------|-------------------------|
| **added** | Inserts new lines / paragraphs (no matching old lines in that hunk) | `color-mix(in srgb, #6cb6ff 28%, transparent)` |
| **modified** | Replaces existing lines (delete + insert in the same hunk) | `color-mix(in srgb, #e8c44a 32%, transparent)` |

Unchanged text has no paint. Deleting a hunk with no replacement paints nothing in the new file.

**Do not** use `--accent` (jump flash / ask chrome). **Do not** restore `.monaco-agent-change` (old whole-line gray).

WYSIWYG and Markdown source must both show the same spans. `.txt` Monaco uses the same colors. Dialogue / kmind / CSV table UIs do not need this paint (store may still record spans if the Agent wrote the file).

#### Span contract (`AgentEditSpan`)

```
{ start: number; end: number; kind: 'added' | 'modified' }
```

- Offsets are **JS UTF-16** indices into the **current buffer** (`tab.content`), half-open `[start, end)`.
- Path key: `agentEditPathKey(abs)` = backslash-normalized lowercase (same as Win).
- **Replace** the old `{ startLine, endLine }` whole-line list. Android must not keep that shape.

#### When spans are created (Agent only)

`applyAiFileEdit({ absPath, content, before })`:

```
existing = agentChangeRanges[key] || []
set(key, mergeAgentWriteSpans(existing, before, content))
```

`spansFromAgentWrite(before, after)`:

1. Line-level LCS (`diffIndex` on `split('\n')`).
2. Consecutive non-`eq` ops are one hunk.
3. Insert-only hunk → those new lines are **added**.
4. Hunk with both deletes and inserts → the **new** lines are **modified**.
5. Delete-only → no span in `after`.

`mergeAgentWriteSpans`: map **existing** spans through this write with the **user** mapper (do not grow onto the Agent’s new bytes), then overlay **fresh** hunks. Fresh **wins** overlaps (a later Agent replace turns prior blue into yellow on the new text).

Hidden explorer paths still skip opening a tab; they also skip painting.

#### When spans move (user typing — never paint new)

`updateTabContent(id, next)` if that path already has spans and `tab.content !== next`:

```
mapSpansThroughUserEdit(spans, tab.content, next)
```

Mapper rules (must match Win):

| User action | Highlight |
|-------------|-----------|
| Type / paste **outside** a span | No new paint. Other spans shift with the edit. |
| Type / paste **inside** or at the edge of a span | New characters are **unmarked**. The span **splits** or stays on the surviving Agent characters only. It does **not** expand. |
| Delete characters that were marked | Span shrinks or disappears. |
| Delete unmarked characters | Spans remap around the hole. |

Implementation: line LCS, then character LCS inside replace hunks (`CHAR_CELL_CAP` 250_000). Equal lines map 1:1. Insert-only hunks map no old index onto the new bytes.

**Forbidden:** treating every user keystroke as an Agent write; re-running `spansFromAgentWrite(originalContent, content)` on user edits (that would paint the user’s own sentences).

#### When spans clear

Call `clearAgentChangeRanges(path)` (or drop that key) on:

| Event | Win |
|-------|-----|
| User save | `saveTab` (including Save All / Ctrl+S) |
| Discard unsaved | `discardTab` |
| Hub reports clean | `applyDocSnapshot` `hubClean` |
| Rewind last chat turn | `syncTabsAfterFileRewind` |
| SCM discard of that file | `ScmPane` |

Do **not** persist spans in session JSON. They live in memory with the open buffer. Process death → gone (same as dirty highlights you never saved — the **text** is on disk from the Agent write, only the **paint** is gone).

#### WYSIWYG (TipTap)

Copy `AgentEditHighlight`. Plugin state is a `DecorationSet` of `Decoration.inline` with classes `article-agent-added` / `article-agent-modified`.

- Rebuild from store: `tr.setMeta(agentEditPluginKey, { spans, markdown }).setMeta('addToHistory', false)` after `setContent` / span updates. Wait until `applyingRef` is false so offsets match the new doc.
- Between store updates: map decorations through `ReplaceStep` with **never-grow** (`mapNeverGrowRange`): insert strictly inside a deco **splits** it; insert at either edge is **not** included; deleted deco text is dropped.
- Markdown offset → PM: `pmPosForMarkdownOffset` (`posForMarkdownLine` + `normalizeSearchText` column align). Do **not** put `kmind-line-flash` on TipTap nodes.

#### Monaco (article source + other text)

`syncMonacoAgentSpans(editor, spans)`: `model.getPositionAt` + `inlineClassName` (not whole-line `className`). Stickiness `NeverGrowsWhenTypingAtEdges` is a backup; the store remap is the source of truth on `onChange` → `updateTabContent`.

#### Interaction with dirty / jump

| Signal | Meaning |
|--------|---------|
| Tab trailing yellow / name color | Unsaved vs last **user** save. Agent write already hit disk. |
| Pale yellow **in the prose** | Agent **replaced** that substring. |
| Pale blue **in the prose** | Agent **inserted** that substring. |
| Accent band `.article-line-flash-overlay` | Jump to a line (`open_in_editor` / 链接到段落). Temporary. |

Saving clears **paint** and the tab dirty mark together. Jump overlay is unrelated.

### Applied-change card title jump

Win source of truth:

| Layer | Path |
|-------|------|
| Card + split head | `src/renderer/src/ai/AiPanel.tsx` `AppliedChangeCard` / `ToolBlock` |
| First changed line | `src/renderer/src/ai/proposalDiff.ts` `computeChangeRanges` |
| Open + jail | `src/renderer/src/workbench/workspaceLinks.ts` `openWorkspaceAbs` (fallback `openWorkspaceHref`) |
| Focus + flash | `appStore.openFile(path, { line })` → `lineFlash` (same as 链接到段落 / `open_in_editor`) |
| CSS | `button.ai-tool-block-title`, `button.ai-tool-block-fold` |
| i18n | `ai.openEditedFile`, `ai.expandChange`, `ai.collapseChange` |

This is **not** a `toolApi` change. It is **not** `cite_workspace` (those chips must not steal focus). It is **not** Agent auto-open after a write (multi-file writes still must not flash the current tab). It **is** a **user click**, so it **may** change the active editor — same family as chat `[text](rel)` / backtick / TipTap underline.

**MUST:** split the card head so the filename is its own `<button>`. **NEVER:** wrap `>_` + filename + `edit` in one fold `<button>` (nested buttons are invalid; the title would not jump). **NEVER:** treat this click as cite (no focus). **NEVER:** bump `toolApi` for it.

#### Proposal record (already on the session)

```
AiProposal {
  id, path, absPath, before, after, summary,
  status: 'pending' | 'applied' | 'rejected',
  messageId?
}
```

- Render a card only when `status === 'applied'` and the proposal belongs to that assistant `messageId` (or, if `messageId` is missing, the last assistant message).
- **Title text** = basename of `path` (`path.split(/[/\\]/).pop()`), not the full abs path.
- **New vs dirty title color:** `isNew = !proposal.before` → class `is-file-new` (`#6cb6ff`); else `is-file-dirty` (`var(--dirty)`). These match **tab** marks, not Agent prose paint (`#e8c44a` mix).
- No new session-JSON fields. No new tool. `absPath` / `path` / `before` / `after` / `summary` already persist.

#### ToolBlock behavior (easy to get wrong)

`AppliedChangeCard` does **not** pass `expandable`. Summary is already `clipLines(summary)` (max 4 lines / 360 chars, then `…`). `canExpand` is therefore false → the summary body is **always** visible.

`children` is the extra `<pre class="ai-proposal-diff">` (`formatProposalDiff(..., 32)`). `interactive` is true because of children. Default `open = false` → extra diff **hidden**. Only the **`edit` tag** toggles `open`.

| Control | Action |
|---------|--------|
| Filename button | `onTitleClick` → jump. `stopPropagation`. `aria-label` / `title` = `ai.openEditedFile`. |
| Tag `edit` | `setOpen`. `aria-expanded`. `aria-label` = `ai.expandChange` / `ai.collapseChange`. |
| `>_` | Decoration. Not a hit target. |
| Summary `<pre>` | Not a jump. Not a fold. |
| Git / pending-tool `ToolBlock` | **No** `onTitleClick`. Whole `button.ai-tool-block-head` still folds. |

Hardware keyboard: filename button is a real `<button>` (Enter / Space opens). Fold button likewise. Do not use a `<span onClick>` for the title.

#### Exact i18n (copy both locales)

| Key | zh-CN | en |
|-----|-------|-----|
| `ai.openEditedFile` | 打开 {{name}} | Open {{name}} |
| `ai.expandChange` | 展开变更 | Expand change |
| `ai.collapseChange` | 折叠变更 | Collapse change |
| `ai.toolTagFile` | edit | edit |
| `errors.noWorkspace` | 请先打开工作区。 | Open a workspace first. |
| `errors.linkMissing` | 工作区里找不到这个文件。 | That file is not in the workspace. |
| `errors.linkFloatOtherFile` | 精简窗不能改开其它文件。 | The compact window cannot switch to another file. |

`openWorkspaceAbs` toasts **`errors.*`**, not `ai.*`.

#### Exact CSS (copy; do not invent)

Title / fold were added on top of existing `.ai-tool-block-*`. Copy these rules (Win `global.css`):

```
button.ai-tool-block-title {
  margin: 0; padding: 0; border: none; background: transparent;
  font: inherit; text-align: left; cursor: pointer;
}
button.ai-tool-block-title:hover {
  text-decoration: underline; text-underline-offset: 2px;
}
button.ai-tool-block-title:focus { outline: none; }
button.ai-tool-block-title:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px; border-radius: 2px;
}
button.ai-tool-block-fold {
  flex-shrink: 0; margin: 0; padding: 2px 0 2px 4px; border: none;
  background: transparent; font: inherit; color: inherit;
  cursor: pointer; border-radius: 4px;
}
button.ai-tool-block-fold:hover .ai-tool-block-tag { opacity: 0.9; color: var(--fg); }
button.ai-tool-block-fold:focus { outline: none; }
button.ai-tool-block-fold:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 1px;
}
.ai-tool-block-title.is-file-dirty { color: var(--dirty); }
.ai-tool-block-title.is-file-new { color: #6cb6ff; }
```

Keep existing `.ai-tool-block-title` flex/ellipsis (13px, weight 500). Do **not** put `--accent` on the filename. Do **not** use Agent paint mixes on the title.

#### Jail helper (same as Win `workspaceLinks.ts`)

```
isInsideWorkspace(workspace, abs):
  w = workspace.replace(\\, /).trim trailing /.toLowerCase()
  a = abs.replace(\\, /).toLowerCase()
  return a === w || a.startsWith(w + '/')

openWorkspaceAbs(absPath, { line }?):
  if no workspace → toast errors.noWorkspace (error)
  hit = absPath.trim()
  if !hit or !isInsideWorkspace → toast errors.linkMissing (error)
  if !await platform.exists(hit) → toast errors.linkMissing (error)
  if Win float and tabs[0] is a different path (slash-normalized lower)
      → toast errors.linkFloatOtherFile (info) and return
      (Android without float: skip this branch)
  openFile(hit, line >= 1 ? { line: floor(line) } : undefined)
```

`openFile` itself also no-ops a float-other-file **silently**. The toast **must** run in `openWorkspaceAbs` first, or the tap looks dead.

Fallback if `absPath` is empty: `openWorkspaceHref(rel)` with optional `:line` suffix, **no** `fromAbs` (already workspace-relative). Same jail / missing / float gates.

Reject `file:` / `content:` outside the SAF tree the same as other workspace jumps.

#### What the user sees

Each auto-applied write is a dark card under that assistant turn:

```
>_   禁唱夜-试场.md          edit
     死人的话改成叠句…
```

| Region | Role |
|--------|------|
| `>_` | Decoration only. Not a hit target. |
| **Basename** (yellow `--dirty` if the file existed; `#6cb6ff` if `!proposal.before` / new) | **Open that file.** Hover underline. `aria-label` / `title` = `ai.openEditedFile` (`打开 {{name}}`). These title colors match **tab** dirty/new, not Agent prose paint. |
| Tag `edit` (`ai.toolTagFile`) | **Fold** the extra unified diff (`formatProposalDiff`). `aria-expanded`; `aria-label` = `ai.expandChange` / `ai.collapseChange`. |
| Summary body | Still the clipped `proposal.summary`. **Not** a jump. |
| Extra (collapsed by default) | Unified-ish preview. Shown only when the fold control is open. |

**Do not** keep the old behavior where the **entire** `>_` head is one `<button>` that only toggles the diff. HTML forbids a button inside a button; more importantly the filename would not jump.

Git result cards (`GitResultCard`) and pending-tool rows **do not** get `onTitleClick`. Their whole head remains the fold/expand control.

#### Head DOM (must split)

When `onTitleClick` is set (change cards):

```
div.ai-tool-block-head
  span.ai-tool-prompt          >_
  button.ai-tool-block-title   basename  → onTitleClick
  button.ai-tool-block-fold    span.ai-tool-block-tag  edit  → setOpen
```

When `onTitleClick` is **unset** and the block is expandable (git / clipped body): keep one `button.ai-tool-block-head` wrapping prompt + title **span** + tag, as before.

#### Jump contract

`AppliedChangeCard` on title click:

1. `line = computeChangeRanges(proposal.before, proposal.after)[0]?.startLine` (1-based, in **`after`**; omit `line` if no ranges).
2. Prefer `proposal.absPath` → `openWorkspaceAbs(abs, line ? { line } : undefined)`.
3. If `absPath` is empty: `openWorkspaceHref` with workspace-relative `proposal.path`, optional `:line` suffix.

`openWorkspaceAbs` (copy this gate; do not call `openFile` raw from the card):

| Check | Fail |
|-------|------|
| No workspace | Toast `errors.noWorkspace` |
| Path empty, or not inside the SAF / workspace jail | Toast `errors.linkMissing` |
| `platform.exists` is false (deleted after the write) | Toast `errors.linkMissing` |
| Win **float** window whose only tab is a **different** file | Toast `errors.linkFloatOtherFile` (`info`). Android without float: **N/A**. |
| Else | `openFile(hit, { line })` → set `lineFlash` then activate / open the tab |

`computeChangeRanges`:

- Identical `before`/`after` → `[]` (open the file, no flash).
- Empty / new `before` → `{ startLine: 1, endLine: after.lineCount }` → jump line **1**.
- Otherwise one outer hunk: first differing line in `after` (trim equal prefix/suffix). Delete-only hunk with no new lines → flash the line that stayed (`Math.max(1, start)`).

This line helper is **not** `articleLine.resolveJumpLine` (no snippet). Do not invent a second Agent tool. Do not drive the mind-map line-pick split UI.

#### Interaction with other jumps

| Gesture | Steal editor focus? | Flash |
|---------|---------------------|-------|
| `cite_workspace` chip | **No** | No |
| Agent `open_in_editor` | **Yes** | `lineFlash` via snippet or `line` |
| Chat `[x](rel)` / `` `rel:12` `` / TipTap underline | **Yes** (user click) | If `:line` / `#L` |
| **Change-card filename** | **Yes** (user click) | First changed line in `after` |
| Agent auto-write of other files | **No** | No (prose blue/yellow spans are not this jump) |

#### Do not

- Bump `toolApi`.
- `window.confirm`.
- Jump when the user taps the summary text or only meant to fold the diff.
- Use `fromAbs` sibling resolve (the proposal path is already workspace-relative / absolute).
- Open `file://` / `content:` outside the SAF tree.
- Treat this as Accept/Reject UI.

### Host restart

Win: main/preload/tool protocol → **full quit** Electron. Android: rebuild / full process restart after bridge or `toolApi` changes. A WebView `location.reload` is not enough if the runtime still has the old tool list.

Ask waiters:

| What died | What to do |
|-----------|------------|
| WebView only, AI runtime **same JS** as UI | Waiter is gone → `settleStalePendingAsk` → cancelled read-only card |
| WebView only, AI runtime in a **native plugin** that survived | Keep `pendingAsk`, restore the live Confirm card (Win Ctrl+R) |
| Whole app process | Cancelled read-only card. Do not show Confirm. |

---

## 4. Acceptance checklist (tablet + hardware keyboard)

```
[ ] toolApi on write / ask_user / cite_workspace / open_in_editor results is 2026-08-25-a
[ ] Ask mode: no tools run; grill mounted → reply asks to switch Plan/Agent; no option card
[ ] Plan + /grill: option card appears; 2–3 questions; Confirm grey until every question has a chip or non-empty Other
[ ] Confirm → next model turn uses the answers
[ ] While pending: Send disabled; Stop cancels the card and unblocks Send
[ ] 9th ask_user in one Agent turn → tool error; model must conclude or act
[ ] foo.csv opens as editable table + source toggle
[ ] Extensionless comma table (sniff hit) opens as table; LICENSE / Makefile stay text
[ ] characters.csv and *.dialogue.csv unchanged (cast / Godot graph)
[ ] Chat [x](a.md) and `a.md:10` jump; bare a.md:10 is not a link
[ ] Article [x](sibling.md) next to the open file jumps (not only workspace-root sibling.md)
[ ] Article relative link does **not** open Custom Tabs / system browser
[ ] Insert-link field accepts chapter.md (not type=url validation)
[ ] Cite missing file still shows a chip; click toasts; active editor tab does not change
[ ] Agent open_in_editor(path, snippet) focuses the tab and highlights the sentence (same as 链接到段落)
[ ] open_in_editor snippet miss → tool error, editor does not jump to line 1
[ ] Markdown body: click underline jumps; drag-select does not
[ ] http(s) to a real site opens outside the app
[ ] Settings: disable all eight game-* skills; grill can still be enabled / mounted
[ ] Hardware keyboard: Enter in composer does not submit while ask card is pending
[ ] Ask card is bright orange (#ff7a00), not cyan accent; pending card is not faded; unselected chips are outline
[ ] Confirm sits on a footer hairline, right-aligned; disabled Confirm is a wash, not 40% opacity orange
[ ] Confirm a grill card, kill the app, reopen the same chat → orange card still shows the chosen options
[ ] Leave a card unanswered, kill the process, reopen → read-only card + askCancelled; no Confirm
[ ] If AI runtime survives WebView reload: unanswered card comes back live (Send still Stop)
[ ] looksLikePathLineCite lives in articleLine.ts, not csvTable.ts
[ ] Typing `/` in the composer opens Skills (4 + show more) then Commands; caveman is not in the list
[ ] Picking /grill strips `/grill` from the textarea and shows a warm /grill chip with ×
[ ] /agent /plan /outline /ask switch mode; /new starts a new chat
[ ] Hardware keyboard: arrows move the highlight; Enter/Tab apply; Escape closes; Enter does not send while the menu is open
[ ] Typing `@` opens recent (open tabs first) + Browse; query filters; Browse walks folders
[ ] Picking a file mounts a chip and strips `@token`; picking a folder only navigates
[ ] Paperclip mounts in-tree files/folders; out-of-tree copies into .kentucky/refs/ then mounts
[ ] Send with only a skill chip or only mounts (empty textarea) works
[ ] User bubble shows chips, not the injected SKILL.md / file bodies
[ ] With mounts, the model treats them as PRIMARY SUBJECT and does not get the active-tab body
[ ] @ path outside the SAF tree is refused (no raw content:// mount)
[ ] Explorer toolbar has Save All (SaveAll icon) between New Dialogue and Refresh; same 14px stroke as the other actions
[ ] Save All disabled with no dirty editors; with several dirty tabs, one tap clears every yellow/new mark (media previews skipped)
[ ] Save All uses saveTab (mind-map viewport / dialogue sidecars / storyboard flush), not a raw writeFile of every SAF file
[ ] Sidebar min width 212 — seven action icons still visible when the sash is at minimum
[ ] Agent inserts a new paragraph in a .md → pale blue on that paragraph (WYSIWYG and source)
[ ] Agent rewrites an existing paragraph → pale yellow on the new wording, not the whole file
[ ] User types elsewhere → no new blue/yellow
[ ] User types inside a highlighted sentence → new characters are unmarked; old Agent characters stay marked
[ ] User deletes highlighted characters → the paint shrinks; it does not stay as a full-paragraph wash
[ ] Ctrl+S / Save All / discard unsaved → all Agent paint on that file is gone
[ ] lineFlash jump overlay still uses accent, not the Agent blue/yellow
[ ] No .monaco-agent-change whole-line gray
[ ] Applied-change card: clicking the yellow/blue **filename** opens that file and flashes the first changed line
[ ] Applied-change card: clicking **edit** still only expands/collapses the extra diff (filename is not the fold control)
[ ] Change-card title is a separate `<button>` from the fold control (no nested buttons, no whole-head toggle)
[ ] Missing / out-of-jail path from the change-card title toasts `errors.linkMissing` and does not Custom Tabs
[ ] Git result cards still fold from the whole head (no filename jump)
[ ] Agent writing several files still does not steal the active tab; only the user click on a card title does
[ ] Hardware keyboard: Enter/Space on the filename button opens the file; on **edit** toggles the extra diff
[ ] Title color: existing file = tab dirty yellow (`--dirty`); new file (`!before`) = solid `#6cb6ff` — not Agent prose `#e8c44a` mix
```

---

## 5. Explicitly out of scope for this note

- Implementing Android **inside** this Win repository.
- Overwriting an existing Android repo `src/` tree from a Win-side agent unless that Android repo’s owner asked for it in **that** clone.
- Changing Godot dialogue protocol or `characters.csv` schema.
- Unlocking filesystem tools in Ask mode.
- Adding `framer-motion`, ag-grid, or `window.confirm`.
- A second Agent jump tool, or driving the mind-map “click a line in split view” picker from the model.
- Putting `looksLikePathLineCite` / `splitPathLineCite` back into `csvTable.ts`.
- Restoring `.article-prose .kmind-line-flash` (overlay replaced it).
- Replacing `/` or `@` with a native `<select>` / full-screen SAF sheet as the **only** UI (paperclip may use SAF; the composer still needs the Win popover).
- Bumping `toolApi` for these menus (existing `skillId` / `attachedPaths`).
- Putting Caveman in the `/` list, or leaving `/grill` in the textarea after pick.
- Mounting a folder from an `@` folder row (that row navigates). Folder mounts = paperclip / drop.
- Walking the whole SAF tree on Save All, or rewriting clean tabs.
- Painting user keystrokes, growing a highlight when the user inserts inside it, or keeping `{ startLine, endLine }` whole-line gray (`monaco-agent-change`).
- Using `--accent` for Agent added/modified paint, or putting `kmind-line-flash` on TipTap nodes.
- Persisting Agent edit spans in chat JSON / SAF (memory-only; save already cleared them).
- Treating the applied-change **filename** click as `cite_workspace` (no focus), or leaving the whole `>_` head as one fold button.
- Jumping from the change-card **summary body**, or wiring git cards to `openWorkspaceAbs`.
- Bumping `toolApi` for the title jump (existing `openFile` + `lineFlash`).
- Requiring `08-invariants.md` / `09-gotchas.md` / `GLOSSARY.md` to implement this delta (this file is the sole copy).
