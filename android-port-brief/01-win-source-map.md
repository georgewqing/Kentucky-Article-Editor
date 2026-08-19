---
title: Windows source map — copy vs rewrite
win_root: this repository
---

# 01 — Win source map

All paths below are relative to the **Win repo root** (this clone).

## Copy vs rewrite

| Kind | Win path | Android action |
|------|----------|----------------|
| **Copy (adapt imports)** | `src/renderer/src/**` | Primary UI. Swap `getPlatform()` impl. |
| **Copy shared contracts** | `src/shared/**`, `src/common/**` | Keep in Android `src/shared` / `src/common`. |
| **Port logic, drop Electron** | `src/main/ai/**` | New `src/ai-runtime/**` (or similar). Replace `fs` with workspace IO. |
| **Port logic, drop git.exe** | `src/main/git/gitService.ts` | isomorphic-git. Keep product rules. |
| **Port schema + math** | `src/shared/kyboardSchema.ts`, `src/main/storyboard/**` | Keep schema. Rewrite PNG/ffmpeg to Android. |
| **Port PDF HTML** | `src/main/pdf/markdownToPrintHtml.ts`, `src/renderer/src/export/**` | Keep HTML builder. Replace `printToPDF`. |
| **Do not copy** | `src/main/index.ts`, `preload/`, `ipcSandbox.ts`, `electron.vite.config.ts`, electron-builder | Electron-only. |
| **Reference only** | `project-memory/**`, `extras/godot-kentucky-dialogue/**` | Read; do not ship Electron docs as the Android app. |
| **Ship as assets** | `resources/ai-skills/**`, `build/icon.png` | Copy skills into app assets; copy-if-missing into app-private `data/ai-skills`. |

## Renderer (UI) — copy first

| Path | Role |
|------|------|
| `src/renderer/src/App.tsx` | Shell: shortcuts, dialogs, doc apply |
| `src/renderer/src/workbench/*` | Activity bar, tree, tabs, SCM, settings, welcome, dialogs |
| `src/renderer/src/editors/*` | md, kmind, dialogue, characters, storyboard, media previews |
| `src/renderer/src/ai/*` | Panel, composer, `@` menu, markdown, chips |
| `src/renderer/src/state/*` | `appStore`, `aiStore`, `settingsStore`, confirm/unsaved |
| `src/renderer/src/platform/index.ts` | **`Platform` interface — implement this** |
| `src/renderer/src/styles/global.css` | Theme tokens, workbench, storyboard, AI |
| `src/renderer/src/i18n/locales/*.json` | zh-CN / en |
| `src/renderer/src/theme/applyTheme.ts` | Dark/light + accent |
| `src/renderer/src/hooks/useOverlayScroll.ts` | Overlay scrollbars |

## Main (Win-only host) — rewrite as plugins / ai-runtime

| Path | Role | Android |
|------|------|---------|
| `src/main/ai/agentLoop.ts` | SSE loop, abort, rewind, persist abort | Port |
| `src/main/ai/tools.ts` | Writing tools + `TOOL_API_VERSION` consumer | Port |
| `src/main/ai/literaryTools.ts` | YAML memory tools | Port |
| `src/main/ai/proposalGate.ts` | `TOOL_API_VERSION`, always-auto gate | **Copy verbatim contract** |
| `src/main/ai/askGuard.ts` | Ask refuses tools | Port |
| `src/main/ai/openaiCompatClient.ts` | Streaming fetch, 45s **connect** only | Port; see PACKAGED-AI-UX |
| `src/main/ai/chatSessions.ts` | Session JSON | Port to app-private dir |
| `src/main/ai/workspacePath.ts` | Path jail | Port to SAF tree |
| `src/main/ai/skills.ts` | Skills load, caveman | Port |
| `src/main/ai/planFiles.ts` | `plans/*.plan.md` | Port |
| `src/main/ai/webSearch.ts` | DDG + Bing fallback | Port (network) |
| `src/main/documentHub.ts` | Buffer authority, dirty, agent write | JS hub in Android process |
| `src/main/ai/formats.ts` | Dialogue/characters parse | Port (shared with UI) |
| `src/main/ipcSandbox.ts` | Window↔workspace bind | Replace with “one activity ↔ one tree URI” |

## Formats on disk (workspace)

These bytes must round-trip with Win.

| File | Spec |
|------|------|
| `*.md` / `*.txt` | UTF-8 text; md via TipTap HTML round-trip |
| `*.kmind` | v2 JSON nodes+edges; sibling `*.assets/` |
| `*.dialogue.csv` | 11 columns; sidecars: `.meta.json`, `.choices.json`, `.layout.json` |
| `characters.csv` | Workspace **root**; columns `id,name,color,note,model_node,operable` |
| `*.kyboard` | Schema v1 + sibling `*.kyboard.assets/` |
| `story_state.yaml` etc. | Literary memory; created on demand |
| `revisions/` | Agent snapshots; **hidden** in explorer and `list_dir` at workspace root |
| `plans/*.plan.md` | Agent plan truth |
| `.git/` | Hidden in explorer; auto-init at **opened root only** |
| `.kentucky/refs/` | Imported out-of-tree attachments |

Godot protocol: `extras/godot-kentucky-dialogue/README.md` (v1.3).

## App-private data (not in the novel folder)

Win: `dev-data/data/` (dev) or `dirname(exe)/data/` (packaged). **Never** `%APPDATA%` / `userData` for chats/keys.

| File | Purpose |
|------|---------|
| `data/ai-chats/*.json` | Sessions; **filter by workspace path** |
| `data/ai-settings.json` | Public AI settings |
| `data/ai-profiles.json` | Multi-profile |
| `data/ai-keys/<id>.bin` | Encrypted keys (`safeStorage` on Win) |
| `data/ai-workspace-prefs.json` | Per-workspace AI panel open |
| `data/ai-skills/<id>/SKILL.md` | Global skills; bundled copy-if-missing |

Android: `getFilesDir()` / app-specific storage. Encrypt keys with Android Keystore (equivalent of `safeStorage`).

## Tests / baselines to re-run on tablet

Win lists: `project-memory/AGENT-TOOL-TEST-BASELINE.md`, `SESSION-TOOL-FEEDBACK.md`.

Minimum Android smoke (after P3+):

- Ask cannot write files.
- Agent write appears on disk immediately; explorer yellow until save.
- `propose_text_patch` does not destroy Markdown tables / `>`.
- Workspace path cannot escape SAF tree.
- Git init does not walk up to a parent repo.
- Edit last user message + confirm restores files (including yaml / hidden).
