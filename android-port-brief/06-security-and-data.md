---
title: Security + app-private data
win: project-memory/SECURITY-AUDIT.md
---

# 06 — Security and app-private data

Win audit: `project-memory/SECURITY-AUDIT.md` (current contract = “现契约详解” + changelog §121–§122). Android has **no** Electron IPC, but the **same threat model**: a malicious workspace, a jailbroken renderer, or the Agent deleting whatever folder the user opened.

## Threat model (port this)

| Attacker | Entry | Must not happen |
|----------|-------|-----------------|
| Malicious zip / `.kyboard` | Open tree → preview / export | Read or copy files **outside** the SAF tree; fill disk with unbounded PNG/MP4 |
| Injected LLM / skill | `workspace_delete` / `propose_write` / `git_*` | Escape the tree; open **storage root / Downloads as the whole device** as workspace |
| WebView compromise | `file://`, unbounded `content://`, `javascript:` | Arbitrary FS; navigate the WebView to an external origin while plugins stay bound |
| User mistake | Pick `Download/` or shared storage root as the project | Agent recursively deletes the user’s photos/docs |

Kentucky is a **local folder editor**. Agent **may** delete everything **inside** an opened project. That is product behavior. Defense is **refusing dangerous roots**, not disabling delete.

## Workspace jail (MUST)

Port `src/main/ai/workspacePath.ts` ideas onto SAF URIs:

| Function | Android meaning |
|----------|-----------------|
| `resolveWorkspacePath` / `assertInsideWorkspace` | Every read/write/rename/delete/copy/mkdir/git path is a child of the persisted tree URI. `..`, extra `content://` authorities, and unrelated trees → error. |
| Escape wording | `Path escapes workspace: <full original path>` — **do not truncate**. Same string as Win so tests/docs match. |
| `assertNotWorkspaceRoot` | Refuse delete/rewrite of the tree root itself. |
| Symlink / `..` | Fail **closed**. If canonicalization fails, refuse. |
| `assertSafeWorkspaceRoot` | Refuse opening: entire shared storage, DCIM/Download as “the computer”, obvious system dirs. Require a **project subfolder**. Toast `errors.unsafeWorkspace`; do not enter. |
| Open vs dialog | `openFolder` / `reportWorkspace` run the unsafe-root check. A “save as” directory picker is **not** a workspace open and does not become the Agent jail. |
| Dialog allowlist | PNG/MP3 import sources and PDF/MP4 save destinations outside the tree: **this-session** picker results only. Renderer cannot invent `sourceAbs`. |
| Media URLs | Preview URLs only for paths already in the tree or allowlist. No arbitrary `file://`. |
| `openExternal` | `http:` / `https:` only (Custom Tabs). |

`openWorkspace`: **first** `reportWorkspace` (unsafe-root check), **then** `readDir` / `gitEnsure`. On failure, roll back to the previous workspace.

## WebView / Capacitor (MUST)

| Win | Android |
|-----|---------|
| `contextIsolation` + no `nodeIntegration` | WebView: **no** `file` access to the whole device; Capacitor bridge methods must re-check jail |
| Navigation lock | Block in-WebView navigation **except the app shell** (`index.html` / `/`). Relative `ch.md` must not replace the WebView. External **foreign** https → `openExternal`. |
| New window deny | No `window.open` / `target=_blank` into Custom Tabs for the WebView origin. Relative article links are in-app. |
| CSP | Keep a strict CSP. Monaco may need `'unsafe-eval'` — **intentional** (same as Win). Do not add `unsafe-inline` for everything. |
| Cleartext | Production: HTTPS APIs only. |

Do not expose a generic “run shell / run ffmpeg with user string” plugin.

## Agent / network

| Rule | Detail |
|------|--------|
| Ask | `tool_choice: none` + refuse executing any `tool_call` (`askGuard.ts`) |
| No Shell tool | Ever |
| No force git | Ever |
| Web fetch | `http`/`https` only; **reject private/link-local** (SSRF). Win `webSearch.ts` after §121. |
| Web search | Off by default (`webSearchEnabled`) |
| Skills | Copy SKILL.md into app-private dir. **Never execute** skill `scripts/` |
| Tokens | Near-full context → refuse send; never silently drop history |

## App-private `data/` (not in the novel)

Win: `dev-data/data/` (dev) or `dirname(exe)/data/` (packaged). **Never** `%APPDATA%`. Android: `getFilesDir()` / app-specific storage. **Never** put chats/keys inside the SAF tree.

| Path | Purpose |
|------|---------|
| `data/ai-chats/*.json` | Sessions. List/open **strictly filtered** by workspace id (tree URI / stable hash). |
| `data/ai-settings.json` | Public settings (theme-adjacent AI flags, webSearchEnabled, …) |
| `data/ai-profiles.json` | Multi-profile metadata |
| `data/ai-keys/<id>.bin` | Encrypted API keys |
| `data/ai-workspace-prefs.json` | Per-workspace AI panel open |
| `data/ai-skills/<id>/SKILL.md` | Global skills; bundled copy-if-missing |

Keys: Android Keystore (AES-GCM blob), equivalent of Electron `safeStorage`. Do not store plaintext keys in SharedPreferences or in the project.

Recent workspaces (≤6 cards): store **tree URI + display name + persistable permission**. If permission is lost, the card must fail clearly, not crash.

## Storyboard / PDF caps (DoS)

Port from Win:

- MP4 export ≤ 15 minutes → `EXPORT_TOO_LONG`
- PNG decode: IHDR first; edge ≤ 16384; pixels ≤ 80_000_000
- Layout `clampLayout`: cols/rows ≤ 8; gutter/label ≤ 200
- PDF HTML ≤ 2MB; PDF file ≤ 50MB
- ffmpeg/`filter_complex`: numeric clamp only

## Settings UX (not “security” but packaged-app landmines)

Win `project-memory/PACKAGED-AI-UX.md`:

1. AI settings fields are **local drafts**; persist **on blur**, not every keystroke.
2. Stream: **45s until response headers**, then **drop the timer**. Do not kill long SSE.
3. Empty Base URL → fast error, no infinite spinner.
4. Copy from Markdown WYSIWYG = plain speech, not source.

## Checklist (Android security DoD)

```
[ ] Cannot open storage root / Downloads-as-computer as workspace
[ ] Agent path outside tree → Path escapes workspace: <full>
[ ] Cannot delete the tree root
[ ] Media preview cannot load a URI the user never picked
[ ] Import PNG/MP3 cannot copy an un-picked path
[ ] WebView cannot navigate to a random site and keep FS plugins
[ ] openExternal only http(s)
[ ] Keys never appear in the novel folder or logcat
[ ] Sessions for workspace A never list in workspace B
[ ] git_push never sends --force
[ ] Ask mode never writes files
[ ] web_fetch rejects 127.0.0.1 / 10.x / 192.168.x / link-local
```
