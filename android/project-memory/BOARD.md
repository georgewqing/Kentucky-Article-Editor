# Android 进度板（唯一）

> 勾选状态只改本文件。详约在 [`open/`](./open/)。Win 缺陷总表：[`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md)。  
> 图例：❌ 未做 · ⚠️ 部分/待验 · ⏳ backlog · ✅ 完成 · ⏭ 本版跳过  
> Win 当前指纹参考：`toolApi: 2026-08-12-l`（Git L5 + playbook）；移植完成时 Android 须同串。

## 建议实施顺序

1. **W1 / W1b / W3** — 门禁 + cast 强制落盘 + continuity 结构  
2. **H1→H4** — [`open/literary-memory.md`](./open/literary-memory.md)  
3. **U12 → U4/U5** — 挂载 CRITICAL + Skill 正文注入（行为正确性优先于皮肤）  
4. **U1–U3 / U8–U11** — Agent UI + Shell  
5. **W 其余**（Plan / FS / search / append…）  
6. **U14→U13→U18→U15** — 他日；再决定 **U16/U17**（Git 可能永久跳过）  
7. **A1** — 触控板真机验收（可随时插队）

---

## A · Android 专属

| ID | 项 | 状态 | 详约 |
|----|-----|------|------|
| A1 | MD↔AI 触控板滚动分流（原生 `ACTION_SCROLL`） | ⚠️ 待真机 | [`open/trackpad-scroll.md`](./open/trackpad-scroll.md) |
| A2 | 台词 SAF 脏名 / 强制落盘 / 状态栏 insets | ✅ 代码已加固；历史副本人工 | [`gotchas.md`](./gotchas.md) §SAF |

---

## W · Agent 工具反馈（对齐 Win Round A–G）

| ID | 项 | 状态 | 备注 |
|----|-----|------|------|
| W1 | `reviewHint` / `gateDetail` / `toolApi` | ❌ | `proposalGate` + `emitProposal` |
| W1b | characters auto **强制写盘** | ❌ | 勿只标脏 |
| W1c | 无「5 张角色阈值」；≤5=台词行 | ❌ | |
| W2 | `workspace_*` 可发现 + 禁抄写提示 | ❌ | |
| W3 | `continuity_check` → `issues[]`，无 excerpts | ❌ | + `registeredCast` |
| W3b | 幽灵启发式 `ghostNames.ts` | ❌ | |
| W4 | 幽灵角色 warn（硬门禁） | ⏳ | 两端 backlog |
| W5–W6 | Plan 单一真相 + `fileWritten` 等 | ❌ | |
| W7–W8 | append 建表 + `columnOrder` | ❌ | |
| W9/W10 | 只读 diff 卡（**无 Accept**） | ❌ | 见 **U13**；勿做旧批量 Accept |
| W12 | web_search snippet 非空 | ❌ | CSP/网络 |
| W13–W14 | CSV RFC + upsert 六列 | ❌ | |
| W15 | 区外附件 → `.kentucky/refs/` | ❌ | SAF 选后写入 |
| W16 | plans/*.plan.md + Build | ❌ | |
| W17 | mkdir/copy/move/delete | ❌ | 全 `WorkspaceIo` |
| W18 | `propose_upsert_characters` | ❌ | |
| W19 | MD patch 不毁表格/`>` | ❌ | TipTap Table |
| B1 | kmind 坐标 | ⏳ | 两端 backlog |

---

## H · 文学记忆（Round H）

详约：[`open/literary-memory.md`](./open/literary-memory.md)

| ID | 项 | 状态 |
|----|-----|------|
| H1 | M1 story_state / foreshadow + continuity + L5 + memoryHint | ❌ |
| H2 | M2 voice_anchor / voice_bank / compare_voice | ❌ |
| H3 | M3 scenes[] + revisions/（restore **自动写盘**，无 Accept） | ❌ |
| H4 | M4 materials / glossary / proofread / reader_critique | ❌ |

---

## U · UI / Shell / Auto-apply

| ID | 项 | 状态 | 详约 |
|----|-----|------|------|
| U1 | `/` Skills+Commands 预览 + `read_skill` | ❌ | [`open/agent-ui.md`](./open/agent-ui.md) |
| U2 | 上下文分项用量（buckets；色条按 limit） | ❌ | 同上 |
| U3 | 工作台铺满 + 消息无横向滑块 | ❌ | 同上 |
| U4 | 挂载 chip + `attachedPaths` + **CRITICAL 注入** | ❌ | [`open/workbench-chrome.md`](./open/workbench-chrome.md) + **U12** |
| U5 | Skill 暖色胶囊 + 正文注入 | ❌ | chrome |
| U6 | 选区右键 Copy / Select All / Google | ❌ | chrome |
| U7 | 文件夹展开记忆 | ⚠️ | prefs 已拷；ExpandCtx 待验 |
| U8 | 设置页卡片 + SegmentedControl | ❌ | [`open/shell-ux.md`](./open/shell-ux.md) |
| U9 | 设置 overlay 滚动条 | ⚠️ | 已接 hook，待验 |
| U10 | 上下文用量 `accentTone` | ❌ | shell |
| U11 | 开始页多开 `goHome` | ⚠️ | 部分已拷，待验 |
| U12 | 纸夹挂载 CRITICAL 注入 | ❌ | shell；与 U4 同做 |
| U13 | 取消 Accept；只读变更卡 | ⏭ | [`open/auto-apply-git.md`](./open/auto-apply-git.md) |
| U14 | 始终写盘 + Agent hub 脏契约 | ⏭ | 同上 |
| U15 | 段内高亮 `agentChangeRanges` | ⏭ | 同上 |
| U16 | Git SCM UI | ⏭ | 或永久跳过（无系统 git） |
| U17 | `git_status` / `git_diff` | ⏭ | 同上 |
| U18 | kmind shape/尺寸/子树 | ⏭ | 同上 |

---

## Android 特有风险（移植时）

1. **SAF / 杀进程**：auto 写盘路径必须真 `WorkspaceIo.write`；不能只标脏。  
2. **勿 import `win/`**：在 `ai-runtime/` 重写；工具用 `WorkspaceIo`。  
3. **窄宽 AI drawer**（≤1100px）：diff/列表须可点可滚。  
4. **U13+**：旧「multi_file → pending / Accept」已废；对齐 Win 当前契约（指纹参考 `2026-08-12-l`，详约 [`open/auto-apply-git.md`](./open/auto-apply-git.md)）。  
5. **Git**：平板常无 CLI；开 U16 前先产品拍板（跳过 / isomorphic-git / 弱还原）。Win 实现真源：[`../win/project-memory/AGENT-GIT.md`](../win/project-memory/AGENT-GIT.md)。  
6. **文学 `revisions/` ≠ Git**。

---

## 全部 ✅ 后

1. 本板对应行改 ✅；相关 `open/*.md` 文首改 **CLOSED**。  
2. [`changelog.md`](./changelog.md) 留一条。  
3. 勿再新建根目录 `OPEN-*.md` — 新工单：板上一行 + 必要时 `open/新文件.md`。
