# 踩坑与约束

## Electron

- **`window.prompt` 基本不可用** → 凡需输入用应用内表单（见 `Sidebar` 内联创建）。
- `window.confirm` 一般可用（删除确认等）；若以后也失效，改成自绘对话框。
- 原生菜单在 **main** 里 `Menu.setApplicationMenu`；语言变更通过 `Platform.setMenuLocale`。
- Monaco 必须 **本地打包**（`monacoSetup` + `monaco-editor`），CSP 会挡 CDN。

## 路径与 TypeScript

- 源码真身在 `src/renderer/src/**`，不是 `src/state/**`。
- `src/state/appStore.ts` 只是 re-export，给旧 IDE 路径消错用；**改逻辑只改 renderer 下文件**。
- `@/` → `src/renderer/src/*`；改目录时同步 `tsconfig` 与 `electron.vite.config.ts`。

## UI / 布局

- 思维导图画布易溢出盖住侧栏 → `mindmap-host` / `main-pane` 要 `overflow: hidden`，活动栏提高 `z-index`。
- Mind Elixir 默认根节点极大（约 25px 字 + `--gap` 作 padding）→ 必须用紧凑 `cssVar` + CSS 覆盖 `me-root > me-tpc`。
- 侧栏可能被用户关掉：打开工作区或点活动栏「资源管理器」时应 `setSidebarVisible(true)`。

## 产品边界

- 写作与思维导图 **不自动同步**。
- 欢迎卡片最多展示 6 个，不做真实文件夹截图。
- 渲染层只依赖 `getPlatform()`，为以后安卓平板留口。

## Windows 启动

若 PowerShell 禁止运行 `npm.ps1`：

```bat
cmd /c npm run dev
```
