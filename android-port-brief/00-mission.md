---
title: Mission, device, definition of done
---

# 00 — Mission

## One sentence

Ship a **tablet-native Kentucky** that opens a **local project folder**, edits the same on-disk formats as Win, and runs the **same Agent tool contract** (`toolApi: 2026-08-25-a`), without Electron.

## Device

| Constraint | Meaning |
|------------|---------|
| Tablet only | Layout for ≥ ~10″. Two-pane workbench (tree + editor, optional AI drawer). |
| No phone | Do not add a compact phone chrome, bottom-nav-only shell, or 360px breakpoints as the product. |
| Keyboard | Ctrl/Cmd shortcuts from Win (`S` save, `W` close tab, `B` sidebar, `O` open folder, `L` AI, `,` settings). Touch must still work. |
| Storage | User’s novel lives in a **user-chosen tree** (SAF). App settings/chats/keys live in **app-private** storage. |
| Offline | Writing/editing works offline. Agent needs network for the API. Web search is optional and **off by default**. |

## Product (must match Win)

Kentucky is a **local writing workbench**, not a cloud doc, not an IDE.

Must exist on Android (same files, same semantics):

1. Open folder workspace + welcome (≤6 recent cards) + explorer.
2. Tabs, dirty/new marks, in-app unsaved dialog.
3. `.md` WYSIWYG (TipTap) + source (Monaco or equivalent).
4. Other text via softened Monaco (or same editor stack).
5. `.kmind` v2 freeform board (React Flow).
6. Dialogue graph: `*.dialogue.csv` + choices/layout/meta + root `characters.csv` (Godot **v1.3**).
7. `.kyboard` storyboard + NLE + PNG/MP3/MP4 in assets (ffmpeg or equivalent export).
8. Read-only preview: workspace `.png` / `.mp4` / `.pdf`.
9. Settings: dark/light, accent, font size, zh/en, AI profiles.
10. Right AI panel: Ask / Plan / Outline / Agent; composer; **`@` file picker** and **`/` skills menu** (Win popover, not a native `<select>` — `10-update-ask-csv-links.md` §3); stop; edit last user bubble; rewind files with confirm.
11. Git SCM pane + Agent `git_*` (isomorphic-git). Auto-init **at workspace root only**. No force.
12. PDF export for `.md` (and mind-map if Win does it) without Chromium `printToPDF` — rewrite the pipeline.

## Explicitly out of scope (same as Win)

Do not build these unless the user asks:

- Phone layout
- Command palette, extensions, cloud sync
- Markdown split preview
- Article ↔ mind map auto-sync
- Agent Shell / force-push / billing UI / cloud key sync
- Brave/Tavily live search (DuckDuckGo/Bing optional search is in Win)
- Godot embedded engine / IPC to Godot
- Storyboard: multi-sequence, in-app drawing, `ffmpeg-static`, auto-put-on-V1
- jpg/webp/webm/mov workspace preview

## Win-only shells (implement equivalents, don’t clone Electron)

| Win | Android equivalent |
|-----|-------------------|
| Electron main + preload IPC | Capacitor plugins + `Platform` |
| Multi-window + DocumentHub | **P1:** single WebView, one hub in JS. **Later:** optional second activity if user asks |
| `titleBarOverlay` / AppMenuBar | Tablet app bar / overflow menu |
| `kentucky-file://` protocol | SAF / content URI / blob URL with allowlist |
| exe-next-to `data/` | App-private files dir |
| `git.exe` | isomorphic-git |
| Hidden print BrowserWindow `printToPDF` | New PDF writer (pdf.js print, or a small native/print service) |
| Bundled `ffmpeg.exe` | Bundled Android ffmpeg build **or** MediaCodec pipeline; still **no** `ffmpeg-static` npm |

## Definition of done (product)

Android is “Kentucky on tablet” when:

- A writer can open a Godot/`dialogue` folder or a novel folder via SAF, edit md/kmind/dialogue, save, and see the same bytes Win would write.
- Agent in Agent mode writes files immediately; Ask cannot call tools.
- SCM can commit; Agent git tools work without force.
- Storyboard can generate blank sheet, slice, timeline, export MP4 on device.
- No Electron APIs remain in the Android tree.

Phase-level DoD: [`07-build-plan.md`](./07-build-plan.md).
