---
title: Workbench, editors, on-disk formats
---

# 03 — Workbench and editors

Copy Win UI. Match `project-memory/product-decisions.md`. Visual target: **Cursor-like** (few hard borders, unified elevation, accent).

## Shell

| Piece | Win file | Notes |
|-------|----------|--------|
| Activity bar | `workbench/ActivityBar.tsx` | home / explorer / scm / settings / AI |
| Sidebar + tree | `Sidebar.tsx`, `FileTree.tsx` | overlay scroll, dirty/new **name color + trailing dot** |
| Editor tabs | `EditorArea.tsx` | wheel-horizontal tab strip; drag reorder; split panes |
| Welcome | `WelcomePage.tsx` | ≤6 recent workspace cards |
| Settings | `SettingsPage.tsx` | theme, accent, font, locale, AI profiles (**local draft + blur save**) |
| Dialogs | `ConfirmDialog.tsx`, `UnsavedChangesDialog.tsx` | `AnimatedDialogShell`; no system confirm |
| Context menus | `fitContextMenu.ts` | clamp to viewport |
| Theme | `theme/applyTheme.ts`, `shared/theme.ts` | dark RAL 9005 `#0A0A0A` |

Shortcuts: `workbench/useKeyboardShortcuts.ts` — Ctrl/Cmd+S/W/B/O/L/,.

Multi-workspace in one window (Win): keep if cheap; else one SAF tree at a time for P0.

## Markdown

- Files: `editors/MarkdownArticleEditor.tsx`, `MarkdownToolbar.tsx`, TipTap extensions (tables, task lists, links).
- WYSIWYG is the reading surface. **No** split preview.
- Source: Monaco (`monacoSetup.ts`, `softMonaco.ts`). Spellcheck off.
- Copy from WYSIWYG must paste as **plain speech**, not Markdown source (`PACKAGED-AI-UX.md` §4).
- Word count: non-whitespace code points (`wordCount.ts`).
- Agent `propose_text_patch` must not smash tables/`>` — Win already fixed in tools + TipTap; keep that.

## Mind map `.kmind`

- `editors/MindMapEditor.tsx`, `kmind.ts`.
- React Flow freeform; shapes rect/rounded/ellipse; assets sibling folder.
- Viewport pan/zoom is **not** dirty; **flush viewport before save**.
- Node file/line links; `linePickSession` if split exists.
- Agent: `read_kmind`, `propose_kmind_edit`, `layout_kmind` (dagre in `main/ai/kmindLayout.ts`).

## Dialogue (Godot v1.3)

**Read** `extras/godot-kentucky-dialogue/README.md` before coding.

| Disk | Role |
|------|------|
| `*.dialogue.csv` | 11-col lines; `speaker` = character **id** |
| `*.dialogue.choices.json` | Play graph; empty option text + `operable` |
| `*.dialogue.layout.json` | Kentucky-only; Godot **ignores** |
| `*.dialogue.meta.json` | `godot_scene` + `dialogue_id` |
| `characters.csv` | Root; `operable` column |

UI: `DialogueEditor.tsx` + inspector + minimap. Rename/move/delete **must** sync sidecars (`appStore`).

Empty CSV write on incomplete load is a known Win gotcha — do not regress (`gotchas.md`).

## Characters

`CharactersEditor.tsx` when opening `characters.csv`.

## Storyboard / media previews

See `05-git-storyboard-pdf.md`. Previews: `ImagePreviewEditor`, `VideoPreviewEditor`, `PdfPreviewEditor`. Not in DocumentHub.

## Explorer rules

- Hide `.git` and dotfiles.
- Hide `revisions/` at workspace root.
- YAML **is** listed (Win TEXT_EXTS includes yaml/yml).
- Dialogue sidecars visually nest under csv (`FileTree`).
- Create/rename: stem only, keep extension chip (`explorerNames.ts`).
- Reveal in Files: file → highlight; folder → open that folder.

## i18n

Copy `src/renderer/src/i18n/locales/zh-CN.json` and `en.json`. Do not ship English-only UI.

## Motion

Emil-style: short ease-out on toast/dialog; no motion on typing; honor `prefers-reduced-motion`. **No framer-motion.**
