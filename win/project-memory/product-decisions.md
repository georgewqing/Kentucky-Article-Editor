# 产品决策（已定稿）

来自需求 grill，后续改动勿无默认推翻；若要改须用户明确同意。

## 形态与闭环

| 项 | 决定 |
|----|------|
| 运行形态 | Electron 桌面（MVP） |
| 功能关系 | 文件管理 / 写作 / 思维导图 **弱联动**（打开 `.kmind` 即编辑，不与正文自动同步） |
| UI 仿度 | 工作台级；视觉再往 **Cursor** 靠（少边框、统一色阶） |
| 项目模型 | **打开本地文件夹**（无自建 `.kentucky` 工程文件） |
| 文本类型 | 首版侧重 `.md` / `.txt`；其它文本可打开 |
| 思维导图 | **自由白板**（React Flow）；节点形状可选；边缘拖出连线；落空弹出创建节点并自动连边；独立 `.kmind` v2；与正文弱联动 |
| 导图链接 | 节点可同时有文字 + 可选链接 + 可选图；**链接到文件**整文件；**链接到段落**选 `.md`/`.txt` 后分屏点行确认；跳转定位行并浅色高亮，光标一动清除；点链接标/下划线文字才跳；单击选中、双击改字 |
| 导图插图 | 与 `.kmind` 同级 `名.assets/` 目录，复制进目录（非外链路径）；精简缩略图+文件名+移除 |
| 导图参考图 | 空白右键**多选导入**；`imageOnly` 纯图节点（无文字区）；选中角点锁比例缩放；四边连线手柄照旧；右键仅移除图/删节点（均删 assets 副本）；节点「插入图片」不变；不做旋转/透明度/锁定/裁剪/分组/独立窗/拖入画布 |
| 导图批注 | 每节点一段纯文本「黑下巴」；右键添加后立刻展开可打字；展开态写入 `.kmind`；下巴绝对定位在节点下沿，不计入 height/连线；**节点原描边保留**，下巴另延长同风格描边；中间分割线保留圆角；批注区黑底、随字增高、无滚动条；可选批注超链（文字后小图标）；不做多条/时间戳/MD/全局展开/搜索 |
| 编辑器 | **`.md`**：TipTap 所见即所得 + Monaco 源码切换；**其它文本**：软化 Monaco |
| 字数 | **不计空白的字符数**（中英数字标点均按码点计 1，见 `wordCount.ts`）；UI「N 字」 |
| 资源管理器 | 右键「在文件资源管理器中显示」：文件→定位并选中；**文件夹/工作区→打开该目录本身**（`openPath`，勿用 `showItemInFolder` 以免进上一级）；台词 meta/choices/layout 在树里**视觉挂在**对应 csv 下（默认折叠；磁盘同级） |
| 语言 | 中文 + 英文 UI |
| Markdown 预览 | **不设分屏预览**；WYSIWYG 即阅读/写作态；源码模式看原始 Markdown |
| 多窗口 | Blender 式：**新建主窗口**=完整工作台+同工作区+空标签；**新建窗口**=精简单文件窗（无顶栏菜单，含 `.kmind`）；同路径正文经 DocumentHub **实时共享**；欢迎页无活动文件时「新建窗口」灰显；关最后主窗退出；无主窗持有该工作区时关掉其精简窗 |
| 未保存确认 | 关窗 / 关脏标签 / 关工作区用应用内对话框（保存 / 不保存 / 取消），风格跟工作台一致；`AnimatedDialogShell` 进出动画；不用系统 `confirm` / `beforeunload` |
| UI 动效 | Emil 取向：偶尔表面（toast/dialog/菜单）短 ease-out；chrome 轻 hover/press；**不**动画键盘高频操作；尊重 `prefers-reduced-motion`；不加 framer-motion |
| 分发 | Windows：**目录版** `release/KENTUCKY-<version>/`（内含 `KENTUCKY.exe`）；可选 `npm run dist:portable` 单文件。图标 `build/icon.png`（灰白 K，圆角） |
| 拼写检查 | 正文关闭浏览器拼写检查（无红波浪线） |
| 帮助链接 | 「了解 KENTUCKY」→ https://github.com/CCFOX12/Kentucky-Article-Editor |
| 台词对话 | **独立功能**；磁盘真相 = `*.dialogue.csv`（11 列）+ `*.dialogue.choices.json`（播放图；空 text 由 `characters.operable` 决定确认或自动）+ 工作区根 `characters.csv`；**节点图画布**（底边 option / End 沉底；smoothstep；选项芯片；检视器可设唯一开场；可调宽检视器；小地图）；`speaker` 存角色 **id**；`text_color` 空=引擎默认正文色（**≠** 角色色）；布局 `*.dialogue.layout.json` 仅 Kentucky；保存须防未就绪写空 CSV |
| 台词角色 | 顶栏创建；检视器选 speaker；列：`id,name,color,note,model_node,operable`（创建时 `model_node` 必填；`operable=1` 为可操作玩家，空文案需确认；否则 NPC 自动过句；进对话立刻听 NPC → 开场 speaker 用非 operable）；打开 `characters.csv` 用 CharactersEditor |
| 台词导出 | 完整管线 CSV + 本地化 `keys,<lang>`；挂画布工具栏 |
| Godot 热编辑 | **同路径磁盘**；协议 **v1.3**。执行器读 csv/meta/characters（含 **operable**）/**choices**（忽略 layout）；空 text 按 speaker 可操作确认 / NPC 自动。Kentucky 不碰 `.import`（Keep File 由作者自检）。换篇是 Godot `dialogue_id` / override。参考 [ai_river_godot](https://github.com/CCFOX12/ai_river_godot) Louisville Station。完整说明书：`extras/godot-kentucky-dialogue/README.md`。不做 IPC / 表达式引擎 / 图格式替代 CSV |
| 活动栏 | 视窗键=起始页（`home`，不关工作区、隐藏侧栏）；**工程徽章列表**（可多开）+ 末尾「+」开文件夹；**AI 对话键**=右侧 Agent 栏（`Ctrl+L`）；齿轮=设置 |
| 多工程 | 同窗口多文件夹；切换保留各工程标签/树；聊天与面板记忆按路径隔离 |
| 工作区布局 | Cursor 工作区容器含两个软件根：`win/`（本 Electron 应用）与 `android/`（独立 Capacitor）；互不共享源码树 |
| 开发优先级 | **先完成 Win 正式版**；安卓仅保留雏形。Win 功能稳定后再按需移植到 `android/`，中途不并行大改安卓 |
| 安卓 | 独立软件根 `../android/`；大屏平板 + 优先外接键盘；不做手机布局；不移植 Electron |
| **版本** | **v0.2.0**：内置文学向 AI 代理人（OpenAI 兼容 API） |

## AI 代理人（v0.2.0）

| 项 | 决定 |
|----|------|
| 协议 | OpenAI 兼容；**多配置档**（label/baseUrl/model/contextWindow + 每档加密 Key），输入栏切换 |
| UI | 编辑区右侧面板；**Cursor 风格 composer**（模式 / 配置档 / 参考文件芯片 / 上传 / 发送）；主题色变量 |
| 模式 | **Ask** 无工具；**Plan** 只读调研 + `create_plan` 写入工作区 `plans/<slug>.plan.md`（同 slug 覆盖、自动打开）；**Outline** 结构/导图；**Agent** 全工具+G3 可审。计划真相 = md 文件；**对话栏上方不挂常驻计划列表**。计划 md 顶栏 **开始执行 / Build**：切 Agent、绑定 `planFileRel`、发执行提示。Agent 若会话有 `planFileRel` 则 InjectPath；`update_plan_step` Soft 勾选 md（保留正文） |
| 工作区文件结构 | Agent 可用 **`workspace_mkdir` / `workspace_copy` / `workspace_move` / `workspace_delete`**（主进程 Node FS，**非** Shell）。用于归档/迁移；move/delete 同步台词 sidecar 与 `.kmind` assets；UI 刷新树并关闭受影响标签 |
| 写文件 | **G3 按类型可审**：已有内容的正文 md/txt、导图内容编辑、多文件同轮内容改 → Accept/Reject；**新建 / 空文件**、**角色 upsert（始终 auto，含批量）**、台词 ≤5 行、纯 layout → 自动。结果含 `written`/`pending`/`reviewHint`。Accept 后按设置写盘或标黄（**R1**：Accept 前不改打开中的 tab） |
| 脏/新建色 | 改过未保存 = **黄 ●**；新建 = **蓝 ●**（标签栏 + 资源管理器同步）；保存后清除 |
| 焦点 | AI 改多文件时**不切换**当前标签（不闪页）；后台挂标签并刷新树 |
| 数据 | 软件本体 `data/`（打包后与 exe 同目录；开发态 `win/dev-data/data/`）；**不**进项目、**不**用 `%APPDATA%` |
| 密钥 | 每配置档 `safeStorage` 加密 blob：`data/ai-keys/<id>.bin`（旧单 Key 会迁入默认档） |
| 会话 | 多会话 JSON：`data/ai-chats/`；**按工作区路径严格隔离**（列表/打开均过滤，互不互通） |
| 面板开关 | **绑定工作区**：启动默认关闭；`data/ai-workspace-prefs.json` 记住各工作区是否打开；无工作区时不可开 AI |
| 上下文 | **L5**：当前文件/选区/`@` + 自动角色表摘要；上下文占用进度条；接近满时禁止静默丢弃历史 |
| 工具 | 只读 list/read；**L1** continuity_check；**L2** 角色驱动；**L3** scene↔kmind；**L4** 台词图；`.kmind` + dagre；**Skills**（`data/ai-skills/`）；可选 **联网搜索**（默认关，DuckDuckGo；Brave/Tavily 预留）；无 Shell/Git |
| 导图可读性 | AI 须建树/分层 DAG（非角色↔场景全连接网）；缺省 Sugiyama/LR；乱图可 `layout_kmind` |
| 台词图能力 | AI 按协议 **v1.3** 读写：`read_dialogue` 看 options / 空 text 链；角色 `operable`；`propose_dialogue_graph` 整图（csv+choices+layout，线性也写空 text options）；`propose_set_dialogue_choices` / `layout_dialogue` / 行级增改排；speaker=角色 id；`propose_upsert_character` 可写 operable |
| Skills | 全局 `data/ai-skills/<id>/SKILL.md`；设置开关/导入；catalog 注入提示；`list_skills` / `read_skill`；**不**执行 scripts |
| 联网搜索 | 设置 `webSearchEnabled`（默认关）；`web_search` + `web_research`；DuckDuckGo 失败自动回退 Bing；可直选 Bing |

| 加载态 | 思考中 / 调工具时必须有可见指示，禁止长时间空白像卡死 |
| 文案 | pending 提案引导用户在卡片上接受/拒绝；自动类标明已写入 |
| 费用 | **不做**账单累计 |
| 失败 | 明确报错 + 手动「重试」 |
| 范围 | 仅 `win/`；安卓冻结至 Win 正式版后再移植 |

## 资源管理器（相关）

| 项 | 决定 |
|----|------|
| 显示名 | 默认隐藏已知后缀；类型靠彩色字母图标（C/M/D/MD/T…） |
| 新建/重命名 | 只编辑主名，后缀芯片固定或自动保留，降低误删后缀风险 |

## MVP 页面范围

欢迎页 + 资源管理器/多标签编辑 + 可拖拽分栏 + 思维导图编辑 + 台词对话编辑 + **右侧 AI 代理人栏**。

## 主题与设置

| 项 | 决定 |
|----|------|
| 主题 | **深色 / 浅色** + **可调主体色**（预设色点 + 取色器） |
| 设置入口 | 独立设置页：活动栏齿轮、`Ctrl+,` |
| 默认强调色 | 柔和青蓝（如 `#88c0d0`），非经典 VS `#007acc` |

## 欢迎页

- 选过文件夹后：Photoshop 式 **工作区卡片**，最多 **6** 张
- 卡片内容：主体色顶条 + 文件夹名 + 路径 + 最近打开时间（不做真实截图预览）

## 明确不做（当前阶段）

- 正文 ↔ 思维导图自动同步
- Markdown 左右分屏实时预览（已用 WYSIWYG 替代）
- 命令面板 / 扩展系统 / Git / 云同步
- 刚性左右树状思维导图布局（已改为自由白板）
- `.md` 工具栏插图 / 表格、专注藏侧栏（本版）
- `.txt` 的 Word 式工具栏（仅 `.md`）
- 导图外链 URL、Blender 式色彩控件、图库管理器、跨工作区绝对路径
- 导图参考图：旋转、透明度、锁定、裁剪、分组、独立窗口、从文件夹拖入画布；带文字插图节点的边框缩放
- 导图批注：多条评论、作者时间戳、Markdown/富文本、全局展开/折叠、批注搜索
- 多窗口：精简窗内换文件、跨窗同步光标/选区、主窗标签列表镜像
- 台词：分支/条件可视化、表达式编辑器、Godot **双向实时协议**、多语言对照编辑、音频播放/资源库、Markdown 内嵌台词、`characters.csv` 路径可配置、全工作区台词一键导出、Kentucky 内预览对焦/校验节点、在本仓附带/打包 Godot 插件  
  （执行器参考：[ai_river_godot](https://github.com/CCFOX12/ai_river_godot)；同目录磁盘联动 ≠ Kentucky 内嵌引擎；协议 v1.3 见 extras）
- AI：命令面板式入口、扩展市场、Shell/Git 工具、费用账单、云同步 Key、正文↔导图自动双向同步、Composer 整页多文件编辑器、Cursor Tab 补全、工作区 skills、执行 skill 脚本、通用网页 fetch/浏览器自动化
  （联网搜索：设置可选开启；Brave/Tavily 真实请求尚未实现）
