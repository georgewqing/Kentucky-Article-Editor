# 如何运行

## 安装

```bash
cd "d:\Working Directory\Kentucky"
npm install
```

## 开发

```bash
npm run dev
```

PowerShell 脚本策略报错时：

```bat
cmd /c npm run dev
```

### Cursor / VS Code 一键调试（推荐）

1. 用 Cursor 打开本软件根 `Kentucky/`（Windows Electron 工程；安卓是旁边的独立文件夹）
2. 左侧 **Run and Debug**（或 `Ctrl+Shift+D`）
3. 顶部下拉选 **Debug All**
4. 按 **F5**（或点绿色三角）

会在本目录执行 `npm run dev -- --sourcemap`，并同时附加：

- **主进程**（Node 调试，`autoAttachChildProcesses`）
- **渲染进程**（Chrome 远程调试端口 `9222`）

在 `src/main/**` 或 `src/renderer/src/**` 打断点即可命中。只需主进程时选 **Debug Main Process**；只想跑起来不调试选 **Run Dev (no debugger)**。

配置文件：[`.vscode/launch.json`](../.vscode/launch.json)（`cwd` = 本软件根）。

若 F5 立刻失败且终端出现 `Invalid package config .../package.json`：多半是 `package.json` 含非 UTF-8 字节（例如错误编码的 `©`）。用纯 UTF-8 重存即可。

## 本机安全 / 工作区（changelog §121）

完整契约：[SECURITY-AUDIT.md](./SECURITY-AUDIT.md)。改 `kentucky-file`、preload、导航锁、`ipcSandbox` 后必须**整进程退出再开** Electron（F5 热重载不够）。

**打开文件夹：** 选小说/项目**子文件夹**。不要把用户主目录、盘符根（`C:\`）、`C:\Users`、`C:\Windows` 当工作区——会 Toast「不能把盘符根、系统目录或用户主目录当作工作区打开」，工作区不切换。`Documents` 下的工程可以。

**Git：** 只认该工作区根的 `.git`。打开某个 git 仓的子目录会在该层 `git init`（嵌套），不会去操作父仓。这是有意的。

**分镜头：** 时间线超过 15 分钟无法导出 MP4。损坏/恶意 `.kyboard` 里带 `../` 的媒体路径会被拒绝。

## 构建 / 检查

```bash
npm run typecheck
npm run build
```

产物在 `out/`（main、preload、renderer）。

### Windows 目录版（文件夹内可运行）

```bash
npm run dist
```

产物：`release/KENTUCKY-<version>/`（内含 `KENTUCKY.exe`）。把整个文件夹拷走即可，双击 exe 运行。体积含 Chromium，通常一百多 MB 起。`dist` / `dist:dir` / `dist:portable` 会先跑 `ensure-ffmpeg`，把 `ffmpeg.exe` 打进安装包（`extraResources` → `ffmpeg/ffmpeg.exe`），否则用户导出 MP4 会 `FFMPEG_NOT_FOUND`。

若仍要单文件 portable：`npm run dist:portable` → `release/KENTUCKY-<version>-portable.exe`。

### 作为 .md 的「打开方式」

`npm run dev` / F5 **不会**出现在系统打开方式里（避免把开发用的 electron.exe 登记成阅读器）。

1. `npm run dist`，运行 `release/KENTUCKY-<version>/KENTUCKY.exe` **至少一次**（启动时写入当前用户 HKCU，不抢已有默认、不需管理员）。
2. 资源管理器里对 `.md` 右键 → 打开方式 → 选择 KENTUCKY。要设默认再点「始终」。
3. 双击会打开该文件所在文件夹为工作区并打开该标签。Kentucky 已在运行则交给现有窗口。

portable 解压到 Temp 的路径不登记。换了安装目录后重新运行一次 exe 即可更新登记。

国内若下载 Electron/NSIS 工具超时，可先设镜像再打包：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| Ctrl+S | 保存当前标签 |
| Ctrl+W | 关闭当前标签 |
| Ctrl+B | 切换侧栏（实现上活动栏点击会强制打开侧栏） |
| Ctrl+O | 打开文件夹 |
| Ctrl+, | 打开设置 |
| Ctrl+L | 打开/关闭右侧 AI 对话栏 |

## AI 代理人（0.2.0 起；当前 app 0.3.2）

1. 设置 → **AI**：填写 OpenAI 兼容 Base URL、模型、API Key（加密存软件本体 `data/`，开发态为 `dev-data/data/`）。思考强度 High / Mid / Low 跟配置档走（默认 Mid）。
2. 活动栏 AI 图标或 `Ctrl+L` 打开右侧栏。内置 **caveman** 默认开：普通问题短答；写章节/GDD 仍可长文。可在设置 Skills 关掉。
3. **Ask** 不执行工具、不写盘。**Agent** 始终自动写盘（无 Accept）。黄● = 相对上次 Ctrl+S。只读变更卡来自 `session.proposals`。
4. 改过的文件标签为**黄 ●**、新建为**蓝 ●**；资源管理器是文件名着色、圆点在行尾（文件夹有未保存子孙时同理）。保存后消失。AI 改多文件时**不切换**当前编辑页。
5. 等待回复时有「思考中 / 正在调用工具」指示；上下文占用见顶栏进度条；接近满时请新建对话。
6. 浮窗（精简窗）不带 AI 栏。
7. DeepSeek 等：填写对照见 [`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md) §5。Base URL 可用 `https://api.deepseek.com`（或带 `/v1`）；模型 `deepseek-v4-flash`。`This operation was aborted` 不是填错（§3）；`fetch failed` 多为网络/代理；错模型一般是 HTTP 4xx。

## 建议自测路径

1. 欢迎页打开文件夹 → 出现在 recent 卡片（最多 6）
2. 新建 `.md`：默认写作视图用工具栏排版；可切源码看 Markdown；保存；右键删除
3. 新建 `.txt`：无工具栏的软化 Monaco
4. 新建 `.kmind`：自由拖节点、改三种形状、从边缘拖出连线；拖到空白可弹出「添加节点」并自动连边；Delete 删除
5. 新建台词 `.dialogue.csv`：先「创建角色」，再选说话人写台词；改字后 id 不变；导出管线/本地化 CSV
6. 设置：深/浅色、改主体色、刷新仍保留
7. 语言中英切换 → 顶栏原生菜单语言同步
8. AI：配 Key → 润色当前 md → 确认不闪页、标签/侧栏有黄或蓝点 → Ctrl+S 圆点消失

## Godot 台词热编辑（同路径联动）

Kentucky **不**内嵌 Godot，**不**在本仓附带引擎插件，也不做双向实时协议。热编辑靠「两边读同一份磁盘文件」。

**Godot 执行器参考实现：** [CCFOX12/ai_river_godot](https://github.com/CCFOX12/ai_river_godot)（AI River）。其它工程也可按协议自研。

```text
YourGodotProject/
  dialogue/                 ← Kentucky「打开文件夹」选这里（工作区根）
    characters.csv          ← 含 model_node + operable（玩家勾 1，NPC 空）
    tavern_intro.dialogue.csv
    tavern_intro.dialogue.meta.json
    tavern_intro.dialogue.choices.json   ← 播放图（空 text：可操作确认 / NPC 自动）
    tavern_intro.dialogue.layout.json    ← 可选，仅 Kentucky 画布坐标
  addons/
    louisville_station/     ← 参考：ai_river_godot 执行器
```

1. 在 Kentucky 打开 `dialogue/`（因 `characters.csv` 固定在工作区根）。
2. **新建台词**信息卡：只填 Godot 场景 + 对话标识 → 自动生成文件名并写 `*.dialogue.meta.json`（卡上无改名入口）。
3. **创建角色**须填模型节点名 `model_node`；玩家角色勾选 **可操作**（顶栏「创建角色」或打开 `characters.csv` 卡片页）。
4. 需要改文件名：资源管理器 **右键 → 重命名**（同步 meta / choices / layout）。
5. 在**节点画布**编辑：从底边拉**选项边**（空文案：可操作=下一句确认，NPC=自动；可连 End）；检视器可勾选唯一**开场**；须保证要播的行从开场可达；右侧检视器改正文与 Godot 演出（`text_color` 留空=默认白正文，勿填角色色）；`Ctrl+S` → csv + choices + layout。
6. Godot（Louisville Station 等）读同一目录；检查器填 `dialogue_dir` + `dialogue_id`（playground 若锁了 `dialogue_file_override` 须改或清空才能换篇）；**不要**把导出 CSV 当热编辑主路径；执行器需按 **v1.3** 播 options，并读 `characters.operable`；保存/重导后确认 `*.dialogue.csv.import` 仍为 Keep File。
7. **完整协议 / 插件说明书 v1.3**：[`extras/godot-kentucky-dialogue/README.md`](../extras/godot-kentucky-dialogue/README.md)（含 §4.2 作者联调注意、显式开场）。

保存注意：画布未加载完时不要依赖立刻 `Ctrl+S` 写盘；若提示图与缓冲区不一致，先确认画布已显示台词再保存（防空覆盖）。

类比：Kentucky ≈ 外部 DCC；Godot 读盘——联动靠路径，不是进程间推送。

## 分镜头稿本 / 简化 PR（v0.3.0）

完整说明：[STORYBOARD.md](./STORYBOARD.md)（polish 至 **§119**；改序/persist **§150–§155**；安全上限 **§121**）。

1. 打开工作区 → Explorer **新建分镜头稿本**（或右键目录）。窗口底部右键时菜单应翻到光标上方，勿被裁切。
2. **稿纸**：设格数 / 推算行列 →（可选）改**生成文件夹**与**文件名** → **生成空白拼图 PNG**。
3. 在资源树打开生成的 `.png`：**滚轮缩放 / 拖拽平移**预览；再用外部绘图软件绘制。
4. **导入并切片**（不上 V1）。已在列表但轨上没有：选中后可点 **接到时间线**。不要对同一张图再点追加。稿本链接栏切换多张；尺寸不符时默认拒绝，可确认强制缩放。
5. **时间线**：从右侧缩略图 **拖到 V1** 才加入（可复用同一格）。V1 块身指针拖动改序（松手 `repackVideoClipStartsMut`）。检视器改时长；监视器拖/滚轮在**播放头**打镜头帧（**I** 钉住当前画面，**Alt+I** 删该时刻的帧；V1 **没有**默认头尾菱形，一帧=整段 hold）；A1–A4 加 MP3（空轨「添加音轨」，可拖边缘修剪）；滚轮横移时间线。**无**一键铺轨。粗剪后须走编辑器持久化（切标签 / Ctrl+S 不会盖回空轨）。
6. **导出**：填写文件夹与文件名（默认跟工程名），或用「另存为…」。时间线超过 **15 分钟**会拒绝导出（防磁盘打满）。多轨会 amix 进 MP4。资源树点导出的 `.mp4` 可在应用内预览播放。

BGM / MP4 预览 / `kentucky-file` 协议或 CSP / 安全沙箱变更后须 **完整退出再开 Electron**（热重载不够）。

不要把用户主目录或盘符根当工作区打开（会提示换项目子文件夹）。恶意/损坏的 `.kyboard` 里带 `../` 的媒体路径会被拒绝，属正常。

### MP4 / ffmpeg

导出 MP4 需要可运行的 ffmpeg。从 Cursor 启动的 Electron **看不到**你后来改的系统 PATH，所以开发机执行一次：

```powershell
cd "d:\Working Directory\Kentucky"
npm run ensure-ffmpeg
```

脚本会把已有可运行的 `ffmpeg.exe` **复制**到 `resources/ffmpeg/`（gitignore）。找不到则 `winget install -e --id Gyan.FFmpeg.Essentials` 再复制。也可继续用 PATH，或：

```powershell
$env:KENTUCKY_FFMPEG="C:\path\to\ffmpeg.exe"
```

跑完后若应用已开，须**完整退出再开** Electron。打包 `npm run dist*` 会先跑 ensure-ffmpeg，并把 `resources/ffmpeg/ffmpeg.exe` 打进 `extraResources`（安装包内路径 `ffmpeg/ffmpeg.exe`）。**不要**加 `ffmpeg-static` npm 包（GitHub 下载易超时）。

未找到时 Toast 为中文「未找到 ffmpeg…」（错误码 `FFMPEG_NOT_FOUND`），不会静默失败，也不会在主进程塞英文长句。

### 工作区 MP4 预览

资源树应能看见 `.mp4`（主进程 `TEXT_EXTS`）。点击用只读 `VideoPreviewEditor`（原生控件 + Reveal），**不会**当文本打开。拖进度依赖 `kentucky-file` 的 Range/206。改协议或 CSP 后须完整重启（见上）。jpg/webm 等尚未支持。
