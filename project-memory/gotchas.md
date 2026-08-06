# 踩坑与约束

## Electron

- **`window.prompt` 基本不可用** → 凡需输入用应用内表单（见 `Sidebar` 内联创建）。
- `window.confirm` 一般可用（删除确认等）；若以后也失效，改成自绘对话框。
- 原生菜单在 **main** 里 `Menu.setApplicationMenu`；语言变更通过 `Platform.setMenuLocale`。
- Windows/Linux：**隐藏原生菜单栏**（无自定义悬停），改用渲染层 `AppMenuBar`（悬停高亮、点击展开）；原生 Menu 仍保留以支持快捷键。macOS 继续用系统菜单栏。
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
- 连线手柄圆心贴边缘（半进半出）；连线接到手柄外沿，故缩放补偿上限宜小，避免空隙过大。
- 自绘小地图节点不要加 `react-flow__minimap-node` class，否则会被 RF 默认浅色 `fill` 盖成全白。
- 边必须持久化 `sourceHandle`/`targetHandle`，否则重载后 smoothstep 会并到同一点。
- TipTap + `tiptap-markdown`：用 `storage.markdown.getMarkdown()` 写回；切模式时注意 `applyingRef` 防回环。
- 正文不要开浏览器拼写检查：TipTap `spellcheck: false`，且 `BrowserWindow` `webPreferences.spellcheck: false`。
- 「了解 KENTUCKY」链接写在 `menu.ts` 与 `menu:runAction` 的 `learnMore` 两处，须保持同一仓库 URL。
- 多窗口：正文走 DocumentHub；`updateTabContent` 经 `doc:patch`，远端 `doc:apply` 时用 `applyingFromHub` / `docRev` 防回环；导图需监听 `tab.content` 外同步（勿只在 `tabId` 时 load）。
- 关最后 **主窗** 才 `app.quit()`；精简窗不保活。主窗 `reportWorkspace(null)` 且无其它主窗仍开该工作区 → destroy 对应 float。
- 精简窗**不要**挂 `beforeunload` 拦关窗；关窗走主进程 `close` → `window:close-request` → 应用内「保存 / 不保存 / 取消」对话框，再 `window:confirmClose`。
- 启动：主窗 `show: false`，先弹轻量 `splash.html`（与 boot-splash 同款），`ready-to-show` / `did-finish-load` 后再显示主窗并关闪屏；便携 exe 解压阶段仍可能短暂系统转圈（Electron 尚未起来）。
- 闪屏主题：独立 BrowserWindow **读不到**主窗 localStorage（dev 为 http、闪屏为 file）。主题写入 `userData/kentucky-theme.json`（`theme:persist`）；闪屏用 query `accent`/`mode` 注入。改主体色后需至少启动一次主窗才会同步到下次闪屏。
- 预加载 / IPC 变更后须**重启** Electron 进程，热更新不够。
- 链接对话框用应用内表单，**勿用** `window.prompt`。
- 字数：`wordCount.ts` 计**非空白码点**（中英一视同仁）；勿按英文「词」分词，否则一行 `dddd…` 只算 1，UI「字」会对不上。
- TipTap React 19：`useEditor({ immediatelyRender: false })`。
- 工具栏 `isActive` 必须用 `useEditorState` 订阅，否则开关格式后高亮不刷新（要打字才更新）。
- 侧栏可能被用户关掉：打开工作区或点活动栏「资源管理器」时应 `setSidebarVisible(true)`。
- 选项卡（`.tab`）需 `cursor: pointer` + `user-select: none`，否则悬停标题会变 I 形光标。

## 导图 assets 与链接

- 插图必须复制进与 `.kmind` **同级**的 `名.assets/`，`image.src` 存相对工作区路径，勿存机器绝对路径。
- 移除图片时删节点引用 **并删除** assets 内该副本，避免孤儿文件。
- `imageOnly` 参考图：删除节点 / 移除图片 / Delete 键均应删 assets 副本；仅 `imageOnly` 挂 `NodeResizer`（`keepAspectRatio`），普通插图节点不要挂。
- 节点「插入图片」仍走 `openImage` 单选；空白「导入参考图」走 `openImages` 多选，二者勿混用。
- 渲染层显示本地图用 `kentucky-file://local/?path=…`（经 `toMediaUrl`），勿直接塞任意 `file://`。
- `index.html` 的 CSP `img-src` **必须**包含 `kentucky-file:`，否则缩略图会显示为裂图（协议本身正常也会被拦）。
- 启动灰屏：`public/boot-theme.js` 读 `kentucky.settings` 设 `--boot-*`（CSP 无 `unsafe-inline`，**勿用** head 内联 script）；`hydrate` 后再用 `--accent-soft` 同步光晕。淡出用 `.boot-splash-out`。
- 段落跳转用 `lineFlash`（带 nonce）；Markdown 高亮是编辑器内 **绝对定位遮罩**，不要只给 TipTap DOM 加 class（会被重绘清掉）。
- 仅「选行设链」时进源码模式显示行号；跳转留在 WYSIWYG。
- 点行设链时 `linePickSession` 会强制分屏；点选完成后经 `linePickResult` 写回导图节点（勿只改磁盘 JSON，画布状态在 React Flow 本地）。
- 批注下巴 `position: absolute; top: 100%`，不计入 `node.height`；节点与 RF wrapper 需 `overflow: visible`。
- 节点原描边保留；下巴另加同色 `1.5px` 描边（无顶边，左右用 `left/right: -1.5px` 与节点外框对齐）；节点底角保持与其它角相同圆角，中间分割线才有倒圆角。
- 下巴须 `top: calc(100% + 1.5px)`，从节点**外边框之外**开始；若用 `top: 100%` 会盖住节点底边描边，中间只剩一条缝里透色。
- 圆角底边与下巴侧线缺位：把下巴整体上移 `--kmind-radius`，侧边框随之上延；`padding-top` + `background-clip: content-box` 保证黑底不盖住节点圆角。勿用伪元素另画描边。
- 节点填色跟圆角：内容包在 `.kmind-node-shell`（`overflow: hidden; border-radius: inherit`），外层仍 `overflow: visible` 以免裁掉下巴。
- 批注 textarea：黑底、`overflow: hidden`、`resize: none`，高度随 `scrollHeight` 同步；勿设 `max-height` 引出滚动条。
- 切换箭头勿加 `:hover` 背景高亮。
- `note` 字段存在即有下巴（可为 `''`）；清除批注须删掉 `note`/`noteOpen`/`noteLink`，不是写空串。
- 选行写回区分 `linkTarget: 'node' | 'note'`，勿把批注链写进节点标题 `link`。
- 「在文件资源管理器中显示」走 Platform `showItemInFolder`；主进程对**目录**用 `shell.openPath`（打开该文件夹），对**文件**用 `shell.showItemInFolder`（在父目录中选中）。目录切勿只用 showItemInFolder，否则会进上一级。

## 产品边界

- 写作与思维导图 **不自动同步**。
- 欢迎卡片最多展示 6 个，不做真实文件夹截图。
- 渲染层只依赖 `getPlatform()`，为以后安卓平板留口。
- 台词：仅 `*.dialogue.csv` 走 DialogueEditor；普通 `.csv`（含 `characters.csv`）仍 Monaco。`characters.csv` 路径固定工作区根，勿做成可配置。
- 台词 id 唯一性要扫工作区全部 `.dialogue.csv`（不只当前文件）；改 text/meta 默认不改 id。
- Godot 热编辑：打开工程内 `dialogue/` 当工作区即可同文件联动；监视/重载插件在 **Godot 工程自研**，契约见 `extras/godot-kentucky-dialogue/README.md`。勿把「导出 CSV」当热编辑主路径。
- 台词 meta：`foo.dialogue.csv` 对应 `foo.dialogue.meta.json`（非 `.dialogue.csv.meta.json`）；删台词 / 重命名台词文件时同步处理 meta。
- 新建台词文件名由场景 stem + 对话标识自动生成；信息卡不提供改名，改名用资源管理器右键。

## Windows 启动

若 PowerShell 禁止运行 `npm.ps1`：

```bat
cmd /c npm run dev
```
