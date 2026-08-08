# 架构（Android）

## 技术栈

| 层 | 技术 |
|----|------|
| 壳 | Capacitor 7（原生工程在 `native/`） |
| UI | React 19 + Vite 6 + TypeScript（从 win 渲染层复制后独立演进） |
| 状态 | Zustand |
| FS | `src/platform` → File System Access / 本地 DocumentHub |

## 目录

```
android/                 ← 本软件根
  package.json
  vite.config.ts
  capacitor.config.ts
  index.html
  src/                   ← React 应用
    platform/            ← createAndroidPlatform（无 Electron）
    editors/ workbench/ state/ ...
  dist/                  ← Vite 构建（cap sync 输入）
  native/                ← Capacitor Android Gradle 工程
  project-memory/
```

## Platform

- `getPlatform()` 固定 `createAndroidPlatform()`
- `newMainWindow` / `newFloatWindow` / `showItemInFolder`：**no-op**
- DocumentHub：进程内 Map；`docSave` 写盘
- 工作区：
  - **Chrome/Edge（Vite dev）：** File System Access API + IndexedDB 持久目录句柄（类 SAF）
  - **Capacitor 真机：** `Directory.Documents/kentucky-workspace`（应用文档目录；后续可换 SAF tree URI 插件）

## 与 Windows 的关系

功能对齐，**源码分家**。台词 CSV 列约定与 win 版 extras 协议 v1.1 一致；联调 Godot 请用 win 版打开同一磁盘目录。
