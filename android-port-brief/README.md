---
title: Kentucky → Android tablet port brief
audience: AI agents and humans starting a greenfield Android app
win_version: 0.3.2
toolApi: 2026-08-14-a
win_repo: https://github.com/CCFOX12/Kentucky-Article-Editor
created: 2026-08-19
---

# Android tablet port brief

This folder is the **handoff pack** for building **KENTUCKY for Android tablets from zero**.

The Windows app in this git repo is the **only source of truth**. Treat any older Android tree on disk as **untrusted scrap**. Do not resume it. Do not `import` it. Do not assume Capacitor, Gradle, or `src/ai-runtime` already exist.

| | |
|--|--|
| **Product** | Local writing workbench (Markdown, mind maps, Godot-linked dialogue, storyboard, AI agent, Git) |
| **Win** | Electron + React 19 + Zustand in **this** repo |
| **Android** | **New independent project** (own folder, own git). Same product rules. Different IO. |
| **Device** | Large **tablet** + prefer hardware keyboard. **No phone layout.** |
| **UI language** | `zh-CN` + `en` |

## Read order (AI: do this, in order)

1. **This file** (mission + hard rules).
2. [`AGENTS.md`](./AGENTS.md) — how to work on the other machine.
3. [`GLOSSARY.md`](./GLOSSARY.md) — SAF, dirty, toolApi, persistDoc, greenfield.
4. [`00-mission.md`](./00-mission.md) — what “done” means; tablet constraints.
5. [`01-win-source-map.md`](./01-win-source-map.md) — what to copy vs rewrite.
6. [`02-platform-io.md`](./02-platform-io.md) — `Platform` contract + SAF / no Electron.
7. Then by feature: [`03-workbench-editors.md`](./03-workbench-editors.md), [`04-agent-tools.md`](./04-agent-tools.md), [`05-git-storyboard-pdf.md`](./05-git-storyboard-pdf.md).
8. [`06-security-and-data.md`](./06-security-and-data.md) — sandbox + app-private `data/`.
9. [`07-build-plan.md`](./07-build-plan.md) — phases P0–P7 + definition of done.
10. [`08-invariants.md`](./08-invariants.md) — MUST / NEVER (keep open while coding).
11. [`09-gotchas.md`](./09-gotchas.md) — Win bugs that will recur if “simplified”.

Machine index: [`INDEX.yaml`](./INDEX.yaml).

Win deep dives live under [`../project-memory/`](../project-memory/README.md). **Do not** treat `changelog.md` as current contract.

## Hard rules (non-negotiable)

1. **Greenfield Android.** Ignore prior Android port progress. Start empty.
2. **No runtime import** from this Electron tree. Copy files by hand; rewrite IO.
3. **Renderer never talks to disk.** All FS/Git/AI/media go through a `Platform` (or equivalent) implemented in native/plugin code.
4. **Agent always writes to disk.** No Accept. Yellow ● = unsaved vs last explicit save. Ask mode = **no tools**.
5. **Do not bump `TOOL_API_VERSION`** unless the tool JSON protocol changes. Current: `2026-08-14-a`.
6. **No** `framer-motion`. **No** `ffmpeg-static`. **No** `window.prompt` / `window.confirm`. **No** arbitrary Shell. **No** git `--force`.
7. **No phone UI.** Tablet chrome. Hardware keyboard shortcuts where Win has Ctrl+*.
8. Product tables in Win `project-memory/product-decisions.md` are locked. Do not silently overturn them.

## Suggested Android stack (default)

Reuse the **React renderer** so editors/CSS/i18n stay aligned:

| Layer | Choice |
|-------|--------|
| Shell | **Capacitor** (or equivalent WebView host). Not Electron. |
| UI | Copy `src/renderer/src/**` (adapt, do not rewrite from scratch) |
| State | Zustand stores (copy, then swap Platform) |
| Agent | Port `src/main/ai/**` to a JS/TS runtime **inside the app** (no Node `fs`, no `ipcMain`) |
| Git | **isomorphic-git** (or similar). **Never** `git.exe` |
| Workspace | Android **SAF tree URI** = workspace root |
| App data | App-private storage ≈ Win `data/` (chats, keys, skills). **Not** inside the novel folder |

React Native (full native UI) is allowed only if the user explicitly chooses it; it means rewriting every editor. Default is **WebView + copied renderer**.

## Win version snapshot

| Key | Value |
|-----|--------|
| Package | `0.3.2` |
| `toolApi` | `2026-08-14-a` (`src/main/ai/proposalGate.ts`) |
| Git remote | https://github.com/CCFOX12/Kentucky-Article-Editor |
| Godot dialogue protocol | **v1.3** (`extras/godot-kentucky-dialogue/README.md`) |
| Kyboard schema | v1, additive only (`src/shared/kyboardSchema.ts`) |

## Files in this folder

| File | Role |
|------|------|
| [README.md](./README.md) | Entry, hard rules, stack, Win snapshot |
| [AGENTS.md](./AGENTS.md) | Receiving-AI operating rules |
| [GLOSSARY.md](./GLOSSARY.md) | Terms |
| [INDEX.yaml](./INDEX.yaml) | Machine index |
| [00-mission.md](./00-mission.md) | Tablet mission + product DoD |
| [01-win-source-map.md](./01-win-source-map.md) | Copy vs rewrite + on-disk formats |
| [02-platform-io.md](./02-platform-io.md) | `Platform` + SAF jail |
| [03-workbench-editors.md](./03-workbench-editors.md) | Shell, md, kmind, dialogue |
| [04-agent-tools.md](./04-agent-tools.md) | Agent loop, tools, chat UX |
| [05-git-storyboard-pdf.md](./05-git-storyboard-pdf.md) | isomorphic-git, kyboard, PDF |
| [06-security-and-data.md](./06-security-and-data.md) | Sandbox + app-private `data/` |
| [07-build-plan.md](./07-build-plan.md) | P0–P7 + copy order |
| [08-invariants.md](./08-invariants.md) | MUST / NEVER |
| [09-gotchas.md](./09-gotchas.md) | Win pitfalls that will recur |

## What this pack is not

- Not a dump of Win changelog history.
- Not permission to ship a subset and call it Kentucky.
- Not a phone app.
- Not instructions to merge Android into this Electron repo.
- Not a resume of any existing Capacitor tree.
