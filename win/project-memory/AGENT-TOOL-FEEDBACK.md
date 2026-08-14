# Agent 工具反馈总清单（Win 已修 · Android 待对齐）

> **权威清单**：创作侧长会话反馈 → 工具侧缺陷与修复对照。  
> Win 实现以本文件 + 源码为准；Android **必须按本清单逐项移植**，不得只抄 UI。  
> 会话交接短文：[`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md)  
> Android 进度板：[`../../android/project-memory/BOARD.md`](../../android/project-memory/BOARD.md) · 入口 [`README.md`](../../android/project-memory/README.md)

| 字段 | 值 |
|------|-----|
| 反馈来源 | `test2/tool_feedback.md`（v1 → v2） |
| Win 轮次 | Round A/B/C/D（2026-08-11） |
| 部署指纹 | 写入类工具结果须含 `toolApi: "2026-08-14-a"` |
| Git 专档 | [`AGENT-GIT.md`](./AGENT-GIT.md)（SCM + Agent 完整契约 §80–89；**§121 不向上找父仓**） |
| 本机沙箱 | [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)（Win IPC / 工作区根 / 导航锁；Android 移植时须对齐，不得只抄 UI） |
| 测试基线 | [`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)（9 项实证） |
| Android 状态 | **未对齐**（见 [`BOARD.md`](../../android/project-memory/BOARD.md)） |

---

## 0. 跨端原则

1. **业务规则两端一致**：写入门禁、工具名/schema、返回字段语义、continuity 结构、Plan 文件协议。
2. **IO 层不同**：Win = Node `fs`（`win/src/main/ai/`）；Android = `WorkspaceIo`（`android/src/ai-runtime/`）。移植时改执行体，不改契约。
3. **UI 项 agent 观测不到**：diff hunk、只读变更卡在面板上；应用结果字段给 agent，面板给人。**无** Accept / 批量 Apply。
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
| **W1b** | 角色 upsert 在「只标黄」时不写盘 → 幽灵 cast | P0 | ✅ 现恒强制写盘 | ❌ 须 `WorkspaceIo.write` | 角色 upsert 后磁盘立刻有行；continuity 能看见 |
| **W1c** | 误以为「≥5 张角色 → pending」 | P0 澄清 | ✅ 无此阈值（历史 ≤5=台词行） | ❌ 勿恢复旧门禁 | 5–6 张 + 同轮改正文仍写盘 |
| **W2** | 归档不知 `workspace_copy/move`，读后重写 | P1 | ✅ 描述+系统提示 | ❌ | agent 用 FS 工具归档，不抄写 |
| **W3** | `continuity_check` dump 全文 | P0 | ✅ `issues[]`，无 `excerpts` | ❌ | 无全文；有 `registeredCast`/`castNote` |
| **W3b** | 幽灵误报（第一章/钟楼/白鲸号）且漏报真名 | P0 | ✅ Round E–F `ghostNames.ts` | ❌ | 报老陈/管事；不报章节地名船号与「张船票/老人」类；排除已登记 |
| **W4** | 幽灵角色（卡 pending 正文已用） | P1 | ⚠️ warn only（启发式已换） | ❌ | prose 可有 `ghostCharacterWarnings`；硬门禁仍 backlog |
| **W5** | Plan 双真相（Todos vs Plan 正文 checkbox） | P1 | ✅ 同步+剥裸 checkbox | ❌ | `update_plan_step` 改 Todos 且同步带 id 的 Plan 行 |
| **W6** | `update_plan_step` 的 `fileUpdated` 交替误导 | P1 | ✅ `fileWritten`/`contentChanged`/`steps` | ❌ | **禁止**再返回 `fileUpdated` |
| **W7** | dialogue 列序静默重排不告知 | P2 | ✅ `columnOrder`/`headerNote` | ❌ | append 结果含列序说明 |
| **W8** | append 新 `.dialogue.csv` 报 File not found | P1 | ✅ 自动建 11 列表头 | ❌ | 不存在则建表，不报错 |
| **W9** | 无 diff 预览 | P2 | ✅ 文本 hunk UI + 结果 `uiReview` | ❌ | **需人工**看 AiPanel；agent 见 `uiReview` 勿重复报缺 |
| **W10** | 无批量 Accept/Reject | P2 | ⏭ **已废止** Accept；只读卡（U13） | ❌ 勿做旧批量 Accept | 对齐 U13；见 BOARD W9 |
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

### 2.0 当前写入契约（覆盖 2.1 历史门禁）

Win **U13/U14** 之后（changelog §80 起，当前 `toolApi: 2026-08-14-a`）：

| 项 | 现行 |
|----|------|
| `decideAutoApply` | **恒 `auto: true`**（reason/kind 仅遥测） |
| `shouldPersistAutoToDisk` | **恒 `true`** |
| Accept / Reject / 底部 pending 条 | **无** |
| `commitProposal` | 写盘后 `status='applied'`，**必须 upsert** `session.proposals`（否则改动卡空白） |
| 黄● | 相对上次 Ctrl+S / 打开 / Git 重载的 baseline，不是「未 Accept」 |
| 误改 | Source Control 丢弃 / Undo |

`forceReviewAllWrites` 加载强制 false，设置 UI 已移除。移植时 **禁止** 再实现 multi_file → pending。

### 2.1 历史门禁（禁止恢复）

下列是 U13 之前的规则，**只作对照，不要按此实现**：

- `forceReviewAllWrites` → 全部 pending。
- dialogue：行数 `changeCount ≤ 5` 可 auto；更大或多文件 → Accept。
- 已有 prose / kmind / performance / 多文件内容 → Accept。
- **没有「角色卡 ≥5 张 → pending」**；勿把台词 ≤5 误套到角色。

仍有效的澄清：`turnPaths` 为遥测；`update_plan_step` Soft 写计划不进内容门控；`propose_append_dialogue_lines` 返回 `addedLineIds`；`setCurrent:false` 用 `asBool`。

### 2.2 自动落盘

所有 Agent 写入走 `applyProposalToDisk`。Android SAF/杀进程：必须真 `WorkspaceIo.write`，不能只标脏。

历史「仅 characters / ≤5 行台词 / layout 强制落盘」已被恒 true 取代。

### 2.3 工具结果公共字段

```json
{
  "ok": true,
  "written": true,
  "pending": false,
  "writeDisk": true,
  "reviewHint": "auto: character_upsert",
  "gateDetail": { "reason": "character_upsert", "kind": "characters", "otherTurnPaths": 0 },
  "toolApi": "2026-08-14-a",
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
| `git_status` / `git_diff` / `git_log` / `git_pull` / `git_push` / `git_add` / `git_commit` / `git_remote_*` | 见 [AGENT-GIT.md](./AGENT-GIT.md)；**无** force；立即执行；Android 本版 ⏭ |
| `propose_kmind_edit` | 含 shape/子树；非法 id → `skipped`/`warnings` |
| `propose_reorder_dialogue_lines` | 可返回 `openingChanged`（CSV 首行=开场） |
| `propose_dialogue_performance` | 校验 font_size / text_color |

### 2.5 System prompt 要点

- `WRITE_GATE_SUMMARY`：已写盘；勿提 Accept；误改 → SCM。黄● 至 Ctrl+S。
- 有 `toolApi` 说明；缺失则提示用户重启/重装。
- cast 六列 + RFC 4180 说明。
- 归档优先 FS 工具。
- 长篇：写章后 `propose_upsert_story_state`（带 sourcePath）+ foreshadow；continuity 冲突只警告。

### 2.6 Round H · 文学记忆（M1–M4）契约摘要

> **Android 完整移植书**：[`../../android/project-memory/open/literary-memory.md`](../../android/project-memory/open/literary-memory.md)

| 项 | 契约 |
|----|------|
| 指纹 | `2026-08-14-a` |
| 工作区文件 | 按需：`story_state.yaml` / `foreshadow.yaml` / `voice_*.yaml` / `glossary.yaml` / `materials/` / `revisions/` |
| 启用态 | 状态表存在且 `chapters.length≥1`（stale + L5） |
| 门禁 | `MEMORY_KINDS` → auto+强制落盘；`materials/*.md`→prose；restore 正文→**自动写盘**（无 Accept，见 U13/U14） |
| continuity aspects | + `foreshadow`/`scene`/`voice`/`glossary`/`proof`；可选 `chapterId`、`assertions[]`；未知角色状态 → `unknown_character` |
| 道具 | **仅表内** + assertions；**禁止**正文搜道具名 |
| 伏笔 | unpaid 清单；overdue 仅精确 chapter.id |
| L5 | 启用态：地点/dayOffset/道具数/open伏笔数 + 「Before write / After chapter」CTA |
| 防遗忘 | `memoryNudge.ts`：系统提示 CRITICAL 清单；散文写入结果 `memoryHint`（**非** reviewHint）；工具 description 含 CALL WHEN |
| voice_anchor | 合法键 person/tense/sentence/metaphorDensity/lexicon/notes；`narrator`→notes；读写带 `schemaHint` |
| Agent UI（另 OPEN） | `/` skills+commands（可滑无滑块）；`contextEstimate` buckets；色条按 **limit**；冷灰蓝色板；消息区 `overflow-x:hidden` — Android：[`open/agent-ui.md`](../../android/project-memory/open/agent-ui.md) |
| 禁止 | excerpts 全文；工具内嵌套 LLM；脚手架空壳；独立 scene_state.yaml；Git |

Win 实现入口：`literaryTools.ts` / `literaryContinuity.ts` / `memoryNudge.ts` / `storyState.ts` / `foreshadow.ts` / `voiceFiles.ts` / `revisions.ts` / `glossaryMaterials.ts` / `proofread.ts`。

---

## 2b. Git / SCM（Agent + UI）

**完整契约**：[AGENT-GIT.md](./AGENT-GIT.md)（勿在本表重复维护细节）。

| 项 | 当前态 |
|----|--------|
| 指纹 | `toolApi: "2026-08-14-a"` |
| 建仓 | 打开工作区 `ensureWorkspaceGit`；**只看本根 `.git`，不向上**（§121）；点文件对 UI/`list_dir` 隐藏 |
| 工作区根 | 拒盘符根 / 系统目录 / `C:\Users` / 用户主目录；见 [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) |
| Agent 工具 | status/diff/log/pull/push/add/commit/remote_add/remote_remove — 全部立即执行；**`git_diff` 越界与 `git_add` 同为 `Path escapes workspace: <完整路径>`**（§123） |
| 写反馈 | 高亮卡 + Toast（无 Confirm；`-g` 已废） |
| 本地 remote | 可含空格；缺失 → `git init --bare`（add/push） |
| 新对话 | Git (L5) + `GIT_AGENT_PLAYBOOK` |
| 禁止 | force / Shell / 任意 argv |
| Android | 详约 [`../../android/project-memory/open/auto-apply-git.md`](../../android/project-memory/open/auto-apply-git.md)；**要移植**（BOARD U16/U17 ❌；isomorphic-git）；Win 真源 [AGENT-GIT.md](./AGENT-GIT.md) |

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
| Git | `main/git/gitService.ts` · `registerGitIpc.ts` · `tools.ts` git_* · `agentLoop` commitGitOp/L5 · `AiPanel` GitResultCard — 见 [AGENT-GIT.md](./AGENT-GIT.md) |

---

## 5. 验证清单（任一端）

1. 工具结果含 `toolApi: "2026-08-14-a"`（版本随契约 bump；清单里更早的 d/f/g/h/i/j/q 仅作历史）。
2. `propose_upsert_characters`×6 → `written`+`writeDisk`；磁盘有 6 人。
3. 同轮先 patch `.md` 再 upsert 角色 → 角色仍 auto（`gateDetail.reason=character_upsert`）。
4. `continuity_check` → 有 `issues`，无 `excerpts`；不报第一章/钟楼会/张船票/老人/小字；能报老陈/管事。
5. `update_plan_step` → `fileWritten` 等，无 `fileUpdated`。
6. 新 dialogue append → 自动建表 + `columnOrder`。
7. `web_search` → snippet 非空。
8. 写入结果含 `uiReview`；UI diff/批量仍 **人眼**确认一次。
9. **Round H**：见 [`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md) §四；Android 详约见 [`open/literary-memory.md`](../../android/project-memory/open/literary-memory.md)。

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
4. **Round H**：按 [`open/literary-memory.md`](../../android/project-memory/open/literary-memory.md) 移植文学记忆；勾选 [`BOARD.md`](../../android/project-memory/BOARD.md) H1–H4。
5. 真机跑 §5 + 基线 §四；更新 [`BOARD.md`](../../android/project-memory/BOARD.md) 勾选；细节见 [`PORTING-WIN-TO-ANDROID.md`](../../android/project-memory/PORTING-WIN-TO-ANDROID.md) 阶段 G。
