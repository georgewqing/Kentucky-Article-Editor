# OPEN: Agent 工具反馈对齐（Win Round A–D → Android）

> **状态：OPEN / 未开始对齐**  
> **创建**：2026-08-11  
> **权威总清单（含完整缺陷表与契约）**：[`../../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../../win/project-memory/AGENT-TOOL-FEEDBACK.md)  
> **Win 会话交接**：[`../../win/project-memory/SESSION-TOOL-FEEDBACK.md`](../../win/project-memory/SESSION-TOOL-FEEDBACK.md)  
> **移植手册**：[`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md) §阶段 G

用户在真实创作流（随笔 → 长篇 → 归档 → 计划）中暴露的 agent 工具缺陷，Win 已按 Round A–D 修复。Android `ai-runtime` **尚未按同一契约对齐**；后续移植必须按总清单逐项完成，避免只同步部分 schema。

---

## 为何单独建 OPEN

- 与 SAF 损坏、触控板滚动等 Android 专属 OPEN 并列，方便排期。
- 总清单在 Win `project-memory`（功能源真相）；本文件跟踪 **Android 勾选进度** 与 Android 特有落盘/SAF 注意点。

---

## Android 进度板（移植时改状态）

| ID | 项 | Android | 备注 |
|----|-----|---------|------|
| W1 | `reviewHint` / `gateDetail` / `toolApi` | ❌ | 对齐 `proposalGate` + `emitProposal` |
| W1b | characters **auto 且强制写盘** | ❌ | 勿只标脏；杀进程会丢 cast |
| W1c | 无「5 张角色阈值」；≤5=台词行 | ❌ | 注释+prompt 写清 |
| W2 | `workspace_*` 可发现 + 禁抄写提示 | ❌ | |
| W3 | `continuity_check` → `issues[]`，无 excerpts | ❌ | + `registeredCast` |
| W3b | 幽灵启发式 `ghostNames.ts`（E/F 轮） | ❌ | 同步新文件；对照基线 P1 |
| W9/W10 | diff/批量 UI + `uiReview` 字段 | ❌ | |
| W19 | MD patch 不毁表格/`>`（TipTap Table + emitUpdate:false） | ❌ | 同步编辑器扩展与 AI 落盘 hub |
| W4 | 幽灵角色 warn（硬门禁 backlog） | ❌ | |
| W5–W6 | Plan 单一真相 + `fileWritten` 等 | ❌ | 可能需补 `planFiles` |
| W7–W8 | append 建表 + `columnOrder` | ❌ | |
| W9–W10 | diff hunk + 批量 Accept UI | ❌ | AiPanel / drawer |
| W12 | web_search snippet 非空 | ❌ | 查 CSP/网络 |
| W13–W14 | CSV RFC 说明 + operable 六列 | ❌ | |
| W15 | 区外附件 → `.kentucky/refs/` | ❌ | SAF 选文件后写入工作区 |
| W16 | plans/*.plan.md + Build 语义 | ❌ | |
| W17 | mkdir/copy/move/delete | ❌ | 全走 `WorkspaceIo` |
| W18 | `propose_upsert_characters` | ❌ | |
| B1 | kmind 坐标 | ⏳ 两端 backlog | |
| B2 | 幽灵硬门禁 | ⏳ 两端 backlog | |

验收指纹：工具结果出现 `toolApi`（与 Win 当前版本字符串一致，见总清单）。

---

## Android 特有风险（移植时勿踩）

1. **SAF / 杀进程**：Win「只标黄」在 Android 更危险。角色 upsert、小台词 append 的 auto 路径必须 `WorkspaceIo.write` 落盘（可与既有 Accept 强制写盘策略合并，但 auto cast 不能仅内存）。
2. **勿 import `win/`**：对照逻辑后在 `android/src/ai-runtime/` 重写；`tools.ts` 用 `WorkspaceIo`，不用 Node `fs`。
3. **窄宽 AI drawer**：批量 Accept / diff 布局需在 `<=1100px` 可点可滚。
4. **web_search**：WebView CSP、CORS、网络权限；snippet 兜底逻辑可与 Win 同，网络层跟 Android。
5. **区外附件**：经 SAF/系统选择器取内容，写入工作区 `.kentucky/refs/`，再挂会话。

---

## 建议实施顺序

1. `proposalGate.ts` + `agentLoop` 落盘（W1/W1b/W1c）  
2. `tools.ts`：continuity、append、upsert(s)、返回字段（W3/W7/W8/W18）  
3. Plan 协议（W5/W6/W16）  
4. FS 工具（W2/W17）  
5. web_search（W12）  
6. UI diff/批量（W9/W10）  
7. 附件 refs（W15）  
8. 真机跑总清单 §5 验证；全部 ✅ 后把本文状态改为 **CLOSED**，并在 `changelog.md` 留一条。

---

## 相关 OPEN（勿混淆）

- [OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md) — SAF 文件名 / Accept 丢缓冲  
- [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md) — MD↔AI 触控板滚动  
