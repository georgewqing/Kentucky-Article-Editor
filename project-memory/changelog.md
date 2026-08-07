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

## 其它小修

- 选项卡悬停用 `cursor: pointer`
- 连线手柄圆心贴节点边缘（半进半出）；缩放时手柄不宜过大

