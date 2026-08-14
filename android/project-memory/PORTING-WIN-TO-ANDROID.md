# Windows → Android 移植交接（AI 扫描）

> **先扫「现状」「硬规则」「能力矩阵」。** 本文是操作规程，不是 Win changelog。  
> Win 真源：[`../../win/project-memory/README.md`](../../win/project-memory/README.md) → [`architecture.md`](../../win/project-memory/architecture.md)  
> Android 入口：[`README.md`](./README.md) · 进度只改 [`BOARD.md`](./BOARD.md)

核对日期：**2026-08-14**。Win 代码若已变，以 Win 源码 + Win README「现状」为准，再回写本矩阵。

**产品拍板（2026-08-14）：Win 已有的产品功能，Android 全部要移植。** 进度未完成 ≠ 可以跳过。  
壳层（Electron 多窗、原生菜单、HKCU 打开方式、`kentucky-file` 协议、`printToPDF`、`git.exe`）**不照搬**，用 Capacitor / SAF / Web API / isomorphic-git / 原生 ffmpeg **重写**，行为对齐。

---

## 0. 现状

| 键 | Win | Android |
|----|-----|---------|
| 软件根 | `win/` · **0.3.0** | `android/` · **0.2.0**（功能未齐） |
| 壳 | Electron 37 · 多窗 DocumentHub | Capacitor 7 · **单窗** · 进程内 hub |
| 当前 `toolApi` | **`2026-08-14-a`** | 未对齐（`ai-runtime` 仍旧门禁；无同串） |
| 工作区 IO | `ipcSandbox` + `workspacePath` + Node fs | **SAF**（真机）/ FSA（浏览器）/ Cap Documents 降级 |
| Agent 写盘 | 始终自动写盘；无 Accept；`commitProposal` → `session.proposals` | **必须对齐**（BOARD U13/U14 ❌）；禁止做回旧 Accept UI |
| Git | SCM + `git_*` | **必须移植**（U16/U17 ❌）；默认 isomorphic-git，无系统 `git` |
| `.kyboard` | 已发版（含 persist/改序） | **必须移植**（A3 ❌） |
| PDF | 预览 + UI 导出 + Agent `export_workspace_pdf` | **必须移植**（A4 ❌）；导出管线重写，不抄 `printToPDF` |
| PNG / MP4 预览 | `isMediaPreviewKind` | **必须移植**（A5/A6 ❌）；媒体 URL 走 SAF blob，不抄 `kentucky-file` |
| 媒体协议 | `kentucky-file://` Range/206 | SAF/FSA blob；**不要**抄 Electron protocol |

### 功能 vs 壳（勿混）

| 必须对齐的产品功能 | 保留的 Android 壳差异 |
|--------------------|------------------------|
| md / kmind / dialogue / characters | 单窗；无精简浮窗 |
| Agent 全工具（含文学记忆、Skills、Ask 守卫、恒写盘、改动卡） | 无 AppMenuBar；入口走 ActivityBar / 快捷键 |
| Git SCM + `git_*`（无 force） | 无 HKCU `.md` 打开方式 |
| `.kyboard` 稿纸 + NLE + ffmpeg 导出 | 无 `kentucky-file://`；无 Electron IPC 沙箱文件 |
| PNG / MP4 / PDF 预览；PDF 导出（UI + Agent） | 无多窗 DocumentHub；进程内 hub |
| 工作区沙箱语义（不逃出当前打开的文件夹） | 真机主路径 SAF |

---

## 1. 硬规则

1. **禁止** `android` `import` `../win`。两套独立 npm。禁止整目录覆盖 `android/src`。
2. Windows 是功能真源，**不是**可粘贴的模板。能抄的是纯 React / 纯算法 / schema；不能抄 Electron main、preload、Node `fs`、菜单、多窗、`shell`、IPC。
3. Android UI 只经 `src/platform/index.ts` 访问文件、选择器、AI、平台行为。
4. 真机工作区主路径是 **SAF tree URI**，不是浏览器 FSA，也不是 Documents 降级目录。
5. 系统栏、Back、触控板桥、`uiScale`、窄宽 AI drawer、单窗模型是长期保留的 Android 适配；从 Win 更新时不能覆盖。
6. 浏览器预览 ≠ 完成。涉及文件 / 原生插件 / 系统栏 / 键盘 / 触控板必须 `cap:sync` + Android Studio **Run 重装**。
7. 改 `MainActivity.java` / `KentuckySafPlugin.java` → 必须重装 APK（仅 `cap sync` 不够）。
8. 对齐 Agent 工具时，Android 的 `toolApi` 必须与 Win **当前**字符串一致（现 `2026-08-14-a`）。未移植前不要假装已对齐。
9. **禁止**把 Win 的 Accept/pending 门禁、一键铺轨、`kentucky-file` handler、`ffmpeg-static`、多窗口、HKCU 登记抄进 Android。产品功能仍须对齐，只换实现。
10. 进度只改 [`BOARD.md`](./BOARD.md)；契约细节改 [`open/`](./open/)。

若准备执行「用 `win/src/renderer/src` 覆盖整个 `android/src`」——**立刻停止**。

---

## 2. 两端心智模型

### Win

```text
React renderer
  → getPlatform() → window.kentucky (preload)
  → ipcMain + ipcSandbox + workspacePath
  → Node fs / dialog / Menu / 跨窗 DocumentHub / agentLoop / git / storyboard / pdf
```

### Android

```text
React WebView
  → createAndroidPlatform()
  → 真机 SAF（KentuckySafPlugin.java）
    / 浏览器 FSA + IndexedDB
    / Capacitor Filesystem 降级
  → 进程内 DocumentHub
  → ai-runtime（WebView 内纯 TS；WorkspaceIo 注入）

MainActivity
  → system bars / WindowInsets / IME
  → WebView 缩放限制
  → 原生 trackpad ACTION_SCROLL → kentucky:native-wheel
```

Win 里跨 IPC 的能力，在 Android 只能变成：

| 情况 | 做法 |
|------|------|
| 浏览器/Capacitor 已能做 | 实现于 Android `Platform` |
| 需要文件读写 | 注入式异步 `WorkspaceIo`（SAF） |
| 必须 Android API | 扩展 Capacitor 原生插件 |

**不要**在 Android 复刻 `ipcSandbox.ts` 的 Electron 形态；对齐的是「路径不得逃出当前工作区」这条产品规则。

---

## 3. 能力矩阵（按当前 Win 0.3.0）

图例：✅ 已有骨架 · ❌ 未对齐（**要做**） · ⚠️ 部分/待验 · ⏳ 两端都未做的 backlog（不是 Win 已有功能）

**没有「本版跳过产品功能」行。** 壳差异见 §0「功能 vs 壳」。

| Win 模块 | Win 现状（2026-08-14） | Android | 策略 |
|----------|------------------------|---------|------|
| 工作台 chrome | ActivityBar / 多窗 / AppMenuBar / fitContextMenu | 单窗；无 AppMenuBar；Back / drawer / uiScale | **U** 人工合并；永不覆盖 Workbench/App。多窗 **不** 做 |
| 标签栏 / 分屏 | 滚轮横滑、指针改序、此栏 `.ctx-menu`（§160–§161） | ✅ 已对齐；保留 `compactLayout` 关分屏 | **R** 对照 `EditorArea.tsx`；禁止整文件覆盖；禁止退回 `<select>`；禁止右键指定分屏 |
| 打开文件夹 | 拒盘符根 / `C:\Users` / 主目录 | SAF tree | **P** 语义对齐；实现重写 |
| `.md` TipTap+Monaco | 无分屏预览；hydration 门闩 | ✅ 有 | **R** 对照；保留触控板分流 |
| `.kmind` v2 | React Flow；viewport 不脏；shape/子树 U18 | ✅ 画布；U18 ❌ | schema **D** 必须同版；子树要移植 |
| `.dialogue.csv` v1.3 | 11 列 + choices/layout；脏 hub 优先 | ✅ 有；SAF 文件名已加固 | **D** 协议同步；flush 防空覆盖 |
| `characters.csv` | 六列；Agent upsert 强制写盘 | ✅ 编辑器；W1b ❌ | 移植 W1b 时真写 SAF |
| PNG 预览 | `ImagePreviewEditor`；不进 hub | ❌ A5 | **R** + 媒体 URL 重写 |
| MP4 预览 | Range/206 `<video>` | ❌ A6 | SAF blob / 流；勿抄 protocol |
| PDF 预览 + 导出 | pdf.js + printToPDF + Agent 工具 | ❌ A4 | 预览可抄 pdf.js；导出 **E** 重写 |
| `.kyboard` NLE | persistDoc；改序 `repackVideoClipStartsMut`；ffmpeg | ❌ A3 | 整模块；schema **D**；ffmpeg 原生捆绑 |
| Agent Ask/Plan/Outline/Agent | Ask=`askGuard`+`tool_choice:none` | ⚠️ 骨架；Ask 守卫未对齐 | 抄 `askGuard` 进 `ai-runtime` |
| Agent 写盘 / 改动卡 | 恒写盘；`session.proposals` applied | ❌ U13/U14 | [`open/auto-apply-git.md`](./open/auto-apply-git.md)；**勿做 Accept UI** |
| 工具门禁 `proposalGate` | 恒 auto + 恒 persist | ❌ 仍旧 kind/阈值 | 整文件对齐 Win |
| 文学记忆 H1–H4 | Win 已落地 | ❌ | [`open/literary-memory.md`](./open/literary-memory.md) |
| Skills / 挂载 / Design L5 | `2026-08-14-a` | ❌ U1/U4/U5/U12 | chrome + runtime 成组 |
| `workspace_*` | mkdir/copy/move/delete | ❌ W17 | 全走 `WorkspaceIo` |
| `export_workspace_pdf` | 仅 `.md` | ❌（含在 A4） | 与 UI 导出同一重写管线 |
| Git SCM + `git_*` | 本根 init；不 walk-up | ❌ U16/U17 | **isomorphic-git**（或捆绑 git）；禁止 force |
| 本机沙箱 | ipcSandbox + 导航锁 | 部分：SAF 范围即沙箱 | 新读写必须停在当前 tree |
| `.md` 系统打开方式 | 仅打包 exe HKCU | 壳差异 | 桌面专属，**不是**要砍的产品功能 |
| ffmpeg 捆绑 | `ensure-ffmpeg` extraResources | ❌（随 A3） | 原生 ffmpeg；禁止 `ffmpeg-static` |

BOARD 工单 ID（W/H/U/A）是进度，不是第二份契约。实现某一行时：Win 源码 → 本矩阵策略列 → BOARD 详约。

---

## 4. 目录映射

| Windows 来源 | Android 目标 | 默认处理 |
|---|---|---|
| `win/src/renderer/src/ai/` | `android/src/ai/` | 对照移植 UI；保留 drawer / 触控 |
| `win/src/renderer/src/editors/` | `android/src/editors/` | 多数可移植；画布/滚动/触控人工合并 |
| `win/src/renderer/src/editors/storyboard*` | `android/src/editors/` | A3：**要移植**；触控/滚动人工合并 |
| `win/src/renderer/src/editors/*PreviewEditor*` | `android/src/editors/` | A4/A5/A6：**要移植**；媒体 URL 走 Platform |
| `win/src/renderer/src/state/` | `android/src/state/` | 业务可移植；持久化/平台调用必查 |
| `win/src/renderer/src/workbench/` | `android/src/workbench/` | **只能人工合并** |
| `win/src/renderer/src/i18n/` | `android/src/i18n/` | 新业务文案同步；桌面专属可不显示 |
| `win/src/renderer/src/theme/` | `android/src/theme/` | 可移植；保留 `uiScale` 与原生启动主题 |
| `win/src/renderer/src/export/` | `android/src/export/` | A4：收集 HTML/位图可抄；打印改 Android |
| `win/src/renderer/src/platform/index.ts` | `android/src/platform/index.ts` | 只同步接口语义 |
| `win/src/preload/index.ts` | 无 | 用来发现新增 API 契约 |
| `win/src/main/index.ts` | Platform 或原生插件 | 按能力重写 |
| `win/src/main/ipcSandbox.ts` / `windowsFileAssociation.ts` | 无直接目标 | 沙箱语义对齐；HKCU 不抄 |
| `win/src/main/ai/` | `android/src/ai-runtime/` | 算法可同步；存储/路径/I/O 必须 Android 化 |
| `win/src/main/ai/askGuard.ts` | `ai-runtime/` 对应模块 | 应移植 |
| `win/src/main/git/` | `android/src/git/` 或 `ai-runtime` | U16/U17：isomorphic-git，禁止抄 `execFile(git.exe)` |
| `win/src/main/storyboard/` / `pdf/` | Platform + 原生插件 / `ai-runtime` | A3/A4：按能力重写 |
| `win/src/main/documentHub.ts` | Platform 内 local hub | 行为契约；不移植跨窗 |
| `win/src/main/menu.ts` / `windowRegistry.ts` | 不抄 | 无 AppMenuBar；单窗 |
| `win/src/shared/kyboardSchema.ts` | `android/src/shared/kyboardSchema.ts` | **D** 同版本 |
| `win/extras/godot-kentucky-dialogue/` | 格式读写兼容 | 协议必须同步；Godot 联调仍用 Win |
| `win/package.json` | `android/package.json` | 只加 renderer/runtime 需要的包 |

Win 业务真文件在 `win/src/renderer/src/**`。`win/src/state/appStore.ts` 若存在只是 re-export，不要在那里改逻辑，也不要据此判断 Android 缺文件。

### 跨端必须同版本的数据协议

- `.kmind` v2 JSON（两端 `editors/kmind.ts`）
- Dialogue Godot **v1.3**：11 列 CSV + choices/layout/meta；根目录 `characters.csv` 六列
- `.kyboard` v1（`kyboardSchema.ts` 必须同版本）
- Agent：工具名、参数 schema、返回字段（`written` / `reviewHint` / `gateDetail` / `toolApi`）、`plans/*.plan.md`
- Platform：`openContextFiles`、全部 `ai*`、`onAiEvent`、文档方法同签名（Android 多窗方法为 no-op）

---

## 5. 永远不能被 Win 覆盖的 Android 文件

即使 Win 同名文件更新，也必须人工三方合并：

- `android/src/platform/index.ts`
- `android/src/plugins/kentuckySaf.ts`
- `android/src/hooks/useAndroidBackButton.ts`
- `android/src/hooks/useSecondaryClick.ts`
- `android/src/hooks/useSpatialWheelScroll.ts`
- `android/src/editors/rfTrackpadProps.ts`
- `android/src/App.tsx`
- `android/src/workbench/Workbench.tsx`
- `android/src/workbench/EditorArea.tsx`
- `android/src/workbench/fitContextMenu.ts`
- `android/src/workbench/ActivityBar.tsx`
- `android/src/workbench/Sidebar.tsx`
- `android/src/workbench/FileTree.tsx`
- `android/src/workbench/SettingsPage.tsx`
- `android/src/state/appStore.ts`
- `android/src/state/settingsStore.ts`
- `android/src/editors/dialogueCsv.ts`
- `android/src/editors/MindMapEditor.tsx`
- `android/src/editors/DialogueEditor.tsx`
- `android/src/editors/CharactersEditor.tsx`
- `android/src/styles/global.css`
- `android/index.html`
- `android/capacitor.config.ts`
- `android/native/**`

原因：SAF、单窗、Back、触控板桥、secondary click、AI drawer、禁用窄屏 split、标签栏手势/此栏菜单、`uiScale`、触屏命中区、system bars、CSP、Capacitor 构建。

---

## 6. 文件分类（动手前给每个 Win 文件打标）

| 类型 | 示例 | Android 策略 |
|---|---|---|
| **R** 纯 renderer | parser、纯 selector、无 IO 组件 | 复制后人工检查 |
| **P** 平台契约 | `Platform` 新方法 | 两端接口一致，Android 独立实现 |
| **E** Electron 专属 | IPC、menu、window、shell、`kentucky-file` | 不复制；重写或 no-op |
| **N** Node 专属 | `fs` / `path` / `crypto` | 改 `WorkspaceIo`、Web API 或 Capacitor |
| **A** Android 原生 | SAF、Insets、MotionEvent | 只在 Android 新增 |
| **D** 数据协议 | CSV、KMind、sidecar、`toolApi` | 两端同版本、同序列化 |
| **U** UX 差异 | hover、菜单、drawer、触控 | 按 Android 产品决策适配 |

判断：出现 `electron` / `ipcRenderer` / `window.kentucky` → **E**；Node `fs`/`path`/`crypto` → **N**；只 React/Zustand/纯 TS → 通常 **R**；改磁盘格式 → **D**。

---

## 7. 标准流程（每次 Win 正式功能之后）

### A. 定范围

1. 确认 Win 已完成且 Win 自己能构建。
2. 从功能入口向下追：renderer、store、Platform、preload、IPC、`main/ai`、i18n、CSS、依赖、sidecar。
3. 用 git（若有上次同步 ref）：

```powershell
Set-Location "D:\Working Directory\Kentucky"
git diff --name-status <last-synced-ref>..<new-win-ref> -- "win"
```

无可靠 ref 时禁止猜「只改了当前 UI 文件」。同名纯业务文件可用 `git diff --no-index`。区分：Win 新变化 / Android 未同步旧变化 / Android 有意差异。

4. 对照 **§3 能力矩阵**：❌ 都是要做的。壳差异（单窗 / 无菜单栏 / 无 HKCU）不要做成 Win 克隆。
5. 同步完成后在 Android `changelog.md` 记 Win ref/版本/日期。没有 ref 写「工作区快照，未提交」。

### B. 先依赖和类型

比较 `package.json`。只加 Android renderer/runtime 需要的包。

**不要**加入：`electron`、`electron-builder`、Electron Vite main 插件、仅 Node 的 db、`ffmpeg-static`。  
**不要**复制：`node_modules/`、`out/`、`release/`、Win `package-lock.json`、`.env`、API Key、签名文件。

```powershell
Set-Location "D:\Working Directory\Kentucky\android"
npm install <package>
npm run typecheck
```

### C. 先协议和纯算法，再 UI

推荐顺序：类型/schema → `formats` / 解析 → `ai-runtime` 工具（经 `WorkspaceIo`）→ Platform 新方法 → 编辑器 → chrome。

`ai-runtime` 禁止 `import` `win/`，禁止 `fs`/`path`/`electron`。

### D. 验证

`npm run typecheck` → `npm run cap:sync` → Android Studio Run。真机过 §9 相关项。勾 [`BOARD.md`](./BOARD.md)，changelog 留一条。

---

## 8. 子系统笔记（移植时易错）

### 8.1 Agent

- Win 现行：**Ask 不跑工具**；Agent **恒写盘**；改动卡只读，来自 `session.proposals`（`commitProposal` 必须 upsert，否则卡空白）。
- Android 现状：`proposalGate` 仍按 kind/阈值，属于旧世界。对齐 U13 时以 Win `proposalGate.ts` + [`AGENT-TOOL-FEEDBACK.md`](../../win/project-memory/AGENT-TOOL-FEEDBACK.md) **§2.0** 为准，**不要**实现 Accept。
- 工具结果必须带当前 `toolApi`。缺指纹 = 旧运行时。
- SAF 杀进程：auto 路径必须真写，不能只标 `dirty`。
- 密钥走 Preferences；app-body 在 `Directory.Data/kentucky-data/`。

### 8.2 Git（U16/U17 · 必须移植）

产品要 SCM 与 `git_*`，行为对齐 [`AGENT-GIT.md`](../../win/project-memory/AGENT-GIT.md)：本根 init、不 walk-up、无 force、写操作立即执行 + 高亮卡。

平板通常 **没有** `git` CLI。默认 **isomorphic-git**（纯 JS，走 `WorkspaceIo`）。不要 `execFile('git')`。`revisions/` 文学快照 **不是** Git。

### 8.3 分镜头（A3 · 必须移植）

读 Win [`STORYBOARD.md`](../../win/project-memory/STORYBOARD.md) 现行硬规则：无铺轨；导入不上 V1；`persistDoc`；`repackVideoClipStartsMut`；无 Agent 工具。不要从 changelog §96 第一版 UI 抄。

ffmpeg：Android 原生二进制或成熟插件，**禁止** `ffmpeg-static`。大图内存、触控滚轮、SAF 写 assets 单独设计。schema 与 Win **同版本**。

### 8.4 PDF（A4 · 必须移植）

- **预览**：可对照 Win `PdfPreviewEditor` + pdf.js；字节来自 SAF/FSA，不走 `kentucky-file`。
- **导出**：Win 的隐藏窗 `printToPDF` 是 Electron。Android 用 WebView 打印或等价 HTML→PDF 库，限制仍 HTML ≤ 2MB、PDF ≤ 50MB。Agent `export_workspace_pdf` 只写工作区 `.md`，无另存框。

### 8.5 对话 / 导图

协议必须与 Win 同版。保存须 `graphReady` 再 flush sidecar。Win 台词工具读脏 DocumentHub；Android hub 是进程内 Map，移植 append/patch 时同样优先脏缓冲。

### 8.6 媒体

不要移植 `kentucky-file://`。预览用 SAF/FSA 可读 blob 或 content URI。`isMediaPreviewKind` 语义（跳过当文本打开）可抄，协议层必须重写。

---

## 9. 验收（按本次改动裁剪，不要整表盲勾）

### 工作区 / SAF

根与两级嵌套；中文/空格；新建读写保存另存；rename/move/delete；脏标签/discard；AI ghost tab；**不出现** `.md.txt` / `.csv.txt`。

### 编辑器

Markdown 输入/格式/滚动；Monaco 大文件；KMind 保存/捏合；Dialogue CSV+sidecar；Characters 与 speaker 联动；`<=1100px` 禁用 split。

### Android UX

黑状态栏不挡 tabs；IME 不挡 composer；Back 分层关；coarse 命中区；`uiScale` 90/100/130；宽屏三栏与窄宽 drawer。

### Agent（仅当改了 runtime/UI）

无 Key 提示；profile；session；streaming/Abort；**无 Accept 按钮**（若已做 U13）；写后 editor/dirty/tree/sidecar 一致；重启后配置仍在；Key 不进工作区。工具结果含当前 `toolApi`。

**不要**再把「proposal Accept/Reject」当成通过条件——那是 Win 已废止的旧验收。

---

## 10. 失败定位

| 现象 | 先查 |
|------|------|
| 编译过、真机仍旧界面 | `cap:sync`；`native/.../assets/public`；Studio **Run**；勿只刷浏览器 |
| 浏览器可、真机打不开夹 | `isNativePlatform` 优先 SAF；插件已注册；Java 已重装；URI permission |
| 扩展名多 `.txt` | 创建 MIME 勿 `text/plain`；用 `application/octet-stream` |
| 新 UI 无入口 | Win 是否只加了 AppMenuBar/menu IPC；Android 要 ActivityBar/Sidebar/快捷键 |
| Agent 改动卡空白 | Win 教训：`commitProposal` 未写入 `session.proposals`；移植时不要漏 |
| 工具无 `toolApi` | 旧 runtime；对齐 Win 字段并重装 |

---

## 11. 建议实施顺序（与 BOARD 一致）

1. W1 / W1b / W3 + **U14/U13**（门禁恒写盘 + 只读卡 + continuity）— 直接按 Win **现行**恒 auto  
2. H1→H4 文学记忆  
3. U12 → U4/U5 挂载与 Skill 注入  
4. U1–U3 / U8–U11  
5. 其余 W（Plan / FS / search / append）  
6. **U18 / U15**（kmind 子树、段内高亮）  
7. **A5 → A6 → A4**（PNG / MP4 预览 → PDF 预览+导出）  
8. **U16/U17** Git（isomorphic-git）  
9. **A3** 分镜头 + ffmpeg（依赖 A5/A6 媒体预览）  
10. A1 触控板真机可随时插队

---

## 12. 读序

| 任务 | 读 |
|------|-----|
| 清空上下文 | 本文 §0–§3 → [`README.md`](./README.md) → [`BOARD.md`](./BOARD.md) |
| 对齐某一 W/H/U | BOARD 行 → `open/*.md` → Win 对应源码 → 本文 §6–§8 |
| Win 工具总表 | [`../../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../../win/project-memory/AGENT-TOOL-FEEDBACK.md) |
| Win Git | [`../../win/project-memory/AGENT-GIT.md`](../../win/project-memory/AGENT-GIT.md) |
| Win 分镜 | [`../../win/project-memory/STORYBOARD.md`](../../win/project-memory/STORYBOARD.md) |
| Win 沙箱 | [`../../win/project-memory/SECURITY-AUDIT.md`](../../win/project-memory/SECURITY-AUDIT.md) |
| 踩坑 | [`gotchas.md`](./gotchas.md) |
