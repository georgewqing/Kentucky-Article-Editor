# 改动时间线（Android）

## 2026-08-14（分屏文件选择换肤 + 标签改序手势）
- 对齐 Win changelog **§161**（现行契约：Win architecture / gotchas「标签栏 / 分屏」）
- 「此栏」去掉原生 `<select>`（Windows/WebView 弹出层无法换肤）→ `.pane-file-picker-btn` + portal `.ctx-menu.pane-file-menu`；拷贝 `fitContextMenu.ts`
- 标签改序：右键 `preventDefault` + 对该 tab `setPointerCapture` + 窗口 `mousemove` 兜底；左键拖过 5px 同样可改序；不要 `lostpointercapture` 结束；不要 HTML5 drag
- 保留 `compactLayout` 关分屏；未并入 Win 的 storyboard/pdf/image/video 路由
- 文件：`EditorArea.tsx` · `fitContextMenu.ts` · `global.css` · i18n `editor.reorderTabsHint`

## 2026-08-14（标签栏滚轮 / 右键改序 / 分屏选文件）
- 对齐 Win §160：滚轮横滑、改序、分屏后各栏选文件；不再用右键指定分屏。首版手势/原生 select 在 §161 修完

## 2026-08-14（产品拍板：Win 功能全移植）
- **Win 已有产品功能全部要移植**；BOARD A3/A4/A5/A6 与 U13–U18 从 ⏭ 改为 ❌
- Git 默认 isomorphic-git（禁止跳过、禁止 `git.exe`）
- PORTING §0 区分「功能对齐」与「壳不照搬」（单窗 / SAF / 无 AppMenuBar）
- **未改** `android/src` 实现

## 2026-08-14（Win 架构核对 · 移植交接重写）
- [`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md) 按 Win **0.3.0** / `toolApi: 2026-08-14-a` 重写：现状表 + 能力矩阵 + 硬规则（AI 扫描）
- README / BOARD 指纹与「Win 超前项」对齐；新增 BOARD **A4** PDF 不移植；A3 注明 Win 分镜已完整、本版仍 ⏭
- `open/auto-apply-git.md` / literary-memory restore 契约去掉过时 Accept；指纹改为当前串
- **未改** `android/src` 实现

## 2026-08-12（Win 0.3.0 分镜头 · 不移植）
- BOARD **A3** ⏭：分镜头稿本 + 简化 PR（`.kyboard`）等 Win 完整版后再移植
- Win 真源：[`../win/project-memory/STORYBOARD.md`](../win/project-memory/STORYBOARD.md)

## 2026-08-12（文档对齐 Win Git l）
- **未混入实现**：Android 仍无 Git/`U13–U18` 代码；BOARD U13–U18 保持 ⏭
- 契约镜像 [`open/auto-apply-git.md`](./open/auto-apply-git.md) 指纹对齐 Win **`2026-08-12-o`**；文首标明 Win 真源 [`../win/project-memory/AGENT-GIT.md`](../win/project-memory/AGENT-GIT.md)
- 修正过期表述：README 曾写 `-f`+§七 OPEN；PORTING/BOARD/gotchas 曾写 `-c`；清单内曾写 `-k`/`-i`
- README 增加 Win AGENT-GIT 链接

## 2026-08-12（冒烟 f）
- Win `toolApi: 2026-08-12-f`：FIND-J/K；§七当时仍 OPEN（其后 Win `-g`…`-l` 已关闭；见 AGENT-GIT）

## 2026-08-12（冒烟 e 详录）
- Win changelog **§82** 扩写：FIND-03/E/F/G/H/I 表 + Agent `git_pull`/`git_push` 契约
- Android [`open/auto-apply-git.md`](./open/auto-apply-git.md) §4.3–4.6 对齐（ensure ignore、工具表、验收）
- 本版仍 **不移植** Android 代码

## 2026-08-12（冒烟 d 详录）
- Win changelog **§81** 扩写：FIND-A/B/C/D

## 2026-08-12（冒烟 e）
- Win `toolApi: 2026-08-12-e`：FIND-03/E/F/G/H/I + Agent `git_pull`/`git_push`（Android 本版仍不移植代码）

## 2026-08-12（冒烟 d）
- Win `toolApi: 2026-08-12-d`：git 中文路径、kmind skipped、unknown_character、reorder openingChanged（Android 本版仍不移植代码；契约见 [`open/auto-apply-git.md`](./open/auto-apply-git.md)）

## 2026-08-12（文档整理）
- **AI 易读重构**：入口 [`README.md`](./README.md) · 唯一进度板 [`BOARD.md`](./BOARD.md) · 详约集中 [`open/`](./open/)
- 旧 `OPEN-*.md` / `SESSION-HANDOFF.md` 改为跳转 stub（勿再写进度）
- SAF/台词说明并入 [`gotchas.md`](./gotchas.md)；PORTING 阶段 G / §11 指向 BOARD+open
- Win 侧 SESSION / AGENT-TOOL-FEEDBACK / README 链接已改

## 2026-08-12（晚）
- 详化 auto-apply 契约（现 [`open/auto-apply-git.md`](./open/auto-apply-git.md)）：U13–U18；本版 **不实施** Android 代码

## 2026-08-12
- Shell UX 契约（现 [`open/shell-ux.md`](./open/shell-ux.md)）：U8–U12；Settings overlay / Welcome 部分已同步待验

## 文档 — Agent UI + 滚动条契约补全（2026-08-11）

- Agent UI 详约（现 [`open/agent-ui.md`](./open/agent-ui.md)）增补 slash/消息滚动条、色条、验收
- **代码尚未移植**；状态 OPEN

## 文档 — Agent UI + 文学记忆增量移植详约（2026-08-11）

- 新增 Agent UI / 文学记忆详约（现 `open/agent-ui.md` · `open/literary-memory.md`）
- **代码尚未移植**；状态 OPEN

## 文档 — 文学记忆 Round H 移植详约（2026-08-11）

- 新增文学记忆详约（现 [`open/literary-memory.md`](./open/literary-memory.md)）
- **代码尚未移植**；状态 OPEN

## 文档 — Agent 工具反馈对齐 OPEN（2026-08-11）

- 进度并入 [`BOARD.md`](./BOARD.md)；Win 总清单 [`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md)
- **代码尚未移植**；状态 OPEN

## 0.2.0+ — 状态栏绑错 id 纠正 + 台词 SAF/Accept（2026-08-10）

- **状态栏**：确认 Capacitor 不用 app `main_content`；`configureSystemBars` 直接给 Bridge `@id/webview` 加 margin，状态栏/导航栏纯黑
- **SAF**：`writeStream` 回收 `.txt` / `(N).txt`、`renameTo` 纠正 mangled 名，纠正失败则抛错避免静默脏名
- **AI Accept**：Capacitor 真机强制 `applyProposalToDisk`（避免只标脏后重载丢失）
- 说明已并入 [`gotchas.md`](./gotchas.md)

## 文档 — Win → Android 持续移植手册（2026-08-10）

- 新增 [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)，面向低上下文 AI
  详细记录：
  - Electron renderer/preload/main 与 Android Capacitor/Platform/SAF/ai-runtime 的映射；
  - 可直接移植、必须人工合并、禁止复制的文件与代码类型；
  - Win 正式功能更新后的分阶段同步流程；
  - Platform 契约、Node I/O 改造、AI runtime、原生 plugin、数据迁移和 Android UX；
  - 常见功能移植模板、强制真机回归矩阵、故障定位和完成定义。
- README 已加入必读入口。今后 Win 功能同步必须在本时间线记录
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
- 专项记录：[`open/trackpad-scroll.md`](./open/trackpad-scroll.md)
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

详见 [`README.md`](./README.md)。

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
