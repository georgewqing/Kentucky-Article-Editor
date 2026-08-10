# KENTUCKY (Android)

**English:** Tablet build of KENTUCKY (Capacitor + React + TypeScript), **v0.2.0**. Targets **large-screen Android tablets with an external keyboard**. Feature-aligned with the Windows app (`../win/` 0.2.0): Markdown writing, `.kmind` boards, dialogue graph protocol **v1.3**, characters, multi-workspace workbench, and AI agent — as a **separate software root** (no shared npm package with `win/`).

**中文：** KENTUCKY 安卓平板版（Capacitor + React + TypeScript），**v0.2.0**。面向**带外接键盘的大屏安卓平板**。功能对齐 Windows 版 0.2.0：Markdown 写作、`.kmind` 导图、台词图编辑器协议 **v1.3**、角色表、多工作区工作台、AI Agent。但是**独立软件根**，不与 `win/` 混用源码树。

**License:** [MIT](./LICENSE)

## Scope / 范围

- Large tablet UI (min width ~768px); **no phone layout**
- Keyboard shortcuts (`Ctrl+S` / `Ctrl+O` / `Ctrl+L`, etc.)
- Single window only — multi-window stays on Windows (`../win/`)
- Native folder pick via **SAF** (`KentuckySaf` plugin); Chrome/Edge Vite uses File System Access
- Godot same-path hot-reload is **desktop-primary** (`../win/`); Android edits the same on-disk formats

## Quick start / 快速开始

```bash
cd android
npm install
npm run dev
```

Open the Vite URL in **Chrome or Edge** (File System Access API for “Open Folder”). Prefer a wide window or tablet + keyboard.

### Capacitor Android project

```bash
npm run build
npm run cap:sync
npm run cap:open
```

Native Gradle project lives in `native/` (see `capacitor.config.ts`). On device, **Open Folder** uses Storage Access Framework (persistable tree URI).

## Docs

- [`project-memory/`](./project-memory/README.md) — decisions & how to run
- Dialogue CSV format: [`../win/extras/godot-kentucky-dialogue/README.md`](../win/extras/godot-kentucky-dialogue/README.md) (protocol **v1.3**)
