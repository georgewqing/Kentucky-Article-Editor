# Windows → Android 持续移植开发手册

> 适用对象：后续接手本仓库、上下文很少、容易直接复制代码的 AI / 开发者。
>
> 核心目标：Windows 版增加正式功能后，在不破坏 Android 文件访问、系统栏、触控板、
> 单窗模型和离线能力的前提下，将同一业务能力完整移植到 `android/`。
>
> 本文是操作规程，不是背景介绍。开始修改前必须完整阅读本文，并同时阅读
> [SESSION-HANDOFF.md](./SESSION-HANDOFF.md)、[architecture.md](./architecture.md)、
> [product-decisions.md](./product-decisions.md) 和 [gotchas.md](./gotchas.md)。

## 1. 最重要的结论

1. `win/` 与 `android/` 是两个独立软件根、两个独立 npm 项目，**禁止**
   `android` 直接 import `../win`。
2. Windows 版是正式功能的产品真源和默认实现参考，但不是可以整目录覆盖的模板。
3. 能直接移植的通常是 React UI、Zustand 业务状态、格式解析和纯算法。
4. 不能直接移植的是 Electron main/preload、Node `fs/path/crypto`、菜单、多窗口、
   `shell`、桌面文件对话框和 IPC。
5. Android UI 必须只通过 `src/platform/index.ts` 访问文件、选择器、AI 和平台行为。
6. 真机工作区的主路径是 Android SAF，不是浏览器 FSA，也不是 Capacitor Documents
   降级目录。
7. Android 的系统栏、返回键、触控板、触屏命中区、AI drawer 和 `uiScale` 是长期
   保留的独立适配；从 Win 更新时不能覆盖。
8. 只通过浏览器预览不算完成。涉及文件、原生插件、系统栏、键盘、触控板的功能，
   必须安装 APK 到真机或对应平板模拟器验证。

## 2. 两端架构的正确心智模型

### 2.1 Windows

```text
React renderer
  ↓ createElectronPlatform()
window.kentucky
  ↓ preload/contextBridge
Electron IPC
  ↓
main process
  ├─ Node fs/path/dialog/shell
  ├─ DocumentHub / 多窗口
  └─ main/ai（AI runtime 与数据）
```

### 2.2 Android

```text
React WebView
  ↓ createAndroidPlatform()
Android Platform
  ├─ 真机 SAF → KentuckySaf TypeScript plugin → KentuckySafPlugin.java
  ├─ 浏览器预览 FSA + IndexedDB
  ├─ Capacitor Filesystem 降级
  ├─ 进程内 DocumentHub
  └─ ai-runtime（WebView 内纯 TypeScript）

MainActivity
  ├─ system bars / WindowInsets / IME
  ├─ WebView 缩放限制
  └─ 原生 trackpad ACTION_SCROLL → kentucky:native-wheel
```

Android 没有 Electron main process，也没有 preload。Win 中跨 IPC 的功能，在 Android
必须改造成以下三种形式之一：

- 浏览器/Capacitor 已能做：直接实现于 Android `Platform`。
- 需要 Node 文件能力：改写成注入式、异步的 `WorkspaceIo`。
- 必须调用 Android API：新增或扩展 Capacitor 原生插件。

## 3. 目录映射

| Windows 来源 | Android 目标 | 默认处理 |
|---|---|---|
| `win/src/renderer/src/ai/` | `android/src/ai/` | 可对照移植 UI，保留 Android 布局差异 |
| `win/src/renderer/src/editors/` | `android/src/editors/` | 多数可移植；画布/滚动/触控部分需人工合并 |
| `win/src/renderer/src/state/` | `android/src/state/` | 业务逻辑可移植；持久化和平台调用需检查 |
| `win/src/renderer/src/workbench/` | `android/src/workbench/` | 只能人工合并，禁止整目录覆盖 |
| `win/src/renderer/src/i18n/` | `android/src/i18n/` | 新业务文案应同步，桌面专属文案不必显示 |
| `win/src/renderer/src/theme/` | `android/src/theme/` | 通常可移植，保留 `uiScale` 和原生启动主题 |
| `win/src/renderer/src/platform/index.ts` | `android/src/platform/index.ts` | 只同步接口语义，不能复制实现 |
| `win/src/preload/index.ts` | 无直接目标 | 用来检查新增 IPC/API 契约 |
| `win/src/main/index.ts` | Android Platform 或原生插件 | 按能力重写，禁止复制 Node/Electron 代码 |
| `win/src/main/ai/` | `android/src/ai-runtime/` | 业务算法可同步；存储、路径、I/O 必须 Android 化 |
| `win/src/main/documentHub.ts` | Android Platform 内 local hub | 保持行为契约，不移植跨窗口机制 |
| `win/src/main/menu.ts` | 通常不移植 | Android 不显示桌面 AppMenuBar |
| `win/src/main/windowRegistry.ts` | 不移植 | Android 产品边界是单窗 |
| `win/extras/godot-kentucky-dialogue/` | Android 格式读写兼容 | 协议必须同步，Godot 联调仍以 Win 为主 |
| `win/package.json` | `android/package.json` | 只同步 renderer 需要的依赖，不能复制 Electron 配置 |

### 当前必须对齐的版本和 schema 触点

- 应用版本：Win `kentucky@0.2.0`；Android `kentucky-android@0.2.0`，
  `native/app/build.gradle` 当前 `versionName "0.2.0"` / `versionCode 2`。
- `.kmind`：当前为 v2 JSON schema，入口在两端 `editors/kmind.ts`。
- Dialogue：当前为 Godot v1.3，11 列 CSV + choices/layout/meta sidecars。
- `characters.csv`：当前列为
  `id,name,color,note,model_node,operable`，文件位置是工作区根。
- AI：工具名称、参数 schema、`formats.ts`、`tools.ts` 和 proposal 行为必须成组同步。
- Platform：`openContextFiles`、全部 `ai*`、`onAiEvent` 及文档方法必须两端同签名。

这些不是“当前实现细节”，而是跨端磁盘和 API 契约。任何一处变化都应按数据协议升级
处理，并进行双向兼容测试。

### 一个容易改错的 Win 路径

Win 可能存在 `win/src/state/appStore.ts` 之类的转发入口；业务真文件位于
`win/src/renderer/src/state/appStore.ts`。追踪功能时要继续打开 re-export 的目标，
不要在转发文件里实现逻辑，也不要误判 Android 缺少某项功能。

## 4. 永远不能被 Win 覆盖的 Android 文件

以下文件即使 Win 同名文件更新，也必须人工三方合并：

- `android/src/platform/index.ts`
- `android/src/plugins/kentuckySaf.ts`
- `android/src/hooks/useAndroidBackButton.ts`
- `android/src/hooks/useSecondaryClick.ts`
- `android/src/hooks/useSpatialWheelScroll.ts`
- `android/src/editors/rfTrackpadProps.ts`
- `android/src/App.tsx`
- `android/src/workbench/Workbench.tsx`
- `android/src/workbench/EditorArea.tsx`
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

原因分别包括：SAF、单窗、Android Back、触控板原生桥、secondary click、AI drawer、
禁用窄屏 split、全局 UI 缩放、触屏命中区、system bars、CSP 和 Capacitor 构建。

如果某个 AI 准备执行“从 `win/src/renderer/src` 覆盖整个 `android/src`”，必须立即停止。

## 5. 每次 Win 正式功能更新后的标准流程

### 阶段 A：确定同步范围

1. 明确 Win 功能已经完成并通过 Win 自身构建。
2. 记录该功能涉及的 Win 文件，不要只看 UI 文件：
   - renderer 组件；
   - store 和数据类型；
   - platform 接口；
   - preload API；
   - main IPC；
   - `main/ai`；
   - i18n；
   - CSS；
   - package 依赖；
   - 数据格式和 sidecar。
3. 在开始 Android 修改前，为每个文件分类：

| 类型 | 示例 | Android 策略 |
|---|---|---|
| R：纯 renderer | parser、React 组件、纯 store selector | 复制后人工检查 |
| P：平台契约 | `Platform` 新方法 | 两端接口保持一致，Android 独立实现 |
| E：Electron 专属 | IPC、menu、window、shell | 不复制，重新设计或 no-op |
| N：Node 专属 | `fs/path/crypto` | 改 `WorkspaceIo`、Web API 或 Capacitor |
| A：Android 原生 | SAF、Insets、MotionEvent | 只在 Android 新增 |
| D：数据协议 | CSV、KMind、sidecar schema | 两端必须同版本、同序列化结果 |
| U：UX 差异 | hover、菜单、drawer、触控 | 按 Android 产品决策重新适配 |

4. 如果无法判断类型，先查依赖：
   - 出现 `electron`、`ipcRenderer`、`window.kentucky`：E。
   - 出现 Node `fs`、`path`、`crypto`：N。
   - 只依赖 React/Zustand/纯 TS：通常 R。
   - 改变文件内容或 sidecar 结构：D，必须提高测试优先级。

#### 用 Git 确定 Win 的真实改动

如果知道上次同步所对应的 Win commit/ref：

```powershell
Set-Location "D:\Working Directory\Kentucky"
git diff --name-status <last-synced-ref>..<new-win-ref> -- "win"
git diff <last-synced-ref>..<new-win-ref> -- "win/src/renderer/src"
git diff <last-synced-ref>..<new-win-ref> -- "win/src/main" "win/src/preload"
git diff <last-synced-ref>..<new-win-ref> -- "win/package.json" "win/package-lock.json"
```

如果没有可靠的上次同步 ref：

1. 不得猜“只有当前打开的 UI 文件变了”。
2. 从功能入口向下追踪 imports、store action、Platform、preload、IPC 和数据格式。
3. 对同名纯业务文件逐个比较，例如：

```powershell
git diff --no-index -- `
  "win/src/renderer/src/editors/dialogueCsv.ts" `
  "android/src/editors/dialogueCsv.ts"
```

`git diff --no-index` 返回 1 通常只表示“有差异”，不是命令故障。比较结果必须区分：

- Win 的新业务变化；
- Android 仍未同步的旧变化；
- Android 有意保留的平台差异。

每次同步完成后，在 `changelog.md` 记录 Win ref/版本/日期。没有 ref 时明确写“工作区
快照，未提交”，避免下一位 AI 误以为存在稳定基线。

### 阶段 B：先同步依赖和类型，不急着复制 UI

1. 比较 `win/package.json` 与 `android/package.json`。
2. 只添加 Android renderer/runtime 确实需要的包。
3. 不得把以下桌面依赖加入 Android：
   - `electron`
   - `electron-builder`
   - Electron/Vite main 构建插件
   - 只能在 Node 环境运行的文件或数据库包
4. 不得从 Win 复制以下生成物或环境文件：
   - `node_modules/`
   - `out/`
   - `release/`
   - Win 的 `package-lock.json`
   - `.env`、API Key、签名文件
5. 使用 Android 根目录自己的 npm：

```powershell
Set-Location "D:\Working Directory\Kentucky\android"
npm install <package>
npm run typecheck
```

6. 不要手写猜测依赖版本；用 npm 安装当前兼容版本，并检查 lockfile。

### 阶段 C：先移植数据协议和纯算法

推荐顺序：

1. 类型和 schema；
2. parser / serializer；
3. path-independent 算法；
4. store；
5. 编辑器组件；
6. workbench 接线；
7. CSS 和 i18n。

原因：如果先复制 UI，类型错误会与平台错误混在一起，后续 AI 很难定位。

对话功能需要同时检查：

- `dialogueCsv.ts`
- `dialogueGraphMap.ts`
- `DialogueEditor.tsx`
- `DialogueInspector.tsx`
- `DialogueLineNode.tsx`
- `DialogueMiniMap.tsx`
- `dialogueSidecarFlush.ts`
- AI `formats.ts` / `tools.ts`
- `win/extras/godot-kentucky-dialogue/` 的协议说明

当前 sidecar 命名必须保持：

```text
foo.dialogue.csv
foo.dialogue.choices.json
foo.dialogue.layout.json
foo.dialogue.meta.json
```

不得生成 `foo.dialogue.csv.meta.json`。不得在图数据尚未 hydrate 完成时写出空 CSV。

### 阶段 D：人工合并 renderer

#### 可以接近直接同步的区域

- 纯格式工具；
- 没有平台调用的 React 子组件；
- AI 消息展示；
- 中英文业务文案；
- Monaco/TipTap 的业务命令；
- Zustand 中纯状态变换。

#### 必须逐段合并的区域

- `App.tsx`：Android 有系统返回键，并删除桌面菜单/窗口监听。
- `Workbench.tsx`：Android 没有 AppMenuBar，窄宽 AI 是覆盖 drawer。
- `EditorArea.tsx`：Android 窄宽禁用 split，tab close 有触控命中保护。
- `SettingsPage.tsx`：Android 有独立 `uiScale`。
- `settingsStore.ts`：Android 有 settings schema migration 和 CSS scale 应用。
- `ActivityBar.tsx`：Android 无工作区错误用 Toast，行为不能依赖桌面窗口。
- `FileTree.tsx`：需兼容 SAF、ghost tabs、Android secondary click。
- `Sidebar.tsx`：需保留触屏命中区和 Pointer Events sash。
- `MindMapEditor.tsx` / `DialogueEditor.tsx`：需保留
  `rfTrackpadProps`、pinch、pan、secondary click。
- `MarkdownArticleEditor.tsx`：需回归 native wheel 与 AI 同时滚动。
- `global.css`：只能按 selector 人工合并，禁止全文件覆盖。

#### CSS 合并规则

1. 新业务样式可以移植。
2. UI 字号优先使用 Android 已有 tokens：
   - `--ui-font-base`
   - `--ui-font-sm`
   - `--ui-font-xs`
   - `--ui-scale`
3. 应用 chrome 尺寸使用 `calc(... * var(--ui-scale))`。
4. Monaco、TipTap、React Flow 不使用根 `zoom` 或 `transform: scale`。
5. 触屏操作至少检查 `(pointer: coarse)` 命中区。
6. 窄宽 AI 相关 selector 必须同时检查 `@media (max-width: 1100px)`。
7. 不要给 Web 根添加 `env(safe-area-inset-top)`；system bar inset 已由原生处理。

### 阶段 E：同步 Platform 契约

Win 和 Android 当前都在各自的 `src/.../platform/index.ts` 内声明 `Platform`。
若 Win 新功能增加平台能力，必须按以下顺序处理：

1. 读取 Win renderer Platform 的新增方法签名。
2. 读取 `win/src/preload/index.ts` 是否增加 `window.kentucky` 方法。
3. 读取 `win/src/main/index.ts` 或 `registerAiIpc.ts` 的真实语义。
4. 将同一业务方法签名加入 Android `Platform` 接口。
5. 在 `createAndroidPlatform()` 返回对象中实现。
6. Android UI 只能调用 `getPlatform().newMethod()`，不能直接碰
   `KentuckySaf`、Filesystem 或 `window.show*Picker`。
7. 如果该功能属于明确不做项，保留签名兼容并实现安全 no-op 或明确 Toast；
   不能留下 `throw new Error('not implemented')` 让普通操作崩溃。

Android Platform 的主要后端：

| 后端 | 使用场景 | 关键事实 |
|---|---|---|
| `saf` | Capacitor 真机主路径 | 路径必须相对 tree URI；调用 `KentuckySaf` |
| `fsa` | Chrome/Edge 浏览器开发 | 目录句柄放 IndexedDB；不是最终真机验证 |
| `cap` | SAF 不可用时降级 | `Directory.Documents/kentucky-workspace`；不要当主设计 |

新增文件操作时，至少实现 `saf` 和 `fsa`；如现有功能允许降级，再实现 `cap`。

媒体 URL 也不是跨端同一种实现：

- Win 使用 main process 注册的 `kentucky-file://`；
- Android SAF 读取 base64 后生成 `data:<mime>;base64,...`；
- Android Cap 后端使用 `Capacitor.convertFileSrc()`；
- Android FSA 使用 object URL，并负责撤销旧 URL。

因此从 Win 复制图片/音频预览逻辑时，只同步 `platform.toMediaUrl()` 的调用，禁止把
`kentucky-file://` 拼接规则带到 Android。

### 阶段 F：把 Electron main/preload 功能改造成 Android 能力

#### 情况 1：文件读写

禁止移植：

```ts
import { readFileSync, writeFileSync } from 'fs'
```

应通过：

```ts
const platform = getPlatform()
const content = await platform.readFile(path)
await platform.writeFile(path, content)
```

AI runtime 内部则使用注入的 `WorkspaceIo`，见：

- `android/src/ai-runtime/tools.ts`
- `android/src/ai-runtime/bridge.ts`
- `android/src/platform/index.ts`

`WorkspaceIo` 必须只暴露工作区内的异步操作。所有 AI path 参数都要先标准化并限制
在 workspace 内，不能允许 `..` 越界。

#### 情况 2：路径处理

- UI 统一使用 Platform 的 `joinPath/basename/dirname/extname/relativeTo`。
- AI runtime 使用 `android/src/ai-runtime/pathUtil.ts`。
- 不要在 Android runtime import Node `path`。
- SAF 内部路径统一使用 `/`，UI 展示根名与真正 tree URI 分开保存。

#### 情况 3：随机 ID / crypto

- 优先 Web Crypto：`crypto.randomUUID()` 或 `crypto.getRandomValues()`。
- 如果目标 WebView 兼容性不足，再增加有测试的 fallback。
- 不要 import Node `crypto`。

#### 情况 4：菜单和窗口

以下通常不移植：

- File/Edit/View/Help AppMenuBar；
- 新建主窗口；
- 浮动编辑窗口；
- Windows shell reveal；
- Electron close event。

对应能力如果为了接口一致而保留：

- `newMainWindow` / `newFloatWindow`：安全 no-op；
- `showItemInFolder`：无可用 Android 语义时 no-op 或 Toast；
- 关闭行为：Android Back 分层关闭，根页面最小化。

不要因为 Win 新增菜单入口，就在 Android 恢复 AppMenuBar。应把同一业务动作放到
Welcome、ActivityBar、Sidebar、Settings、上下文菜单或快捷键。

#### 情况 5：系统文件选择器

优先判断是否已有 SAF 能力。若没有：

1. 扩展 `KentuckySafPlugin.java`；
2. 扩展 `kentuckySaf.ts` 接口；
3. 必要时在 Java 注册 Activity Result；
4. 在 Android Platform 包装，不让 UI 直接调 plugin；
5. 处理取消、权限持久化、MIME、多个选择结果和进程恢复。

### 阶段 G：AI 功能同步

Win AI 位于 `win/src/main/ai/`，Android 位于 `android/src/ai-runtime/`。两者业务能力
应保持一致，但运行环境完全不同。

当前 app-body 数据位置：

- Win 开发态通常位于 `win/dev-data/data/`，打包后位于 exe 旁 `data/`；
- Android 真机位于 `Directory.Data/kentucky-data/`；
- Android 浏览器预览使用 IndexedDB 镜像。

工作区文件协议需要跨端兼容，但 app-body 的物理路径不应互相复制。

#### 通常可以同步的 AI 文件

- `formats.ts`
- `kmindLayout.ts`
- proposal gate 规则
- agent prompt / tool definitions
- OpenAI-compatible 请求和流解析（确认只用 Web API）
- session 数据结构
- profile 公共类型

#### 必须 Android 化的 AI 文件

- `tools.ts`：Node fs → `WorkspaceIo`
- `storage.ts`：用户数据目录 → Capacitor Preferences / Filesystem / IndexedDB
- `appBodyPaths.ts`：不能使用 Electron `app.getPath`
- `skills.ts`：Win 可按磁盘目录导入；Android 使用已选择文件内容记录，目录浏览、
  import 参数和 reveal 语义不同
- `webSearch.ts`：检查 WebView CSP、CORS、网络权限
- `bridge.ts`：替代 `registerAiIpc.ts`，直接创建异步 API 并发事件

#### 每次同步 AI 工具必须做

1. Win `getWritingTools()` 增加/修改工具定义时，同步 Android定义。
2. 同步工具执行分支，而不仅是 JSON schema。
3. 检查读写是否全部走 `WorkspaceIo`。
4. 检查 proposal Accept/Reject/Apply All 的结果一致。
5. 检查自动落盘阈值、dirty tab、ghost tab 和“全部保存”。
6. 检查会话与 profile 升级，不得丢失旧 Preferences 数据。
7. 真机用真实兼容 API 发一轮消息，不能只测试 mock。
8. 网络失败、无 Key、Abort、App 切后台后恢复都要有可理解结果。
9. **对照** [`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md) 与 OPEN 工单 [`OPEN-agent-tool-feedback-parity.md`](./OPEN-agent-tool-feedback-parity.md)：写入门禁、`toolApi`/`gateDetail`、characters 强制落盘、continuity 无全文、Plan 返回值、append 建表、FS 工具、`propose_upsert_characters`、web snippet、diff/批量 UI。缺一项不得标「AI 已对齐」。

#### 网络与安全

- API Key 只能存 Capacitor Preferences/应用私有区，不写工作区。
- Win 使用 Electron `safeStorage` 的 Key 文件；Android 当前使用 Preferences
  `ai-key:{profileId}`。两端没有自动密钥迁移，升级功能时不要声称会自动共享 Key。
- 工作区正文和 AI 会话要明确区分。
- `index.html` CSP 必须允许所需 API URL；不能为了省事改成完全开放。
- WebView 请求可能受 CORS 限制；Win main process 能请求不代表 WebView 也能请求。
- 若必须绕过 CORS，应设计 Capacitor 原生 HTTP 能力，不要偷偷禁用 Web 安全。

### 阶段 H：新增 Android 原生能力

只有以下情况才应修改 `android/native/`：

- SAF/系统选择器；
- Android 系统栏、WindowInsets、IME；
- Android Back 或 Activity lifecycle；
- WebView 无法可靠处理的 trackpad/keyboard 事件；
- 必须由 Android API 提供的能力。

新增 Capacitor plugin 的标准步骤：

1. Java 类放在：

```text
android/native/app/src/main/java/com/ccfox12/kentucky/
```

2. 使用与现有工程一致的 Capacitor 7 import。
3. 在 `MainActivity.onCreate()` 的 `super.onCreate()` **之前**注册：

```java
registerPlugin(MyPlugin.class);
```

4. 在 `android/src/plugins/` 增加 TypeScript interface 与 `registerPlugin()`。
5. 在 Platform 包装 plugin。
6. 如需权限，更新 Manifest，并区分运行时权限与 SAF URI permission。
7. 如需依赖，更新 `native/app/build.gradle`。
8. 运行 `npm run cap:sync` 后再用 Android Studio Run 重装。

原生层特别注意：

- 当前 `native/variables.gradle` 为 `minSdk 23`、`compileSdk 35`、`targetSdk 35`；
  升级 SDK 前必须回归 edge-to-edge、权限、SAF 和软键盘。
- JDK 用 17 或 21；Gradle 8.11 不支持过新的 class file 版本。
- `takePersistableUriPermission` 只能传 READ/WRITE flags。
- 文本文件创建不能用 `text/plain`，否则部分 DocumentsProvider 自动附加 `.txt`。
- 当前统一用 `application/octet-stream` 保存可编辑文本。
- system bar inset 必须应用到 WebView layout margins，不能改回根 padding。
- `MainActivity.dispatchGenericMotionEvent` 只拦 pointer `ACTION_SCROLL`，不能影响触屏。
- 原生 wheel 坐标必须减去 WebView `getLocationOnScreen()`，再做归一化。

### 阶段 I：Android UX 适配

Win 新功能完成移植后，必须问以下问题：

1. 入口是否依赖桌面菜单？若是，为 Android 增加平板可见入口。
2. 操作是否只有 hover 才能发现？触屏必须可见或有明确手势。
3. 命中区是否至少约 44dp？尤其是关闭、菜单、拖拽柄。
4. 是否使用右键？Android 要支持触控板次要点击；不要让手指长按误触。
5. 是否新增可滚动容器？确认 `overflow:auto|scroll`，并用触控板验证
   `useSpatialWheelScroll` 的通用 fallback。
6. 是否新增 React Flow 画布？使用 `rfTrackpadProps`，不要自行发明另一套滚轮语义。
7. 是否在 `<=1100px` 仍可用？AI drawer 打开时不能挤没编辑器。
8. 是否会被状态栏、导航栏、IME 遮挡？
9. Android Back 应该先关闭哪个层？按“最上层 overlay → 页面 → 最小化”接入。
10. `uiScale` 90%/100%/130% 是否都不截断？

### 阶段 J：持久化和迁移

修改以下任一内容时必须设计 migration：

- Zustand localStorage schema；
- AI settings/profile/session；
- app-body 文件结构；
- 工作区 sidecar；
- SAF workspace metadata；
- Android Preferences key。

要求：

1. 新字段必须有默认值。
2. 旧字段读取失败不能阻止 App 启动。
3. schema 有版本号时递增版本，不要只改类型。
4. 保存前确保 hydrate 已完成，避免默认值覆盖旧值。
5. Win 与 Android 的工作区文件协议必须兼容；应用私有配置可以独立。
6. 数据协议升级要测试“旧 Win 文件在新 Android 打开”和“新 Android 文件在 Win 打开”。

### 阶段 K：构建、同步和安装

Web 层基础验证：

```powershell
Set-Location "D:\Working Directory\Kentucky\android"
npm run typecheck
npm run build
```

同步 Web 资产到原生工程：

```powershell
npm run cap:sync
```

命令行原生编译（本机示例）：

```powershell
Set-Location "D:\Working Directory\Kentucky\android\native"
$env:JAVA_HOME = "C:\Users\CHEN\.jdks\jbr-21.0.11"
.\gradlew.bat compileDebugJavaWithJavac
.\gradlew.bat assembleDebug
```

打开 Android Studio：

```powershell
Set-Location "D:\Working Directory\Kentucky\android"
npm run cap:open
```

必须理解三层产物：

```text
android/src
  ↓ npm run build
android/dist
  ↓ cap sync
android/native/app/src/main/assets/public
  ↓ Gradle / Android Studio Run
设备上的 APK
```

- 只改 `src/`：至少 build + cap sync；设备仍需重新 Run/安装才能看到新 bundle。
- 改 `native/`、Manifest、Gradle、resource：必须重新 Gradle 编译和安装。
- 只看到浏览器新效果，不代表设备 APK 已更新。

#### 发布版本号

准备 Android 正式包时同时检查：

- `android/package.json` 的 `version`；
- `android/package-lock.json` 根 package 的 version；
- `android/native/app/build.gradle` 的 `versionName`；
- `android/native/app/build.gradle` 的 `versionCode`。

`versionName` 应与产品版本一致；`versionCode` 每次向设备/商店发布必须递增，不能只改
字符串版本。功能仍在开发且未准备发布时，不要擅自提高版本号；在 changelog 标记
`0.2.0+` 或对应开发状态即可。

## 6. 常见 Win 功能的移植模板

### 6.1 新增一种编辑器/文件类型

1. 同步 parser/serializer 和 editor component。
2. Android `appStore.detectKind()` 加扩展名识别。
3. `EditorArea` 加 editor 分发。
4. `FileTree`、新建菜单、显示名、图标和 i18n 同步。
5. Platform/SAF 确认该扩展名不会被自动加 `.txt`。
6. AI `formats/tools` 如需理解该类型，同步工具。
7. 测试新建、打开、编辑、dirty、保存、放弃、重命名、移动、删除、重启恢复。

### 6.2 新增一个 Platform 文件操作

1. Win renderer Platform 加签名。
2. Win preload 和 main IPC 完成。
3. Android Platform 加相同业务签名。
4. 分别实现 SAF/FSA/cap。
5. 若 SAF plugin 缺能力，扩展 Java + TS plugin。
6. UI 只调用 Platform。
7. 测试根目录、嵌套目录、中文/空格文件名、已存在目标、取消与权限失效。

### 6.3 新增 AI 工具

1. 同步 tool JSON schema、执行代码和结果格式。
2. Android 工具不得 import Node API。
3. 文件访问注入 `WorkspaceIo`。
4. proposal 是否需要 Accept 必须与 Win 一致。
5. UI 事件 channel 和 `Platform.onAiEvent` 同步。
6. 测试成功、模型参数错误、Abort、越界路径、写文件后 tab/树刷新。

### 6.4 新增设置项

1. Win 和 Android 分别决定它是跨端业务设置还是平台专属设置。
2. Android `settingsStore` 加默认值、hydrate、persist、migration 和 setter。
3. `SettingsPage` 加 UI 与 i18n。
4. 若影响 CSS，接 token，不给根加 zoom/transform。
5. 测试重启恢复、旧设置迁移、非法值 clamp。

### 6.5 更新对话/Godot 协议

1. 先更新协议文档和 fixtures，再改两端 parser/serializer。
2. 同步 Win renderer、Win AI、Android editor、Android AI。
3. 明确 sidecar 文件名与缺省值。
4. 双向兼容测试：
   - Win 写 → Android 读/改 → Win 再读；
   - Android 写 → Godot importer 读；
   - 老 v1.3 文件升级后不丢字段。
5. Android 不负责 Godot 同盘热编体验，但必须保证磁盘格式正确。

### 6.6 新增第三方前端依赖

1. 先确认包支持浏览器/WebView，不依赖 Node built-ins。
2. 在 Android 根单独安装。
3. 检查 bundle 体积和动态 import。
4. 检查 CSP、Web Worker、wasm、字体和离线资源。
5. CDN 不是可接受的核心依赖来源；Monaco 等必须随 APK 打包。

## 7. 强制回归矩阵

### 7.1 每次移植都做

- Android `npm run typecheck`
- Android `npm run build`
- IDE lints 无新增错误
- `git diff --check`
- 浏览器预览完成基本路径
- `npm run cap:sync`
- JBR 17/21 `gradlew assembleDebug`

### 7.2 文件功能

- 首次打开 SAF tree；
- 杀进程后恢复 tree permission；
- 根目录和两级嵌套目录；
- 中文、空格、长文件名；
- 新建/读取/保存/另存语义；
- rename/move/delete；
- 图片与上下文文件选择；
- dirty tab、discard、全部保存；
- AI 新建但未落盘的 ghost tab；
- 不出现 `.md.txt` / `.csv.txt`。

### 7.3 编辑器

- Markdown：输入、格式、链接、图片、滚动、word count；
- Monaco：大文件、快捷键、行导航；
- KMind：节点/边、保存、布局、捏合和触控板平移；
- Dialogue：CSV + choices/layout/meta sidecar、mini map、inspector；
- Characters：与 dialogue speaker/AI proposal 联动；
- split：宽屏可用，`<=1100px` 自动禁用。

### 7.4 Android UX

- 黑色原生状态栏，tabs 不重叠；
- 导航栏和 display cutout 不遮内容；
- IME 不遮 AI composer/编辑输入；
- Android Back 分层关闭；
- tab close 可点；
- coarse pointer 命中区；
- 90% / 100% / 130% `uiScale`；
- 宽屏三栏与窄宽 AI drawer；
- Activity 切后台/回来状态合理。

### 7.5 触控板/键盘

- Settings、文件树、Inspector、角色列表可滚；
- Markdown 与 AI 可反复交替滚；
- MindMap/Dialogue 与 AI 可反复交替；
- React Flow 双指平移、捏合缩放、Ctrl/Meta+滚轮缩放；
- 手指触屏滚动正常；
- 触控板次要点击正常，手指长按不误开菜单；
- Ctrl+S/O/L 等快捷键；
- 整页 WebView 不发生意外 pinch zoom。

### 7.6 AI

- 无 Key 提示；
- profile 增删改切换；
- session 创建/恢复/删除；
- streaming、Abort、错误显示；
- context files；
- proposal 单个/全部 Accept/Reject；
- AI 修改文件后 editor、dirty、tree、sidecar 一致；
- App 重启后配置和会话仍在；
- Key 不出现在工作区文件和日志。

## 8. 常见失败及定位顺序

### 编译能过，真机仍是旧界面

1. 检查是否执行 `npm run cap:sync`。
2. 检查 `native/app/src/main/assets/public` 是否更新。
3. Android Studio 重新 Run，必要时卸载旧包。
4. 不要只刷新浏览器预览。

### 浏览器正常，真机打不开文件夹

1. 确认 `Capacitor.isNativePlatform()` 分支优先 SAF。
2. 确认 `KentuckySafPlugin` 已注册。
3. 确认 Java 改动已重新安装，不只是 cap sync。
4. 检查 URI permission flags。
5. 不要静默退回 WebView 的伪 `showDirectoryPicker`。

### 文件扩展名多出 `.txt`

1. 检查 Java 创建 MIME。
2. 不用 `text/plain`。
3. 使用 `application/octet-stream`。
4. 回归 `.md`、`.csv`、`.json`、`.kmind`。

### 新 UI 在 Android 缺入口

1. 检查 Win 是否只加了 AppMenuBar/menu IPC。
2. 在 Android ActivityBar/Sidebar/Settings/上下文菜单增加入口。
3. 同步快捷键，但不要恢复桌面菜单栏。

### 新功能调用 `window.kentucky` 报错

说明把 Win renderer 代码原样复制到了 Android。改成 `getPlatform()`，并在 Android
Platform 实现对应方法。

### Node built-in 找不到

说明复制了 main-process 代码。按以下顺序改造：

1. 文件 → `WorkspaceIo`/Platform；
2. path → Platform/pathUtil；
3. crypto → Web Crypto；
4. app userData → Capacitor Preferences/Filesystem；
5. dialog/shell → Platform/原生 plugin/no-op。

### Settings 或普通面板触控板不滚

1. 容器必须真的形成 overflow：父 flex 链有 `min-height: 0`。
2. 容器使用 `overflow-y: auto|scroll`。
3. `useSpatialWheelScroll` 会寻找指针下最近 overflow ancestor。
4. 不要给 viewport 加 `user-scalable=no`。
5. 真机仍失败再记录 native raw coordinate 与 `elementFromPoint`。

### 顶部与系统栏重叠

1. 不在 Web CSS 添加第二份 safe-area padding。
2. 检查 `MainActivity.configureSystemBars()`。
3. Insets 应写入 WebView layout margins，不是根 CoordinatorLayout padding。
4. 修改 Java 后重新 Run 安装。

### Gradle 报 unsupported class file major version

Shell 正在用过新的 JDK。改用 JDK/JBR 17 或 21，不要改 Gradle 来迎合 JDK 25。

## 9. 每次同步必须留下的记录

在 `changelog.md` 新增一节，至少包含：

```markdown
## <Android version> — 同步 Win <feature/version/date>

- Win 功能来源：
  - 功能名称
  - Win 版本/commit（若可用）
  - Win 涉及文件
- Android 实现：
  - 直接同步的纯业务文件
  - 人工合并的 Android UI 文件
  - Platform/SAF/ai-runtime/原生改造
- 明确未移植：
  - 桌面专属功能及原因
- 数据兼容：
  - schema/sidecar/version 变化
- 验证：
  - typecheck/build/cap sync/Gradle
  - 真机型号与通过/待验收项目
```

同时按影响更新：

- `architecture.md`：长期架构变化；
- `product-decisions.md`：产品边界变化；
- `gotchas.md`：踩坑和禁止项；
- `how-to-run.md`：构建/验收流程变化；
- `SESSION-HANDOFF.md`：当前状态和下一步；
- 独立 `OPEN-*.md`：未解决且需要真机继续追踪的问题。

不得只在聊天里说“已经同步”，却不更新 project-memory。

## 10. 完成定义

一个 Win 功能只有满足以下全部条件，才可标记“已移植 Android”：

- Android 有可发现入口；
- 核心业务行为与 Win 一致；
- Electron/Node 依赖已替换；
- SAF 真机路径可用；
- 数据格式双向兼容；
- Android Back、system bars、IME、touch/trackpad 不回归；
- `uiScale` 和窄宽 drawer 不回归；
- typecheck/build/cap sync/assemble 通过；
- 真机必测项已实际验证，或在 `OPEN-*.md` 明确标记“待真机验收”；
- project-memory 已记录来源、差异、验证和遗留项。

“代码已复制”“TypeScript 能编译”“浏览器能打开”都不等于移植完成。

## 11. 给后续 AI 的最短执行清单

如果上下文不足，严格执行：

1. 读 `README.md` → `SESSION-HANDOFF.md` → 本文 → `gotchas.md`。
2. 找出 Win 功能的 renderer/main/preload/AI/依赖/协议全部改动。
3. 分类 R/P/E/N/A/D/U。
4. 先移植类型、协议、纯算法。
5. renderer 逐文件人工合并；绝不覆盖 Android 特有文件。
6. 新平台能力先对齐 `Platform` 接口，再实现 SAF/FSA/cap。
7. main/AI 的 Node I/O 改 `WorkspaceIo` 或 Capacitor。
8. 补 Android 入口、Back、touch、trackpad、drawer、uiScale。
9. 跑 typecheck/build/cap sync/assemble。
10. 真机验证 SAF、系统栏、滚动、键盘和本功能。
11. 更新 changelog/handoff/gotchas；未验收内容写 OPEN。

任何一步不清楚时，先停止修改并继续读代码，不要用空实现、浏览器 API 假实现或整目录
覆盖来“让编译通过”。
