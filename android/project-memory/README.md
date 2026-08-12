# Kentucky Android — project memory

> **AI 入口**。先读本页 → 做 Win 对齐时再读 [`BOARD.md`](./BOARD.md) + [`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md)。  
> 版本：`0.2.0` · 独立软件根 · 勿 `import ../win`

## 硬规则（每次动手前）

1. `win/` 与 `android/` **分家**；禁止整目录覆盖 `android/src`。
2. 文件 / AI / 对话框只走 `src/platform/index.ts`；真机工作区主路径是 **SAF**。
3. 改 `MainActivity.java` / `KentuckySafPlugin.java` → Android Studio **Run 重装**（仅 `cap sync` 不够）。
4. 移植进度只改 [`BOARD.md`](./BOARD.md)；契约细节只改 [`open/`](./open/)。
5. 浏览器预览 ≠ 完成；涉及文件/原生/触控板必须真机验。

## 按任务读什么

| 你要做的事 | 读 |
|------------|-----|
| 清空上下文续聊 / 当前状态 | 本页「现状」+ [`BOARD.md`](./BOARD.md) |
| 从 Win 搬功能 | [`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md) → 阶段分类 → [`BOARD.md`](./BOARD.md) 对应 ID |
| 实现某一 OPEN 项 | `BOARD` 行内「详约」列 → `open/*.md` |
| 踩坑 / 禁止项 | [`gotchas.md`](./gotchas.md) |
| 产品边界 | [`product-decisions.md`](./product-decisions.md) |
| 结构 / Platform | [`architecture.md`](./architecture.md) |
| 怎么跑 | [`how-to-run.md`](./how-to-run.md) |
| 历史改动 | [`changelog.md`](./changelog.md) |
| Win 工具总清单（源真） | [`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md) |
| Win Git 完整记录（源真） | [`../win/project-memory/AGENT-GIT.md`](../win/project-memory/AGENT-GIT.md) |

## 现状（2026-08-12）

- **骨架**：0.2.0 已对齐 Win 主能力（编辑器 / 对话 v1.3 / SAF / `ai-runtime` / 单窗平板 chrome）。
- **Win 超前未移植**：Agent 工具反馈 W*、文学记忆 H*、UI U1–U18 — 进度见 [`BOARD.md`](./BOARD.md)。
- **本大版本不移植**：U13–U18（去 Accept / 始终写盘 / Git / kmind 子树）— Win 已落地至 `toolApi: 2026-08-12-l`；**契约镜像** [`open/auto-apply-git.md`](./open/auto-apply-git.md)；Win 完整记录 [`../win/project-memory/AGENT-GIT.md`](../win/project-memory/AGENT-GIT.md)。Android **无** Git 实现代码。
- **待真机验收**：MD↔AI 触控板分流 — [`open/trackpad-scroll.md`](./open/trackpad-scroll.md)。
- **历史脏文件**：工作区里已 mangled 的台词副本需人工整理（代码不自动修内容）。

## 目录（整理后）

```text
project-memory/
  README.md                 ← 你在这里
  BOARD.md                  ← 唯一进度板（W / H / U / A）
  PORTING-WIN-TO-ANDROID.md ← 操作规程
  architecture.md | product-decisions.md | gotchas.md | how-to-run.md | changelog.md
  open/                     ← 详约（按需打开，勿当进度板）
    literary-memory.md      H1–H4
    agent-ui.md             U1–U3
    workbench-chrome.md     U4–U7
    shell-ux.md             U8–U12
    auto-apply-git.md       U13–U18
    trackpad-scroll.md      A1
```

旧文件名（`OPEN-*.md` / `SESSION-HANDOFF.md`）保留为 **跳转 stub**，勿再往里写进度。

## 真机最短路径

```bat
cd /d "d:\Working Directory\Kentucky\android"
npm run cap:sync
npm run cap:open
```

Android Studio → 平板 → Run。
