# Kentucky Win — AI 交接入口

> **先扫本页「现状」和「硬规则」，再按任务打开其它文件。**  
> [`changelog.md`](./changelog.md) 是历史，**不是**当前契约。旧节里的 `toolApi` 以当时为准。

本目录就是 Windows / Electron 软件根。安卓平板版是**另一套独立工程**（本机常见并列目录 `../Kentucky for Android/`），不在本仓库。**禁止**跨工程 `import`。

---

## 现状（2026-08-15）

| 键 | 值 |
|----|-----|
| 软件根 | 本目录 · `package.json` **0.3.2** |
| 壳 | Electron 37 + electron-vite · React 19 · Zustand |
| 当前 `toolApi` | **`2026-08-14-a`**（`proposalGate.ts` `TOOL_API_VERSION`） |
| 沙箱 | `ipcSandbox.ts` + `workspacePath.ts`（changelog §121–§122） |
| Agent 写盘 | **始终自动写盘**；无 Accept。黄● = 相对上次 Ctrl+S。改动卡只读 |
| Git | 工作区根自动 `git init`（**不向上**找父仓）；Agent `git_*` 立即执行、无 force |
| 分镜头 | `.kyboard` 已发版；粗剪须 `persistDoc` + Save 前 flush（§155） |
| Android | 独立工程 `../Kentucky for Android/`（Capacitor **0.3.0**）；不在本仓库构建或提交 |

改协议 / preload / CSP / 导航锁 / IPC 沙箱后必须**完整退出 Electron**。`Ctrl+R` / F5 热重载不够。

---

## 硬规则

1. 渲染层只走 `getPlatform()`，禁止 `require('fs')` 或散落 `window.kentucky`。
2. 新 IPC / `kentucky-file` / Git / Agent 路径必须过 `ipcSandbox` + `workspacePath`。禁止回退裸 `fs:*`。
3. **不要**把盘符根、`C:\Users`、用户主目录当工作区打开（产品拒绝）。
4. Agent：**Ask 不执行工具**；Agent 模式写盘无 Accept；`commitProposal` 必须把提案 upsert 进 `session.proposals`（status=`applied`）。
5. `.kyboard` 变更必须 `persistDoc`（写盘 **且** 更新 `tab.content`）。只 `writeFile` 会让 Ctrl+S 用打开时缓冲盖掉时间线。
6. 分镜：**无**一键铺轨；导入不上 V1；改序后 `repackVideoClipStartsMut`（禁止改序后再 `packVideoClipsMut`）。
7. 契约 bump 才改 `TOOL_API_VERSION`。未 bump 的主进程改动仍须完整退出。
8. 勿用 `window.prompt` / `window.confirm`；确认走应用内对话框。
9. 勿加 `framer-motion` / `ffmpeg-static`。
10. 安卓在独立工程里维护。不要把 Capacitor / Gradle 放进本目录，也不要从这里覆盖那边的 `src/`。

---

## 按任务读什么

| 你要做的事 | 读（按序） |
|------------|------------|
| 清空上下文续聊 | 本页「现状」→ 本表对应行 |
| 改工作台 / 标签 / 多窗 | [`architecture.md`](./architecture.md) · [`product-decisions.md`](./product-decisions.md) · [`gotchas.md`](./gotchas.md)「标签栏 / 分屏」 |
| 改 Markdown / 导图 / 台词 | architecture 对应节 · product-decisions · extras Godot v1.3 · MD 复制见 [`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md) §4 |
| 改分镜 / ffmpeg / 预览 | **[`STORYBOARD.md`](./STORYBOARD.md)**（单一真源） |
| 改 Agent 工具 / 门禁 | [`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md) · `proposalGate.ts` · [`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md) |
| 改 AI 设置 / 流式超时 / MD 复制 | **[`PACKAGED-AI-UX.md`](./PACKAGED-AI-UX.md)**（打包三件 + abort 回归） |
| 改 Git / SCM | **[`AGENT-GIT.md`](./AGENT-GIT.md)** |
| 改 IPC / 协议 / 工作区根 | **[`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)**「现契约详解」 |
| 怎么跑 / 打包 / 打开方式 | [`how-to-run.md`](./how-to-run.md) |
| 文学记忆 / 游戏 skill | [`REQ-literary-agent-capability-upgrade.md`](./REQ-literary-agent-capability-upgrade.md) · [`REQ-indie-game-skills.md`](./REQ-indie-game-skills.md) |
| 安卓对照 | 打开独立工程 `../Kentucky for Android/project-memory/README.md` |
| 「为什么以前那样」 | [`changelog.md`](./changelog.md) 对应节 |

---

## 文档地图

| 文件 | 角色 |
|------|------|
| **本页** | 现状 + 硬规则 + 读序 |
| [architecture.md](./architecture.md) | 当前技术栈、目录、数据流、模块索引 |
| [product-decisions.md](./product-decisions.md) | 已定稿产品表；勿擅自推翻 |
| [gotchas.md](./gotchas.md) | 当前踩坑；改相关功能必读 |
| [PACKAGED-AI-UX.md](./PACKAGED-AI-UX.md) | 打包/真机：设置回弹、转圈、abort、MD 复制（Android 对照） |
| [how-to-run.md](./how-to-run.md) | 运行 / F5 / dist / ffmpeg / 危险工作区 |
| [changelog.md](./changelog.md) | 按对话演进的历史（§1–§161） |
| [STORYBOARD.md](./STORYBOARD.md) | `.kyboard` 完整契约 |
| [AGENT-GIT.md](./AGENT-GIT.md) | Git SCM + Agent `git_*` |
| [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) | 本机沙箱；禁止回退清单 |
| [AGENT-TOOL-FEEDBACK.md](./AGENT-TOOL-FEEDBACK.md) | 工具缺陷总表（Win 已修 / Android 待对齐） |
| [AGENT-TOOL-TEST-BASELINE.md](./AGENT-TOOL-TEST-BASELINE.md) | 干净仓实证基线 |
| [SESSION-TOOL-FEEDBACK.md](./SESSION-TOOL-FEEDBACK.md) | 短交接 + 回归清单 |
| [REQ-literary-agent-capability-upgrade.md](./REQ-literary-agent-capability-upgrade.md) | 文学记忆需求归档 |
| [REQ-indie-game-skills.md](./REQ-indie-game-skills.md) | 8 个游戏策划 skill |
| [../extras/godot-kentucky-dialogue/README.md](../extras/godot-kentucky-dialogue/README.md) | Godot 协议 **v1.3** |

---

## 模块一句话

| 模块 | 磁盘 / 入口 |
|------|----------------|
| 工作台 | 打开本地文件夹；多标签（滚轮横滑、拖动改序）；分屏各栏「此栏」菜单；多窗 DocumentHub；活动栏 home/explorer/scm/settings/AI |
| `.md` | TipTap WYSIWYG + Monaco；无分屏预览 |
| `.kmind` v2 | React Flow；viewport 不脏；保存前 flush |
| `.dialogue.csv` | 11 列 + choices/layout sidecar；`characters.csv` 工作区根 |
| `.kyboard` | 稿纸 + NLE；`persistDoc`；无 AI 工具 |
| PNG/MP4/PDF | 只读预览；`isMediaPreviewKind`；不进 DocumentHub |
| PDF 导出 | UI printToPDF；Agent 仅 `.md` → `export_workspace_pdf` |
| Agent | OpenAI 兼容；Ask/Plan/Outline/Agent；本体 `dev-data/data/` 或 exe 旁 `data/` |

根目录另有简版 [README.md](../README.md)。详细以本目录为准。
