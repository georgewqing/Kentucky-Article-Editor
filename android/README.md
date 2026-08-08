# KENTUCKY (Android)

**English:** Tablet build of KENTUCKY (Capacitor + React + TypeScript). Targets **large-screen Android tablets with an external keyboard**. Same writing / mind-map / dialogue CSV features as the Windows app, as a **separate software root** (no shared package with `win/`).

**中文：** KENTUCKY 安卓平板版（Capacitor + React + TypeScript）。面向**带外接键盘的大屏安卓平板**。功能对齐 Windows 版写作 / 导图 / 台词，但是**独立软件根**，不与 `win/` 混用源码树。

**License:** [MIT](./LICENSE)

## Scope / 范围

- Large tablet UI (min width ~768px); **no phone layout**
- Keyboard shortcuts (Ctrl+S / Ctrl+O, etc.)
- Single window only — multi-window stays on Windows (`../win/`)
- Godot same-path hot-reload is **desktop-primary** (`../win/`)

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
npx cap add android
npx cap sync android
npx cap open android
```

Native Gradle project lives in `native/` (see `capacitor.config.ts`). On device, folder access uses the Platform implementation (Chrome FSA when available; see `project-memory/` for SAF / Documents notes).

## Docs

- [`project-memory/`](./project-memory/README.md) — decisions & how to run
- Dialogue CSV format matches the Windows protocol (see `../win/extras/godot-kentucky-dialogue/` when both roots are in the same Cursor workspace)
