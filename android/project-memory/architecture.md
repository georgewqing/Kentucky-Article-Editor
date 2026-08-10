# 架构（Android）

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
- `(pointer: coarse)` 放大触屏命中区；外接触控板的 wheel / secondary click 仍走
  专用桥与 hooks。

## 与 Windows 的关系

功能对齐，**源码分家**。台词协议 **v1.3** 与 Win extras 一致；联调 Godot 请用 win
版打开同一磁盘目录。Windows 正式功能后续同步的文件映射、Platform/AI/原生改造流程
和回归矩阵见 [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)。
