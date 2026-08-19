---
title: Git, storyboard, PDF export
win_git: project-memory/AGENT-GIT.md
win_storyboard: project-memory/STORYBOARD.md
---

# 05 — Git, storyboard, PDF

Read Win `project-memory/AGENT-GIT.md` and `STORYBOARD.md` as the **behavior spec**. This file is the Android rewrite map. Do not `import` Win `src/main/git` or `src/main/storyboard` at runtime.

## Git (isomorphic-git)

### Product (must match Win)

| Item | Rule |
|------|------|
| Auto-init | On open/switch workspace: `ensureWorkspaceGit` looks **only** at `<workspaceRoot>/.git`. No walk-up. Missing → `git init` + default `.gitignore` + `kentucky.autoInit=true`. |
| Invisible | `.git` and dotfiles hidden in explorer and Agent `list_dir`. Disk still has a normal repo. |
| SCM pane | status / diff / stage / unstage / commit / discard / pull / push / remotes. Manual init if ensure fails. |
| Agent tools | Immediate. No Confirm. Highlight card + Toast. **Never** `--force` / `--force-with-lease` / arbitrary argv / Shell. |
| Empty commit | Clear `Nothing to commit` / `Nothing staged` — not a generic command-failed string. |
| Foreign `.git` | `.git` **file** (worktree / submodule pointer) → `foreign`. Do not reuse parent. Do not `git init` over it. |
| Nested folder | Opening a subfolder of an existing git repo **nests** a new `.git` at that opened root. Do not walk up. |

Default `.gitignore` (init / ensure). If a file already exists, **idempotently** append `.kentucky/` only:

```
# Kentucky defaults
.DS_Store
Thumbs.db
desktop.ini
node_modules/
*.tmp
*.temp
~$*
.kentucky/
```

### Tool contract (names + modes)

Copy descriptions/WHEN from Win `src/main/ai/tools.ts`. Write results include `"toolApi": "2026-08-14-a"`. Write ops emit `ai:gitOp`.

| Tool | Modes | Notes |
|------|-------|-------|
| `git_status` | Plan / Outline / Agent | ensure repo; branch/remotes/files; may set `repoCreated` / `gitignoreUpdated`. **Not** pure read-only. |
| `git_diff` | same | `path` + `staged?`. Missing path/dir → error. Escape → `Path escapes workspace: <full path>` (do not truncate). `staged=true` does not dump untracked full text. |
| `git_log` | same | `maxCount?` ≤ 50; oneline |
| `git_pull` | same | No remote → clear error; optional `ffOnly` |
| `git_push` | same | Never force. Optional `setUpstream` + `branch`. Local missing remote → bare first; may return `bareCreated`. |
| `git_add` | **Agent only** | `all=true` or `paths[]` |
| `git_commit` | **Agent only** | `message` required |
| `git_remote_add` | **Agent only** | `name` + `url`; local missing → bare |
| `git_remote_remove` | **Agent only** | `name` |

Recipe: `git_status` → (`git_diff`) → `git_add` → `git_commit` → `git_push`. Split commits: each batch `git_add(paths)` then immediate `git_commit`.

### Remote URLs (`isValidGitRemoteUrl`)

Allow: `https?://`, `git://`, `ssh://`, `file://`, `user@host:path`, drive/UNC (Win), `/` `./` `../`, `*.git` relative. **Allow spaces** (do not reject on `/\s/`).

**Android P0:** HTTPS clone/push/pull. SSH keys / `file://` to another SAF tree are later. Local bare remotes **inside** the current tree are OK if isomorphic-git can write them.

### Bare local remotes

- Path missing → mkdir parents + `git init --bare`.
- Already a git dir (`HEAD`/`objects`) → reuse.
- Exists but not git → **error, do not overwrite**.
- Refuse storage root / system dirs (`assertSafeExternalGitPath` equivalent).

### `Platform` git methods

Implement every method in `src/renderer/src/platform/index.ts` (`gitProbe` … `gitDiscard`).

| Win | Android |
|-----|---------|
| `gitProbe` / `gitSetPath` | Bundled isomorphic-git → `ok: true`, version string like `isomorphic-git x.y`. **Hide or no-op** “path to git.exe”. Never exec an arbitrary binary. |
| `gitFindRoot` | Only `<root>/.git` **directory**. Null if file/symlink/missing. |
| LightningFS / custom `fs` | Adapter over SAF `DocumentFile` **or** a mirrored cache. Must still jail to the tree. |

### Agent context

Every Agent turn: **Git (L5)** snapshot of **this** root (branch/remotes/dirty) + `GIT_AGENT_PLAYBOOK` from Win `proposalGate.ts`. Optional workspace file `agent-GIT环境说明.md` / `AGENT-GIT-ENV.md` describes **this** remote only. Never reuse another workspace’s remotes from chat memory.

### HTTP on Android

Push/pull needs network + auth. Store credentials in Android Keystore / EncryptedSharedPreferences, **not** in the novel folder. Do not log tokens.

---

## Storyboard (`.kyboard`)

Win truth: `project-memory/STORYBOARD.md` + `src/shared/kyboardSchema.ts`.

**Agent does not participate.** No storyboard tools.

### Disk

```
storyboard.kyboard                 JSON, schema version 1 (additive only)
storyboard.kyboard.assets/         sibling folder
  blank_3x2.png
  blank_3x2_01.png                 sliced 1920×1080 panels
  bgm_….mp3
  export_….mp4
```

Panel pixels: **1920×1080**. Sheet formula:

```
width  = cols * 1920 + (cols + 1) * gutterPx
height = rows * (labelBandPx + 1080) + (rows + 1) * gutterPx
```

Factory: `gutterPx=24`, `labelBandPx=48`. Example 6 panels `3×2` → **5856×2328**. Slice **content rect only** (`panelContentRect`), not the label band.

Limits (must port): `MAX_SHEET_COLS/ROWS = 8`; PNG edge ≤ 16384, pixels ≤ 80e6; MP4 duration ≤ **15 minutes** (`MAX_EXPORT_DURATION_SEC`); ffmpeg filter numbers clamped (never stringify JSON into `filter_complex`).

### Product rules

| Do | Do not |
|----|--------|
| External drawing only; Kentucky generates blank sheets | In-app drawing |
| Import = slice only; user **drags** thumbs onto V1 | Auto-put-on-V1 / one-click lay track |
| Camera: stored keys ≤ 6; diamonds = `storedCameraKeys` | Inject identity @0/@1; draw default bookend diamonds |
| Playback/export = `cameraAtClip` | Export using a handwritten from→to lerp when keys exist |
| A1–A4, one MP3 per track | Extra tracks / wav |
| After reorder: `repackVideoClipStartsMut` | `packVideoClipsMut` after reorder |
| **`persistDoc`**: write disk **and** update `tab.content` | Only `writeFile` (Ctrl+S will clobber timeline with open-time buffer) |
| Flush before Save / close | Persist on every drag pixel; persist on mouse-up |

Copy UI: `src/renderer/src/editors/StoryboardEditor.tsx` + `storyboard-nle.css` / `storyboard-pages.css`. Copy math from `src/shared/kyboardSchema.ts` **verbatim**.

### Native rewrite (Win `src/main/storyboard/`)

| Win | Android |
|-----|---------|
| `pngUtil.ts` (pngjs) | Same JS PNG or Android `Bitmap` — same pixels (bg, safety frame, `#n` labels) |
| `storyboard:generateBlank` | SAF write inside workspace |
| `importSheet` | Source must be in workspace **or** this-session read allowlist (SAF picker) |
| `sliceSheet` | `forceScale?` after confirm |
| `exportMp4` | Bundled Android ffmpeg **or** MediaCodec. **No** `ffmpeg-static`. Missing binary → `FFMPEG_NOT_FOUND` i18n Toast |
| Export target outside tree | Write `*.kyboard.assets/export_*.mp4` first, then copy if the picker allowlisted a dest |
| Progress | `onStoryboardExportProgress({ pct })` |

Touch: blade / scrub / monitor Ken Burns must work with finger **and** hardware keyboard (`I` / `Alt+I` where possible).

---

## PDF

Win UI: `src/renderer/src/export/exportPdf.ts` + `markdownToPrintHtml.ts`. Win host: hidden BrowserWindow `printToPDF` (`src/main/pdf/printHtmlToPdf.ts`). **Android cannot use that.**

Keep:

- HTML builder for `.md` (A4 portrait light print CSS).
- `.kmind` → one landscape page bitmap (Win captures the board).
- Caps: HTML ≤ **2MB**, PDF ≤ **50MB**.
- Dest default: same folder `basename.pdf`. Overwrite OK for Agent tool.
- Agent `export_workspace_pdf`: workspace `.md` only; no dialog; prefer unsaved buffer; **not** dialogue/storyboard/plain `.txt`; Agent does not export kmind.

Replace `Platform.exportPdf({ destAbs, html, landscape })` with one of:

1. WebView print → PDF (if the WebView API can write a file you then copy into SAF), or
2. A small native PDF writer that lays out the same HTML, or
3. pdf-lib / similar after converting HTML.

Preview of workspace `.pdf` files: pdf.js (Win already). Fetch via allowlisted content URI → `ArrayBuffer`. No annotate/search/print chrome.

Workspace `.png` / `.mp4` preview: canvas zoom/pan; native `<video>` with Range/206 or equivalent. **Not** in DocumentHub (`isMediaPreviewKind`).
