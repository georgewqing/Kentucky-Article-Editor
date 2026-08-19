# 踩坑与约束

## Electron

- **`window.prompt` 基本不可用** → 凡需输入用应用内表单（见 `Sidebar` 内联创建）。
- **不要**用 `window.confirm`（Win32 白底系统框，标题 kentucky）。删除/危险确认走 `askConfirm`（`ConfirmDialog` + `app-dialog`）。未保存走 `UnsavedChangesDialog`。
- 原生菜单在 **main** 里 `Menu.setApplicationMenu`；语言变更通过 `Platform.setMenuLocale`。
- Windows/Linux：**隐藏原生菜单栏**（无自定义悬停），改用渲染层 `AppMenuBar`（悬停高亮、点击展开）；原生 Menu 仍保留以支持快捷键。macOS 继续用系统菜单栏。
- Monaco 必须 **本地打包**（`monacoSetup` + `monaco-editor`），CSP 会挡 CDN。

## 路径与 TypeScript

- 源码真身在 `src/renderer/src/**`，不是 `src/state/**`。
- `src/state/appStore.ts` 只是 re-export，给旧 IDE 路径消错用；**改逻辑只改 renderer 下文件**。
- `@/` → `src/renderer/src/*`；改目录时同步 `tsconfig` 与 `electron.vite.config.ts`。

## 标签栏 / 分屏

现行结构见 [`architecture.md`](./architecture.md)「标签栏 / 分屏」。这里只记踩坑。

- **滚轮横滑**必须在 `.tab-bar-scroll` 上 `{ passive: false }`，把较大的 `deltaY` 或 `deltaX` 写成 `scrollLeft`。默认 wheel 只竖滚，标签栏 `overflow-x` 不会跟着动。
- **不要 HTML5 `draggable` 改序。** 松手未 `drop` 时 Chromium 会把拖影弹回（分镜 V1 在 §152 踩过）。标签改序走指针手势；拖动中**不要 splice 标签 DOM**（捕获会丢、竖线下标会乱）。
- **右键改序与分镜时间线相反。** 时间线左键拖块：不要对 pointerdown `preventDefault`、不要把 capture 钉到**别的**节点。标签右键：必须 `preventDefault`（否则系统菜单吃掉手势），并且 `setPointerCapture` 钉在**该 `.tab` 自己**上。另加窗口捕获 `mousemove`/`mouseup`：Windows 上 RMB 经常没有 `pointermove`。
- **不要用 `lostpointercapture` 结束手势。** 右键 capture 可能立刻丢失；若此时清掉 listener，mousemove 兜底也没了，看起来「右键拖完全没实现」。
- **Windows 系统菜单在 mouseup 弹出。** 手势期间要在 document 捕获阶段 `contextmenu` `preventDefault`，否则拖到编辑器松手仍会出菜单。`SelectionContextMenu` 须 skip `.tab-bar`。
- 拖过 **5px** 才算改序；未过阈值的左键 click 仍 `setActiveTab`。改序成功后用 `suppressClickRef` 挡住随后的 click。
- `reorderTabs(id, insertBefore)`：`insertBefore` 是「插到第 n 个**之前**」；若 `from < dest` 先 dest−1 再 splice，否则拖到自己右侧会偏一格。
- **禁止**原生 `<select>` 做分屏「此栏」。Chromium/Electron 在 Windows 上弹出层是系统浅色，CSS 换不了 option 列表。用 `.pane-file-picker-btn` + portal 到 `document.body` 的 `.ctx-menu`（`.editor-pane` 有 `overflow: hidden`）。
- **禁止**恢复「右键标签 = 指定分屏文件」。与改序抢同一手势。
- 「关闭分屏」只放 `.tab-bar-actions`，不要做到每个 pane 里。
- 与分镜 V1 改序不要混：标签改序只动 `tabs[]` 顺序，不碰 `.kyboard`。
- 选项卡（`.tab`）需 `cursor: pointer` + `user-select: none`，否则悬停标题会变 I 形光标。

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

## 导图 assets 与链接

- 插图必须复制进与 `.kmind` **同级**的 `名.assets/`，`image.src` 存相对工作区路径，勿存机器绝对路径。
- 移除图片时删节点引用 **并删除** assets 内该副本，避免孤儿文件。
- `imageOnly` 参考图：删除节点 / 移除图片 / Delete 键均应删 assets 副本；仅 `imageOnly` 挂 `NodeResizer`（`keepAspectRatio`），普通插图节点不要挂。
- 节点「插入图片」仍走 `openImage` 单选；空白「导入参考图」走 `openImages` 多选，二者勿混用。
- 渲染层显示本地图/音/视频用 `kentucky-file://local/?path=…`（经 `toMediaUrl`），勿直接塞任意 `file://`。
- `index.html` 的 CSP `img-src` **必须**包含 `kentucky-file:`，否则缩略图会显示为裂图（协议本身正常也会被拦）。`media-src` 同理（BGM / MP4）。
- 改 `protocol.handle('kentucky-file')` 后必须**完整退出 Electron**；热重载不会换 handler。
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
- 渲染层只依赖 `getPlatform()`。安卓是独立工程，勿在本目录混入 Capacitor。
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
- `prefers-reduced-motion: reduce` 时须停无限动画（dialogue edge-flow、boot-slide、作曲框 `border-beam`）；思考指示用 `thinking-orbs`（库内减动效冻帧）。覆盖层可瞬切。流式气泡不再用闪烁 `○`。
- `@starting-style` 入场依赖较新 Chromium（Electron 内可用）；无支持时退化为无入场动画，不影响功能。- 新建台词文件名由场景 stem + 对话标识自动生成；信息卡不提供改名，改名用资源管理器右键。
- 活动栏：视窗键=`home`（起始页、藏侧栏、不关项目）；文件夹键=`explorer`；勿把视窗键做成 `closeWorkspace`。
- 应用图标：底稿 `build/icon.svg`；`scripts/rasterize-icon.js` 生成 1024² `build/icon.png`（透明圆角）+ `resources/icon.png`。窗口 `windowIcon()` 与 electron-builder 用 PNG。菜单栏 logo 直接引 SVG（`@brand/icon.svg`）。不要手改 PNG。
- 台词/角色列表滚动：`.editor-area` / `.editor-pane` 须 `min-height: 0` + `overflow: hidden`，否则列表 `overflow-y: auto` 不生效。
- 叠加滚动条：只在 `scroll` 时加 `is-scrolling`（约 1s 后移除）；**不要**用 `:hover` 显示滑块。
- 深色分区：活动栏 `DARK_BG` `#0A0A0A`，侧栏/代理人 `DARK_ELEV_1`，编辑器 `DARK_ELEV_2`。栏间线画在 `.sash` 上（1px `--border-pane`），不要给 sash 负边距，否则会盖住发丝线。改 `applyTheme` / Monaco 主题后须 **Ctrl+R**，窗口底色须完整退出。
- Windows 顶栏：`titleBarStyle: 'hidden'` + `titleBarOverlay`（色跟 `DARK_BG` / `LIGHT_BG`）。菜单栏 / 精简窗标题条要 `-webkit-app-region: drag`，按钮 `no-drag`；宽度用 `env(titlebar-area-*)` 给系统按钮留位。顶栏 CSS 高度须 **overlay + 1px**（给 `border-bottom` 留位），否则系统按钮会压住分割线。改 overlay 选项须**完整退出**。`nativeTheme.themeSource` 跟应用主题走。
- **右键菜单**（changelog §116 / §138）：`position:fixed` 必须用 `workbench/fitContextMenu.ts` 的 `useFittedMenuPos`（`useLayoutEffect` 量完再钳）；下方不够翻到光标上方。CSS `.ctx-menu`：`max-height: calc(100vh - 16px)` + `overflow-y: auto` + `overscroll-behavior: contain`。**资源树 / 活动栏菜单必须 `createPortal` 到 `document.body`**，否则侧栏 `overflow` 裁切、sash 会画在菜单上。接入点：`FileTree`、`MindMapEditor`、`ActivityBar`、`SelectionContextMenu`。**勿**只按 `clientY` 往下开——窗口底部长列表会被裁切。新菜单同样走这套，不要复制旧的 `{left:x, top:y}`。

## AI / 标签脏标记

- AI 改文件走 `applyAiFileEdit`，**勿**切换 `activeTabId`，否则多文件会来回闪页。
- DocumentHub `doc:apply` / `applyDocSnapshot` 必须**保留**本地 `dirty` 与 `isNew`，否则黄/蓝圆点会被冲掉。
- 新建文件即使已落盘，UI 仍标 `isNew` 直至用户 Ctrl+S；AI 编辑一律先 `dirty: true`。
- 系统提示与工具返回禁止写「请点 Apply」——已无确认栏。
- **AI 设置栏位 / Agent 转圈 / abort / MD 复制**：完整契约 **[`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md)**（§162/§164 的现行版）。禁止按键 `upsertProfile`；连接 45s 只等到响应头（`fetch` 返回立刻 `clearTimeout`，勿只 finally）；`ai:send` 拒绝须 `error`+`done`；TipTap `transformCopiedText: false`。Android 对照移植禁止回退。
- DeepSeek `fetch failed` 是网络层（代理/防火墙），不是模型名错误（错模型多为 HTTP 4xx）。
- AI 导图：勿让模型手填密网格坐标；用 `autoLayout` / `layout_kmind`。乱成网时先砍交叉边再建树，单靠布局救不了完全二分图。
- AI 台词图：整段脚本用 `propose_dialogue_graph`（线性也写空 text options；勿再用「缺 choices=线性」）；乱画布用 `layout_dialogue`；`nodes` 空才删 choices。choices/layout 与 csv 同轮写入时一律自动落盘（无 Accept）。
- AI Skills：只读 `SKILL.md` / reference / examples；**永不**执行 skill 内 `scripts/`。技能在软件本体 `data/ai-skills/`，不跟工作区走。厂家 `resources/ai-skills/` 只 **copy-if-missing**（用户改过的 `SKILL.md` / `examples.md` 永不覆盖；缺的 extra 文件会补上）。`seenBundledSkillIds` 只把从未见过的 bundled id 追加进白名单；用户关掉后下次启动不得再打开。**caveman** 是内置：开启则每轮把 `SKILL.md` 注入系统提示，catalog 标明已应用、勿再 `read_skill`。游戏策划文档硬约定工作区根 `design/`。有 `design/` 树：系统提示 Design playbook；**Design L5** 列出本根实际存在的 gdd/concept/characters/glossary/dialogue csv（无 `gdd.md` 也会出 L5）。纯小说工作区无 `design/` 则两套都不注入。`/game-narrative` 挂载时注入 `examples.md`。
- 思考强度随配置档：High / Mid / Low（默认 Mid）。请求带 `reasoning_effort`（mid → `medium`）。非推理模型 400 且报该字段时，去掉再试一次。须完整退出后再测。
- AI 联网：默认关；DDG 超时自动回退 Bing；搜索结果会抓取前几条页面写入 `excerpt`（天气站可解析预报卡）；需要更深可读 `web_fetch`。Brave/Tavily 未实现。
- **Ask 无工具、不写盘**：请求 `tool_choice: none`；同会话里先前 Agent 的 tool_calls 会压成纯文本再发给模型。模型若仍吐出 `read_file` / `propose_text_patch`，主进程**不执行**。DeepSeek 可能把 DSML XML 写成气泡正文——Ask 会丢掉并改成「请切 Agent」。气泡标题「代理人」只是助手角色名，不是当前模式——看输入栏模式胶囊。Ask 启动时 `ai:contextUsage` 不得因空工具列表抛错，否则会黑屏。测 C1 须完整退出后再开（Ask 引入时 `2026-08-13-d`；**当前全局** `toolApi: 2026-08-14-a`）。
- Plan 模式：计划真相是工作区 `plans/<slug>.plan.md`（同 slug 覆盖），**不是**会话 JSON  alone；AI 面板**不**再挂常驻计划列表。`update_plan_step` 只改 Todos 勾选，勿整文件覆盖冲掉用户改的正文。`plans/` 可随项目提交。
- Agent 归档/迁移：用 `workspace_mkdir` / `workspace_copy` / `workspace_move` / `workspace_delete`，**不要**说「没有 shell / 不能移动删除」。删除须用户明确要求。勿对归档读全文再 `propose_write_file` 抄写。
- 写入门禁：**Agent 一律自动写盘**（无 Accept）。黄● = 相对上次 Ctrl+S 的 original。看 `written`/`reviewHint`/`gateDetail`/`toolApi`。误改用 Source Control 丢弃。
- Agent Git 完整契约与验收：[AGENT-GIT.md](./AGENT-GIT.md)（当前指纹 `2026-08-14-a`）。
- `git()` allowFail：空 stderr 勿回退到 `Command failed: git …`（会盖住 stdout 的 `nothing to commit`）。
- remote 删除重加后上游丢失：下一次 `git_push` 须 `setUpstream`+`branch`（GIT-3，非缺陷）。
- 工作区根 `agent-GIT环境说明.md`（或 `AGENT-GIT-ENV.md`）：固化**该根**远程/分支；仅当 L5 点名才读。勿把其它仓（如 test2-remote）带到新工作区。
- Source Control：活动栏 SCM；**打开工作区自动 ensure Git**（**只看本根** `.git`，不向上找祖先；没有则在根 init）；untracked 丢弃二次确认；discard 强制重载打开文件。Git 调用带 `core.quotepath=false`，中文路径应可读。`git_status` 会 ensure 仓 + 幂等补 `.kentucky/`。
- **Windows .md 打开方式**：只有**打包后的** `KENTUCKY.exe` 会写入 HKCU Open With（不抢默认）。F5 / `npm run dev` 列表里不会出现 Kentucky。须先 `npm run dist` 并运行一次 exe。单实例：第二次启动把路径交给已有窗口。父目录若是盘符根/主目录则拒绝。换文件夹位置后重新运行 exe。
- **`revisions/` 对用户不可见**：工作区根快照柜（Agent `list_revisions` / create / restore）。资源树与根目录 `list_dir` 隐藏；磁盘仍在；`read_file` 与文学工具照常。`.gitignore` 会幂等补 `revisions/`（与 `.kentucky/` 一样），SCM 不刷快照。须完整退出后生效。环形上限默认 20：再拍会删最旧一份（`evicted[]`），不拒建。
- Agent Git：`git_status` / `git_diff` / `git_log` / `git_pull` / `git_push` / `git_add` / `git_commit` / `git_remote_add` / `git_remote_remove`（**禁止 force**）。写操作立即执行，聊天高亮卡 + Toast；discard 仍 UI。
- `git_status` **非纯只读**：可能自动 init（`repoCreated`）并/或追加 `.gitignore` 的 `.kentucky/`、`revisions/`（`gitignoreUpdated`）。
- 指纹：工具结果须含 `toolApi`（当前 `2026-08-14-a`）；缺则完整重启 Electron。
- 工作区沙箱：`workspacePath.ts` + `ipcSandbox.ts` — 跨盘符绝对 relative、symlink realpath fail-closed、拒盘符根裸仓与危险工作区根；文件工具与 `fs:*` 不能逃出打开的文件夹。详见 [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) §121。
- `git_remote_add`：本地路径 / `file://` / 带空格路径合法；缺失目录会自动 `git init --bare`。`git_push` 对已配本地 remote 同样补建。清理远程用 `git_remote_remove`。
- 新对话仍会调用 Git：系统提示含 `GIT_AGENT_PLAYBOOK`；每条用户消息末尾有 **Git (L5)** 快照（该轮开头冻结；同轮写盘后以 `git_status` 为准）。
- **请求前缀**：文学系统提示 + 工具表永远在最前且跨步不变；Editor context / skill / 挂载贴本轮 user 末尾，并写入该条 `apiContent`（含当时的 Editor context），跨轮重放不再砍掉后缀。历史 user 勿再读盘。勿把易变块插回 system[1]。切 Ask/Agent 会换 tools，前缀失效。须完整退出后测。
- kmind `moveSubtree`/`connect` skipped 文案区分哪一端 id 不存在。
- `propose_kmind_edit`：非法 connect/move/update id 会进返回体 `skipped`/`warnings`，勿当静默成功。
- `propose_reorder_dialogue_lines`：CSV **首行=开场**；部分 order 可能改 opening — 看 `openingChanged`。
- `continuity_check` 角色状态断言：表中无该角色键 → `unknown_character`（非静默）。
- `propose_dialogue_performance`：`font_size` 须数字或空；`text_color` 须 `#RGB/#RRGGBB/#RRGGBBAA` 或空。
- append / voice upsert：未注册 speaker/characterId → `warnings`（仍可写盘）。**空 `text:""` 是合法 v1.3 确认续句行**，`propose_append_dialogue_lines` / `propose_dialogue_graph` 不得丢行（缺 speaker 才拒绝）。台词 CSV 读写优先脏 DocumentHub（与 patch 的 `editor_buffer` 对齐）；只读磁盘会在 append 时盖掉未 Ctrl+S 的行（第三轮 d16）。
- `propose_kmind_edit` 支持 shape/尺寸与子树删移。
- DocumentHub：Agent 走 `docApplyAgentWrite`（保 original）；勿对 Agent 用会清脏的 `docApplyExternalWrite`。
- 打开 `.md` 无编辑却变脏：TipTap `getMarkdown` 规范化误写回；已用 hydration 门闩挡住（changelog §62）。
- Markdown AI 写入曾因 TipTap 无 Table 扩展毁掉 `|` 表格（W19）；已修。
- Diff / 只读变更卡只在 AiPanel；agent 看 `uiReview`。无 Accept / 批量 Apply。
- 总清单：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)。

## package.json / F5

- `win/package.json` 必须合法 UTF-8。Latin-1 的 `©` 等会触发 Node `Invalid package config`，electron-vite / F5 起不来。

## 分镜头 / Storyboard（v0.3.0）

完整契约：[STORYBOARD.md](./STORYBOARD.md)（polish §97–§119；改序/persist §150–§155；§116 工作台右键同批）。

- 工程：`*.kyboard` + 同级 `*.kyboard.assets/`（不是 `.kmind` 那种 `名.assets`，注意后缀含 `.kyboard.assets`）。
- 拼图尺寸必须含 gutter + labelBand；只比内容区 1920×1080 会误判 mismatch。期望公式见 STORYBOARD §2。
- 导入源 PNG/MP3 **可以在工作区外**；写入必须进 assets。勿对源路径 `resolveWorkspacePath`。
- 尺寸不符默认失败；强制缩放用确认后再 `forceScale:true`（勿重新弹文件对话框丢已导入文件）。
- **空白生成**：可改工作区内文件夹 + 文件名（`targetDirAbs` / `fileName`）；目录越界 Toast；默认 assets + `blank_{cols}x{rows}.png`。
- **空白路径键入**：用户改过文件名后勿再按 `blank_NxM.png` 正则强制写回（否则「无法输入」）；用 touched ref。
- **多稿本**：同一工程 `sheets[]`；UI 用链接栏切换。**无**一键铺轨；导入不上 V1。已在列表但未上轨的稿本可用「接到时间线」（`appendPanelClipsMut`，跳过已在轨 panelId）。**不要**恢复「点格追加到 V1」素材库。
- MP4 导出用 `npm run ensure-ffmpeg` 得到 `resources/ffmpeg/ffmpeg.exe`（gitignore；发版 extraResources：`ffmpeg/ffmpeg.exe`）。**不要**加回 `ffmpeg-static`（GitHub postinstall ETIMEDOUT）。从 Cursor 启动的 Electron **不继承**后来改的 PATH，故不能只靠「已装 ffmpeg」。`resolveFfmpeg()` 每个候选 `-version` 探活，不是只 `existsSync`。顺序：`KENTUCKY_FFMPEG` → 打包 resources → 开发 `../../resources/ffmpeg`（相对 `out/main`）→ 常见 Win 路径 → PATH。缺则主进程 `error: 'FFMPEG_NOT_FOUND'`（勿塞英文长句）→ Toast `storyboard.ffmpegNotFound`。跑完 ensure-ffmpeg 须**完整重启** Electron。
- 区外保存 MP4：先写 assets 再 copy；Toast `exportInsideWorkspace`。
- 导出页可改**文件夹**与**文件名**（默认=`工程父目录` + `工程名-sheet.png` / `工程名.mp4`）；「另存为」开系统对话框并回写路径/文件名。
- 导出临时帧在 `workspace/.kentucky/storyboard-export/`；成功/失败都应清理（`rmSync`）。
- **时间线 scrub**：必须用 `TransportScrubber`（`.storyboard-scrub*`）。原生 `range`+`accent-color` 在 Win 上 0% 溢色、100% 到不了头——**禁止回退**。
- **时间线横滚**：隐藏滚动条；`wheel` 须 `{ passive: false }` 才能 `preventDefault` 并改 `scrollLeft`。
- **V1 布局**：固定 px/秒，禁止按总时长百分比排布（否则边缘拖像对称缩放）。
- **V1 改序不是 HTML5**：Chromium 松手若 `drop` 未成功会把拖影弹回源（闪回）。吸附竖线 `pointer-events: none`，松手命中测试经常失败；`dropEffect: move` 还不删源节点也会弹回。`dragstart` 会 `pointercancel`，不能和指针手势混用。改序用窗口捕获阶段的 pointermove，提交 **拖动中最后一次 `lastIndex`**，不要在 pointerup 再对 DOM 做命中。不要 `preventDefault` 在 pointerdown、不要 `setPointerCapture` 到别的节点（会立刻 pointercancel）、不要给源块 `pointer-events: none`、不要拖动中 splice DOM。素材箱→V1 才用 HTML5。Alt+缘才修剪。
- **改序后不要 `packVideoClipsMut`**：它按旧 `start` 排序，会把 splice 还原成 `mut-noop`（看起来像闪回）。用 `repackVideoClipStartsMut` 按数组顺序重写 start。插入同理。
- **BGM 无声 / 工作区 MP4 播不了**：
  - CSP 要有 `media-src … kentucky-file:`（图片还要 `img-src`）。
  - `.mp3` 与 `.mp4` 共用 `streamLocalMedia`：流式 + Range → **206** + `Accept-Ranges`；勿整包 `arrayBuffer`。其它扩展仍 `net.fetch`。
  - **禁止** `outSec > 节目×3` 当占位探测；只修经典 `outSec===60`。
  - 播放中勿让 audio effect 依赖整份 `doc` 或每帧 `playhead`。
  - 改 `protocol.handle` / CSP 须**完整退出 Electron**；热重载不够。
- **稿纸显示不全**：滚动 pane 的子卡片必须 `flex-shrink: 0`，否则中间区块被压扁 + `overflow:hidden` 消失。稿纸/导出滚动用 `kentucky-overlay-scroll` + `useOverlayScroll(..., doc ? mode : 'idle')`（稿未加载时 pane 不在 DOM，切页/加载后要重绑）。
- **检视器显示不全**：检视器在 `overflow:hidden` 行内须 `max-height:100%` 自滚；窄栏稿本链接换行，勿只靠横滑。
- UI：**禁止**另起 PR 深蓝皮肤；跟主题变量。动效不加 framer-motion；时间码/细拖勿加过渡。样式拆 `storyboard-nle.css` + `storyboard-pages.css`。
- `.kyboard` 立即写盘，**同时**把 JSON 写入 DocumentHub 标签缓冲（`persistDoc` / `storyboardDocFlush`）。只 `writeFile` 不清缓冲时，Ctrl+S / 退出保存会用打开时的空时间线盖盘，粗剪看起来被重置。
- Android **要从零移植**（`android-port-brief` P5）；IO/ffmpeg 重写，勿 import 本仓库。
- schema **v1 只增不改**；改字段须用户同意 + 迁移策略（`mediaDurationSec`、`audioClips`、`camera.keys` 为可选增量）。
- **多音轨**：`MAX_AUDIO_TRACKS=4`、每轨一条 MP3；读写走 `listAudioClips` / `ensureAudioClipsMut` / `firstEmptyAudioTrack`；`serializeKyboard` 必须 `syncLegacyAudioClip`（`audioClip === audioClips[0]`）。播放用 `Map<clipId, HTMLAudioElement>`，勿共用一个 `audioRef`。导出单轨 `anull`、多轨 `amix=duration=longest`，再 `-shortest`。
- **监视器镜头（§113–§115，顺序很重要）**：
  - 半分辨率 canvas：`dCam = -dCanvas * 2 / scale`；滚轮 `{ passive: false }`。
  - 打帧写在**播放头时刻**（`upsertCameraKeyMut`）。**禁止**拖监视器走 `nudgeNearestCameraKeyMut`（会改最近的另一帧，画面跳）。
  - **禁止**在 `writeCameraKeys` / UI 里注入 t=0/t=1 identity。菱形 / 芯片只用 `storedCameraKeys`，**不要**用 `cameraKeysOf`（后者无 stored 时会合成 from/to，画出「默认菱形」）。
  - 有 stored keys：`cameraAtClip` 区间外 **hold**（一帧=整段钉住）。无 keys：from→to。导出必须 `cameraAtClip`。
  - 旧工程 identity 头尾由 `pruneIdentityBookends` 丢掉；若再注入，中间帧会 rest→pose→rest「乱跑」。
  - 满 6 帧 Toast `camKeysFull`，upsert 返回 false，不要静默丢别的帧。
  - **Alt+I 可删播放头上任意手动帧**（含头尾）。不要恢复「入出点不能删」。
  - 不要恢复检视器「记录入点/出点」四按钮或 from/to 六个数字。
  - 不要恢复「点格追加到 V1」素材库。

## 图片预览（PNG）

- `.png` 须在资源树可见（`TEXT_EXTS`）；点击用 `ImagePreviewEditor`，**禁止** `docOpen` 当文本读。
- `isMediaPreviewKind`（`image | video | pdf`）：`openFile` 跳过 `docOpen`；`saveTab` 直接成功；`closeTab` 不 `docUnsubscribe`。
- 预览 URL 用 `toMediaUrl` / `kentucky-file://`，勿用 `file://` 直链（CSP）。
- 交互对齐导图画布：**滚轮定点缩放**（`wheel` 监听须 `{ passive: false }` 才能 `preventDefault`）、**拖拽平移**、双击/「适应」复位；勿依赖页面滚动条缩放。
- 目前仅 `.png` 图片预览、`.mp4` 视频预览、`.pdf` 阅读器预览；勿在未扩 `TEXT_EXTS`+`detectKind` 前假设 jpg/webm 可预览。

## 视频预览（MP4，changelog §119）

- `.mp4` 须在资源树可见（`TEXT_EXTS`）。该集合是**树可见白名单**，名字不表示「当文本打开」。
- `detectKind('.mp4')` → `'video'` → `VideoPreviewEditor`；**禁止** `docOpen`（UTF-8 读二进制会坏）。
- `isMediaPreviewKind` 调用点（`appStore.ts`）：`openFile`（含已开标签再激活）跳过 `docOpen`；`saveTab` 直接成功；`closeTab` **不** `docUnsubscribe`。漏一处就会把 MP4 当文档订阅读。
- 预览 URL 用 `toMediaUrl` / `kentucky-file://`；协议必须 **流式 + Range/206** + `Content-Type: video/mp4`（与 BGM mp3 同一套 `streamLocalMedia`）。改协议须**完整重启 Electron**。
- 原生 `<video controls>`；不要做自定义播放器皮肤；不要恢复点格素材库。

## PDF 预览 / 导出（changelog §127–§128）

- `.pdf` 须在资源树可见（`TEXT_EXTS`）。`detectKind` → `'pdf'` → `PdfPreviewEditor`；列入 `isMediaPreviewKind`（与 PNG/MP4 相同：禁止 `docOpen`）。
- 预览用 **pdf.js 自绘**（`PdfPreviewEditor`），不要再塞 Chromium PDF iframe：插件滚动条/缩略图改不了，同一 URL 重挂会空白。`fetch(kentucky-file)` 成 `Uint8Array` 交给 `getDocument({ data })`（worker 不能自己打自定义协议）。Worker `pdfjs-dist/build/pdf.worker.min.mjs?url`。缩略图栏宽度拖 sash（112–280，记 `localStorage kentucky.pdfThumbWidth`）。页面区与缩略图都走 `kentucky-overlay-scroll`。适应 = 页宽撑满舞台。CSP `connect-src kentucky-file:`；`worker-src 'self' blob:`。
- CSP：`frame-src` / `object-src` / `connect-src` 含 `kentucky-file:`。改 CSP/协议须**完整退出 Electron**。
- 导出用隐藏 `BrowserWindow` 加载仓内 `pdf-print.html`（dev：Vite 同源；prod：`out/renderer`），再 `printToPDF`。**禁止** `loadURL(data:)`——导航锁 `isAllowedNavigationUrl` 只放行 dev server / `out/renderer`。
- `.md` 用当前 TipTap HTML（源码模式则 markdown→HTML）；`.kmind` 须在渲染层栅格化（主进程画不出 React Flow）。未激活的导图标签是卸载的，树右键导出会先 `openFile` 再等 capturer。
- `dialog:savePdf` 与 `pdf:export` 走 `assertWritableLocalPath` / write allowlist；HTML ≤ 2MB、PDF ≤ 50MB。失败只 Toast i18n，不抛英文栈。
- Agent `export_workspace_pdf` 与 UI 共用 `printHtmlToPdf`。只写工作区 `.md`→`.pdf`（无对话框；覆盖 sibling）。主进程 GFM 子集不是 TipTap。`.kmind` 仍须 UI。该工具引入时指纹 `2026-08-13-a`；**当前全局** `toolApi: 2026-08-14-a`，须完整退出 Electron。
- **不做** puppeteer、导图矢量/分页、台词图/分镜头/纯 txt 导出、Agent 导图 PDF。Android **要移植**预览与导出（BOARD A4；不抄 `printToPDF`）。

## 本机安全（changelog §120–§122）

- 审计原文（当时发现）+ **现契约详解**（通道表、拒绝清单、手测）：[SECURITY-AUDIT.md](./SECURITY-AUDIT.md)。摘要：changelog **§121–§122**。
- **必须完整退出 Electron** 再验证（协议 / preload / `bindNavigationGuard`）。
- 新 IPC 一律经 `ipcSandbox.requireSenderWorkspace` 或 `resolveWorkspacePath`。禁止再加「渲染层保证路径合法」的裸 `fs:*`。
- 对话框选中的源/另存路径用 `rememberDialogReadPath` / `rememberDialogWritePath`，不要开放任意绝对路径。
- `kentucky-file` 只服务 `toMediaUrl` 登记过的路径或 dialog read allowlist，不要用「任一已开工作区」放行。
- `joinPath` 会消化 `..`，但**不能**当成沙箱；主进程仍要校验。
- 不要把用户主目录或盘符根当工作区（Toast `errors.unsafeWorkspace`）。
- Git **只认工作区根的 `.git` 目录**，不向上找父仓，也不跟随 worktree 指针。打开子文件夹会嵌套 init——这是有意的，不要改回 walk-up。
- `git:setPath` 必须探活为 `git version`；不要存任意 exe。
- MP4 导出 > 15 分钟会 `EXPORT_TOO_LONG`，不要去掉上限去「方便」。
- `realpath` 失败要拒绝，不要再 `catch` 后放行。
- `web_fetch` 不要放开内网 URL。
- CSP `'unsafe-eval'` 留给 Monaco，不要为此关掉导航锁。

## Windows 启动

若 PowerShell 禁止运行 `npm.ps1`：

```bat
cmd /c npm run dev
```
