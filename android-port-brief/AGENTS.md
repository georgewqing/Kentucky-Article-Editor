---
title: Operating rules for the receiving AI
---

# AGENTS.md — Android port (other machine)

You are building **KENTUCKY for Android tablets from zero**, using the Windows Electron repo as the **behavior spec** and **UI source**.

## Identity

- **Win repo (this clone):** behavior + editors + CSS + i18n + agent tool contracts.
- **Android repo (you create):** new folder, new git remote if the user wants one. Never commit Android Gradle/Capacitor into the Win tree unless the user explicitly asks.

## First actions on the other device

1. Clone/open **this** Win repo. Read `android-port-brief/README.md` → this file → `GLOSSARY.md`.
2. Create a **sibling** directory, e.g. `Kentucky-Android/`. Empty app. Own `package.json`.
3. Do **not** copy an old `Kentucky for Android` project as the base. If that folder exists on disk, ignore it unless the user says to mine snippets.
4. Copy renderer files from Win in slices (see `01-win-source-map.md`). Implement `Platform` natively.
5. Keep `08-invariants.md` and `09-gotchas.md` open while coding. Follow phases in `07-build-plan.md`.

## How to use Win code

| Do | Do not |
|----|--------|
| Copy TSX/CSS/i18n and keep names when possible | `import` from `../Kentucky/src/...` at runtime |
| Port `src/main/ai/*.ts` logic into an Android `ai-runtime` | Call Electron `ipcMain` / `BrowserWindow` |
| Match tool names, JSON result fields, `toolApi` | Invent Accept/Reject for Agent writes |
| Point comments to Win paths | Re-derive Godot v1.3 or kyboard schema from memory |

When Win and this brief conflict: **Win `project-memory/product-decisions.md` + current source win.** Then update this brief if the user wants.

## Coding rules (same as Win)

- UI → `getPlatform()` only.
- Confirmations → in-app dialogs (`askConfirm` / unsaved dialog), never `window.confirm`.
- Agent Ask = no tools (`tool_choice` none + refuse execution).
- Agent Agent-mode = auto-write disk; UI change cards are **read-only**.
- Dirty = yellow vs last user save. New file = blue.
- Do not add `framer-motion` or `ffmpeg-static`.
- Do not bump `TOOL_API_VERSION` unless tool request/response shape changes.

## After each slice

- Update Android `project-memory/` (create it) with: what shipped, what is stubbed, known gaps vs Win.
- Keep a `BOARD.md` with `P0…P7` checkboxes matching `07-build-plan.md`.
- Do not claim a feature done if IO is a stub that cannot persist.

## User communication

- Tablet + keyboard first; mention touch fallbacks when you add them.
- If a Win feature cannot exist on Android (true multi-window DocumentHub, `git.exe`, `printToPDF`), implement the **product equivalent** listed in this pack, do not silently drop it.
