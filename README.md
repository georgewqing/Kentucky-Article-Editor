# KENTUCKY

**English:** A local desktop writing app (Electron + React + TypeScript). Built for focused article writing: Markdown WYSIWYG with optional source mode, a freeform whiteboard mind map, and a **node-graph** dialogue CSV editor (Godot-linked branching) for game/script writing. The UI aims for a Cursor-like workbench feel—soft edges, a unified palette, dark/light themes, and a tunable accent color.

**中文：** 本地写作桌面应用（Electron + React + TypeScript）。面向**专心写文章**与**台词**：`.md` 所见即所得 + 可切源码；自由白板思维导图；节点式 `.dialogue.csv` 编辑器。界面气质接近 Cursor 工作台：少硬边框、统一色阶，支持深色 / 浅色与可调主体色。

> **Development note / 开发说明:** Built collaboratively by the author and AI (Cursor Agent).  
> **Update policy / 更新原则:** Features ship primarily for the author’s own writing needs—this is **partly a personal tool**. The public repo is welcome to browse and learn from; the roadmap and UX trade-offs may not match a fully productized app.

**Why “KENTUCKY”? / 关于名字:** Named after the Kentucky map in *Project Zomboid*—the author got hooked on the B42 (Build 42) update. (Yes, that is the whole reason.) / 因为最近《僵尸毁灭工程》B42 更新玩上头了（笑）。

**License:** [MIT](./LICENSE) · **Repo:** https://github.com/CCFOX12/Kentucky-Article-Editor

Architecture and decision notes: [`project-memory/`](./project-memory/README.md) (read this after context resets). / 架构与决策备忘见同目录（上下文重置后请先读）。

## Features / 功能

- **Workspace / 工作区:** Open a local folder; welcome page shows up to 6 recent workspace cards. / 打开本地文件夹；欢迎页以卡片展示最近工作区（最多 6 个）。
- **Explorer / 资源管理器:** File tree; create file / folder / mind map / dialogue from toolbar or context menu; rename / delete; “Reveal in File Explorer”; resizable sidebar. / 文件树、新建（含台词）、重命名、删除、「在文件资源管理器中显示」。
- **Writing / 文本写作:** `.md` via TipTap WYSIWYG + minimal toolbar (toggle Monaco source, non-whitespace character count); other text via softened Monaco; dirty flag + save; browser spellcheck squiggles disabled. / `.md` 为 TipTap 所见即所得 + 极简工具栏；`.txt` 等为软化 Monaco；脏标记与保存；关闭拼写红波浪线。
- **Mind map / 思维导图:** Standalone `.kmind` v2 (React Flow freeform board); rectangle / rounded / ellipse; drag edges onto empty canvas to create linked nodes; custom minimap; node links, images, reference images, and note “chin” panels; weak coupling to articles (no auto-sync). / 独立 `.kmind` v2；节点链接/插图/参考图/批注「黑下巴」；与正文弱联动、不同步。
- **Dialogue / 台词:** Node-graph `*.dialogue.csv` (11 cols) + `*.dialogue.choices.json` play graph (empty option text: operable speaker waits confirm, NPC auto-advances) + Kentucky-only `*.dialogue.layout.json`; root `characters.csv` (`operable` column); meta `*.dialogue.meta.json`. Protocol **v1.3**: [`extras/godot-kentucky-dialogue/README.md`](./extras/godot-kentucky-dialogue/README.md). Godot executor: [ai_river_godot](https://github.com/CCFOX12/ai_river_godot). / 节点式台词图；choices 播放图；`characters.operable`；契约 **v1.3**。
- **Multi-window / 多窗口:** Blender-style **New Window** (slim single-file editor) and **New Main Window** (full workbench, same workspace, empty tabs); same-path buffers shared live across windows; in-app unsaved dialog (Save / Don’t Save / Cancel). / Blender 式新建窗口/新建主窗口；同路径正文跨窗实时共享；应用内未保存对话框。
- **Split view / 分屏:** Side-by-side editor panes. / 编辑器左右分栏。
- **Storyboard / 分镜头 (v0.3.0):** `.kyboard` sheet + simplified NLE; workspace `.png` / `.mp4` / `.pdf` preview. / 分镜头稿本 + 简化时间线；工作区可预览 PNG/MP4/PDF。
- **Settings / 设置:** Dark/light, accent (presets + picker), font size, Chinese/English UI; menus follow locale; startup splash follows saved accent; **AI** (OpenAI-compatible URL/key/model, agent tools). / 深色/浅色、主体色、字号、中英 UI；启动闪屏跟主体色；**AI** 设置。
- **AI writing agent / AI 写作代理人 (since v0.2.0):** Right Cursor-like panel (`Ctrl+L`); Ask / Plan / Agent; Agent **auto-writes** (no Accept); read-only change cards; multi-session history + encrypted key in app-body `data/`; optional Skills and web search (off by default); Git tools on desktop. / 右侧对话栏；Agent 始终写盘、无 Accept；可选 Skills 与联网搜索；桌面含 Git 工具。
- **Source Control / Git:** Auto `git init` at the opened folder root (does not walk up); SCM pane + Agent `git_*` (no force). / 打开的文件夹根自动建仓；不向上找父仓。
- **Platform / 平台抽象:** Renderer talks to the filesystem only through `Platform` (Electron preload). The Android tablet app is a **separate product** (greenfield; handoff in [`android-port-brief/`](./android-port-brief/README.md)), not part of this repo. / 渲染层经 `Platform` 访问文件系统；安卓平板版是独立工程，从零移植见 `android-port-brief/`。

## Out of scope (for now) / 明确不做（现阶段）

- Split Markdown preview (WYSIWYG is the reading surface); auto-sync between article and mind map / Markdown 左右分屏预览、正文 ↔ 导图自动同步
- Command palette / extensions / cloud sync / 命令面板、扩展、云同步
- AI: billing UI, Shell tools, cloud key sync; Brave/Tavily live search (DDG optional search is in-app) / AI 费用账单、Shell、云同步密钥；Brave/Tavily 尚未接通（DuckDuckGo 可选搜索已内置）
- Phone-narrow layouts / 手机窄屏布局
- Switching files inside a slim window; syncing caret/selection across windows / 精简窗内换文件、跨窗同步光标/选区
- Godot bidirectional live protocol (Kentucky does not embed Godot or push IPC) / Godot 双向实时协议（不同路径磁盘联动）
- Bundled Godot editor plugin in this repo (reference executor: [ai_river_godot](https://github.com/CCFOX12/ai_river_godot); contract in extras) / 本仓不附带 Godot 插件（参考实现见 ai_river_godot；契约在 extras）

## Quick start / 快速开始

```bash
npm install
npm run dev
```

If Windows PowerShell blocks npm scripts / 若 PowerShell 禁止 npm 脚本:

```bat
cmd /c npm run dev
```

**Cursor / VS Code:** Open this folder (`Kentucky/`) → Run and Debug → **Debug All** → **F5** (see [`project-memory/how-to-run.md`](./project-memory/how-to-run.md)). / 打开本文件夹后 F5（详见 how-to-run）。

```bash
npm run typecheck
npm run build
```

Build output is in `out/`. / 产物在 `out/`。

### Windows portable `.exe` (download & run) / 便携版（下载即开）

```bash
npm run dist
```

Default ship is a **folder** `release/KENTUCKY-0.3.2/` (contains `KENTUCKY.exe`). Optional `npm run dist:portable` builds a single-file exe. / 默认目录版 `release/KENTUCKY-0.3.2/`；可选便携单文件。

If Electron/NSIS downloads time out in China, set mirrors first: / 国内下载超时可先设镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

## Shortcuts / 快捷键

| Shortcut | Action (EN) | 作用（中文） |
|----------|-------------|--------------|
| Ctrl+S | Save | 保存 |
| Ctrl+W | Close tab | 关闭标签 |
| Ctrl+B | Sidebar | 侧栏相关 |
| Ctrl+O | Open folder | 打开文件夹 |
| Ctrl+, | Settings | 设置 |
| Ctrl+L | AI chat panel | AI 对话栏 |

## Stack / 技术栈

Electron · electron-vite · React 19 · TypeScript · Zustand · TipTap · Monaco · @xyflow/react · i18next

## Contributing / 贡献与反馈

Personal needs come first—feature requests and PR timing are not guaranteed. Issues and PRs are still welcome; the author merges by personal priority. / 因以个人需求为优先，不保证接受所有功能请求或 PR 节奏。Issue / PR 仍可开，作者会按自身使用优先级决定是否合入。
