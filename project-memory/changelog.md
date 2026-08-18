# 改动时间线

按对话演进记录，便于回溯「为什么现在是这样」。

> §167 起 Windows 与 Android 已拆成两个独立工程。此前条目里的 `win/`、`android/`、`../../android/project-memory/` 指旧容器仓嵌套路径。


## 1. MVP 脚手架与工作台

- Electron + Vite + React + TS（electron-vite 布局）
- Platform 抽象 + preload `window.kentucky`
- VS Code 风格壳：活动栏 / 侧栏 / 多标签 / 状态栏
- 打开文件夹、文件树、Monaco 编辑与保存
- `.kmind` + Mind Elixir
- 中英 i18n、快捷键 Ctrl+S/W/B/O
- 文档化 Android 预备（Platform）

## 2. Cursor 风格 UI + 设置 + 欢迎卡片

- `settingsStore` + `applyTheme`（深/浅 + accent 衍生变量）
- `global.css` 去硬边框、弱化状态栏高饱和底
- `SettingsPage`、活动栏齿轮、`Ctrl+,`
- Monaco / Mind 跟主题
- 欢迎页最多 6 张 recent 工作区卡片；recent 改为 `{ path, lastOpened }`

## 3. 资源管理器新建修复

- Electron 下 `window.prompt` 不可用 → 侧栏 **内联输入框** 新建文件/文件夹/思维导图

## 4. 菜单汉化 + 右键

- `src/main/menu.ts`：文件/编辑/查看/窗口/帮助（中英随语言切换）
- 资源管理器右键：新建文件/文件夹/思维导图、删除
- 思维导图右键：子节点 / 同级 / 删除；locale `zh_CN`；自有 ctx 菜单兜底
- `create*` 支持 `parentDir`；`deleteEntry`

## 5. 侧栏可见性 + 思维导图根节点过大

- 活动栏提高对比度与 z-index；打开工作区强制 `sidebarVisible: true`
- Mind Elixir 默认根节点 25px + 大 padding → 紧凑主题 + CSS 覆盖；关掉内置 toolBar
- 画布 `overflow: hidden`，避免盖住左侧栏

## 6. 项目记忆目录

- 新增 `project-memory/`，固化架构与决策，防上下文丢失

## 7. 开源发布

- MIT License（Copyright leyang chen）
- README 标明功能、与 AI 协作开发、优先个人需求自用更新
- 仓库：https://github.com/CCFOX12/Kentucky-Article-Editor

## 8. 自由白板思维导图

- 移除 Mind Elixir；改用 `@xyflow/react`
- `.kmind` 升级为 **v2**（nodes/edges/viewport）；废弃 v1 树格式
- 节点形状：矩形 / 圆角矩形 / 椭圆；手柄拖出连线；右键/工具栏增删改
- MiniMap 跟主题：accent 节点色、elev 背景、弱遮罩、去默认阴影的简约边框
- 修复点阵不可见（勿用近透明 `--border`）；MiniMap 尺寸走 `style` 避免 SVG 被 CSS 裁切
- 拖线落空：弹出与右键相同的「添加节点」菜单；创建后自动接到原连线；点空白取消
- MiniMap 仅细线框，背景贴合画布，去掉厚重黑边底板
- 落空建节点：自动接到离源节点最近一侧的手柄（不再默认顶边）
- MiniMap 单层灰底（`--bg-elev-3`），去掉外圈黑边与 mask 描边
- MiniMap 视口 mask 改为透明（暗色 mask 会在边缘形成「黑圈」）
- 拉远连线：放大 connectionRadius + 手柄随缩放补偿；落点靠近节点时吸附连边
- 自定义小地图绘制边（官方 MiniMap 不渲染 edges）
- 小地图节点勿用 `.react-flow__minimap-node`（浅色主题 CSS fill 会盖成一片白）
- `.kmind` 边持久化 `sourceHandle`/`targetHandle`；缺省时按相对位置推断，避免保存后连线并干

## 9. Markdown 专心写作

- `.md`：TipTap 所见即所得 + 极简工具栏；可切 Monaco 源码
- 工具栏：粗斜删/链接/行内代码、H1–H3、引用、列表、任务列表、代码块、分隔线、撤销重做、CJK 字数
- 磁盘仍为 Markdown 文本（`tiptap-markdown` 往返）；无分屏预览
- `.txt` 等非 md：软化 Monaco（淡行号、无缩进线）
- 工具栏 active 态用 `useEditorState` 订阅事务，开关格式即时刷新（不必再打字才更新）

## 10. 导图超链接 + 内嵌图片

- `.kmind` 节点可选 `link` / `image`（仍 version 2）
- 右键：链接到文件 / 链接到段落 / 清除链接；插入图片 / 移除图片（删 assets 副本）
- 资源：`ideas.kmind` → `ideas.assets/`；Platform `copyFile` + `openImage` + `kentucky-file` 协议
- 「链接到段落」：选 `.md`/`.txt` → 分屏 → 点行确认；跳转在 WYSIWYG 定位高亮（不显示行号），光标移动后清除
- 旧 `kind: heading` 降级为整文件链接

## 11. 导图参考图（PureRef 极简）

- 节点可选 `imageOnly`；空白右键多选导入 → 复制进 `名.assets/`，网格错开摆放
- 纯图：无文字区/文件名条；选中角点锁比例缩放（`NodeResizer`）；四边手柄可连线
- 纯图右键仅移除图片 / 删除节点（均删节点+assets）；节点插图流程不变
- Platform：`openImages`（`multiSelections`）；`openImage` 仍单选

## 12. 导图节点批注（黑下巴）

- 节点可选 `note` / `noteOpen` / `noteLink`；右键添加 → 展开聚焦；下巴绝对定位不撑高节点
- 展开后 textarea 直接编辑；批注超链复用选文件/选行（`linkTarget: note`），文字后小图标跳转
- 普通 / 插图 / 纯图节点均可；清除批注去掉下巴与批注链
- **视觉定稿**：节点原描边不动；下巴另延同色描边（无顶边）；中间分割线=节点底边（含圆角）；侧线靠下巴上移 `--kmind-radius` 延长，勿伪元素另画
- 内容区 `.kmind-node-shell` 按圆角裁切填色；切换箭头无悬停高亮
- 批注输入：黑底、无滚动条、随文字增高（`overflow: hidden` + 高度同步）

## 13. 字数统计修正 + 资源管理器「打开所在目录」

- `wordCount.ts`：**非空白字符数**（中英均按码点计 1）；修正「一行英文只算 1」与 UI「字」不一致
- Platform / IPC：`showItemInFolder`；目录→`shell.openPath`，文件→`shell.showItemInFolder`
- 文件树右键：「在文件资源管理器中显示」（文件 / 文件夹 / 空白处→工作区根）

## 14. 拼写波浪线 / 菜单精简

- TipTap `spellcheck: false` + BrowserWindow `webPreferences.spellcheck: false`（去掉红波浪线）
- 查看菜单去掉「切换开发者工具」（`AppMenuBar` + `menu.ts`）
- 「了解 KENTUCKY」统一打开 https://github.com/CCFOX12/Kentucky-Article-Editor

## 15. Blender 式多窗口

- 「窗口」：新建窗口（精简单文件）/ 新建主窗口（完整台+同工作区空标签）
- 主进程 `documentHub` + `windowRegistry`；同路径实时共享 content/dirty；任一窗保存两边清脏
- `FloatWorkbench`（无顶栏菜单）；无活动文件时新建窗口灰显；关最后主窗退出；工作区无主窗持有则关 float

## 16. 应用内未保存对话框

- 关窗 / 关脏标签 / 关工作区：应用内「保存 / 不保存 / 取消」（勿用 `window.confirm` / `beforeunload`）
- 主进程 `close` → `window:close-request` → 对话框 → `window:confirmClose`；`doc:discard` 回滚缓冲

## 17. Windows 便携 exe

- `electron-builder` target `portable`；`npm run dist` → `release/KENTUCKY-*-portable.exe`
- 用户下载后双击运行，无需先解压；体积大（自带 Chromium）

## 18. 台词对话编辑器（完整）

独立功能（非 Markdown 混写）：聊天式写台词 + Godot 可用的稳定 id CSV。

### 数据契约

| 文件 | 位置 | 列 |
|------|------|-----|
| `*.dialogue.csv` | 任意子目录 | `id,speaker,text,note,emotion,scene,condition,audio` |
| `characters.csv` | **工作区根固定**（不可配置） | `id,name,color,note` |

- `speaker` 存角色 **id**，不存显示名；行序 = 播放序
- 普通 `.csv` 仍 Monaco；仅 `.dialogue.csv` → DialogueEditor
- 稳定 id：`{scene|stem}_{characterId}_{###}`；改 text/meta/speaker/scene **默认不改 id**；仅「复制为新台词」生成新 id；工作区全部 `.dialogue.csv` 查重顺延并 toast

### 新增 / 改动文件

| 路径 | 作用 |
|------|------|
| `src/renderer/src/editors/dialogueCsv.ts` | 解析/序列化、id 分配、管线/本地化导出 |
| `src/renderer/src/editors/DialogueEditor.tsx` | 气泡流、@/说话人选择、创建角色、详情、拖拽重排、多选、导出对话框 |
| `src/renderer/src/state/appStore.ts` | `EditorKind` + `dialogue`；`detectKind` / `createDialogue` |
| `src/renderer/src/workbench/EditorArea.tsx` | 路由到 DialogueEditor |
| `src/renderer/src/workbench/FloatWorkbench.tsx` | 精简窗同样路由 |
| `src/renderer/src/workbench/Sidebar.tsx` | 「新建台词」入口 |
| `src/renderer/src/workbench/FileTree.tsx` | 右键新建台词 + D 图标 |
| `src/main/index.ts` | `TEXT_EXTS` 加入 `.csv`（树里可见） |
| `src/renderer/src/styles/global.css` | `.dialogue-*` 样式 |
| `src/renderer/src/i18n/locales/en.json` / `zh-CN.json` | `explorer.*` + `dialogue.*` |
| `README.md` + `project-memory/*` | 功能说明与决策 |

### UI / 导出行为

- 底部输入：选说话人（或 `@`）+ 回车追加；模式下拉含「创建角色」
- 气泡：点改正文；详情编 note/emotion/condition/scene/audio；换说话人 id 不变；删句确认；拖拽重排
- 导出：当前文件或勾选句子 → 管线 CSV（可选 emotion/condition/audio）或本地化 `keys,<lang>`；**不做**全工作区一键导出

### 明确不做（v1）

分支可视化、表达式编辑器、Godot 双向同步、多语言对照编辑、音频播放、Markdown 内嵌台词、`characters.csv` 路径可配置

## 19. Cursor / VS Code 调试配置

- 新增 `.vscode/launch.json`（electron-vite 官方推荐）：`Debug All` = 主进程 + 渲染进程；F5 即可跑起来调试
- `how-to-run.md` 补充 Run and Debug 步骤

## 20. Godot 台词热编辑联动

- 文档：打开工程内 `dialogue/` 当 Kentucky 工作区；`Ctrl+S` 写同一份磁盘 CSV（非进程内 API）
- **不附带** Godot 插件；完整契约写在 `extras/godot-kentucky-dialogue/README.md`，由各项目自研监视/重载
- 仍不做 Kentucky↔Godot 双向实时协议

## 21. 台词 Godot 元数据字段

- 新建台词信息卡：必填 `godot_scene` + `dialogue_id` → 旁路 `*.dialogue.meta.json`
- 文件名自动 `{sceneStem}_{dialogueId}.dialogue.csv`；信息卡无改名入口
- 资源管理器右键重命名（`renameEntry`）；台词同步改对应 meta
- 角色表增加 `model_node`（创建/编辑必填）；新台词行默认 `scene` = meta.`dialogue_id`
- 删除 `.dialogue.csv` 时尝试删除对应 meta
- 协议全文：`extras/godot-kentucky-dialogue/README.md`（含 §0 协议速览）

## 22. Godot 协议 v1.1 — 演出声明列

- `*.dialogue.csv` 表头升为 11 列：追加 `focus_node,font_size,text_color`；旧 8 列可读，写回始终 11 列
- `font_size` 空与 `0` = 默认，磁盘统一空串；`text_color` 合法 `#RGB` / `#RRGGBB` / `#RRGGBBAA`
- 对话编辑器详情内可折叠「Godot 演出」声明区（风格对齐现有 details）；复制为新台词保留演出字段
- 管线导出可选带三列；locale 仍仅 id+text
- extras / product-decisions / architecture 对齐声明器·执行器与角色 5 列（含 `model_node`）

## 23. 台词 UI 文案

- 详情列 `emotion` 界面称呼改为「配音」/ Voice（磁盘列名仍为 `emotion`，协议不变）

## 24. 资源管理器：meta 挂在台词下

- 显示层 `nestDialogueMetaInTree`：同 stem 的 `*.dialogue.meta.json` 视觉挂在 `*.dialogue.csv` 下，可折叠、**默认收起**
- 磁盘仍同级；孤立 meta 仍平铺显示

## 25. 启动闪屏主题色修复

- 根因：query 带 `#` 被当成 URL hash；dev 下 `out/renderer/boot-theme.js` 过期
- 修复：accent 不带 `#` 传递；dev splash 走 Vite URL；主进程 `dom-ready`/`did-finish-load` 注入 `--boot-accent*`

## 26. 活动栏：起始页 ↔ 项目

- `ActiveView` 增加 `home`
- 视窗四格键（上）：回起始页；**不关工作区**；起始页时**不显示**资源管理器侧栏
- 文件夹键（下，仅已开项目）：回编辑区并显示资源管理器
- 打开文件 / `openWorkspace` 仍切回 `explorer`

## 27. 应用图标

- `build/icon.png`：灰白 K，安卓式圆角（透明角）；`package.json` / 主窗口 / 闪屏引用
- 不保留 SVG 底稿

## 28. 台词列表可滚动

- `.editor-area` / `.editor-pane` 补 `min-height: 0` + `overflow: hidden`，避免 flex 撑开导致无法下滑
- `.dialogue-list` 使用 `flex: 1 1 0` 作为滚动容器

## 29. 叠加滚动条（主题色）

- `.kentucky-overlay-scroll` + `useOverlayScroll`：滑轨透明、滑块用 accent
- **仅上下滚动时**显示；停滚 **1 秒**后隐藏；光标移动不触发
- 已用于台词列表、资源管理器侧栏、角色卡片列表

## 30. 角色表卡片编辑器

- basename `characters.csv` → `CharactersEditor`（不再走 Monaco）
- 卡片展示：色点 / 显示名 / `@id` / `model_node` / 备注；详情可编辑；id 创建后锁定
- 添删角色；`Ctrl+S` 写回 5 列 CSV；与台词编辑器共享 `parseCharactersCsv` / `serializeCharactersCsv`

## 31. Godot 执行器参考实现已落地

- Godot 侧插件完成于独立仓库：[CCFOX12/ai_river_godot](https://github.com/CCFOX12/ai_river_godot)（AI River 白盒对话运行时）
- Kentucky **仍不**附带 / 打包该插件；本仓只维护协议 **v1.1** 与声明器
- 文档已指向参考仓库：`extras/godot-kentucky-dialogue/README.md`、how-to-run、product-decisions、根 README

## 32. 双软件根（win / android）

- Cursor 工作区容器下：`win/` = 本 Electron 应用；`android/` = 独立 Capacitor 平板应用
- 本目录为完整软件根（含 README、LICENSE、project-memory、extras）；父级不留共享产品文件
- **优先级：先做完 Win 正式版，再移植安卓**；安卓现阶段只保留雏形，不并行大改

## 33. v0.2.0 文学向 AI 代理人

- OpenAI 兼容 API（设置：Base URL / Key / Model / contextWindow / 代理人开关 / 写入方式 / 文风备忘）
- 右侧 Cursor 式 `AiPanel`：上下文进度条、多会话、流式回复、计划步骤、快捷指令、停止生成、思考中加载指示、`Ctrl+L`
- 主进程 tool loop：只读探索；写类工具**自动落盘/进缓冲**（无手动 Apply）；台词/角色/`.kmind` 结构化编辑；无联网/Shell
- 数据落软件本体 `data/`（开发：`dev-data/data/`）；密钥 `safeStorage` 加密；不进项目、不用 AppData
- 版本号 `package.json` → **0.2.0**；发版目录 `KENTUCKY-0.2.0/`

## 34. F5 调试与 package.json 编码

- 工作区根 `.vscode/launch.json`：`Debug All` = `npm run dev -- --sourcemap`（cwd=`win/`）+ 附加渲染进程 `9222`
- `win/package.json` 必须是合法 UTF-8；Latin-1 的 `©` 等会导致 Node `Invalid package config`，electron-vite / F5 起不来

## 35. 资源管理器：隐藏后缀 + 可编辑新建名

- 树与重命名默认**隐藏**已知后缀（`.md` / `.kmind` / `.csv` / `.dialogue.csv` 等）；类型靠彩色字母图标
- 新建文件/导图：输入框只填主名，右侧固定后缀芯片；修复焦点/可编辑问题
- 重命名只改主名，后缀自动保留

## 36. AI 自动写入（取消手动确认）

- 弃用「提案 → Apply / Reject」确认栏与全局/迷你确认条（易出 bug）
- Agent 产出变更即自动写入；系统提示与工具返回禁止再说「请点 Apply」
- 对话内仅展示「已写入 / 新建」摘要卡片（嵌在对应助手消息下）

## 37. AI 改文件 UX（对齐 Cursor 脏/新建色）

- **不抢焦点**：`applyAiFileEdit` 后台更新/挂标签，不切换 `activeTabId`（避免多文件来回闪）
- 标签与资源管理器：**黄 ●** = 已修改未保存（`dirty`）；**蓝 ●** = 新建（`isNew`，保存后清除）
- DocumentHub `doc:apply` 不得冲掉本地 `dirty`/`isNew`；新建文件仍落盘以便树可见
- 设置「AI 写入方式」：改完直接写盘 / 改完标黄待保存（默认偏后者）
- 正文 / AI 消息列表使用与台词相同的 `kentucky-overlay-scroll` 叠加滚动条
- Agent 思考中 / 调工具时显示加载指示（避免误以为卡死）

## 38. AI 思维导图可读性（dagre / Sugiyama）

- 根因：网格乱摆坐标 + 角色↔场景全连接网 + 固定 bottom→top 手柄 → 线网缠死
- 采用业界分层布局（Sugiyama；React Flow 官方示例同款）：主进程 `@dagrejs/dagre`，默认 **LR**
- `propose_kmind_edit` 默认 `autoLayout: true`；新增 `layout_kmind` 专治乱图
- 系统提示强制：树/分层、人物/情节分 hub、禁止角色×场景密集连线；细节进 `note`
- 去重边 / 自环；布局后按方向设手柄（LR=`sr`→`tl`）

## 39. 导图误标脏（打开 / 平移）

- 打开 `.kmind` 不再因推断连线手柄写回而变黄；手柄仅显示用（`persistHandles`）
- **平移/滚轮缩放不再 persist**（只更新内存 viewport；保存前 flush）
- 脏判定忽略 viewport（`src/common/kmindDirty.ts`）；`doc:patch` 回写后渲染层本地重算 dirty，避免旧主进程 `snap.dirty` 覆盖
- 真正改节点/边仍正常标脏

## 40. AI 面板与聊天按工作区绑定

- 启动默认不打开代理人；`ai-workspace-prefs.json` 按工作区路径记 `panelVisible`
- 打开/切换/关闭工作区时重绑面板状态与会话列表
- `ai:listSessions` 按 `workspacePath` 过滤，聊天互不互通；无工作区时 AI 按钮不可用

## 41. 活动栏多工程切换

- 同窗口 `openWorkspaces[]`；活动栏工程徽章 + 末尾固定「+」；右键关闭
- 切换 park/restore 标签与文件树；AI / `reportWorkspace` 跟活动工程走

## 42. 文学 Agent：G3 可审 + L1–L5

- 写入按类型分流（正文/导图内容/多文件可审；角色单条、≤5 行台词、layout 可自动）；R1 Accept 前不改 tab
- L5 角色摘要上下文；L1 continuity_check；L2 lookup_character；L3 scene↔kmind；L4 追加/演出/cast_check
- 设置「强制全部可审」；系统提示改为 pending/Accept 语义

## 43. Cursor 风格 Agent 输入栏

- Composer：Ask / Plan / Outline / Agent 模式；多配置档切换；参考文件芯片 + 上传；主题色 CSS 变量
- `ai-profiles.json` + `ai-keys/<id>.bin`；旧单 Key 迁移；设置页 CRUD
- 按模式过滤工具与系统提示前缀；附件并入 `mentionedPaths`

## 44. 节点式台词编辑器（Godot choices 协议 v1.2）

### 协议与落盘

- 协议升 **v1.2**：在 v1.1（11 列台词 + meta + 演出列）上增加可选分支旁路 `*.dialogue.choices.json`（`version: 1`，`nodes[after_line_id].options[{ text, goto, end? }]`）
- Kentucky 专用 `*.dialogue.layout.json`（节点坐标 + End 位置）；**Godot 忽略**
- 改名 / 删除 / 移动 `*.dialogue.csv` 时同步 **meta + choices + layout**
- `Ctrl+S`：写 csv；有分支则写 choices，清空则删 choices 文件；写 layout
- 权威说明书（含执行器接入）：[`extras/godot-kentucky-dialogue/README.md`](../extras/godot-kentucky-dialogue/README.md)

### 编辑器（声明器 UI）

- 去掉聊天气泡列表；整页 **React Flow** 画布（`DialogueEditor` / `DialogueLineNode` / `DialogueInspector` / `dialogueGraphMap`）
- **顺序边**（下边 handle）→ 保存时重排 CSV 行序；**选项边**（右边 handle）→ choices；**End 汇点** → `end: true`
- 多根允许：画布最左上根链 = 开场（CSV 第一行）；有选项则禁止同节点再出顺序边；顺序边禁环
- 检视器改正文 / 说话人 / 演出字段；选项边双击改文案；顶栏：添加台词、适应画布、撤销、创建角色、导出、删除
- 浅 undo 栈；删被 goto 指向的节点前确认并清理引用
- 旧仅 csv：打开静默成纵向链；首次保存才写 layout

### UI 抛光

- 连线改为贝塞尔曲线（非直角 smoothstep）
- 检视器可拖拽调宽（约 200–480px）
- 小地图复刻思维导图自定义绘制（节点+边、主题色、无默认白框）
- 选项边标签主题色底+可读字（修复 RF 默认白底白字）

### 保存防清空

- 画布未 hydrate 完成时 **禁止** flush 写空 CSV
- 若图导出 0 行但缓冲区仍有台词且仍有 line 节点 → 阻止覆盖并提示
- 打开文件只 hydrate 一次（不依赖每次 content 变更），避免竞态把空图写回磁盘

### 文档与 AI

- product-decisions / architecture / how-to-run / gotchas / win README / project-memory README 同步 v1.2
- **Godot 插件说明书**整篇重写为 v1.2：choices API、layout 忽略、Keep File、播放伪代码、Kentucky 图映射、自测清单（`extras/godot-kentucky-dialogue/README.md`）
- `read_dialogue` 附带同 stem choices 摘要；系统提示注明分支在 choices.json

## 45. AI Agent 适配节点式台词图（v1.2）

- `formats.ts`：choices / layout 解析序列化、`layoutDialogueGraph`（分支扇出排版）、`summarizeDialogueGraph`
- 新工具：`propose_dialogue_graph`（整图 csv+choices+layout）、`propose_set_dialogue_choices`、`propose_reorder_dialogue_lines`、`layout_dialogue`
- `propose_append_dialogue_lines` 支持 `afterId` 插入；`read_dialogue` 返回 sequenceChains / warnings / hasLayout
- 审核门：`dialogue_layout` 始终可自动写；`dialogue_choices` 在同轮已写 sibling csv 时可自动写；空 choices → 删文件
- Outline 模式可结构排版对话图；文学系统提示增加 Dialogue graph（Godot v1.2）专节

## 46. Agent Skills + 多轮联网搜索

- 全局 Skills：`data/ai-skills/<id>/SKILL.md`；设置页启用/导入/打开目录；示例 `literary-voice`
- 工具：`list_skills` / `read_skill`；catalog 注入系统提示（Ask 也可读到摘要）
- 联网搜索：设置默认关；`web_search` + `web_research`（自动拆题、串行连搜、合并/重叠/浅层冲突）
- 提供方：DuckDuckGo（短超时）失败则**自动回退 Bing**；可直接选 Bing；Brave/Tavily 枚举预留；Electron `net.fetch`
- 无 Shell、不执行 skill 脚本、无通用 web_fetch

## 47. 台词图 dagre 自动排版

- 编辑器 / AI `layout_dialogue` 统一用 dagre TB + End 收拢；工具栏「自动排版」；无 layout 首开走同算法
- 选项边标签截断显示，完整文案仍在 `data.label`

## 48. 台词图可读性（End 沉底 + 芯片 + smoothstep）

- End 参与 dagre 沉底（取消右侧横拉）；选项全文进节点芯片，边上仅序号
- 连线改 smoothstep；短预览 + 开场徽章 i18n；product-decisions 同步

## 49. 台词连线统一为选项（协议 v1.3）

- 废除顺序边 / 右侧选项柄；底边全为 option；禁止空/非空混排
- 读盘迁移：无 choices 合成空 text 链；有 choices 则补缺行邻接
- Godot 联动说明书整篇升 **v1.3**；AI / project-memory / win README 去 v1.2 行序语义
- **可操作角色** `characters.operable`：仅玩家空 text 等确认；NPC 空 text 自动过句；协议速览 / 执行器伪代码 / 自测清单已对齐

## 50. 协议吸收 Godot 联调作者协调项

- `text_color` 空=引擎默认正文色（≠ 角色色）；开场立刻听 NPC → 非 operable；不可达行播不到；换篇属 Godot override；Kentucky 不碰 Keep File `.import`
- extras §4.2 + 作者侧自测；gotchas / product-decisions / how-to-run；检视器与 AI 提示勿把角色色写入 `text_color`

## 51. 开场节点互斥开关

- 检视器「开场节点」勾选设唯一入口（已是开场不可取消，须改设其它节点）
- `resolveOpeningId` / `withExclusiveOpening`：`diskFromGraph` 优先 `data.isOpening` → CSV 第一行；缺省/多标归一；删开场回退无入边最左上
- 协议 §9：Kentucky 可显式指定开场；Godot 仍只认 CSV 首行（无新 sidecar 字段）
- 涉及：`dialogueGraphMap.ts`、`DialogueEditor.tsx`、`DialogueInspector.tsx`、i18n

## 52. UI 动效抛光（Emil Kowalski skills）

- 气质：工作台 crisp；偶尔出现的表面才动画；**不**动画高频键盘切标签；无 framer-motion
- Tokens（`global.css`）：`--ease-out`、`--duration-press|popover|toast|modal|chrome`
- Toast：`ToastLayer.tsx`（Workbench / FloatWorkbench）；进出 `opacity` + `translateY(8px)` ~180ms
- 对话框：`AnimatedDialogShell.tsx` 包裹 Confirm / Unsaved；backdrop fade + 面板 `scale(0.98)`；内联 `app-dialog` 靠 `@starting-style` 入场
- Chrome：tab / activity / toolbar / dialog 按钮短 hover + `:active scale(0.97)`；菜单/ctx/mention/mode 微入场；character-card / kmind-handle opacity 对齐 bubble-actions
- A11y：`prefers-reduced-motion` 停 edge-flow / ai-spin / blink / boot-slide；覆盖层 duration→0；`index.html` + `public/splash.html`

## 53. Plan 模式：工作区 `plans/*.plan.md`（Cursor 对齐）

- `create_plan` 写入工作区根 `plans/<slug>.plan.md`（同 slug 覆盖）；自动打开编辑器；会话记 `planFileRel` + Mirror `plan[]`
- `update_plan_step` Soft 更新勾选（保留 Overview/Plan 正文）；Agent InjectPath
- **移除** AI 面板消息区上方常驻计划列表；计划真相 = md（可随项目提交；作者要私有自行 ignore）
- Plan 模式仅允许 `create_plan` / `update_plan_step` 写计划文件；其余写工具仍禁用
- 涉及：`planFiles.ts`、`tools.ts`、`agentLoop.ts`、`chatSessions.ts`、`AiPanel.tsx`、`documentHub.docApplyExternalWrite`

## 54. Agent 工作区 FS + 计划一键执行

- 新工具：`workspace_mkdir` / `workspace_copy` / `workspace_move` / `workspace_delete`（Agent 模式；Node FS，禁止 shell）
- move/delete 同步 `*.dialogue` sidecar；move `.kmind` 时尽量带 `.assets`
- `ai:workspaceOp`：`refreshTree` / `fsMoved` / `fsDeleted` / `fsCopied` 刷新树并处理打开中的标签
- `plans/*.plan.md` 编辑器顶栏 **Build / 开始执行** → `executePlanFile`（切 Agent、开面板、绑定 plan、发执行提示）
- 系统提示：归档优先 `workspace_move`，勿再声称「无法移动/删除」

## 55. 工具反馈修复（创作长会话）

来源：`tool_feedback.md`（随笔→三部曲→归档→雾港）

- **写入门禁**：`characters` upsert **始终 auto**（即使同轮已改正文）；结果带 `reviewHint`；系统提示 `WRITE_GATE_SUMMARY`
- **continuity_check**：返回结构化 `issues[]`（含 `ghost_character` / `empty_cast`），**不再** dump 章节全文
- **计划勾选**：去掉按序号误伤 `## Plan` checkbox；按 `id:` / 同文案同步；`update_plan_step` 返回 `fileWritten`/`contentChanged`/`steps`（弃用误导的交替 `fileUpdated`）
- **dialogue append**：文件不存在时自动建 11 列表头；返回 `columnOrder` / `headerNote`
- **FS 可发现性**：copy/move 描述强调归档勿读后重写

## 56. 工具反馈 Round B（diff / 批量 / search / CSV）

- Pending/Applied 卡片：`formatProposalDiff`（−/+ hunk），不再只贴 after 截断
- 批量：底部全部接受/拒绝；每轮消息「接受/拒绝本轮全部」
- `web_search` / `web_research`：enrich 开；空 snippet 用 excerpt 回填
- `sanitizeCsvCell`：清理 `""人""` 类转义残迹（characters + dialogue parse/serialize）
- 交接长文：[`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md)

## 57. 工具反馈 Round C（「已修未部署」根因 + 幽灵）

- **根因**：默认「改完标黄」时，characters upsert 曾标 applied **却不写盘** → 批量/continuity 仍见旧 cast。现 `shouldPersistAutoToDisk`：characters / ≤5 行台词 / layout / choices **强制落盘**
- continuity：删除 `excerpts`；`registeredCast` + `castNote` 标明仅磁盘已登记
- prose 提案可附 `ghostCharacterWarnings`
- create_plan：剥掉 `## Plan` 里无 id 的裸 checkbox
- web_search：snippet 保证非空；upsert 入参 sanitize
- SESSION 顶栏强调：**必须完整重启 Electron 主进程** 才能验证

## 58. 工具反馈 Round D（feedback v2：伪「5 张阈值」）

- **结论**：不存在「≥5 张角色 → pending」门禁；`≤5` 只约束 **dialogue 行数**。v2 观测更像「同轮多文件 + 旧主进程」
- `decideAutoApply` / `gateDetail` / `toolApi:"2026-08-11-d"`（部署指纹）
- 多文件判定改为「本轮其它路径」（先判定再登记 turnPath）
- 新工具 `propose_upsert_characters`（一批一写）
- `read_characters` 注明 6 列含 operable；`""…""` 为 RFC 4180 非缺陷
- characters 始终 auto（含与正文同轮）
- **权威总清单**（含 Android 待对齐）：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)

## 59. 工具反馈 Round E（幽灵误报）

- 新模块 `ghostNames.ts`：不再用 CJK `{2,4}` 滑窗
- 排除已登记名、第一章类章节、*楼地名、*号船名、把字结构；召回老陈/阿X/姓+名/管事职衔/X说
- `toolApi` → `2026-08-11-e`
- W9/W10 仍标「需人工 UI 复核」；B1 kmind 坐标仍 backlog

## 60. 测试基线入库 + Round F（幽灵残留）

- 干净结论基线：[`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)（9 项实证通过）
- 幽灵再收紧：挡「钟楼会/张船票/管收件/水泡得/老规/老人/小字」；姓表去掉易误伤的「管/水」
- 提案结果增加 `uiReview`（说明面板有 diff/批量，勿重复报缺）
- `toolApi` → `2026-08-11-f`

## 61. Round G — propose_text_patch 破坏 Markdown 表格/引用

- **根因**：AI 同步进 TipTap 时无 Table 扩展，`setContent`→`getMarkdown` 丢掉 `|`、折叠 `>`、加倍 `**`
- **修**：`@tiptap/extension-table*`；`emitUpdate:false`；`applyProposalToDisk`→`docApplyExternalWrite`；`read_file`/`propose_text_patch` 对齐脏编辑缓冲
- `toolApi` → `2026-08-11-g`；总清单 W19；Android OPEN 待同步编辑器 Table

## 62. 打开 MD 误标脏

- TipTap 打开/切换源码时 `getMarkdown` 规范化写回 → 无编辑也 dirty
- 修：hydration 门闩 + 忽略 `addToHistory:false`；干净 tab 切源码不序列化回写；`contentIsDirty` 忽略纯 CRLF/LF 差异

## 63. Round H — 文学 Agent 记忆能力（M1–M4）

- 工作区按需：`story_state.yaml` / `foreshadow.yaml` / `voice_anchor|bank.yaml` / `glossary.yaml` / `materials/` / `revisions/`（非 Git）
- 工具：`read_*` / `propose_upsert_*` / `compare_voice` / `proofread_check` / `reader_critique`（骨架）/ 快照 create·restore
- `continuity_check` 填 timeline/prop/foreshadow/scene/voice/glossary/proof；表内一致性 + 可选 `assertions[]`；冲突只警告
- 启用态 = 状态表存在且 ≥1 章；L5 ~200 字计数摘要；记忆 YAML auto+强制落盘
- `toolApi` → `2026-08-11-h`；Android OPEN：[`../../android/project-memory/OPEN-literary-memory-parity.md`](../../android/project-memory/OPEN-literary-memory-parity.md)（H1–H4）

## 64. 文学记忆防遗忘（toolApi i）

- 新增 `memoryNudge.ts`：系统提示 CRITICAL 清单；散文写入结果 `memoryHint`；L5 附 Before/After 调用 CTA（优先保留 CTA）
- literary 工具 description 统一 `CALL WHEN/BEFORE/AFTER…`；`continuity_check` 强调写后 aspects
- `toolApi` → `2026-08-11-i`；Android OPEN 同步 `memoryNudge` / `memoryHint` 契约

## 65. 全屏/最大化时工作台 letterbox

- 现象：窗口边框已全屏，但 UI 挤在左上，右侧/底部露出 `#141414` 底色（agent 流式时更易触发）
- 修：`html/#root/.app-root/.workbench` 强制 `width/height:100%`；Win `bindClientAreaFill` 在 maximize/resize/fullscreen 时重申 contentSize；流式起停时再 kick 一次 layout

## 66. Agent `/` skills 预览 + 上下文结构预览

- Composer 输入 `/`：弹出 Skills（启用 skill）+ Commands（`/agent|/plan|/outline|/ask|/new`）；选 skill 写入 `/id`，发送时强制 `read_skill`
- 上下文条可点：分段色条 + 分项（system / tools / skills / rules / conversation）估算弹层
- 主进程 `contextEstimate.ts`；`ai:contextUsage` 返回 `buckets`
- Android OPEN：[`../../android/project-memory/OPEN-agent-ui-parity.md`](../../android/project-memory/OPEN-agent-ui-parity.md)

## 67. voice_anchor schema 修正（toolApi j）

- 合法键 person/tense/sentence/metaphorDensity/lexicon/notes；`narrator` 写入 alias→notes
- `schemaHint` 出现在 read/set 结果；工具 parameters 写明嵌套键
- `TOOL_API_VERSION` → `2026-08-11-j`

## 68. 上下文色条比例 + 冷色板

- 色条按 `tokens/limit`（非 used 拉满）；头数字 = 分项之和；图例「剩余容量」
- 色板低饱和冷灰蓝：`#8a9aa8` … `#3d5a6c`

## 69. Agent 面板多余滑块

- 消息列表：`overflow-x: hidden`（去掉底部横向滑块）；`pre` 内部可横滚
- `/` skills 菜单：保留竖滚，隐藏滑块（`scrollbar-width: none`）
- `.ai-pane` / `.ai-messages-wrap`：`overflow: hidden` + `min-width: 0`

## 70. 选中文段右键菜单

- 有非空选区时右键：Copy / Select All / Search with Google（暗色圆角，快捷键右对齐）
- 跳过文件树 / 导图 / 活动栏等已有菜单区域
- `shell:openExternal`（仅 http/https）供 Google 搜索
- Win：`SelectionContextMenu.tsx`；Android CSS 同步 `.ctx-menu-item`（组件待移植）

## 71. Composer 文件挂载样式（行内 chip + 示意页）

- 输入区：挂载文件以冷青蓝 **行内 chip**（FileDown 图标）出现在文案前，可 × 移除
- 发出后：用户气泡保留 chip（**无**示意页缩略图）
- 会话字段：`attachedPaths`；`editor.attachedPaths` 随 `ai:send`
- 可从资源管理器 **拖文件/文件夹到 Composer** 挂载；文件夹路径以 `/` 结尾，上下文注入浅层目录列表
- Win：`FileMountChip.tsx` / `AiComposer` / `AiPanel` / `workbench/dnd.ts` / `agentLoop.readWorkspaceMention`

## 72. Composer Skill 胶囊

- `/` 选 skill 后变为暖色胶囊（如 `/grill-me`），可 × 清除；正文另写
- 发送：`skillId` 落会话；**主进程注入 SKILL.md 正文**到本轮系统提示（不依赖模型先调 `read_skill`）
- 气泡：skill/文件 chip 单独一行，正文在下
- 仅 skill、无正文也可发送

## 73. 资源管理器文件夹展开记忆

- 按工作区记住展开的文件夹（`localStorage`：`kentucky:explorer-expand:<ws>`）
- 默认：项目根展开以显示顶层条目，**子文件夹默认收起**（不再 `depth<=1` 全开）
- Win / Android：`explorerExpandPrefs.ts` + `FileTree` ExpandCtx

## 其它小修

- 选项卡悬停用 `cursor: pointer`
- 连线手柄圆心贴节点边缘（半进半出）；缩放时手柄不宜过大

## 74. 设置页排版与分段开关动效
- 卡片分区、stacked 字段；SegmentedControl clip-path（`--duration-toggle`）
- 详见 android `OPEN-shell-ux-parity.md` U8

## 75. 设置页主题色滚动条
- `kentucky-overlay-scroll` + `useOverlayScroll`（U9）

## 76. 上下文用量跟随主体色
- `accentTone` / `CONTEXT_BUCKET_STRENGTH`；ContextBar 读 settings accent（U10）

## 77. 开始页多开工作区
- `goHome` 停车；Welcome 与活动栏「+」同为加开；已开 badge（U11）

## 78. 纸夹挂载 CRITICAL 注入
- `buildMountedFilesHint`；`readAbsSafe` 路径键统一；`toolApi: 2026-08-12-a`（U12）
- 移植契约：`android/project-memory/OPEN-shell-ux-parity.md`

## 79. 冒烟反馈修复（2026-08-12-b）
- **门控澄清**：`update_plan_step` 不进 `turnPaths`；`multi_file_turn` 仅内容路径（plan 路径排除）
- **setCurrent:false**：`asBool` 防 `"false"`；不改 `current.location`；rollup 本就不写 sceneId
- **append**：返回 `addedLineIds`；空/已有 dNN 续编号；schema 支持 `lines[].id`
- **choices merge**：`null` 亦可删 key
- **ghost**：排除「这/那+量词」（那串风铃）
- `toolApi: 2026-08-12-b`

## 80. Agent 自动落盘 + Git SCM + 导图子树（2026-08-12-c）
- 取消 Accept/Reject；提案只读卡；Agent **始终写盘**
- DocumentHub `docApplyAgentWrite` / `docReloadFromDisk`；黄●相对 original 至 Ctrl+S
- 活动栏 Source Control：init、status、diff、discard、stage、commit；Agent `git_status`/`git_diff`
- `propose_kmind_edit`：shape/尺寸、removeSubtree、moveSubtree
- Android：仅手册 [`open/auto-apply-git.md`](../../android/project-memory/open/auto-apply-git.md)，本版不同步代码
- `toolApi: 2026-08-12-c`

## 81. 第三轮冒烟修复（2026-08-12-d）

来源：`test2/agent-第三轮冒烟测试总结.md`（找茬）。指纹 `toolApi: 2026-08-12-d`（须**完整重启** Electron）。

| FIND | 严重度 | 现象 | 修复 |
|------|--------|------|------|
| **A** | 中 | `propose_kmind_edit` connect/move 非法 id 静默丢弃 | 收集 `skipped[]`，同步 `warnings` + note；覆盖 update/removeSubtree |
| **B** | 低 | continuity `character`+`characterStatus` 表中无键则静默 | `kind: unknown_character` warn（`literaryContinuity.checkAssertions`） |
| **C** | 低/设计 | 部分 reorder 改 CSV 首行=开场无感知 | 返回 `openingId`/`openingBefore`/`openingChanged` + note；schema 说明首行=开场 |
| **D** | 中 | `git_status` 中文路径八进制 | 所有 git 调用前缀 `-c core.quotepath=false`；`unquoteGitPath` 按 **UTF-8 字节**解八进制（勿逐字节 `fromCharCode`） |

**文件：** `gitService.ts`（quotepath / unquote / 默认 `.gitignore` 含 `.kentucky/`）· `tools.ts`（kmind skipped、reorder）· `literaryContinuity.ts` · `proposalGate.ts`。

**验收：** 错 id 连线有 skipped；未知角色断言有 unknown_character；部分 reorder 有 openingChanged；中文路径可读。

## 82. 第四轮冒烟 + Agent git pull/push（2026-08-12-e）

来源：`test2/agent-第四轮冒烟测试总结.md`（含 §六 备份/拉取补测）。指纹 `toolApi: 2026-08-12-e`。

### 82.1 冒烟 FIND

| FIND | 严重度 | 现象 | 修复 |
|------|--------|------|------|
| **03** | 中 | 旧仓 `.gitignore` 无 `.kentucky/`（`-d` 只写在**新建** ignore） | `ensureKentuckyGitignore` 幂等；`git init` + **`git_status`/summary** 时调用 |
| **E** | 低 | `git_diff` 缺文件/目录 → `ok:true, diff:""` | 缺文件 / 是目录 → `ok:false` + `error` |
| **F** | 低（复测降级） | `staged=true` 对 untracked 仍全文 fallback | **仅** `staged=false` 才对 untracked 生成 `/dev/null` 全文；staged 空则 note |
| **G** | 低-中 | performance `font_size:"abc"` / 非 hex `text_color` 落盘 | 校验：font_size=数字或空；text_color=`#RGB/#RRGGBB/#RRGGBBAA` 或空；拒写字段进 `warnings` |
| **H** | 低 | append 未注册 speaker 静默 | 仍写盘；`warnings` 列未注册 speaker |
| **I** | 低 | voice upsert 未注册 characterId 静默 | 仍写盘；`warnings` 提示不在 cast |

**未做（有意）：** Agent **commit** 仍 UI-only；append/voice **不硬拦**（与 cast_check 分工）。

### 82.2 Agent Git 工具扩展

产品决策更新：Agent 可 **pull/push**，**禁止 force**；无任意 argv/Shell；**无** Agent commit。

| 工具 | 行为 |
|------|------|
| `git_status` | 分支、files、**remotes**、`gitignoreUpdated`；触发 ensure `.kentucky/` |
| `git_diff` | 见 FIND-E/F；截断大 diff |
| `git_pull` | `git pull` [remote] [branch]；可选 `ffOnly`→`--ff-only`；无 remote → error |
| `git_push` | `git push` [remote] [branch]；可选 `setUpstream`→`-u`（须 branch）；**永不** `--force` / `--force-with-lease` |

**IPC（供日后 UI）：** `git:pull` / `git:push` / `git:remotes`（`registerGitIpc.ts`）。

**文件：** `gitService.ts` · `registerGitIpc.ts` · `tools.ts`（defs + cases）· `literaryTools.ts`（voice warn）· `proposalGate` 文案 · `product-decisions.md` / `gotchas.md`。

**Android：** 详约 [`open/auto-apply-git.md`](../../android/project-memory/open/auto-apply-git.md)；**本版不移植代码**。

**验收：** 指纹 `2026-08-12-e`；无 remote 时 pull/push 可读错误；FIND-03/E/F/G/H/I 对齐。

## 83. 第五轮冒烟（2026-08-12-f）

来源：`test2/agent-第五轮冒烟测试总结.md`。

| FIND | 处理 |
|------|------|
| **J** | `moveSubtree` 区分 `unknown root` / `unknown parent`；`connect` 区分 source/target |
| **K** | `git_status` 工具描述与返回 `note` 标明可能写 `.gitignore`（非纯只读）；`gitignoreUpdated` 时写明 side effect |

**产品 OPEN（报告 §七）：** 已由后续版本关闭 — Confirm 卡（`-g`）→ 自动执行+高亮（`-i`）→ 本地 URL/裸仓/L5（`-j`…`-l`）。详见 [`AGENT-GIT.md`](./AGENT-GIT.md)。

- `toolApi: 2026-08-12-f`

## 84. 独立 Git 确认卡（2026-08-12-g）

用户拍板：Agent Git **写操作**用独立确认卡（非文件 Accept；文件仍始终自动写盘）。

| 工具 | 行为 |
|------|------|
| `git_add` | 排队 Confirm；`all=true`→`git add -A`，或 `paths[]` |
| `git_commit` | 排队 Confirm；Confirm 后 `git commit -m` |
| `git_remote_add` | 排队 Confirm；`name`+`url` |
| `git_log` | 只读立即执行 |
| `git_pull` / `git_push` | 仍立即执行（无 force） |

- 工具结果：`pending:true` / `executed:false` / `opId` / `toolApi`；**勿**在 Confirm 前声称已提交。
- 会话：`ChatSession.gitOps[]`；IPC `ai:confirmGitOp` / `ai:rejectGitOp`；事件 `ai:gitPending`。
- UI：`AiPanel` `GitConfirmCard`（Confirm/Reject）；执行失败保持 pending 可重试。
- `toolApi: 2026-08-12-g`（须完整重启 Electron）。

## 85. 工作区自动建仓（隐藏 `.git`）（2026-08-12-h）

- 打开/切换工作区 → `gitEnsure`：无祖先 `.git` 时在**工作区根** `git init` + 默认 `.gitignore` + `kentucky.autoInit=true`。
- `git:status` / Agent `git_status` 同样 ensure（返回可含 `repoCreated`）。
- **软件内不可见**：资源管理器与 Agent `list_dir` 均不列出 `.git` 等点文件；SCM 不再依赖用户手动「初始化」（失败时仍可重试）。
- 有父级 Git 仓时**不**嵌套 init，复用向上找到的仓根。
- `toolApi: 2026-08-12-h`
- **历史注（§121）：** 上条 walk-up **已废止**。现只认工作区根 `.git`，打开子文件夹会嵌套 init。勿按本节实现。

## 86. Git 写操作取消确认 · 高亮提示（2026-08-12-i）

- `git_add` / `git_commit` / `git_remote_add` **立即执行**（无 Confirm/Reject）。
- UI：只读高亮卡（flash 动画）+ Toast；失败卡显示 error。
- 事件：`ai:gitOp`（替代 `ai:gitPending`）。旧会话 pending gitOps 加载时标 rejected。
- `toolApi: 2026-08-12-i`

## 87. git_remote_add 本地路径（2026-08-12-j）

冒烟：带空格的 Windows/`file://` 路径被 `/\s/` 误拒为 Invalid remote URL。

- `isValidGitRemoteUrl`：允许 https/ssh/git/file、scp-like、本地盘符/相对路径（**允许空格**）。
- 新增 `git_remote_remove`（清理占位 origin）。
- `toolApi: 2026-08-12-j`

## 88. 本地 remote 自动建裸仓（2026-08-12-k）

- `git_remote_add` 指向本地/`file://` 且目录不存在 → 自动 `git init --bare`（`bareCreated`）。
- `git_push` 前同样 ensure：已配置但裸仓缺失时补建再推。
- 路径已存在且非 Git 目录 → 明确报错（不覆盖）。
- `toolApi: 2026-08-12-k`

## 89. Git 工具更易被 Agent 调用（2026-08-12-l）

- 每轮 Editor context 注入 **Git (L5)** 实况（branch/remotes/dirty），新对话不依赖旧聊天记忆。
- 系统提示增加 `GIT_AGENT_PLAYBOOK`（配方 + 意图关键词）。
- 各 `git_*` 工具 description 改为 WHEN/Next 导向。
- `toolApi: 2026-08-12-l`

## 90. Git 专档归档

- 新增完整记录 [`AGENT-GIT.md`](./AGENT-GIT.md)；README / product-decisions / architecture / SESSION 已交叉链接。
- 本文 §80–§89 为时间线；**契约以 AGENT-GIT 为准**。

## 91. 空提交可读错误（2026-08-12-m · GIT-1）

压力测反馈：空 `git_commit` 报 `Command failed: git …`，未暴露 `nothing to commit`。

- `git()` `allowFail`：空 stderr **不再**回退到 `err.message`（避免盖住 stdout）。
- `formatGitCommitFailure`：映射为 `Nothing to commit — working tree clean…` / `Nothing staged to commit…`。
- Playbook / `git_commit` description：整 index 一次提交（GIT-2 信息项）。
- `toolApi: 2026-08-12-m`

## 92. 三轮压力结论 + GIT-3（2026-08-12-n）

test2 三轮合并：工具链稳定；批量/特殊路径/拉取专项/自动裸仓全通过。

- [`AGENT-GIT.md`](./AGENT-GIT.md) §7 写入三轮总结论。
- GIT-1 已在 `-m` 关闭；GIT-2/GIT-3 为 Git 正常行为。
- Playbook + `git_push`/`git_remote_add`：remote 删除重加后用 `setUpstream`+`branch`（GIT-3）。
- `toolApi: 2026-08-12-n`

## 93. 工作区 Git 环境说明防遗忘（2026-08-12-o）

- 约定工作区根文件：`agent-GIT环境说明.md` / `AGENT-GIT-ENV.md`（远程、分支、常用序列）。
- L5：`findWorkspaceGitEnvDoc` 探测到则提示「新对话先 read_file 再 git_status」。
- Playbook + `git_status` description 同步。
- 例：test2 已落盘 `agent-GIT环境说明.md`（origin → `D:/Working Directory/test2-remote.git`）。
- `toolApi: 2026-08-12-o`

## 94. 工具通用性 / 禁跨工作区路径（2026-08-12-p）

审计：Agent 工具实现均绑定 `ctx.workspaceRoot`，源码无 test2/绝对盘符写死；风险在提示层把某仓 remote「记」到其它仓。

- Playbook / L5 / `git_status`·`git_remote_add` description：明确 **THIS workspace only**；无 L5 点名则不读/不造 env remote。
- [`AGENT-GIT.md`](./AGENT-GIT.md) §4 增加通用性说明。
- `toolApi: 2026-08-12-p`

## 95. 工作区沙箱（2026-08-12-q）

防错误指令理解后整盘破坏：

- 新增 `workspacePath.ts`：跨盘符 `isAbsolute(rel)` 拦截、symlink realpath、提案落盘二次校验。
- `gitStage` / `gitDiscard` / plan / revision 快照走同一围栏。
- 本地裸仓：`assertSafeExternalGitPath` 拒绝盘符根与 Windows 系统目录。
- 系统提示 / playbook 标明 sandbox。
- `toolApi: 2026-08-12-q`

## 96. 分镜头稿本 + 简化 PR（Win 0.3.0）

大版本功能；完整说明书 → [`STORYBOARD.md`](./STORYBOARD.md)。

### 产品

- 每格 1920×1080；外绘拼图（gutter + 标题条 + 空白安全框）；Kentucky 不内绘。
- 单序列：一键铺轨、Ken Burns `from→to` 线性、单 BGM 轨 MP3、监视器播放/scrub（相机用检视器）。
- 导入尺寸不符默认拒绝；强制缩放二次确认。
- 导出：PNG；MP4 24fps H.264 1080p yuv420。
- AI 不参与；仅 Win；Android BOARD **A3 ⏭**。

### 工程 / Schema

- `*.kyboard` + 同级 `*.kyboard.assets/`。
- `win/src/shared/kyboardSchema.ts` **v1**（只增不改）；别名 `@shared`。
- 出厂默认：6 格 → suggest `3×2`；`panelDurationSec=2`；gutter 24 / labelBand 48。
- 冒烟：空白 `3×2` → **5856×2328**。

### 主进程

- `main/storyboard/`：`pngUtil`（pngjs）+ `storyboardService` + `registerStoryboardIpc`。
- IPC：`generateBlank` / `importSheet` / `sliceSheet` / `sheetSize` / `exportMp4` + progress；对话框 openPng/Mp3、savePng/Mp4。
- 沙箱：写入走 `workspacePath.ts`；导入源允许区外再 copy 进 assets。
- MP4：帧 PNG 序列 → ffmpeg（`KENTUCKY_FFMPEG` / 可选 ffmpeg-static / PATH）；临时目录 `.kentucky/storyboard-export/` 导出后清理。
- **未**稳定捆绑 ffmpeg-static（安装曾超时）。

### UI

- `StoryboardEditor`：Seg **稿纸 / 时间线 / 导出**；主题变量 + Emil 动效；无 PR 孤岛皮肤。
- Explorer：新建入口（Clapperboard）+ 右键；图标 **SB**；i18n `storyboard.*`。
- 路由：`EditorArea` / `FloatWorkbench`；`EditorKind 'storyboard'`。
- 立即写盘（非 DocumentHub）；BGM 播放不按 RAF 每帧 seek。

### 文档 / 版本

- 新建/扩写：[`STORYBOARD.md`](./STORYBOARD.md)、product-decisions、architecture、gotchas、README、how-to-run。
- Android：BOARD A3 ⏭ + changelog。
- `package.json` → **0.3.0**；依赖 `pngjs`。

## 97. 分镜头导出自定义路径/文件名

- 导出页：导出文件夹（可浏览）+ PNG/MP4 文件名输入；预览完整路径。
- 「导出」写到 `文件夹/文件名`；「另存为…」系统对话框（`defaultPath` 完整路径）并回写目录与文件名。
- 默认名：`{kyboardStem}-sheet.png` / `{kyboardStem}.mp4`；默认目录=工程文件父目录。
- Toast 显示实际落盘路径。

## 98. 工作区 PNG 预览

- 资源树显示 `.png`（主进程 `TEXT_EXTS` 纳入）。
- `EditorKind 'image'` + `ImagePreviewEditor`：只读预览、缩放、尺寸、Reveal。
- 打开时跳过 DocumentHub UTF-8 读盘；媒体走 `kentucky-file://`。

## 99. PNG 画布式缩放平移 + 空白稿自定义路径

- PNG 预览：滚轮定点缩放、拖拽平移、双击/适应（对齐导图画布手感）。
- 稿纸页「生成空白拼图」：可改**生成文件夹**（须在工作区内）与**文件名**；默认 `*.kyboard.assets/` + `blank_{cols}x{rows}.png`。
- `storyboard:generateBlank` 支持 `targetDirAbs` + `fileName`。

## 100. 时间线进度条（TransportScrubber）

问题：Windows Electron 原生 `input[type=range]` + `accent-color` —

- **0%**：左侧出现方形蓝块溢出圆角轨道；
- **100%**：拇指 / 填充到不了轨道右端。

修复：

- `StoryboardEditor` 内 `TransportScrubber`：自绘轨道 + 填充 + 拇指。
- 轨道 `overflow: hidden` 裁剪填充；拇指 `left: pct%` + `translate(-50%)`，0%/100% 中心贴齐两端。
- 指针拖拽 scrub；方向键 / Home / End；样式 `.storyboard-scrub*`。
- **勿回退**为仅靠原生 range accent 的实现。

完整契约仍以 [`STORYBOARD.md`](./STORYBOARD.md) §5（空白/导出/scrub/PNG 预览）与 §12 年表为准。

## 101. Composer 挂载指示词绑定（2026-08-12-r）

问题：拖 `storyboard.kyboard.assets/` 进对话框问「这个文件夹里有什么」时，Agent 扫整仓，不认 chip。

原因：挂载正文只进独立 system `turnHint`；用户气泡仍是短指示词；Editor context 里 L5 / 活动文件正文抢注意力。

修复：

- 发给模型的 **user 消息** 前缀绑定挂载路径 + 目录列表 / 文件正文（UI 仍显示短文案 + chip）
- CRITICAL 指示词增加中英指示词规则；禁止默认整仓盘点
- Editor context 置顶 `PRIMARY SUBJECT (composer mounts)`；有挂载时省略活动文件正文
- `@mentions` 不再把 chip 路径重复塞进弱提及；拖夹时树未展开则用 `readDir` 探测并补 `/`
- `toolApi: 2026-08-12-r`（须完整重启）

## 102. V1 片段边缘拖拽调时长

- 格子右缘可视化手柄（`.storyboard-clip-edge`）；拖动改单段 `duration`，`packVideoClipsMut` 涟漪后续 start。
- `timelineLaneSec` 尾部留白，末段可拖长；检视器改时长同样 pack。
- 契约：[`STORYBOARD.md`](./STORYBOARD.md) §5「V1 片段边缘拖拽」。

## 103. V1 入点/出点单边修剪

- 根因：轨道按总时长 % 布局，拖尾时整段左右缘一起动（像对称缩放）。
- 固定 px/秒 + 横向滚动；右缘只动出点；左缘（非首段）滚动修剪，本段出点时刻不变。
- `trimVideoClipInMut` / `trimVideoClipOutMut`。

## 104. 时间线播放：BGM 无声 + 监视器闪烁

- 无声：CSP 缺 `media-src kentucky-file:`；`.mp3` 响应补 `Content-Type: audio/mpeg`。
- 闪烁：每帧重设 `canvas.width` 清空位图 + 每帧 `new Image()`；改为缓存图片，仅在尺寸变化时设 canvas，RAF 内同步绘制。

## 105. 播放黑屏 / 时长不显示 / 残余闪烁

- BGM 默认 `outSec:60` 把 scrubber 拉到无画面区间 → 黑屏；改为探测 MP3 时长；**节目时长**用 `videoTimelineDurationSec`（不受音频虚长影响）。
- 切镜未缓存下一张时先清黑 → 闪；改为加载中保留上一帧 + 预取相邻格；`findVideoClipAt` 末端 hold。
- 拖段缩短后 playhead 钳回节目长度；片段上显示 `Ns` 时长。

## 106. 时间线 NLE 观感与基础剪辑

- 运输条 + 监视器|检视器 + 可拖上下分栏 + 刻度尺/播放头 + 加高 V1/A1 + clip 缩略图。
- 刀片分割 / Delete 涟漪 / 缩放适应 / 吸附 / 分镜条追加；快捷键 Space、←→、Home/End、C、Delete。
- 进入时间线校正已存 BGM `outSec=60` 占位。
- 样式：`storyboard-nle.css`；助手见 `kyboardSchema` split/remove/snap。

## 107. 时间线滚轮横移 + A1 修剪 + BGM 再无声

- 隐藏时间线横向滚动条；滚轮/触控板直接横移素材轨（`wheel` + `{ passive: false }` → `scrollLeft`）。
- A1 BGM 左右缘手柄：`trimAudioClipInMut` / `trimAudioClipOutMut`；可选 `mediaDurationSec` 作修剪上限。
- 无声回归根因：曾用 `outSec > 节目×3` 把**正常长 BGM**当占位反复探测，与播放抢 `kentucky-file`。
- 修复：占位校正**仅** `outSec===60`；缺 `mediaDurationSec` 时用当前 `outSec` 填、不另开探测 Audio。
- `.mp3` 协议改为 **流式 + Range/206**（勿整文件 `arrayBuffer`）；等 `canplay` 再 `play()`。
- 播放钟用 `docRef`，勿把整份 `doc` / 高频 `playhead` 绑进加载 effect。
- **须完整重启 Electron**（协议/CSP 在 main）。

## 108. 分镜素材库 → 多稿本切换

- 去掉检视器「分镜条/素材库」点格追加 V1（及轨道 `kentucky-panel-id` 拖放）。
- 改为「追加画完的稿本」（`importSheet`+`sliceSheet`）+ 稿本链接栏切换 `activeSheetId`。
- 稿纸页与时间线检视器同步；分镜格列表按当前 `sheetId` 过滤。
- 一键铺轨：先 `sheets` 顺序，再 `panel.index`。

## 109. 分镜三页 UI 抛光

- 稿纸 / 时间线检视器 / 导出：分区卡片、链接栏、路径预览条、操作主次分组。
- 分镜格改为格位卡片（`#N` +「列·行」）；按钮按压 `scale(0.97)`（Emil）。
- 新样式：`storyboard-pages.css`（`main.tsx` 引入）；NLE 仍用 `storyboard-nle.css`。
- 跟 Cursor 工作台色阶；**不**另起 PR 皮肤 / 落地页美学。

## 110. 空白路径/文件名无法键入

- 根因：`blankFileName` 仍匹配 `/^blank_\d+x\d+\.png$/i` 时，布局 cols/rows effect 不断写回默认名，表现为「打不了字」。
- 修复：`blankDirTouchedRef` / `blankFileNameTouchedRef`；用户一改就停止自动同步；输入 `stopPropagation` + `user-select:text`。

## 111. 稿纸页「页面显示不全」

- 根因：`.storyboard-pane` 为 column flex + `overflow:auto` 时，子 section 默认 `flex-shrink:1`，再叠加 section `overflow:hidden`，中间「空白稿输出」等被压扁裁掉。
- 修复：稿纸/导出 pane 显式滚动；子 `.storyboard-section` → `flex: 0 0 auto`；底部分区可滚出视口而非消失。

## 112. 时间线检视器「内容显示不全」

- 根因：检视器 `max-height: none` 撑破监视器行后被父级 `overflow:hidden` 裁切；窄栏横滑链接栏把「稿本 N」切成半截。
- 修复：检视器 `height/max-height: 100%` + 自身纵向滚动；紧凑态按钮竖排、稿本链接**换行全显**；分栏 `minmax(0, fr)`；监视器 canvas 取消全局 16:9 硬比例以免裁切。

## 113. 时间线多轨音频 + 监视器镜头打点

用户明确要求覆盖原「单 BGM / 监视器不改相机」限制（STORYBOARD「明确不做」不再含这两项）。schema **v1 只增不改**。

**音频**
- 新字段 `timeline.audioClips?: AudioClip[]`，`AudioClip.track?: number`（0–3，A1–A4）。
- 每轨 **一条** MP3；空轨点「添加音轨」写入 `a{n}_{ts}.mp3` 到 sibling assets。
- 旧字段 `timeline.audioClip` **始终** = `audioClips[0]`（`parseKyboard` 迁入；`serializeKyboard` / `syncLegacyAudioClip` 写出）。
- 播放：`Map<clipId, HTMLAudioElement>`，按 clip 的 start/in/out 同步；勿共用一个 `audioRef`。
- 导出：ffmpeg 每轨 `-ss/-t` + `volume/afade/adelay`，多轨 `amix=inputs=N:duration=longest`，再 `-map 0:v -map [a] -shortest`。
- 占位校正仍 **仅** `outSec===60`；缺 `mediaDurationSec` 用当前 out 填，勿把长 BGM 当虚长重探测。

**镜头（本条初版，随后被 §114–§115 修正交互）**
- 新字段 `VideoClip.camera.keys?: { t, x, y, scale }[]`，`t` ∈ 0..1，最多 `MAX_CAMERA_KEYS=6`。
- 监视器半分辨率 canvas：滚轮缩放、拖拽平移。
- 画布位移：`dCam = -dCanvas * 2 / scale`（与 `translate(-cam.x/2)` 一致）。
- 导出帧循环必须 `cameraAtClip`，禁止手写 from→to lerp。

**源码**：`src/shared/kyboardSchema.ts`；`main/storyboard/storyboardService.ts`；`editors/StoryboardEditor.tsx`；`storyboard-nle.css`；i18n `storyboard.*`。

## 114. 镜头打帧改为 Blender 式一键操作

§113 检视器拆成「记录入点 / 出点 / 在播放头打点 / 删除此点」+ from/to 六个数字，心智负担大；拖监视器还改**最近**一帧，播放头不在那一帧时画面会跳。

**现契约（Blender 自动关键帧 + I）**
- 拖监视器 / 滚轮 = 在 **播放头当前时刻** `upsertCameraKeyMut`（覆盖同 t，否则插入）。
- **I** 或运输条 / 检视器「打帧」：把当前插值姿态钉在播放头。
- **Alt+I** / 「删帧」：删除播放头处已有的手动帧。
- 去掉入出点四按钮和 from/to 数值栏；时长仍可改。
- 满 6 帧 Toast `camKeysFull`，`upsert` 返回 false，**不**默默丢掉别的帧。
- V1 clip 上菱形 = 已打的帧（点击跳转）；快捷键避开输入框。
- i18n：`camInsertKey` / `camInsertKeyTitle` / `camKeyHint` / `camKeysFull`（zh「打帧」；`addBgm` 文案改为「添加音轨」）。

## 115. 轨道上不显示默认镜头关键帧

§114 仍把 t=0 / t=1 静止姿态写入 `keys` 并画菱形。中间打一帧后，插值变成「原位 → 该帧 → 原位」，画面「乱跑」。

**现契约**
- `camera.keys` **只存手动打的帧**；`writeCameraKeys` **不再**强制补 t=0/t=1。
- 轨道菱形 / 检视器芯片只用 `storedCameraKeys`（不是合成的 from/to）。
- 播放/导出 `cameraAtClip`：有 stored keys → 在这些点之间线性插值，**区间外 hold**（一帧=整段钉住）；无 keys → 旧 from→to。
- `storedCameraKeys` 读取时 `pruneIdentityBookends`：丢掉旧工程里自动注入的 identity 头尾点（有内部帧且两端为静止）。
- 删帧可删播放头上**任意**手动帧（含头尾）。
- 刀片：只重映射 stored keys，不在切开处注入默认帧。

## 116. 右键菜单贴窗口边缘

资源树在窗口底部右键时，`.ctx-menu`（`position:fixed`）按 `clientY` 往下开，列表一长（新建文件/夹/导图/分镜/台词 + 重命名/在文件夹中显示/删除）被窗口裁切。导图节点菜单、活动栏关工作区、选区复制菜单同样问题。

**现契约**
- 真源：`workbench/fitContextMenu.ts`
  - `clampMenuPosition`：下方不够则翻到光标上方，再钳进 `pad=8` 的视口。
  - `useFittedMenuPos`：`useLayoutEffect` 量 `offsetWidth/Height` 后再钳（避免估高不准）。
- 接入：`FileTree`、`MindMapEditor`、`ActivityBar`、`SelectionContextMenu`。
- CSS `.ctx-menu`（`global.css`）：`max-height: calc(100vh - 16px)` + `overflow-y: auto` + `overscroll-behavior: contain`（菜单高于窗口时仍可滚到每一项）。
- 禁止只把 `left/top` 设成点击坐标。
- 新菜单必须走同一 helper，勿再复制 `{ left: clientX, top: clientY }`。

## 117. 追加稿本接到 V1 末尾

- 根因：「追加画完的稿本」只 `push` `sheets`/`panels`，不写 `timeline.videoClips`；时间线仍是旧片段，用户以为没追加成功。
- 已导入但未上轨的稿本：选中后出现「接到时间线」（`appendPanelClipsMut` 跳过已在轨的 panelId）。不要再点追加以免重复 `sheets`。
- 播放头跳到新片段起点并横滚露出；Toast `slicedOntoTimeline`。
- **一键铺轨**仍按全部稿本重铺（会丢掉已改时长/keys），作重置用。
- **不要**恢复点格素材库。

## 118. 捆绑 ffmpeg 供 MP4 导出

导出页点「导出 MP4」Toast 英文 `ffmpeg not found…`：本机 PATH 无 ffmpeg；Electron 从 Cursor 启动时也不继承用户后来改的 PATH。曾尝试 `ffmpeg-static` npm 包，postinstall 从 GitHub 拉二进制 **ETIMEDOUT**，不能当稳定依赖。

**现契约**
- 真源脚本：`win/scripts/ensure-ffmpeg.js`（`npm run ensure-ffmpeg`）。已有可运行 ffmpeg 则**复制**到 `win/resources/ffmpeg/ffmpeg.exe`；否则 `winget install -e --id Gyan.FFmpeg.Essentials` 再复制。
- `ffmpeg.exe` **gitignore**（`resources/ffmpeg/*.exe`）；目录只提交 `README.txt`。
- `resolveFfmpeg()`（`storyboardService.ts`）顺序：`KENTUCKY_FFMPEG` → 打包 `process.resourcesPath/ffmpeg/ffmpeg.exe` → 开发态 `../../resources/ffmpeg/ffmpeg.exe`（相对 `out/main`）→ 常见 Win 路径 → PATH。每个候选 `-version` 探活，不是只 `existsSync`。
- `dist` / `dist:dir` / `dist:portable` **先**跑 ensure-ffmpeg；`extraResources`：`resources/ffmpeg/ffmpeg.exe` → `ffmpeg/ffmpeg.exe`。
- 找不到：主进程 `error: 'FFMPEG_NOT_FOUND'`（勿塞英文长句）；渲染层 Toast `storyboard.ffmpegNotFound`。
- **禁止**再把 `ffmpeg-static` 加回 dependencies。

**源码**：`scripts/ensure-ffmpeg.js`；`storyboardService.ts`；`package.json`；i18n `ffmpegNotFound`。

## 119. 工作区 MP4 可点开预览

用户要求：工作区能**识别**并**点击预览**导出的 MP4。此前 `TEXT_EXTS` 只有 `.png` 媒体，`.mp4` 在树里消失；若硬打开会走 DocumentHub UTF-8 `docOpen`。

**现契约**
- 主进程 `TEXT_EXTS` 含 `.mp4`（与 `.png` 一样：树可见，不是文本编辑）。
- `detectKind('.mp4')` → `EditorKind 'video'`。
- `isMediaPreviewKind` = `image | video`：`openFile` **跳过** `docOpen`；`saveTab` 直接成功；`closeTab` **不** `docUnsubscribe`。
- UI：`VideoPreviewEditor.tsx` — `toMediaUrl` → `<video controls playsInline preload="metadata">`；工具栏时长 + Reveal。路由：`EditorArea` / `FloatWorkbench`。
- 资源树图标 **MP4**（`tree-icon-video`）；`explorerNames` `STRIP_EXTS` 含 `.mp4`。
- `kentucky-file`：抽出 `streamLocalMedia`。`.mp3` → `audio/mpeg`；`.mp4` → `video/mp4`。有 `Range` 则 **206** + `Content-Range` / `Accept-Ranges`；无 Range 仍声明 Accept-Ranges。其它扩展仍 `net.fetch(file URL)`。
- CSP `media-src` 已含 `kentucky-file:`（BGM 时加过）；协议/handler 变更须 **完整退出 Electron**，热重载无效。
- i18n：`video.preview` / `loading` / `loadFailed`。
- **明确不做**：jpg/webp/webm/mov；工作区内嵌播放器皮肤；把 MP4 当文本。不要恢复「点格素材库」。

**源码**：`main/index.ts`（`TEXT_EXTS` + `streamLocalMedia`）；`state/appStore.ts`；`editors/VideoPreviewEditor.tsx`；`workbench/{EditorArea,FloatWorkbench,FileTree,explorerNames}`；`styles/global.css`（`.video-preview-*`）；i18n `video.*`。

## 120. Win 本机安全审计（只记不改）

对 `win/` 做代码 + 漏洞审查，焦点是**破坏用户计算机**（擦盘、越权写删、任意执行、磁盘打满），不是网站 XSS。全文：[SECURITY-AUDIT.md](./SECURITY-AUDIT.md)。

**结论：** Agent/Git 工作区沙箱（`workspacePath.ts`）没有发现可直接删系统目录的洞。真正危险的是更早的渲染层 IPC 与产品边界。

**P0（应先修，本轮未改代码）**
- `fs:*` / `doc:*` 不校验工作区；`fs:delete` 对目录 `recursive+force`。
- 主窗无 `will-navigate` / `setWindowOpenHandler`：整页导航后 preload 仍暴露 `window.kentucky`。
- `git:setPath` 可指向任意 exe；打开盘符根 / 用户主目录当工作区时，Agent 可清空其下全部子项。

**P1：** `kentucky-file` 任意本地读；`.kyboard` `joinPath` 不挡 `..`；MP4 导出时长 / PNG 尺寸 / 空白稿 layout 无上限；`importSheetFile` 任意 `sourceAbs`；Git IPC 根可走到父仓。

**已有防护勿回退：** Agent `resolveWorkspacePath`；Git/ffmpeg `execFile`；`openExternal` 仅 http(s)；`contextIsolation`。

下一步须用户点头后再改代码（建议顺序见审计文档「建议修复顺序」）。**已由 §121 落地。**

## 121. 本机安全加固（审计 P0–P2）

用户要求按 [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) 修完发现项，避免破坏用户计算机。全文对照表见该文档「§121 落地对照」。**须完整退出 Electron**（协议 / preload / 导航锁 / IPC 沙箱）；热重载无效。

### 现契约

**导航锁**（`ipcSandbox.bindNavigationGuard`，主窗 + 闪屏）
- `will-navigate` / `will-redirect`：dev 仅 `ELECTRON_RENDERER_URL` 同源；打包仅 `file:` 且路径在 `out/renderer/` 内。
- `setWindowOpenHandler`：**一律 deny**；`http:`/`https:` 转已有 `shell.openExternal`。
- `setPermissionRequestHandler`：全部 `callback(false)`。
- 禁止再给主窗加 `nodeIntegration` 或关掉 `contextIsolation`。

**窗口工作区沙箱**（`ipcSandbox.ts` + `workspacePath.ts`）
- 每个 BrowserWindow 的工作区以 `windowRegistry` 为准，**不信任**渲染层随口传来的绝对路径。
- `fs:readDir` / `readFile` / `writeFile` / `mkdir` / `exists` / `isDirectory` / `doc:*`：`resolveInSenderWorkspace`。
- `fs:delete` / `rename`：`resolveWriteInSenderWorkspace`（额外 `assertNotWorkspaceRoot`）。
- `fs:copyFile`：源 = 工作区内 **或** 本会话 read allowlist；目标 = 工作区内 **或** write allowlist。
- `fs:toMediaUrl` / `kentucky-file` / `shell:showItemInFolder`：可读路径必须在打开的工作区或 allowlist。
- `openWorkspace`：**先** `reportWorkspace`（校验危险根）再 `readDir`；失败回滚上一工作区。i18n `errors.unsafeWorkspace`。

**对话框 allowlist**（进程内 Set，最多 512 条 FIFO）
- **read**：`dialog:openImage` / `openImages` / `openContextFiles` / `openPng` / `openMp3`。
- **write**：`dialog:savePng` / `saveMp4`（用户另存到桌面等处）。
- Agent `readAbsSafe` 可读 allowlist（作曲器夹文件）；写工具仍只限工作区。
- **不要**把任意绝对路径当例外；过期/新会话 allowlist 为空。

**危险工作区根**（`assertSafeWorkspaceRoot`）
- 继承 `assertSafeExternalGitPath`：盘符根、`C:\Windows` / Program Files / ProgramData / System Volume Information / Recycle Bin。
- 另拒：`X:\Users`（Users 目录本身）、`os.homedir()`（当前用户主目录本身）。`Documents` / 项目子文件夹允许。
- `window:reportWorkspace` / `window:newMain` / `window:newFloat` / `gitInit` / `ensureWorkspaceGit` 均校验。

**Git**
- `configureGitExecutable`：`execFile(…, ['--version'])` 且 stdout 匹配 `/^git version /i` 才保存 `gitPath`；启动时已存脏路径则清空。
- Git IPC：`requireSenderWorkspace(e, claimed)`，claimed 必须等于该窗工作区。
- `findGitRoot`：**只看该文件夹是否有 `.git`**，不再向上 40 层。打开 `Kentucky/win` 不会操作容器仓 `Kentucky/`；无 `.git` 则在**本根** `git init`（可能嵌套）。见 [AGENT-GIT.md](./AGENT-GIT.md)。
- `gitUnstage` 路径同样 `resolveWorkspacePath`。

**分镜头 / 媒体**
- `kentucky-file`：`assertReadableLocalPath` 后再 `streamLocalMedia` / `net.fetch`。
- 渲染层 `joinPath` 消化 `..`（不能越过盘符）；**主进程仍沙箱**，勿只靠 renderer。
- Storyboard IPC 的 `workspaceRoot` 必须等于窗口工作区。
- `importSheetFile`：源必须在 read allowlist **或** 工作区内。
- `exportMp4` 目标：工作区内 **或** write allowlist；临时帧目录走 `resolveWorkspacePath(.kentucky/storyboard-export/…)`。
- 时长：`MAX_EXPORT_DURATION_SEC = 15 * 60`；超限 `{ error: 'EXPORT_TOO_LONG' }` → Toast `storyboard.exportTooLong`。
- PNG：IHDR 先读；`MAX_PNG_DIM = 16384`、`MAX_PNG_PIXELS = 80e6`。稿纸 `clampLayout`：≤ 8×8，panel 锁 1920×1080，gutter/labelBand ≤ 200。
- ffmpeg `filter_complex` 的 volume / fade / delay 一律 `finiteNum` 夹紧。

**Agent / 联网**
- `runAgentTurn` 把 `editor.workspacePath` 与 `session.workspacePath` **覆盖**为窗口工作区。
- `ai:createSession` 优先用窗口工作区，不信渲染层乱传根。
- `fetchPageExcerpt`：仍仅 http(s)；再拒 localhost / `.local` / RFC1918 / link-local。
- `assertInsideWorkspace`：`realpath` 失败 **fail-closed**（不再吞掉）。

**明确保留**
- Monaco CSP `'unsafe-eval'`。
- Agent 在用户**自愿打开的项目文件夹内**写删（产品行为）。
- `ensure-ffmpeg.js` 的 winget（仅开发/打包）。
- Android 本轮不移植。

**手测 / 禁止回退 / 危险路径清单 / IPC 通道表：** 全文 [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)「现契约详解」。Git 相对 §85 的 walk-up 废止见 [`AGENT-GIT.md`](./AGENT-GIT.md)。

**源码**：`src/main/ipcSandbox.ts`（新）；`src/main/ai/workspacePath.ts`；`src/main/index.ts`；`src/main/windowRegistry.ts`（`listWorkspaceRoots`）；`src/main/git/{gitService,registerGitIpc}.ts`；`src/main/storyboard/*`；`src/shared/kyboardSchema.ts`（`clampLayout` / `MAX_EXPORT_DURATION_SEC`）；`src/main/ai/{agentLoop,registerAiIpc,webSearch}.ts`；`src/renderer/src/platform/index.ts`；`src/renderer/src/state/appStore.ts`；`src/preload/index.ts`；i18n `errors.unsafeWorkspace` / `storyboard.exportTooLong`。

## 122. IPC / 协议 / Git 根再收紧

§121 之后对照契约继续改：协议不再按「任一已开工作区」放行；Git 根只认 `.git` **目录**；窗口与 AI IPC 不再信渲染层乱传的根。

- **`kentucky-file`**：`assertProtocolReadable` = `rememberMediaPath`（`fs:toMediaUrl` 沙箱通过后登记）∪ dialog read allowlist。伪造 `?path=` 读另一已开工程 → 404。
- **`assertReadableLocalPath`**：有 sender 时只允许该窗工作区 ∪ read allowlist，**不**跨窗。
- **`window:newFloat`**：`requireSenderWorkspace` + 解析后的文件绝对路径。**`window:newMain`**：只能克隆本窗或 `listWorkspaceRoots` 已有根。
- **AI**：`listSessions` / `createSession` / `loadSession` / `deleteSession` / prefs / `send` / apply* 绑窗口工作区（`sameWorkspace`）。
- **`findGitRoot` / `inspectWorkspaceGit`**：`.git` 必须是目录；文件或 symlink（worktree/submodule 指针）→ `foreign`，不 init、不操作父仓。
- **`git:discard`**：DocumentHub evict/reload 用解析后的绝对路径。另存对话框 `defaultPath` 夹在工作区内。

须完整退出 Electron。权威：[SECURITY-AUDIT.md](./SECURITY-AUDIT.md)「§122」。

## 123. git_diff 越界与 git_add 同文案

测试建议：`git_diff` 越界应返回 `Path escapes workspace`（与 `git_add` 一致），且错误里的路径不要截断。

- 原先 `gitDiff` 用手写 `startsWith`/`includes(':')` 拼路径，越界常变成 `Path not found` 或 git 的 outside repository。
- 现与 add/unstage/discard 共用 `resolveRepoRel`：`error` 为 **`Path escapes workspace: <调用方传入的完整路径>`**（不 slice）。
- 工具 UI 预览：含该前缀的 JSON **整段保留**，不再 `result.slice(0, 400)` 切到半路。

不必改旧 test2 冒烟总结；记在 [AGENT-GIT.md](./AGENT-GIT.md)。

## 124. 独立游戏文案 / 策划 Agent 技能包

文学 + 独立游戏策划双主线：新装 / 新 `data/` 默认开启 8 个中文 game-* skill；纯小说作者可在设置关掉。需求：[REQ-indie-game-skills.md](./REQ-indie-game-skills.md)。

- 仓内真源 `win/resources/ai-skills/<id>/SKILL.md`（打包 extraResources）；`ensureSkillsDir` **copy-if-missing**，已有文件永不覆盖。
- `seenBundledSkillIds`：只把从未见过的 bundled id 追加进 `enabledSkillIds` 白名单；用户关掉后重启不复活。`enabledSkillIds === null`（全开）只记 seen。
- 工作区硬约定 `design/`（concept / gdd / systems / narrative / levels / balance csv / marketing）。文学 YAML 仍在根上。
- 若存在 `design/gdd.md`，Editor L5 加一行（模型向，中英；与 Git L5 同类）。
- UI 用 SKILL 中文 `name`；不新增 `nameEn`。不执行 skill 脚本、无子 Agent、无数值仿真器。

**验收**：完整退出后重启 Electron；设置里 8 个中文名 + `literary-voice`；关掉后 `/` 不列出且重启不复活。

## 125. Design 常驻纪律 + 对白 examples.md

技能包之后：没挂 `/game-*` 时 Agent 仍会按小说助手写。有 `design/` 树则系统提示注入 `DESIGN_AGENT_PLAYBOOK`（对白走 CSV、数字进表、专有名词先读 glossary）。`/game-narrative` 的 `examples.md` copy-if-missing，挂载 skill 时与正文一起注入。

纯小说工作区（无 `design/`）不注入，避免误伤。须完整退出 Electron。

## 126. Design L5 扩探测（策划 skill 收尾）

Design L5 不再只认 `design/gdd.md`。只要工作区有 `design/` 树，就列出本根**实际存在**的：`gdd.md` / `concept.md` / `characters.csv` / `glossary.yaml` / 浅扫 `*.dialogue.csv`（文件名最多 3 个）。只报存在、不灌正文；CTA 只点名已存在的文件。无 `design/` 的纯小说工作区不注入（Cast 摘要照旧）。

本切片到此收口：8 skill + copy-if-missing + seenBundled + playbook + 对白 examples + L5 探测。厂家改 SKILL 正文仍不覆盖老用户文件；不做 kyboard Agent 工具 / 子 Agent / 数值仿真。

## 127. 工作区 PDF 预览 + Markdown/导图导出 PDF

工作区 `.pdf` 可点开只读预览，对齐 PNG/MP4：`EditorKind 'pdf'`、`isMediaPreviewKind`（跳过 DocumentHub）、树图标 **PDF**、`TEXT_EXTS` + `STRIP_EXTS`。预览为 **pdf.js 自绘**（工作台配色、叠加主题滚动条、可拖宽缩略图、适应/缩放、Reveal）；`toMediaUrl` + fetch ArrayBuffer，worker 用打包的 `pdf.worker.min.mjs`。不用 Chromium PDF iframe（无法换肤，重挂空白）。导出仍为隐藏窗 `printToPDF`（非 pdf.js）。HTML ≤ 2MB，PDF ≤ 50MB。无批注/全文搜索。Android 不移植。改协议/CSP/preload 须**完整退出 Electron**。

导出仅当前 `.md` / `.kmind`（含未保存）。`.md`：TipTap HTML，A4 竖版浅色印刷稿。`.kmind`：`fitView` 后 `html-to-image` 栅格化 `.react-flow`（滤 minimap/controls，长边 ≤ 4096），一页横版。入口：文章/导图工具栏、文件菜单、资源树右键（未打开的 `.md` 读盘转 HTML；未打开的 `.kmind` 先 `openFile`）。另存 `dialog:savePdf`，默认同目录 `主名.pdf`，`rememberDialogWritePath` + `assertWritableLocalPath`。

印刷：隐藏 `BrowserWindow` 加载仓内 `pdf-print.html`（导航锁禁止 `data:` URL），IPC 注入 HTML 后 `printToPDF`。HTML ≤ 2MB，PDF ≤ 50MB；失败 i18n Toast。无 puppeteer。Android 不移植。改协议/CSP/preload 须**完整退出 Electron**。

## 128. Agent `export_workspace_pdf`

用户要 Agent 把 Markdown **直接写成工作区 PDF**（无另存对话框）。指纹 `toolApi: 2026-08-13-a`（须完整退出 Electron）。

- 工具 `export_workspace_pdf`（仅 Agent 模式）：`path` = 工作区相对 `.md`；可选 `dest`（默认同目录 `主名.pdf`，覆盖）。打开且未保存时用 DocumentHub 缓冲。
- 与 UI 共用 `printHtmlToPdf`（隐藏窗 + `printToPDF`）。主进程无 DOM，Markdown→HTML 用 GFM 子集（标题/列表/表格/代码/链接），不是 TipTap。
- `.kmind` / 台词 / 分镜头 / `.txt` 拒绝（导图仍须 UI 栅格化）。写完 `refreshTree`。路径走 `resolveWorkspacePath` + `assertWritableLocalPath`。
- 系统提示 + Design playbook 点名此工具。无 puppeteer / Android。

## 129. 应用图标改为黑底负形 K

用户提供的几何标重绘为 SVG，并替换软件图标。

- 底稿 `build/icon.svg`：黑圆角方（透明角外）、两块浅色几何（内圆角方被 45° 切开 + 右侧三角），负形为 K。
- 比例对齐 Cursor：外圆角 **220 / 1024（≈22%）**；K 标四周留白 **184（≈18%）**（原先 rx 135、留白 108）。
- `node scripts/rasterize-icon.js` 写出 1024² PNG（透明圆角）到 `build/icon.png` 与 `resources/icon.png`。
- 窗口 / electron-builder 仍读 PNG。改标须重跑脚本，不要手改 PNG。

## 130. 深色底 RAL 9005

深色模式画布 / 欢迎页 / 闪屏 / 窗口 `backgroundColor` 为 **RAL 9005** `#0A0A0A`。功能区用同色系深浅分开（Cursor 式房间，不是平涂）：活动栏 `#0A0A0A`、资源树/代理人 `#121212`、编辑器 `#161616`；输入 `#1C1C1C`、菜单 `#242424` 只比所在房间略抬。栏间分隔是 sash 自己的 1px `--border-pane` 发丝线（约 16% 白），命中区 5px，不再用负边距把线盖掉。标签条跟侧栏同色，活动标签跟编辑器。Windows 原生标题栏在浅色系统下会发白。深色模式用 `nativeTheme.themeSource` + Win32 `titleBarStyle: 'hidden'` / `titleBarOverlay`（色同 `DARK_BG`），菜单栏即顶栏，系统按钮叠在右侧。切主题走 `setTitleBarOverlay`。此项须完整退出再开。浅色仍 `#f3f3f3`。

## 131. 分镜头生成器滚动条

稿纸 / 导出页改用与资源树、设置、Agent 相同的 `kentucky-overlay-scroll`（滚动时才出现主题色细滑块）。时间线横滚仍隐藏。

## 132. Agent 输入框边缘流光

作曲框沿边走一圈 accent 彗星（conic + `transform` 旋转，8s linear）。外层轻 bloom，内层 1.5px 发丝；焦点 / 生成中略亮。`prefers-reduced-motion` 停转、留静态虹边。无 framer-motion。

## 133. 菜单栏软件标

Windows 自定义顶栏最左侧放 `build/icon.svg`（16px，负形 K）。装饰图，可拖窗，不抢菜单焦点。

## 134. Ask 模式真正禁工具

Ask 原先只是不把 tools 放进请求，同会话若刚跑过 Agent，模型仍会发出 `read_file` / `propose_text_patch`，循环也会执行并写盘。现：Ask（及未广告工具时）请求 `tool_choice: none`、历史里的 tool_calls 改成纯文本、收到的工具调用一律不执行。

DeepSeek 等模型仍可能把 DSML / `<invoke>` 写成**气泡正文**（不是 OpenAI tool_calls）。Ask 改用短系统提示（不再灌写盘/read_file 说明书），流式丢弃工具 XML，落盘前换成「请切 Agent」。

Ask 下 `getWritingToolsForMode` 返回空，`JSON.stringify(undefined)` 让 `ai:contextUsage` 抛错，hydrate 失败则 `bootReady` 永不置位；闪屏 480ms 已卸 → 黑屏。现：估算对空工具安全、IPC 失败不抛、hydrate 失败仍显示工作台、闪屏等到 `bootReady`。

## 135. 空台词 text 可落盘

`propose_append_dialogue_lines` / `allocateLineIds` 曾把 `text:""` 当无效行丢掉（第三轮 pressure.dialogue.csv d16）。Godot v1.3 确认续句行允许真空字符串。现只要求 speaker；空 text 写入 CSV。

## 136. 台词工具读脏缓冲区

第三轮 d16 经 `propose_text_patch`（`patchSource=editor_buffer`）写入黄脏缓冲，随后 `propose_append_dialogue_lines` 只 `readFileSync` 磁盘（无 d16），写回时把缓冲盖掉。`read_dialogue` / append / update / reorder / performance / graph / layout / cast_check 改为与 patch 一样优先脏 DocumentHub。结果带 `readSource`。指纹 `toolApi: 2026-08-13-e`（须完整退出 Electron）。

## 137. `/` 技能菜单被流光规则顶到面板顶

§132 给作曲框子元素加了 `position: relative`（盖住流光）。斜杠菜单因此丢掉 `absolute`，`bottom: 100%` 按 relative 把 SKILLS 抬到栏顶，输入框上方留下一块空圆角框。现把 `.ai-slash-menu` 排除出该规则。CSS-only，Ctrl+R 即可。

## 138. 资源树右键菜单裁切

资源树 `.ctx-menu` 画在侧栏里：`.sidebar-body` 裁掉超出部分，sash（`z-index: 8`）叠在菜单上，长文案（「新建分镜头稿本」）贴边被切。菜单改 `createPortal(..., document.body)`，并 `width: max-content` / `nowrap`。活动栏工作区右键同样 portal。CSS/布局，Ctrl+R 即可。

## 139. 系统标题按钮压住顶栏分割线

`.app-menu-bar` / `.float-titlebar` 高度等于 `titleBarOverlay`（`env(titlebar-area-height)`），`box-sizing: border-box` 又把 1px `border-bottom` 算进这高度里，Win32 最小化/最大化/关闭刚好盖住分割线。高度改为 overlay + 1px，线画在按钮下方。Ctrl+R 即可。

## 141. 活动栏选中块滑动

侧栏按钮切换原先是各钮自己亮/灭。现一块 `activity-indicator` 用 `transform: translateY` 跟到当前视图键（起始页 / 工作区 / SCM / 设置）；曲线 `--ease-in-out`、`--duration-toggle` 200ms，与分段控件同一套 token。首次定位不播；`prefers-reduced-motion` 关掉位移。代理人键仍是独立开关，不抢这块。Ctrl+R 即可。

## 140. 删除确认改用应用内弹窗

资源树 `deleteEntry` 和 SCM 删除未跟踪文件原先走 `window.confirm`，Win32 弹出白色系统框（标题 kentucky）。改走已有 `askConfirm` / `ConfirmDialog`（与台词/角色删除、未保存对话框同一套深色 `app-dialog`）。Ctrl+R 即可。

## 142. 代理人开关用淡主题色底

活动栏代理人开着时 Chromium 焦点环画成空心白框。改为 `--accent-soft` 底（与选中块同色、无描边）；已点亮时不再画 `:focus-visible` 框。Ctrl+R 即可。

## 143. Agent 请求前缀稳定（模型无关）

自动前缀缓存从请求开头做最长相同匹配。原先文学系统提示之后立刻插入每步都变的 Editor context（Git L5 / 活动文件）和 skill/mount `turnHint`，历史全部无法复用。现：系统提示 + 工具表保持在最前；Git L5 等易变块冻结在本轮用户消息末尾；一轮循环内不刷新；历史挂载写入 `apiContent` 快照不再读盘。不 bump `toolApi`，须**完整退出** Electron。切 Ask/Agent 仍会换工具表，前缀照样作废。

## 144. 资源树隐藏 `revisions/`

Agent 章节快照柜在工作区根是给工具用的，日常不必出现在资源管理器。现与 `.git` 一样对用户隐藏：磁盘仍在，`list_revisions` / `propose_create_revision` / `propose_restore_revision` / `read_file` 仍可用。根目录 `list_dir` 也不列出该项。`.gitignore` 幂等补 `revisions/`，SCM 不再堆快照。须**完整退出** Electron。

## 145. 快照环形 20 份

`propose_create_revision` 不再在上限报错。默认 20（`maxRevisionSnaps`）：成功写入新快照前先删最旧，结果含 `evicted[]`。拷贝失败不删旧份。指纹 `toolApi: 2026-08-14-a`，须**完整退出** Electron。

## 146. Windows「打开方式」出现 KENTUCKY（.md）

打包版启动时在 **HKCU** 登记 `.md` 的 Open With / 默认应用能力（不抢当前默认、不需管理员）。`npm run dev` 和 portable 解到 Temp 的路径不登记，避免绑上 electron.exe。双击或「打开方式」把文件路径传入：已打开的工作区包含该文件则只开标签；否则以父文件夹为工作区（仍拒盘符根/主目录）。单实例：第二次启动把路径交给已有窗口。须跑 `npm run dist` 后的 `KENTUCKY.exe` **至少一次**，再在资源管理器里对 `.md` 选「打开方式」。

## 147. Win 正式版收尾（查缺补漏）

- **restore** 与其它 Agent 写入对齐：自动写盘、无 Accept；工具 description / `instruction` / Q13 / 基线 §四.6 不再写 pending Accept。误改仍靠 Undo / SCM。
- **前缀**：本轮 user 的 `apiContent` 在第一次请求时写入完整后缀（Editor context + turnHint），同轮后续步与跨轮重放不再重拼、不再把历史 user 砍短。
- **指纹**：Win 文档「当前 toolApi」统一为 `2026-08-14-a`（changelog 旧节保留当时串）。
- `electron.vite.config.ts` 重复 `server` 键导致 typecheck 失败，已删一份。
- **`npm run dist`**：GitHub CDN 超时后用 npmmirror（`ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR`，见 how-to-run）打出 `release/KENTUCKY-0.3.0/KENTUCKY.exe`。跑过一次打包 exe：HKCU `KENTUCKY.md` 已写入「打开方式」（命令指向该 exe，不是 F5 的 electron.exe）；`resources/ffmpeg/ffmpeg.exe` 探活为 8.1.1，导出 0.5s 1920×1080 24fps yuv420 H.264；`assertSafeWorkspaceRoot` 拒 `C:\` / 用户主目录 / `C:\Users`，Agent `Path escapes workspace`；干净临时仓写入 md / kmind / 台词 / 分镜头一格 / 新文件并 SCM commit；asar 含帮助菜单仓库 URL。GitHub 未登录时该 URL 返回 404（私有仓），菜单仍打开同一地址。

须**完整退出** Electron；打开方式仍须打包 exe。

## 148. 代理人顶栏按钮统一

三个操作从混用的 `+` / `≡` / `×` 改成同一套 Lucide 图标（新建 / 对话历史 / 关闭），按钮尺寸与输入栏回形针一致（28px、圆角 8）。历史打开时才有底，不再看起来像单独一个实心菜单键。

## 149. 分镜切片文件名 + 格位缩略图

切片 PNG 不再带 sheet UUID，也不按稿本序号（`s2_p01`）。文件名为 **稿本文件名 + 格号**：导入 `blank_3x2.png` → `blank_3x2_01.png`、`blank_3x2_02.png`；空格会变成下划线；重名则 `_2` 递增。稿纸页「分镜格」直接显示切片图（16:9 contain），编号叠在左上角。旧工程已落盘的 UUID / `sN_pNN` 文件名不改写。

## 150. 时间线拖动分镜块改序

V1 块身可拖到新位置，播放顺序涟漪重排（无空隙）。左右缘仍是修剪时长。镜头关键帧留在该片段上。

## 151. 时间线：取消自动铺轨，拖分镜上轨

去掉稿本分类按钮与「一键铺轨」。导入只切片、不上 V1。时间线左侧工具栏：选择 / 刀片（分割从顶栏挪走）。监视器右侧排列切片缩略图，拖到 V1 才加入（可重复用同一格）。

## 152. 时间线内拖块改序真正能拖

§150 把改序绑在片段 `<button>` 的 pointer 上：一点就 `preventDefault`，重排时 DOM 一挪捕获就丢，拖出块范围手势直接断。后又把原块设成 `pointer-events: none`，Chromium 会立刻 `pointerup`，插入下标还是原位，看起来像闪回；播放头却被误seek到该块入点。V1 块与右侧素材箱一样走 **HTML5 拖放**（不是指针 capture）。拖到目标接缝，竖线标插入点，松手 `reorderVideoClipMut`。按住 **Alt** 拖边缘才修剪。未改序不挪播放头。

## 153. V1 改序：指针手势，提交 lastIndex

HTML5 改序松手仍闪回：吸附竖线 `pointer-events: none`，`drop` 经常不触发；`dragend` 只清状态不提交；`dropEffect: move` 且源节点还在，Chromium 会把拖影弹回原点。MDN：失败的 drop 就会播放飞回动画。现改回 **窗口捕获阶段的指针跟踪**（不 `preventDefault` pointerdown、不 `setPointerCapture` 到其它节点、源块不 `pointer-events: none`、拖动中不 splice DOM）。松手提交拖动中最后一次插入下标。素材箱→V1 仍 HTML5。须 **Ctrl+R**。

## 154. V1 改序 mut-noop：splice 后按旧 start 排序

检测 log：手势 `pointerup`、`lastIndex` 已变、`willMut: true`，但 `reorderVideoClipMut` 返回 `mut-noop`。原因是 splice 之后又 `packVideoClipsMut`（按旧 `start` 排序），片段被排回原位，幽灵块一收就像闪回。改序/插入后只按**当前数组顺序**重写 start（`repackVideoClipStartsMut`）。临时探针已关闭。须 **Ctrl+R**；主进程改动须**完整退出 Electron**。

## 155. 分镜粗剪保存

时间线改序/修剪会 `writeFile`，但 `.kyboard` 标签仍走 DocumentHub。Ctrl+S、关标签保存、退出保存用的是**打开时**的 JSON，把磁盘上的粗剪盖回空轨；切到别的文件再回来就像重置。现改为 `persistDoc` 同时写盘 + 更新标签缓冲；Save 前 `flushStoryboardForSave`；工具栏增加保存（Ctrl+S 仍可用）。拖动中不写盘，松手再持久化。切走仍打开的标签会把当前稿刷进缓冲；关掉并不保存时卸载不再写盘。

## 157. Agent 改动卡片重新记入会话

`commitProposal` 自动写盘后漏了 `session.proposals`（status=applied）。面板按该数组画卡片，当轮和重载后都是空的。现写盘后 upsert 进会话；渲染层 `ai:proposal` 同步补进当前会话（对齐 gitOps）。

## 158. project-memory 改成 AI 交接扫描

Win `project-memory/README.md` 改为现状表 + 按任务读序；`changelog.md` 明确只作历史。architecture / STORYBOARD / gotchas / 工具总表去掉过时 Accept、一键铺轨、`isMediaPreviewKind` 缺 pdf、旧 `toolApi` 当「当前」的写法。Android `PORTING-WIN-TO-ANDROID.md` 按 Win **0.3.0** 重写成能力矩阵交接文；BOARD/README 指纹对齐 `2026-08-14-a`。不 bump `toolApi`。

## 159. Android 全量移植拍板

用户明确：**Win 已有产品功能 Android 全部要移植。** 此前 BOARD ⏭（分镜 A3、PDF A4、Git U16/U17、U13–U18）改为 ❌。壳不照搬（单窗、无 AppMenuBar、SAF、无 `kentucky-file` / `printToPDF` / `git.exe`）。Git 默认 isomorphic-git。不 bump `toolApi`。

## 160. 标签栏滚轮 / 右键改序 / 分屏选文件

标签过多时滚轮横向滚动标签栏。按住右键拖动标签改顺序（非 HTML5 drag）。分屏后左右栏各有「此栏」下拉，从已打开文件里选；不再用右键指定分屏文件。

首版手势只在窗口上听 `pointermove`，且未 `preventDefault` 右键、未 `setPointerCapture`；Windows 上几乎拖不动。首版「此栏」是原生 `<select>`，深色主题下弹出层仍是系统白底。

## 161. 分屏文件选择换肤 + 标签改序手势

用户反馈两件：分屏文件选择栏不像工作台；「按住右键拖动改标签顺序」等于没实现。

**此栏：** Chromium/Electron 在 Windows 上无法给 `<select>` 的弹出列表换肤（option 走系统控件）。改为 `PaneFilePicker`：kicker「此栏」+ 输入风按钮（`--bg-input`、当前标题、▾）→ portal 到 `document.body` 的 `.ctx-menu.pane-file-menu`（与资源树右键同一套：`--bg-elev-4`、`--bg-selection` hover、当前项 `--accent-soft`）。`.editor-pane` `overflow:hidden`，不 portal 会被裁切。位置复用 `fitContextMenu.ts`。Escape / 点外侧关闭。脏/新建 ● 与标签一致。

**改序：** 右键在 Windows 是系统上下文菜单手势；不 `preventDefault` 则没有可靠的 `pointermove`。现：左键或右键按下；右键 `preventDefault` + 对该 **tab** `setPointerCapture`；窗口捕获 `pointermove` **和** `mousemove`；手势期间 document 捕获 `contextmenu`。拖过 5px 才画插入竖线并在松手 `reorderTabs`；未过阈值的单击仍激活。不要 HTML5 drag、不要拖动中 splice 标签 DOM、不要用 `lostpointercapture` 当结束（RMB 捕获常立刻丢，会拆掉 mousemove 兜底）。左键拖同样可改序（VS Code 习惯）。`SelectionContextMenu` skip `.tab-bar`。

**未改：** 滚轮横滑；「关闭分屏」仍在顶栏右侧；右键不再指定分屏文件；不 bump `toolApi`。须 **Ctrl+R**。

**文件：** `EditorArea.tsx` · `appStore.reorderTabs` · `SelectionContextMenu.tsx` · `global.css` · i18n `editor.reorderTabsHint`。Android 同步（保留 `compactLayout` / 无分镜预览路由）。现行契约写在 architecture「标签栏 / 分屏」与 gotchas 同名节。

## 162. 打包版：Agent 转圈、设置栏被默认值顶掉、MD 复制带括号

正式目录包测到三件：

1. **Agent 一直转圈。** 叠加：设置改不了（见 2）时打包默认 `https://api.openai.com/v1`，国内 `fetch` 常永不返回；`ai:send` 在会话缺失/工作区不一致时只回 `{ ok: false }`，不发 `ai:error`/`ai:done`，渲染层已把 `streaming: true`；无 workspace 的会话对已打开文件夹 `sameWorkspace(null, path)===false`，发送从未进 `runAgentTurn`。现：连接 45s 超时（响应头到达后清 timer）；拒绝发送时同时 `ai:error`+`ai:done`；无 workspace 的会话允许绑到当前窗口；渲染层 `!ok`/throw 清转圈。`i18n ai.sendFailed`。
2. **设置 AI 栏位删不掉默认值。** 受控 input 每个按键 `upsertProfile` 再 `refreshProfiles`，磁盘旧值写回。现本地 draft，失焦才保存；上下文 `4096…2_000_000`，勿 `Number('') || 128000`。
3. **排版 MD 复制变 `[text](url)`。** `tiptap-markdown` `transformCopiedText: true`。现 `false`；粘贴仍 `transformPastedText: true`。

不 bump `toolApi`。主进程/客户端改动须**完整退出**后再测；设置与复制 **Ctrl+R** 即可。Android 同步 `SettingsPage` / `openaiCompatClient` / `aiStore` / Markdown 编辑器。

**文件：** `openaiCompatClient.ts` · `registerAiIpc.ts` · `agentLoop.ts` · `aiStore.ts` · `SettingsPage.tsx` · `MarkdownArticleEditor.tsx` · i18n `ai.sendFailed`。

## 163. 发版 0.3.1

`package.json` **0.3.1**。含 §162 三件（Agent 转圈 / 设置栏被默认值顶掉 / MD 排版复制带括号）。目录包 `release/KENTUCKY-0.3.1/`。不 bump `toolApi`。连接超时误放在整段流上，Agent 超过 45s 会 `This operation was aborted`（§164）。

## 164. 连接超时不得掐 SSE（0.3.2）

0.3.1 把 45s `AbortController` 定时器放到 `finally` 才清。`fetch` 已拿到响应头后，Agent 工具轮/长回复仍会被 45s 到点 `ac.abort()`，Chromium 报 `This operation was aborted`，气泡空。现：`fetch` 返回后立刻 `clearTimeout`；超时只表示连不上。Android `openaiCompatClient` 同步。不 bump `toolApi`。须**完整退出**后再测。

## 165. 发版 0.3.2

`package.json` **0.3.2**。含 §164。目录包 `release/KENTUCKY-0.3.2/`。

## 166. 打包 AI UX 写成两端契约

Win 目录包测的设置回弹 / 转圈 / abort / MD 复制，抽成现行契约 [`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md)，避免对照移植或整文件覆盖时回退。gotchas / architecture 改为指向该文。不 bump `toolApi`。

## 167. 拆成两个独立工程（2026-08-18）

原容器仓里的 `win/` 升为本目录软件根；`android/` 迁到并列文件夹 `Kentucky for Android/`，自带 git 与文档。本仓库不再包含 Capacitor / Gradle。F5 的 `cwd` 为本根。安卓对话协议副本在那边的 `extras/`。

## 168. 内置 caveman + 思考强度（high / mid / low）

Agent 随包装 `resources/ai-skills/caveman/SKILL.md`（copy-if-missing）。开启则每轮注入系统提示（Ask 也注入），普通问题短答；catalog 标明已应用，勿 `read_skill("caveman")`。`/` 菜单不列出（已内置）。设置 Skills 可关。

配置档新增 **思考** High / Mid / Low（默认 Mid）。请求带 OpenAI 兼容 `reasoning_effort`（mid → `medium`）。网关 400 不认该字段则去掉再试一次。分段控件点选立刻存档（不是文本栏 draft）。不 bump `toolApi`。须**完整退出**后再测。

**文件：** `skills.ts` · `tools.ts` · `agentLoop.ts` · `openaiCompatClient.ts` · `aiProfiles.ts` · `aiSettings.ts` · `SettingsPage.tsx` · i18n。

## 169. Caveman 留一点人情味

短答不变：先答、不铺垫、不教程。语气改成同事桌边说话，允许一句轻点头；禁止冷到像电报，也禁止打气/段子/表情。厂家源与开发态 `data/ai-skills/caveman/SKILL.md` 已同步（copy-if-missing 不会覆盖已有文件）。

## 170. 作曲框改用 border-beam

Agent 输入卡外包 `BorderBeam size="md" colorVariant="colorful"`，跟应用深/浅色。去掉自绘 conic 彗星。`prefers-reduced-motion` 时 `active={false}`。无 framer-motion。Ctrl+R 即可。

## 171. 作曲框菜单不再被光圈透过

`border-beam` 的 `::before`/`::after`/bloom 叠在卡片子树之上，模式/配置档/斜杠菜单会透出彩光。菜单改挂在外壳上（光圈外面），不透明底。Ctrl+R 即可。

## 172. 思考圈换成 ThinkingOrb

Agent「思考中 / 正在调用工具」的 CSS spinner 换成 `thinking-orbs`：思考为 `breathing`，写盘为 `shaping`，`size={20}`。思考指示：`[Orb] 思考中…` 单独一行，图标在句首、与文字垂直居中。出字时不再把 Orb 塞进正文末尾。写盘为 `shaping`，其余 `breathing`。Ctrl+R 即可。

## 173. 资源管理器按 Cursor 排版

脏/新建圆点从「图标和文件名中间」改到**行尾**，同级文件名对齐。文件名仍黄/蓝。文件夹若有未保存子孙，名称着色 + 行尾点。侧栏不再显示「资源管理器」四字，只留操作按钮。按钮水平居中；拖拽分栏最窄 184px（六枚按钮排得下），与 Cursor 一样不会把图标挤没。Ctrl+R 即可。

## 174. 活动栏 Git 图标

原先那条残缺 path 在 20px 下只剩细锯齿线。换成三个实心节点 + 圆角连线，视觉重量跟底下齿轮接近。Ctrl+R 即可。

## 175. Git 提示截成前几行

提交/推送 toast 和结果卡不再铺满 `create mode 100644 …`。只留前 4 行（并限字数），超出改成 `…`。Ctrl+R 即可。




