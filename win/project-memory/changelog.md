# 改动时间线

按对话演进记录，便于回溯「为什么现在是这样」。

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

## 其它小修

- 选项卡悬停用 `cursor: pointer`
- 连线手柄圆心贴节点边缘（半进半出）；缩放时手柄不宜过大

