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
| 编辑器 | **`.md`**：TipTap 所见即所得 + Monaco 源码切换；**普通 `.csv` / 无后缀且严格 sniff 为表的文件**：表格 + 源码（不动 `*.dialogue.csv` / `characters.csv`）；**其它文本**：软化 Monaco |
| 字数 | **不计空白的字符数**（中英数字标点均按码点计 1，见 `wordCount.ts`）；UI「N 字」 |
| 资源管理器 | 右键「在文件资源管理器中显示」：文件→定位并选中；**文件夹/工作区→打开该目录本身**（`openPath`，勿用 `showItemInFolder` 以免进上一级）；台词 meta/choices/layout 在树里**视觉挂在**对应 csv 下（默认折叠；磁盘同级）；**右键菜单贴视口**（`fitContextMenu.ts`，changelog §116） |
| 语言 | 中文 + 英文 UI |
| Markdown 预览 | **不设分屏预览**；WYSIWYG 即阅读/写作态；源码模式看原始 Markdown |
| 编辑器标签 | 一条顶栏 = 打开顺序。标签过多时**滚轮横滑**（隐藏系统滑块）。**拖动改序**（左键或右键拖过短阈值；非 HTML5 drag）。单击仍只激活。关闭钮点 × |
| 编辑器分屏 | 左右两栏看**已打开**的两个标签（可同一文件）。「关闭分屏」只在顶栏右侧，不按栏重复。分屏后每栏一条「此栏」**工作台菜单**（禁止原生 `<select>`，Windows 弹出层无法换肤）。**不要**用标签右键指定分屏文件（与改序冲突） |
| 多窗口 | Blender 式：**新建主窗口**=完整工作台+同工作区+空标签；**新建窗口**=精简单文件窗（无顶栏菜单，含 `.kmind`）；同路径正文经 DocumentHub **实时共享**；欢迎页无活动文件时「新建窗口」灰显；关最后主窗退出；无主窗持有该工作区时关掉其精简窗 |
| 未保存确认 | 关窗 / 关脏标签 / 关工作区用应用内对话框（保存 / 不保存 / 取消），风格跟工作台一致；`AnimatedDialogShell` 进出动画；不用系统 `confirm` / `beforeunload` |
| UI 动效 | Emil 取向：偶尔表面（toast/dialog/菜单）短 ease-out；chrome 轻 hover/press；**不**动画键盘高频操作；尊重 `prefers-reduced-motion`；不加 framer-motion |
| 分发 | Windows：**目录版** `release/KENTUCKY-<version>/`（内含 `KENTUCKY.exe`）；可选 `npm run dist:portable` 单文件。图标 `build/icon.svg` → 1024 PNG（黑底负形 K，圆角透明角） |
| 拼写检查 | 正文关闭浏览器拼写检查（无红波浪线） |
| 帮助链接 | 「了解 KENTUCKY」→ https://github.com/CCFOX12/Kentucky-Article-Editor |
| 台词对话 | **独立功能**；磁盘真相 = `*.dialogue.csv`（11 列）+ `*.dialogue.choices.json`（播放图；空 text 由 `characters.operable` 决定确认或自动）+ 工作区根 `characters.csv`；**节点图画布**（底边 option / End 沉底；smoothstep；选项芯片；检视器可设唯一开场；可调宽检视器；小地图）；`speaker` 存角色 **id**；`text_color` 空=引擎默认正文色（**≠** 角色色）；布局 `*.dialogue.layout.json` 仅 Kentucky；保存须防未就绪写空 CSV |
| 台词角色 | 顶栏创建；检视器选 speaker；列：`id,name,color,note,model_node,operable`（创建时 `model_node` 必填；`operable=1` 为可操作玩家，空文案需确认；否则 NPC 自动过句；进对话立刻听 NPC → 开场 speaker 用非 operable）；打开 `characters.csv` 用 CharactersEditor |
| 台词导出 | 完整管线 CSV + 本地化 `keys,<lang>`；挂画布工具栏 |
| Godot 热编辑 | **同路径磁盘**；协议 **v1.3**。执行器读 csv/meta/characters（含 **operable**）/**choices**（忽略 layout）；空 text 按 speaker 可操作确认 / NPC 自动。Kentucky 不碰 `.import`（Keep File 由作者自检）。换篇是 Godot `dialogue_id` / override。参考 [ai_river_godot](https://github.com/CCFOX12/ai_river_godot) Louisville Station。完整说明书：`extras/godot-kentucky-dialogue/README.md`。不做 IPC / 表达式引擎 / 图格式替代 CSV |
| 活动栏 | 视窗键=起始页（`home`，不关工作区、隐藏侧栏）；**工程徽章列表**（可多开）+ 末尾「+」开文件夹；**AI 对话键**=右侧 Agent 栏（`Ctrl+L`）；齿轮=设置 |
| 多工程 | 同窗口多文件夹；切换保留各工程标签/树；聊天与面板记忆按路径隔离 |
| 工作区布局 | 本目录是 Windows Electron 工程；安卓平板版在**独立新工程**。互不共享源码树与 git。交接包：[`../android-port-brief/`](../android-port-brief/README.md) |
| 开发优先级 | 本仓库只维护桌面端。安卓在自己的工程里对照功能，禁止从这里整目录覆盖那边的 `src/` |
| 安卓 | 独立产品；大屏平板 + 优先外接键盘；不做手机布局；不移植 Electron 壳。**从零开始**（忽略旧 `../Kentucky for Android/`）。进度写在新安卓工程自己的 `project-memory/` |
| **版本** | **v0.3.2**（当前包）：连接超时不得掐断 SSE。**v0.3.1** §162 设置/复制。功能面仍是 **v0.3.0** 分镜头 + v0.2.0 起文学向 AI 代理人 |
| AI 设置 / 流式 / MD 复制 | 档案栏失焦才保存；连接超时只等响应头；排版复制为人话。两端禁止回退：[`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md) |

## 分镜头稿本 / 简化 PR（v0.3.0）

| 项 | 决定 |
|----|------|
| 工程 | `*.kyboard` + 同级 `*.kyboard.assets/`；**单序列**；可多 `sheets`（多稿本，非多序列） |
| 画幅 | 每格 **1920×1080**；外绘拼图再切片；Kentucky **不内绘** |
| 纸面 | gutter + 标题条；空白稿浅灰底 + 安全框 + 格外编号；生成时可自定义**工作区内路径**与**文件名** |
| 排版 | 总数 + 横/竖优先 → 推 `列×行`，可手改；出厂示例 6→`3×2` |
| 时间线 | **无**一键铺轨；切片后从右侧缩略图 **拖到 V1**；clip Ken Burns + **手动** keys（不画默认头尾菱形）；**I / 拖监视器在播放头打帧**；**Alt+I** 删帧；NLE 壳；**自定义 scrub**；固定 px/秒；A1–A4 可边缘修剪；隐藏横滑条+滚轮横移 |
| 音频 | **最多 4 轨** MP3（每轨一条）；`audioClips` + 兼容 `audioClip`；`mediaDurationSec` 可选；仅校正经典 `outSec=60` |
| 导出 | PNG；MP4 **24fps** H.264 1080p yuv420；**可自定义导出文件夹与文件名**；ffmpeg 由 `ensure-ffmpeg` 捆绑（**禁止** `ffmpeg-static`）；缺则 `FFMPEG_NOT_FOUND` i18n Toast |
| 导入尺寸 | 默认拒绝；强制缩放需确认；可多次追加画完的稿本 |
| 默认停留 | `defaults.panelDurationSec`，出厂 **2s** |
| UI | 工作台 Seg 稿纸/时间线/导出；`storyboard-nle.css` + `storyboard-pages.css`；主题与 Emil 同现有 chrome；**无** PR 孤岛皮肤 |
| UX 技能 | 实现须遵 `emil-design-eng` + 本文动效条；验收见 [`STORYBOARD.md`](./STORYBOARD.md) §6/§8 |
| AI | **不参与**；无 Agent 工具 |
| 平台 | **Win 已发版**；Android **要从零移植**（IO/ffmpeg 重写，勿 import 本仓库；见 `android-port-brief` P5） |
| Schema | v1 **只增不改** |
| 说明书 | [`STORYBOARD.md`](./STORYBOARD.md)（完整单一真源；polish **§97–§119**、改序/persist **§150–§155**） |

## AI 代理人（v0.2.0）

| 项 | 决定 |
|----|------|
| 协议 | OpenAI 兼容；**多配置档**（label/baseUrl/model/contextWindow/**thinkingLevel** high·mid·low + 每档加密 Key），输入栏切换。请求带 `reasoning_effort`（mid → medium）；网关 400 不认则去掉再试一次 |
| UI | 编辑区右侧面板；**Cursor 风格 composer**（模式 / 配置档 / **行内挂载芯片**；资源树拖入挂载；**Skill 暖色胶囊** + 发送注入 SKILL 正文 / 上传 / 发送）；主题色变量 |
| 模式 | **Ask** 无工具且主进程拒绝执行任何 tool_call（`tool_choice: none`，历史 tool 记录压成文本）；**Plan** 只读调研 + `create_plan` + `ask_user` / `cite_workspace`；**Outline** 结构/导图 + 同上问句/引用；**Agent** 全工具且**始终自动写盘**（无 Accept）。Grill 挂在 Ask 里不能出选项——须切 Plan/Agent。计划真相 = md 文件；**对话栏上方不挂常驻计划列表**。计划 md 顶栏 **开始执行 / Build**：切 Agent、绑定 `planFileRel`、发执行提示。Agent 若会话有 `planFileRel` 则 InjectPath；`update_plan_step` Soft 勾选 md（保留正文） |
| 问用户 | **`ask_user`**：阻塞多选卡（每调用 ≤3 题、单选 +「其他」、一张卡统一确认；每轮最多 8 次）。Pending 时 Send 禁用（Stop 取消）。已答写入会话；未答完也会落盘，完整退出后只读「已中断」。事实禁止问用户。无 `window.confirm`。 |
| 工作区超链 | 聊天 `[text](rel)` 与反引号 `` `rel.md:12` `` 可点；`cite_workspace` 引用卡不抢编辑器焦点。**`open_in_editor(path, snippet 或 line)`** = 导图「链接到段落」同一套跳转（开标签、滚到句、高亮）。点到某句时必须调这个，不要只贴 `[text](path)`。正文 `.md` 单击下划线且未拖选则跳。相对路径先试**当前文件同目录**再试工作区根；真 http(s) 才外开。TipTap 链 **禁止** `target=_blank`。 |
| 工作区文件结构 | Agent 可用 **`workspace_mkdir` / `workspace_copy` / `workspace_move` / `workspace_delete`**（主进程 Node FS，**非** Shell）。用于归档/迁移；move/delete 同步台词 sidecar 与 `.kmind` assets；UI 刷新树并关闭受影响标签。路径必须在打开的工作区内（§121 IPC 与 Agent 同一套沙箱）。 |
| 写文件 | **始终自动写盘**（无 Accept/Reject）。黄● = 相对上次 Ctrl+S/打开/Git 重载的 baseline。AiPanel 只读变更卡 + diff。误改靠 **Source Control 丢弃** 或编辑器 Undo。 |
| 脏/新建色 | 改过未保存 = **黄**；新建 = **蓝**。标签栏仍是名前 ●；资源管理器是文件名着色、圆点在**行尾**（Cursor）。保存后清除 |
| Git | 工作区打开时若无仓则**自动**在**该根** `git init` + 默认 `.gitignore`（`kentucky.autoInit`）；**不向上**复用父仓。**`.git`/点文件在资源管理器与 `list_dir` 不可见**。活动栏 SCM：status/diff/discard/stage/commit。Agent 工具见下行。无任意 Shell。完整说明：[`AGENT-GIT.md`](./AGENT-GIT.md)。 |
| Git Agent 工具 | **全部立即执行**（无 Confirm）：`git_status`/`git_diff`/`git_log`/`git_pull`/`git_push`/`git_add`/`git_commit`/`git_remote_add`/`git_remote_remove`。写操作 → **高亮卡 + Toast**。本地/`file://` URL（可含空格）；缺失本地路径 → 自动 `git init --bare`。空提交 → 清晰 Nothing to commit/staged。remote 重加后 push 用 setUpstream。每轮 **Git (L5)** + **`GIT_AGENT_PLAYBOOK`**。**禁止** force。指纹 `toolApi: 2026-08-25-a`。文件工具沙箱仅本工作区；**打开工作区拒绝主目录/盘符根/系统目录**（§121）。工作区可放 `agent-GIT环境说明.md` 固化**本根**远程/分支（勿跨仓复用）。 |
| 焦点 | AI 改多文件时**不切换**当前标签（不闪页）；后台挂标签并刷新树。`cite_workspace` 不切页；`open_in_editor` 与用户点击超链可以切页。 |
| 数据 | 软件本体 `data/`（打包后与 exe 同目录；开发态 `win/dev-data/data/`）；**不**进项目、**不**用 `%APPDATA%` |
| 密钥 | 每配置档 `safeStorage` 加密 blob：`data/ai-keys/<id>.bin`（旧单 Key 会迁入默认档） |
| 会话 | 多会话 JSON：`data/ai-chats/`；**按工作区路径严格隔离**（列表/打开均过滤，互不互通） |
| 面板开关 | **绑定工作区**：启动默认关闭；`data/ai-workspace-prefs.json` 记住各工作区是否打开；无工作区时不可开 AI |
| 上下文 | **L5**：当前文件/选区/`@` + 角色表摘要 + **Git (L5)**；有 `design/` 树时 **Design (L5)** 列出实际存在的 gdd/concept/characters/glossary/`*.dialogue.csv`（只报存在、不灌正文）并提示先读；同时系统提示注入 **Design playbook**；上下文占用进度条；接近满时禁止静默丢弃历史 |
| 工具 | 只读 list/read；continuity；角色；scene↔kmind（含子树）；台词图；文学记忆 YAML（非 Git）；**Git** 全套（见 [`AGENT-GIT.md`](./AGENT-GIT.md)）；**`ask_user` / `cite_workspace` / `open_in_editor`**；Skills；可选联网；**无**通用 Shell |
| 文学记忆文件 | 工作区根按需创建：`story_state.yaml`、`foreshadow.yaml`、`voice_anchor.yaml`、`voice_bank.yaml`、`glossary.yaml`；`materials/`。`revisions/` 同样按需创建，但资源树 / 根 `list_dir` 隐藏（Agent 专用快照柜）。启用态 = story_state 存在且至少一章。语义冲突只警告不挡写入。M1 schema 冻结后只增不改。 |
| 快照上限 | `maxRevisionSnaps`（默认 20，AI 设置可配）；满则删最旧再写入，不拒建 |
| 导图可读性 | AI 须建树/分层 DAG（非角色↔场景全连接网）；缺省 Sugiyama/LR；乱图可 `layout_kmind` |
| 台词图能力 | AI 按协议 **v1.3** 读写：`read_dialogue` 看 options / 空 text 链；角色 `operable`；`propose_dialogue_graph` 整图（csv+choices+layout，线性也写空 text options）；`propose_set_dialogue_choices` / `layout_dialogue` / 行级增改排；speaker=角色 id；`propose_upsert_character` 可写 operable |
| Skills | 全局 `data/ai-skills/<id>/SKILL.md`；随包装 **caveman（内置，开启则每轮注入系统提示，勿 `read_skill`）** + **`grill`（不注入；挂上或用户说烤才强制 `ask_user`；独立于游戏八件套开关）** + `literary-voice` + **8 个中文游戏策划 skill**（双主线默认开，纯小说可关）；`copy-if-missing` 不覆盖用户已有文件（含 `examples.md`）；`seenBundledSkillIds` 只欢迎从未见过的 bundled id（关掉后不复活）；catalog；`list_skills` / `read_skill`；挂载 skill 时注入 examples/reference。**不**执行 scripts。工作区硬约定 `design/`。详见 [`REQ-indie-game-skills.md`](./REQ-indie-game-skills.md) |
| 联网搜索 | 设置 `webSearchEnabled`（默认关）；`web_search` + `web_research`；DuckDuckGo 失败自动回退 Bing；可直选 Bing |

| 加载态 | 思考中 / 调工具时必须有可见指示，禁止长时间空白像卡死 |
| 文案 | Agent 写入标明已落盘；勿引导 Accept；误改指向 Source Control |
| 费用 | **不做**账单累计 |
| 失败 | 明确报错 + 手动「重试」 |
| 范围 | 本仓库仅桌面端。安卓从零另开工程（[`android-port-brief`](../android-port-brief/README.md)） |

## 资源管理器（相关）

| 项 | 决定 |
|----|------|
| 显示名 | 默认隐藏已知后缀；类型靠彩色字母图标（C/M/D/MD/CSV/T/SB/PNG/MP4/PDF…） |
| 新建/重命名 | 只编辑主名，后缀芯片固定或自动保留，降低误删后缀风险 |
| PNG 预览 | 工作区 `.png` 可打开为只读图片预览（滚轮定点缩放 / 拖拽平移 / 适应 / Reveal）；不经文本 DocumentHub |
| MP4 预览 | 工作区 `.mp4` 可打开为只读视频预览（原生 `<video controls>` / 时长 / Reveal）；`kentucky-file` **Range/206** 流式；与 PNG 共用 `isMediaPreviewKind`（跳过 `docOpen`）；不经 DocumentHub。**不做** jpg/webp/webm/mov、自定义播放器皮肤 |
| PDF 预览 | 工作区 `.pdf` 可打开为只读预览（**pdf.js 自绘**：工作台配色、叠加主题滚动条、可拖宽缩略图栏、适应/缩放、Reveal）；与 PNG/MP4 共用 `isMediaPreviewKind`；文件经 `kentucky-file` fetch 成 ArrayBuffer。**不做** 批注/全文搜索/打印下载条。**仍不做** jpg/webp |
| PDF 导出 | **UI**：当前标签（含未保存）`.md` → A4 竖版浅色印刷稿（TipTap HTML）；`.kmind` → 整板 fit 进一页横版位图。入口：MD/导图工具栏、文件菜单、资源树右键。另存为默认同目录 `主名.pdf`。**Agent**：`export_workspace_pdf` 把工作区 `.md` 直接写成 PDF（无对话框；默认同目录 `主名.pdf`；覆盖；未保存缓冲优先）。Win 主进程隐藏窗 `printToPDF`，无 puppeteer。HTML ≤ 2MB、PDF ≤ 50MB。不做台词图/分镜头/纯 `.txt`；导图 Agent 不导出。**Android 要从零移植**（导出管线重写，不抄 `printToPDF`；见 `android-port-brief` P6） |
| 本机安全 | 渲染层无 Node fs。IPC / `kentucky-file` / Git / Agent **锁在该窗工作区**（`ipcSandbox` + `workspacePath`）。**拒绝**把盘符根、`C:\Windows` 等系统目录、`C:\Users`、用户主目录当工作区打开（`Documents` 下项目可以）。导航锁禁止整页跳外站（preload 不回收）。Git **不向上**找父仓。MP4 导出 ≤ 15 分钟。审计与现契约：[`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md) §121。 |

## MVP 页面范围

欢迎页 + 资源管理器/多标签编辑 + 可拖拽分栏 + 思维导图编辑 + 台词对话编辑 + **分镜头稿本/简化 PR** + **右侧 AI 代理人栏**。

## 主题与设置

| 项 | 决定 |
|----|------|
| 主题 | **深色 / 浅色** + **可调主体色**。深色大体 **RAL 9005** `#0A0A0A`：活动栏最黑、资源树/代理人略抬、编辑器再抬（内容井）；栏间 1px `--border-pane` 发丝分隔（Cursor 分区，不是一坨平涂）；输入/菜单只比房间略亮。Windows 标题栏跟主题走（hidden + overlay） |
| 设置入口 | 独立设置页：活动栏齿轮、`Ctrl+,` |
| 默认强调色 | 柔和青蓝（如 `#88c0d0`），非经典 VS `#007acc` |

## 欢迎页

- 选过文件夹后：Photoshop 式 **工作区卡片**，最多 **6** 张
- 卡片内容：主体色顶条 + 文件夹名 + 路径 + 最近打开时间（不做真实截图预览）

## 明确不做（当前阶段）

- 正文 ↔ 思维导图自动同步
- Markdown 左右分屏实时预览（已用 WYSIWYG 替代）
- 命令面板 / 扩展系统 / 云同步（**Git SCM + Agent Git 已做**：见 [`AGENT-GIT.md`](./AGENT-GIT.md)；无分支图 / checkout UI）
- 刚性左右树状思维导图布局（已改为自由白板）
- `.md` 工具栏插图 / 表格、专注藏侧栏（本版）
- `.txt` 的 Word 式工具栏（仅 `.md`）
- 导图外链 URL、Blender 式色彩控件、图库管理器、跨工作区绝对路径
- 导图参考图：旋转、透明度、锁定、裁剪、分组、独立窗口、从文件夹拖入画布；带文字插图节点的边框缩放
- 导图批注：多条评论、作者时间戳、Markdown/富文本、全局展开/折叠、批注搜索
- 多窗口：精简窗内换文件、跨窗同步光标/选区、主窗标签列表镜像
- 台词：分支/条件可视化、表达式编辑器、Godot **双向实时协议**、多语言对照编辑、音频播放/资源库、Markdown 内嵌台词、`characters.csv` 路径可配置、全工作区台词一键导出、Kentucky 内预览对焦/校验节点、在本仓附带/打包 Godot 插件  
  （执行器参考：[ai_river_godot](https://github.com/CCFOX12/ai_river_godot)；同目录磁盘联动 ≠ Kentucky 内嵌引擎；协议 v1.3 见 extras）
- AI：命令面板式入口、扩展市场、**任意 Shell**、Agent 侧 git **force** push/任意 argv、费用账单、云同步 Key、正文↔导图自动双向同步、Composer 整页多文件编辑器、Cursor Tab 补全、工作区 skills、执行 skill 脚本、通用浏览器自动化
  （联网搜索：设置可选开启；Brave/Tavily 真实请求尚未实现；Agent Git 全记录见 [`AGENT-GIT.md`](./AGENT-GIT.md)，**无** force）
- 分镜头：多序列、内绘、关键帧缓动、转场/调色/字幕、Agent 工具、PR 孤岛皮肤、**jpg/webp/webm/mov 工作区预览**、自定义 MP4 播放器皮肤、`ffmpeg-static`、一键铺轨 / 稿本分类自动上轨
- PDF：批注与全文搜索、导图矢量或分页 PDF、台词图/分镜头/纯 `.txt` 导出 PDF、Agent 导出 `.kmind`、puppeteer、Android 移植
