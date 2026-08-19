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
| **dirty / yellow** | Buffer ≠ last **user** save (or git reload baseline). Agent writes bump `content` and keep the old baseline → yellow until Ctrl+S. |
| **new / blue** | File created in this session, not yet a “normal saved” file in the Win sense. |
| **`toolApi` / `TOOL_API_VERSION`** | Fingerprint on Agent **write** tool JSON. Current **`2026-08-14-a`**. Do not bump unless request/response **shape** changes. |
| **Ask / Plan / Outline / Agent** | Chat modes. Ask = zero tools. Agent = full tools + auto-write. |
| **Accept** | Deleted product behavior. Do not port. |
| **L5** | Compact per-turn context: active file, selection, `@`, characters summary, Git L5, optional Design L5. |
| **Caveman** | Bundled skill; if enabled, injected **every** turn; do not `read_skill` it as optional. |
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
