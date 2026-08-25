---
title: Platform + IO — replace Electron IPC
win_interface: src/renderer/src/platform/index.ts
---

# 02 — Platform and IO

Win renderer **must not** `require('fs')`. Android WebView **must not** use unrestricted filesystem APIs. Both talk to one **`Platform`**.

Copy the TypeScript interface from `src/renderer/src/platform/index.ts` (`export interface Platform`). Implement every method. Stubbing is allowed only in early phases if the UI degrades explicitly (Toast “not yet”).

## Workspace = SAF tree

| Win | Android |
|-----|---------|
| `dialog:openDirectory` → absolute path | `ACTION_OPEN_DOCUMENT_TREE` → tree URI; persist URI permission |
| Path `D:\novel\ch1.md` | Display path + canonical `DocumentFile` URI; internally keep a **stable string id** |
| `reportWorkspace(path)` + `assertSafeWorkspaceRoot` | Reject opening the entire shared storage root / `Download` as “the computer”; require a **project subfolder** |
| `ipcSandbox` binds window → one workspace | One main activity → one tree URI |

**Jail:** every read/write/rename/delete/copy/mkdir must resolve inside the tree. Symlinks / `..` / foreign URIs → error string `Path escapes workspace: <full>` (same wording as Win tools).

## `Platform` groups

### Files

`openFolder`, `readDir`, `readFile`, `writeFile`, `mkdir`, `rename`, `delete`, `exists`, `isDirectory`, `copyFile`, `openImage(s)`, `openContextFiles`, path helpers (`joinPath`, `basename`, `dirname`, `extname`, `relativeTo`).

Composer **paperclip** uses `openContextFiles`. In-tree → mount rel; out-of-tree → `copyFile` into `.kentucky/refs/` then mount (same as Win `aiStore.pickComposerAttachments`). Composer **`@` browse** uses in-memory `fileTree` first, then `readDir` when a folder has no `children` yet. Jail every path. See `10-update-ask-csv-links.md` §3 Composer.

`readDir` must **hide** the same names as Win `src/main/index.ts` `shouldInclude`:

- names starting with `.`
- `node_modules`, `dist`, `out`
- workspace-root folder `revisions`
- files whose extension is not in the include set (Win TEXT_EXTS: md/txt/kmind/kyboard/csv/json/ts/tsx/js/jsx/css/html/**yaml/yml**/png/mp4/pdf)

Explorer display names: `src/renderer/src/workbench/explorerNames.ts`. Hidden-path helper: `src/renderer/src/workbench/explorerHidden.ts`.

### Media

Win: `toMediaUrl` → `kentucky-file://local/?path=` with Range/206 for mp3/mp4/pdf.

Android: content URI or copied cache file. **Allowlist** the same way (only paths the workspace IO opened). Do not load arbitrary `file://`.

`showItemInFolder`: open the system Files UI on that document if possible; otherwise Toast.

`openExternal`: Custom Tabs / external browser for `https://` only.

### Documents (buffer hub)

Win `documentHub.ts`: `docOpen/Subscribe/Patch/Save/Discard/ReloadFromDisk/Evict`, `onDocApply`, `docApplyAgentWrite`, `docApplyRewindWrite`.

Android: one in-process hub (JS is enough for a single WebView).

Rules:

- `dirty` vs `originalContent` (last user save / git reload).
- Agent write: disk already updated → hub content = after, **keep** original baseline, mark dirty (yellow).
- Media kinds `image | video | pdf` **do not** enter the hub (`isMediaPreviewKind`).
- Rewind last chat turn: restore `before` or delete new files; close hidden tabs — Win `src/shared/rewindFiles.ts` + `appStore.syncTabsAfterFileRewind`.

### Dialogs / windows

`newMainWindow` / `newFloatWindow`: **defer** (single-task tablet). Keep APIs returning “unsupported” until a later phase. Unsaved close still uses in-app dialogs.

`confirmWindowClose` / `onWindowCloseRequest`: map to Activity `onBackPressed` / last-tab close.

### Git / AI / Storyboard / PDF

See `05-git-storyboard-pdf.md` and `04-agent-tools.md`. Same method names as Win `Platform`.

## Encoding

Always UTF-8 for text. CSV dialogue is RFC 4180 (Win `formats.ts` / `dialogueCsv.ts`).

## Permissions (Android)

- SAF tree (persistable).
- Network (Agent + optional search).
- Optional: notifications none required for MVP.
- Do **not** request all-files access (`MANAGE_EXTERNAL_STORAGE`) as the primary workspace mechanism.

## Path display

UI may show a friendly name (`tree.displayName`). Agent tools and git paths should use **workspace-relative** POSIX paths (`chapter.md`, `design/gdd.md`) so sessions and Git stay portable with Win.
