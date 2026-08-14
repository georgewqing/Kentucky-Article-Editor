# 架构（Android）

> **扫描**：先读 [`README.md`](./README.md)「现状」+ [`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md) 能力矩阵。本文是 Android 技术结构。  
> **当前**：Android **0.2.0**（功能未齐）· 目标对齐 Win **0.3.0** 全部产品功能 · `toolApi: 2026-08-14-a`。

## 技术栈

| 层 | 技术 |
|----|------|
| 壳 | Capacitor 7（原生工程在 `native/`） |
| UI | React 19 + Vite 6 + TypeScript（从 win 渲染层覆盖后独立演进） |
| 状态 | Zustand（`appStore` / `settingsStore` / `aiStore`） |
| 编辑器 | TipTap、Monaco、@xyflow（mind map + dialogue graph） |
| AI | `src/ai-runtime/`（纯 TS，无 Electron）；经 Platform `ai*` 暴露 |
| FS | `src/platform` → FSA / **SAF** / Cap Documents 降级；进程内 DocumentHub |

## 目录

```
android/                 ← 本软件根
  package.json           ← kentucky-android@0.2.0
  vite.config.ts
  capacitor.config.ts
  index.html
  src/                   ← React 应用
    platform/            ← createAndroidPlatform
    plugins/kentuckySaf.ts
    ai-runtime/          ← AI（由 win main/ai 改编）
    ai/ editors/ workbench/ state/ ...
  dist/                  ← Vite 构建（cap sync 输入）
  native/                ← Capacitor Android Gradle 工程
    .../KentuckySafPlugin.java
  project-memory/
```

## Platform

- `getPlatform()` 固定 `createAndroidPlatform()`
- 接口与 Win 渲染层 `Platform` 对齐（含全部 `ai*`、`openContextFiles`）
- `newMainWindow` / `newFloatWindow` / `showItemInFolder`：**no-op**
- DocumentHub：进程内 Map；`docSave` 写盘
- 工作区：
  - **Chrome/Edge（Vite）：** File System Access + IndexedDB 目录句柄
  - **Capacitor 真机：** `KentuckySaf` → `ACTION_OPEN_DOCUMENT_TREE` + 持久 URI
  - 降级：`Directory.Documents/kentucky-workspace`
- App-body AI 数据：`Directory.Data/kentucky-data/`（或浏览器 IndexedDB 镜像），结构对齐 Win `data/`

## 触控板滚轮桥

- Android `MainActivity` 在 WebView 之前截获指针设备 `ACTION_SCROLL`，用
  `rawX/rawY` 计算 WebView 内归一化坐标，并发送 `kentucky:native-wheel`。
- `useSpatialWheelScroll` 在命中位置重建 DOM `WheelEvent`；MD / AI / Sidebar 走专用
  空间路由，其他普通面板寻找指针下最近的可滚动 overflow ancestor；React Flow
  继续使用既有画布平移/缩放处理。
- 触屏手势不经过此桥。修改该桥后必须重新编译并安装原生应用。

## Android 平板壳与布局

- `MainActivity` 使用 edge-to-edge 透明系统栏，`activity_main` 根布局以黑色填充；
  `WindowInsetsCompat` 把状态栏、显示缺口、导航栏和 IME inset 转为 WebView layout
  margins。不能改用根 `CoordinatorLayout` padding，否则 `match_parent` WebView
  仍可能延伸到状态栏内。
- Android 不渲染 Win 风格 `AppMenuBar`；系统返回键依次关闭对话框、AI 历史/面板、
  设置/工作区层级，根页面调用 `App.minimizeApp()`。
- `settingsStore.uiScale` 写入 `--ui-scale`，只驱动 ActivityBar / Sidebar / tabs /
  AI / Settings / dialogs 等 chrome；编辑器 `fontSize` 保持独立，禁止用根
  `transform` / `zoom` 破坏 Monaco、React Flow 和触控板坐标。
- 宽度 `<= 1100px` 时 AI pane 脱离三栏布局成为右侧覆盖抽屉；编辑器分屏自动关闭。
- 标签栏 / 分屏对齐 Win §160–§161（详见下节）。触屏不要给 `.tab` 常驻 `touch-action: none`（会挡标签栏横滑）；只在 `.tab-bar-scroll.is-reordering` 时加上。
- `(pointer: coarse)` 放大触屏命中区；外接触控板的 wheel / secondary click 仍走
  专用桥与 hooks。

## 标签栏 / 分屏

Win 真源：[`../win/project-memory/architecture.md`](../win/project-memory/architecture.md)「标签栏 / 分屏」。Android 差异：

- **保留** `compactLayout`（`max-width: 1100px`）时强制 `disableSplit`，「分屏编辑」按钮 disabled + `editor.splitNeedsWideScreen`。
- 路由仍无 storyboard / image / video / pdf 预览（BOARD A3–A6）；`EditorPane` 不要从 Win 整文件覆盖进来。
- `fitContextMenu.ts` 已拷到 `android/src/workbench/`（此栏菜单用）。FileTree 仍可本地定位；新浮层优先 portal + clamp。
- 「此栏」必须是 `.pane-file-picker-btn` + `createPortal` `.ctx-menu`，禁止原生 `<select>`。
- 改序：左/右键拖过 5px；右键 `preventDefault` + 对该 tab `setPointerCapture` + 窗口 `mousemove` 兜底；不要 `lostpointercapture` 结束；不要 HTML5 drag；不要右键指定分屏文件。
- 关闭分屏只在 `.tab-bar-actions`。

文件：`workbench/EditorArea.tsx` · `workbench/fitContextMenu.ts` · `state/appStore.ts` `reorderTabs` · `styles/global.css` · i18n `editor.paneFile` / `paneFileTitle` / `reorderTabsHint`。

## 与 Windows 的关系

功能对齐写作/kmind/对话骨架，**源码分家**。Win 现为 **0.3.0**；**产品功能全部要移植**（分镜/PDF/Git/媒体预览），对照 [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)。台词协议 **v1.3** 与 Win extras 一致；联调 Godot 请用 win 版打开同一磁盘目录。
