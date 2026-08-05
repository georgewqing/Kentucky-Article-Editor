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
