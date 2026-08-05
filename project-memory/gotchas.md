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
- Mind Elixir 默认根节点极大 — **已废弃该引擎**；现用 React Flow 自由白板，节点尺寸由 width/height 控制。
- `.kmind` **仅 v2**；旧 v1 树文件打开会 toast 并给空白画布。
- MiniMap **尺寸必须用 `style={{ width, height }}`**，勿只用 CSS 强制宽高（SVG viewBox 按 style 算，否则会裁切）。
- 拖线落空菜单：`onConnectEnd` 里用 `setTimeout(0)` 打开，并用 `pointerdown` 关闭，避免松开鼠标立刻关掉菜单。
- Background 点阵颜色勿用近透明的 `--border`，否则看起来像「点阵没了」。
- 拉远后 `connectionRadius` 按 `1/zoom` 放大；官方 MiniMap **不画边**，需自绘。
- 手柄宽高勿写死 `!important`，否则无法按缩放补偿命中区域。
- 自绘小地图节点不要加 `react-flow__minimap-node` class，否则会被 RF 默认浅色 `fill` 盖成全白。
- 边必须持久化 `sourceHandle`/`targetHandle`，否则重载后 smoothstep 会并到同一点。
- TipTap + `tiptap-markdown`：用 `storage.markdown.getMarkdown()` 写回；切模式时注意 `applyingRef` 防回环。
- 链接对话框用应用内表单，**勿用** `window.prompt`。
- 字数用 CJK 友好计数（汉字计字 + 英文按词），见 `wordCount.ts`。
- TipTap React 19：`useEditor({ immediatelyRender: false })`。
- 工具栏 `isActive` 必须用 `useEditorState` 订阅，否则开关格式后高亮不刷新（要打字才更新）。
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
