# Agent 工具反馈总清单（Win 已修 · Android 待对齐）

> **权威清单**：创作侧长会话反馈 → 工具侧缺陷与修复对照。  
> Win 实现以本文件 + 源码为准；Android **必须按本清单逐项移植**，不得只抄 UI。  
> 会话交接短文：[`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md)  
> Android OPEN 工单：[`../../android/project-memory/OPEN-agent-tool-feedback-parity.md`](../../android/project-memory/OPEN-agent-tool-feedback-parity.md)

| 字段 | 值 |
|------|-----|
| 反馈来源 | `test2/tool_feedback.md`（v1 → v2） |
| Win 轮次 | Round A/B/C/D（2026-08-11） |
| 部署指纹 | 写入类工具结果须含 `toolApi: "2026-08-11-g"` |
| 测试基线 | [`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)（9 项实证） |
| Android 状态 | **未对齐**（见 OPEN 工单） |

---

## 0. 跨端原则

1. **业务规则两端一致**：写入门禁、工具名/schema、返回字段语义、continuity 结构、Plan 文件协议。
2. **IO 层不同**：Win = Node `fs`（`win/src/main/ai/`）；Android = `WorkspaceIo`（`android/src/ai-runtime/`）。移植时改执行体，不改契约。
3. **UI 项 agent 观测不到**：diff hunk、批量 Accept 在面板上；应用结果字段给 agent，面板给人。
4. **验证指纹**：任一端若工具结果无 `toolApi`，视为旧运行时，勿当「未修」。

### Win ↔ Android 文件映射

| Win | Android |
|-----|---------|
| `win/src/main/ai/proposalGate.ts` | `android/src/ai-runtime/proposalGate.ts` |
| `win/src/main/ai/tools.ts` | `android/src/ai-runtime/tools.ts` |
| `win/src/main/ai/agentLoop.ts` | `android/src/ai-runtime/agentLoop.ts` |
| `win/src/main/ai/planFiles.ts` | （若尚无）需新增或并入 tools；与 Win 同协议 `plans/*.plan.md` |
| `win/src/main/ai/formats.ts` | `android/src/ai-runtime/formats.ts` |
| `win/src/main/ai/webSearch.ts` | `android/src/ai-runtime/webSearch.ts` |
| `win/src/renderer/.../proposalDiff.ts` | Android 对应 AiPanel / diff 组件 |
| `win/src/renderer/.../AiPanel.tsx` | Android AiPanel（窄宽 drawer） |
| `win/src/renderer/.../aiStore.ts` | Android ai store / bridge |

---

## 1. 缺陷总表（按优先级）

图例：`Win` = 源码状态；`Android` = 移植状态。

| ID | 问题 | 严重度 | Win | Android | 验收要点 |
|----|------|--------|-----|---------|----------|
| **W1** | 写入结果不可预测；缺稳定提示 | P0 | ✅ Round A/D | ❌ | 结果含 `written`/`pending`/`reviewHint`/`gateDetail`/`toolApi` |
| **W1b** | 角色 upsert 在「只标黄」时不写盘 → 幽灵 cast | P0 | ✅ Round C `shouldPersistAutoToDisk` | ❌ 查 Accept/落盘策略 | 角色 upsert 后磁盘立刻有行；continuity 能看见 |
| **W1c** | 误以为「≥5 张角色 → pending」 | P0 澄清 | ✅ 无此阈值；≤5=台词行 | ❌ 对齐门禁注释 | 5–6 张 + 同轮改正文仍 `character_upsert` auto |
| **W2** | 归档不知 `workspace_copy/move`，读后重写 | P1 | ✅ 描述+系统提示 | ❌ | agent 用 FS 工具归档，不抄写 |
| **W3** | `continuity_check` dump 全文 | P0 | ✅ `issues[]`，无 `excerpts` | ❌ | 无全文；有 `registeredCast`/`castNote` |
| **W3b** | 幽灵误报（第一章/钟楼/白鲸号）且漏报真名 | P0 | ✅ Round E–F `ghostNames.ts` | ❌ | 报老陈/管事；不报章节地名船号与「张船票/老人」类；排除已登记 |
| **W4** | 幽灵角色（卡 pending 正文已用） | P1 | ⚠️ warn only（启发式已换） | ❌ | prose 可有 `ghostCharacterWarnings`；硬门禁仍 backlog |
| **W5** | Plan 双真相（Todos vs Plan 正文 checkbox） | P1 | ✅ 同步+剥裸 checkbox | ❌ | `update_plan_step` 改 Todos 且同步带 id 的 Plan 行 |
| **W6** | `update_plan_step` 的 `fileUpdated` 交替误导 | P1 | ✅ `fileWritten`/`contentChanged`/`steps` | ❌ | **禁止**再返回 `fileUpdated` |
| **W7** | dialogue 列序静默重排不告知 | P2 | ✅ `columnOrder`/`headerNote` | ❌ | append 结果含列序说明 |
| **W8** | append 新 `.dialogue.csv` 报 File not found | P1 | ✅ 自动建 11 列表头 | ❌ | 不存在则建表，不报错 |
| **W9** | 无 diff 预览 | P2 | ✅ 文本 hunk UI + 结果 `uiReview` | ❌ | **需人工**看 AiPanel；agent 见 `uiReview` 勿重复报缺 |
| **W10** | 无批量 Accept/Reject | P2 | ✅ 批量按钮 + `uiReview` | ❌ | 同上 |
| **W11** | kmind omit x/y 但坐标被固化 | P2 | ⏳ backlog 刻意未做 | ⏳ | 见 §3 |
| **W12** | `web_search` 无 snippet | P2 | ✅ enrich+兜底 | ❌ | 每条 `snippet` 非空 |
| **W13** | CSV `""人""` 观感 | P3 | ✅ 标明 RFC 4180 | ❌ | `read_characters` 解码字段 + 说明 |
| **W14** | `characters.csv` 增 operable 列无提示 | P2 | ✅ `formatNote`/columns | ❌ | 六列说明 |
| **W15** | 区外参考附件路径报错 | P1 | ✅ 复制到 `.kentucky/refs/` | ❌ | 区外文件可挂上 |
| **W16** | Plan 模式 / Build / plans/*.plan.md | P1 | ✅ | ❌ 若缺则补 | 与 Win 同协议 |
| **W17** | FS：mkdir/copy/move/delete | P1 | ✅ | ❌ | 无 Shell；归档用工具 |
| **W19** | `propose_text_patch` 破坏 MD 表格/`>` | P0 | ✅ Round G TipTap Table + emitUpdate:false + hub 同步 | ❌ | write→read→patch→read 保留 `\|` 与多行 `>`；无 `****` 加倍 |

---

## 2. Win 已实现行为契约（Android 必须复刻）

### 2.1 写入门禁（`proposalGate`）

- `forceReviewAllWrites` → 全部 pending。
- 新文件 / 空文件 → auto。
- **`kind === 'characters'` → 始终 auto**（任意张数、即使本轮已改其它文件）。
- layout（kmind_layout / dialogue_layout）→ auto。
- dialogue：**行数** `changeCount ≤ 5` 可 auto；更大或多文件 → Accept。
- 已有 prose / kmind / performance / 多文件内容 → Accept。
- **没有「角色卡 ≥5 张 → pending」**；勿把台词 ≤5 误套到角色。
- 多文件判定：`turnPaths` 为**本轮已提交的其它路径**（先 `decideAutoApply`，再登记当前 path）。

### 2.2 自动落盘（即使「改完只标黄」）

`shouldPersistAutoToDisk` 为 true 时必须写工作区：

- characters
- dialogue（≤5 行）
- dialogue_choices / dialogue_layout / kmind_layout
- 新文件 / 空文件
- 或用户开启 `applyWritesToDisk`

Android 另有 SAF/杀进程风险：角色与小台词建议与 Win 一样强制落盘（可参考既有 Accept 强制写盘策略，但 **auto 角色不能只停在内存**）。

### 2.3 工具结果公共字段

```json
{
  "ok": true,
  "written": true,
  "pending": false,
  "writeDisk": true,
  "reviewHint": "auto: character_upsert",
  "gateDetail": { "reason": "character_upsert", "kind": "characters", "otherTurnPaths": 0 },
  "toolApi": "2026-08-11-d",
  "note": "..."
}
```

`continuity_check` 另须：`issues[]`、`registeredCast`、`castNote`、`filesScanned`、`toolApi`；**禁止** `excerpts` 全文。

`update_plan_step` 须：`fileWritten`、`contentChanged`、`steps`；**禁止** `fileUpdated`。

`propose_append_dialogue_lines`：文件不存在则建标准 11 列表头；返回 `createdFile` / `headerNote` / `columnOrder`。

### 2.4 必有工具（相对旧 Android 基线可能缺失）

| 工具 | 说明 |
|------|------|
| `propose_upsert_character` | 单行；始终 auto+落盘 |
| `propose_upsert_characters` | 批量一行提案 |
| `workspace_mkdir` / `copy` / `move` / `delete` | 归档用；描述强调勿读后重写 |
| `continuity_check` | 结构化 issues |
| `create_plan` / `update_plan_step` | `plans/*.plan.md` |
| `web_search` / `web_research` / `web_fetch` | snippet 非空 |

### 2.5 System prompt 要点

- `WRITE_GATE_SUMMARY` 含「角色始终 auto；≤5 仅台词行」。
- 有 `toolApi` 说明；缺失则提示用户重启/重装。
- cast 六列 + RFC 4180 说明。
- 归档优先 FS 工具。

---

## 3. 刻意未做 / Backlog（两端共用）

| ID | 项 | 说明 |
|----|----|------|
| B1 | kmind 坐标 vs autoLayout | omit x/y 自动布局后坐标写入 JSON，手动拖动易冲突；需产品决策（不固化 / 分 layout 文件 / 标记 auto） |
| B2 | 幽灵角色硬门禁 | 现仅 `ghostCharacterWarnings` + continuity；未拒绝写 prose |
| B3 | Monaco 级 side-by-side diff | 当前文本 hunk 够用 |
| B4 | Android 本清单对齐 | 本 OPEN 工单 |

---

## 4. Win 源码锚点（Round A–E）

| 主题 | 位置 |
|------|------|
| 门禁 / 落盘 / toolApi | `proposalGate.ts`：`decideAutoApply`、`shouldPersistAutoToDisk`、`TOOL_API_VERSION`、`CHARACTERS_CSV_FORMAT` |
| 幽灵名启发式 | `ghostNames.ts`：`findGhostCharacterHits`（排除已登记 / 章节地名船号；老陈·管事类召回） |
| 提交顺序 | `agentLoop.ts`：`commitProposal` 先判定再 `turnPaths.add` |
| 工具与 prompt | `tools.ts`：upsert(s)、continuity、append、web_search、emitProposal |
| Plan 文件 | `planFiles.ts`：剥裸 checkbox、patch Todos |
| Diff UI | `renderer/.../proposalDiff.ts` + `AiPanel.tsx` |
| 区外附件 | `aiStore` → `.kentucky/refs/` |

---

## 5. 验证清单（任一端）

1. 工具结果含 `toolApi: "2026-08-11-f"`（版本随契约 bump）。
2. `propose_upsert_characters`×6 → `written`+`writeDisk`；磁盘有 6 人。
3. 同轮先 patch `.md` 再 upsert 角色 → 角色仍 auto（`gateDetail.reason=character_upsert`）。
4. `continuity_check` → 有 `issues`，无 `excerpts`；不报第一章/钟楼会/张船票/老人/小字；能报老陈/管事。
5. `update_plan_step` → `fileWritten` 等，无 `fileUpdated`。
6. 新 dialogue append → 自动建表 + `columnOrder`。
7. `web_search` → snippet 非空。
8. 写入结果含 `uiReview`；UI diff/批量仍 **人眼**确认一次。

---

## 6. 反馈原文结论摘要（v2 + 剩余）

- reviewHint **已在用户环境生效**；其余多项曾因主进程未重启被报「未部署」。
- `""人""` **不是缺陷**（RFC 4180）；真问题是 UX/说明。
- 「5 张阈值」为误判；应对齐门禁并给出 `gateDetail`。
- UI 修复 agent 看不到 → 勿再当工具未修；**需人工复核 W9/W10**。
- Round E：幽灵启发式改为模式匹配，降误报、补召回。
- **B1 kmind 坐标仍刻意未做**。

---

## 7. Android 移植最小步骤

1. 对照 §1 总表，在 `android/src/ai-runtime/` 逐项 diff Win（含 **`ghostNames.ts`**）。
2. 优先：`proposalGate` + `emitProposal` 字段 + characters 落盘 + continuity/ghost + append 建表 + plan 返回值。
3. 其次：FS 工具、`propose_upsert_characters`、web_search snippet、AiPanel diff/批量。
4. 真机跑 §5；更新 [`OPEN-agent-tool-feedback-parity.md`](../../android/project-memory/OPEN-agent-tool-feedback-parity.md) 勾选状态。
5. 细节流程见 [`PORTING-WIN-TO-ANDROID.md`](../../android/project-memory/PORTING-WIN-TO-ANDROID.md) 阶段 G。
