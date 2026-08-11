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
- `.kmind` 脏标记：平移/缩放只改内存中的 viewport，**不**在 `onMoveEnd` 里 persist；保存前再 flush。脏判定忽略 viewport（`src/common/kmindDirty.ts`）。`doc:patch` 回写后渲染层须**本地重算** dirty，勿盲信 `snap.dirty`（旧主进程包会把平移标脏）。打开时推断的连线手柄只用于显示（`persistHandles`）。
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
- 渲染层只依赖 `getPlatform()`。安卓为独立软件根 `../android/`，勿在本目录混入 Capacitor。
- 台词：仅 `*.dialogue.csv` 走 DialogueEditor；basename `characters.csv` 走 CharactersEditor；其它 `.csv` 仍 Monaco。`characters.csv` 路径约定工作区根，勿做成可配置。
- 台词 id 唯一性要扫工作区全部 `.dialogue.csv`（不只当前文件）；改 text/meta 默认不改 id。
- Godot 热编辑：打开工程内 `dialogue/` 当工作区即可同文件联动；执行器参考 [ai_river_godot](https://github.com/CCFOX12/ai_river_godot)（Kentucky **不**附带插件），契约见 `extras/godot-kentucky-dialogue/README.md`（**v1.3**）。勿把「导出 CSV」当热编辑主路径。
- 启动闪屏主题：读 `userData/kentucky-theme.json`；dev 下 splash 走 Vite URL（避免 `out/renderer/boot-theme.js` 过期）；query 里 accent **不带 `#`**；主进程在 `dom-ready`/`did-finish-load` **注入** `--boot-accent*`，不单靠页面脚本。
- 台词演出列：`focus_node` / `font_size` / `text_color`；`font_size` 空与 `0` 磁盘统一空串；`text_color` 仅 `#RGB`/`#RRGGBB`/`#RRGGBBAA`；**空 = 引擎默认正文色，不是** `characters.color`（角色色只用于画布名牌）；Kentucky 不校验节点存在。
- 播放只跟 choices：CSV 有行但从开场经 option 边到不了 → 播不到；开场若要立刻听 NPC，开场 speaker 用非 operable。
- Godot Keep File：Kentucky **不**读写 `*.dialogue.csv.import`；作者在引擎保存/重导后自检 `importer="keep"`。换篇是 Godot `dialogue_id` / `dialogue_file_override`，非 Kentucky API。
- 台词 sidecar：`foo.dialogue.csv` ↔ `foo.dialogue.meta.json` / `.choices.json` / `.layout.json`（非 `.dialogue.csv.meta.json`）；删/重命名/移动同步三者；树里挂在 csv 下默认收起。
- 台词保存：画布未就绪时不得 flush 空 CSV；曾出现「保存后重启文件被清空」即因此。异常时应提示 `saveGraphInconsistent` 而非静默覆盖。
- 台词图：底边全为 option（无顺序边）；空 text：可操作角色=下一句（确认），非可操作=自动过；非空=玩家选项；禁止同节点空/非空混排；连线用 smoothstep。乱图用工具栏「自动排版」（dagre TB，End 沉底）；`.layout.json` 仅 Kentucky 画布用。
- 开场：检视器可设唯一开场节点（互斥）；落盘 CSV 第一行；删除开场后回退无入边最左上；`diskFromGraph` 优先 `isOpening`，勿再用位置覆盖用户选择。
- 角色表 `operable` 列：勾选可操作（玩家）；缺列/空=NPC 自动过句；执行器须按当前行 `speaker` 查表，不可一律等确认。
- UI 动效：Toast/Dialog 离开须本地 retain DOM（`ToastLayer` / `AnimatedDialogShell`），勿在 store 清内容后立刻卸载导致空白闪一下；duration 与 CSS token 对齐（toast 180ms / modal 220ms）。
- `prefers-reduced-motion: reduce` 时须停无限动画（dialogue edge-flow、ai-spin、boot-slide）；覆盖层可瞬切。
- `@starting-style` 入场依赖较新 Chromium（Electron 内可用）；无支持时退化为无入场动画，不影响功能。- 新建台词文件名由场景 stem + 对话标识自动生成；信息卡不提供改名，改名用资源管理器右键。
- 活动栏：视窗键=`home`（起始页、藏侧栏、不关项目）；文件夹键=`explorer`；勿把视窗键做成 `closeWorkspace`。
- 应用图标只维护 `build/icon.png`（无 SVG 底稿）。
- 台词/角色列表滚动：`.editor-area` / `.editor-pane` 须 `min-height: 0` + `overflow: hidden`，否则列表 `overflow-y: auto` 不生效。
- 叠加滚动条：只在 `scroll` 时加 `is-scrolling`（约 1s 后移除）；**不要**用 `:hover` 显示滑块。

## AI / 标签脏标记

- AI 改文件走 `applyAiFileEdit`，**勿**切换 `activeTabId`，否则多文件会来回闪页。
- DocumentHub `doc:apply` / `applyDocSnapshot` 必须**保留**本地 `dirty` 与 `isNew`，否则黄/蓝圆点会被冲掉。
- 新建文件即使已落盘，UI 仍标 `isNew` 直至用户 Ctrl+S；AI 编辑一律先 `dirty: true`。
- 系统提示与工具返回禁止写「请点 Apply」——已无确认栏。
- DeepSeek `fetch failed` 是网络层（代理/防火墙），不是模型名错误（错模型多为 HTTP 4xx）。
- AI 导图：勿让模型手填密网格坐标；用 `autoLayout` / `layout_kmind`。乱成网时先砍交叉边再建树，单靠布局救不了完全二分图。
- AI 台词图：整段脚本用 `propose_dialogue_graph`（线性也写空 text options；勿再用「缺 choices=线性」）；乱画布用 `layout_dialogue`；`nodes` 空才删 choices。choices/layout 与 csv 同轮写入时通常自动落盘，大改 csv 仍可能要 Accept。
- AI Skills：只读 `SKILL.md` / reference / examples；**永不**执行 skill 内 `scripts/`。技能在软件本体 `data/ai-skills/`，不跟工作区走。
- AI 联网：默认关；DDG 超时自动回退 Bing；搜索结果会抓取前几条页面写入 `excerpt`（天气站可解析预报卡）；需要更深可读 `web_fetch`。Brave/Tavily 未实现。
- Plan 模式：计划真相是工作区 `plans/<slug>.plan.md`（同 slug 覆盖），**不是**会话 JSON  alone；AI 面板**不**再挂常驻计划列表。`update_plan_step` 只改 Todos 勾选，勿整文件覆盖冲掉用户改的正文。`plans/` 可随项目提交。
- Agent 归档/迁移：用 `workspace_mkdir` / `workspace_copy` / `workspace_move` / `workspace_delete`，**不要**说「没有 shell / 不能移动删除」。删除须用户明确要求。勿对归档读全文再 `propose_write_file` 抄写。
- 写入门禁：角色 upsert **始终自动落盘**（即使设置是「改完标黄」、即使本轮已改正文）；**没有「5 张卡阈值」**——`≤5` 只约束台词行数。看 `written`/`pending`/`reviewHint`/`gateDetail`/`toolApi`。
- 打开 `.md` 无编辑却变脏：TipTap `getMarkdown` 规范化误写回；已用 hydration 门闩挡住（changelog §62）。
- Markdown AI 写入曾因 TipTap 无 Table 扩展毁掉 `|` 表格（W19）；已修。
- Diff / 批量 Accept 只在 AiPanel；agent 看 `uiReview`。
- 总清单：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)。

## package.json / F5

- `win/package.json` 必须合法 UTF-8。Latin-1 的 `©` 等会触发 Node `Invalid package config`，electron-vite / F5 起不来。

## Windows 启动

若 PowerShell 禁止运行 `npm.ps1`：

```bat
cmd /c npm run dev
```
