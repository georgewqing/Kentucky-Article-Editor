# 改动时间线（Android）

## 文档 — Agent 工具反馈对齐 OPEN（2026-08-11）

- 新增 [OPEN-agent-tool-feedback-parity.md](./OPEN-agent-tool-feedback-parity.md)：Win Round A–D 工具反馈须移植到 `ai-runtime`
- 权威总清单在 Win：[`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md)
- [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md) 阶段 G 增加第 9 条对照总清单
- **代码尚未移植**；状态 OPEN

## 0.2.0+ — 状态栏绑错 id 纠正 + 台词 SAF/Accept（2026-08-10）

- **状态栏**：确认 Capacitor 不用 app `main_content`；`configureSystemBars` 直接给 Bridge `@id/webview` 加 margin，状态栏/导航栏纯黑
- **SAF**：`writeStream` 回收 `.txt` / `(N).txt`、`renameTo` 纠正 mangled 名，纠正失败则抛错避免静默脏名
- **AI Accept**：Capacitor 真机强制 `applyProposalToDisk`（避免只标脏后重载丢失）
- 文档：[OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md)

## 文档 — Win → Android 持续移植手册（2026-08-10）

- 新增 [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)，面向低上下文 AI
  详细记录：
  - Electron renderer/preload/main 与 Android Capacitor/Platform/SAF/ai-runtime 的映射；
  - 可直接移植、必须人工合并、禁止复制的文件与代码类型；
  - Win 正式功能更新后的分阶段同步流程；
  - Platform 契约、Node I/O 改造、AI runtime、原生 plugin、数据迁移和 Android UX；
  - 常见功能移植模板、强制真机回归矩阵、故障定位和完成定义。
- README 与 SESSION-HANDOFF 已加入必读入口。今后 Win 功能同步必须在本时间线记录
  功能来源、Android 差异、未移植项和验证结果。

## 0.2.0+ — 真机首轮回归修复（2026-08-10）

- 修复顶部 Web 内容与原生状态栏重叠：
  - 根 `CoordinatorLayout` 的 padding 不会可靠约束 `match_parent` WebView 子项。
  - `MainActivity.configureSystemBars` 改为把 system bar / cutout / IME insets 应用为
    WebView layout margins；黑色根布局继续作为系统栏底色。
  - 原生 wheel 坐标仍以 WebView 的实际屏幕位置换算，顶部 inset 后不会偏移。
- 修复 Settings 触控板无法上下滚动：
  - 原生层消费 `ACTION_SCROLL` 后，合成的 `WheelEvent` 不会触发 WebView 默认滚动。
  - `useSpatialWheelScroll` 新增通用 overflow ancestor fallback，除 MD / AI /
    Sidebar 专用路径外，Settings、inspector、角色列表等普通滚动容器也显式更新
    `scrollTop`。
- 文档标签关闭按钮增加独立 pointer ownership、稳定层级和不可收缩命中区；顶部
  inset 修复后按钮不再落入系统状态栏拦截区域。
- 验证：`npm run build`、`npm run cap:sync`、JBR 21
  `gradlew compileDebugJavaWithJavac` / `assembleDebug` 通过；IDE lints 无新增诊断。
  需 Android Studio Run 重装后真机复验。

## 0.2.0+ — Android 平板原生体验适配（2026-08-10）

### Win / Android 交叉审计结论

- Android 渲染层原本基本一比一复制 Win，桌面菜单、hover、小命中区、三栏固定布局和
  Electron 窗口语义不适合平板。
- `fontSize` 实际只控制 Monaco / TipTap，不是全局界面缩放。
- Android `AppMenuBar` 大部分动作在 Platform 中是 no-op；决定移除桌面菜单栏，
  保留文档标签和键盘快捷键。
- 768px 下默认 ActivityBar 48 + Sidebar 260 + AI 380 会严重挤压编辑器；决定窄宽
  使用 AI 覆盖抽屉。
- targetSdk 35 但原生层此前没有 edge-to-edge / WindowInsets / system bars 处理。

### 原生壳与系统栏

- `MainActivity.configureSystemBars`：
  - `WindowCompat.setDecorFitsSystemWindows(false)`
  - 状态栏 / 导航栏透明，由原生根布局提供固定黑底
  - `WindowInsetsControllerCompat` 强制浅色系统图标
  - `WindowInsetsCompat` 处理 status/navigation/display cutout/IME inset
- `activity_main.xml`：
  - 根布局新增 `main_content` ID、黑色背景
  - WebView 新增稳定 ID 和 `#141414` 背景
- `styles.xml`：
  - App / NoActionBar 主题统一透明 system bars
  - Launch theme 增加 `windowSplashScreenBackground` 和 `postSplashScreenTheme`
- 新增 `res/values/colors.xml`，补齐 primary / accent / app background / system bar 色。
- Manifest 增加 `windowSoftInputMode="adjustResize"`，避免软键盘遮挡输入。

### 菜单、返回键与原生弹窗

- 删除 Android `AppMenuBar.tsx` 及对应 CSS；`Workbench` 不再探测 OS / 渲染
  File/Edit/View/Help。
- `App.tsx` 移除 Android 永远不会触发的桌面菜单 / 窗口监听，保留 DocumentHub
  `onDocApply`。
- 新增 `useAndroidBackButton`：
  - 依次关闭 Confirm / Unsaved、AI history、AI panel、Settings、Explorer
  - 根页面调用 `App.minimizeApp()`，不直接丢失脏标签
- ActivityBar 无工作区点 AI 改为 Toast。
- 文件删除由 `window.confirm` 改为 `ConfirmDialog`。
- Platform 的 SAF / 浏览器能力错误由 `window.alert` 改为 Toast。

### 界面缩放

- `settingsStore` schema 升级为 v2，新增持久化 `uiScale`：
  - 默认 `1.0`
  - 范围 `0.90–1.30`
  - 旧 localStorage 自动迁移
- Settings 外观区新增界面缩放 stepper 与重置；中英文文案已补齐。
- `global.css` 新增 `--ui-scale` 及 UI 字号 / chrome 尺寸 tokens。
- ActivityBar、Sidebar、FileTree、tabs、AI、Settings、dialogs、Toast 等应用 chrome
  接入缩放；Monaco / TipTap 编辑器字号继续由原 `fontSize` 独立控制。
- 未使用根 `transform` / `zoom`，避免破坏 React Flow、Monaco 与触控板坐标。

### 平板布局与触屏

- `<=1100px`：
  - AI pane 脱离 flex 三栏，变成右侧覆盖抽屉
  - 增加遮罩，点击可关闭
  - 隐藏 AI sash
  - 自动关闭并禁用编辑器分屏
- `(pointer: coarse)`：
  - 放大 ActivityBar、Sidebar、AI、tab close、context menu、dialog 和 sash 命中区
  - tab close 常显
  - Sidebar 六个工具按钮重新分配整行空间
- 修复 `.ai-msg-streaming::after` 缺失引号 / 分号导致的 CSS minify warning。

### 新增 / 删除 / 重点修改文件

- 新增：
  - `src/hooks/useAndroidBackButton.ts`
  - `native/app/src/main/res/values/colors.xml`
- 删除：
  - `src/workbench/AppMenuBar.tsx`
- 重点修改：
  - `MainActivity.java`、Manifest、`activity_main.xml`、`styles.xml`
  - `App.tsx`、`Workbench.tsx`、`EditorArea.tsx`、`ActivityBar.tsx`
  - `settingsStore.ts`、`appStore.ts`、`platform/index.ts`
  - `SettingsPage.tsx`、i18n、`global.css`

### 验证

- `npm run typecheck`：通过
- `npm run build` / `npm run cap:sync`：通过
- JBR 21 `gradlew compileDebugJavaWithJavac`：通过
- JBR 21 `gradlew assembleDebug`：通过（168 tasks）
- IDE lints：无新增诊断
- 真机仍需 Run 重装后验收：system bars、IME、Back、uiScale、AI drawer，以及
  MD↔AI 触控板交替滚动。

## 0.2.0+ — MD↔AI 触控板原生修复候选（2026-08-10）

- 现象：Markdown + AI 触控板滚动互斥；触屏正常；MindMap/Dialogue+AI 正常
- 专项记录：[OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md)
- 已尝试均无效：viewport、CSS pan-y、全局/区域 wheel 劫持、focusScrollHost、`useSpatialWheelScroll`
- 原生候选：
  - `MainActivity.dispatchGenericMotionEvent` 截获 pointer `ACTION_SCROLL`
  - 原生 `rawX/rawY` 归一化后发送 `kentucky:native-wheel`
  - Web 在真实位置重建 `WheelEvent`，MD / AI / Sidebar 显式滚动，React Flow
    保留画布 wheel 语义
  - MD / AI 在滚动边界也始终 `preventDefault`，避免 latch 回旧容器
  - 修饰键读取改用 `MotionEvent.getMetaState()` + `KeyEvent` mask
- Web 构建与原生 assemble 已通过；状态仍为**待真机验收**。

## 0.2.0+ — 触控板对齐 Mac（2026-08-10）

- MindMap / Dialogue：`panOnScroll`、禁默认滚轮缩放、捏合 + Ctrl/Meta 滚轮缩放；`.rf-host` `touch-action: none`
- 次要点击：`useSecondaryClick`（contextmenu + Ctrl/Meta+左键；抑制 touch 长按）
- WebView 禁整页缩放（Java）；撤回 viewport `user-scalable=no`
- 侧栏 / AI / Inspector sash 改 Pointer Events
- 列表滚动问题见上一条 OPEN

## 0.2.0+ — 真机修复与侧栏（2026-08-10）

详见 [SESSION-HANDOFF.md](./SESSION-HANDOFF.md)。

- Vite：`/boot-theme.js` + `public/boot-splash.css`（规避 Windows 空格路径 inline-css bug）
- `openFolder`：Capacitor 真机优先 SAF，不再被 WebView 假 FSA 抢走
- CSP：`connect-src` 允许 `https:` / `http:`（AI API）
- SAF 写入：`application/octet-stream`，避免 `foo.csv.txt` / `foo.md.txt`；读写兼容旧 `.txt` 后缀
- `stripSafTextSuffix`：对话 / 角色 / Markdown 类型识别
- 侧栏：未落盘脏标签显示为 ghost；`characters.csv` 显示「角色表」；`+` 旁「⬇」全部保存
- `KentuckySafPlugin` Capacitor 7 正确 import；`takePersistableUriPermission` 仅 READ|WRITE

## 0.2.0 — 对齐 Win 一比一移植

- 从 Win 0.2.0 覆盖 workbench / editors / ai UI / i18n / styles
- 对话升级为 **v1.3** 图编辑器（xyflow + inspector + sidecars）
- 新增 `src/ai-runtime/`（AI Agent、工具循环、提案、Skills、可选联网）
- Platform 对齐 Win 签名；真机 **SAF**（`KentuckySaf`）打开任意文件夹；图片 / 上下文文件导入
- App-body `kentucky-data/` + Preferences 存密钥
- 移除应用内「新建窗口」菜单；版本 `0.2.0`

## 0.1.0 — 软件根建立

- Cursor 工作区容器下新增独立 `android/` 软件根
- 从 win 渲染层复制业务 UI；Platform 改为 `createAndroidPlatform`
- 去掉多窗口菜单；DocumentHub 本地化
- Vite + Capacitor 7 脚手架；原生路径 `native/`
- 工作区：Chrome File System Access；真机 Documents/`kentucky-workspace`（后由 SAF 取代为默认）

## 开发冻结（已解除）

- 曾约定 Win 完成前安卓不大改；0.2.0 移植起该冻结结束
