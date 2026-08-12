# 契约：文学记忆（H1–H4 / Round H）

> **状态**：OPEN / 未开始移植  
> **Win 指纹**：`toolApi: "2026-08-11-j"`  
> **进度**：[`../BOARD.md`](../BOARD.md)  
> **Win 源**：[AGENT-TOOL-FEEDBACK](../../../win/project-memory/AGENT-TOOL-FEEDBACK.md) · [REQ](../../../win/project-memory/REQ-literary-agent-capability-upgrade.md) · [基线 §四](../../../win/project-memory/AGENT-TOOL-TEST-BASELINE.md)  
> **勿 import `win/`**；IO 一律 `WorkspaceIo`

## 0. 先决条件（移植 Round H 之前）

建议先完成（或至少并行排期）总 OPEN 中的：

| 优先级 | ID | 为何挡路 |
|--------|-----|----------|
| P0 | W1 / W1b | 无 `toolApi` / 记忆 YAML 无法「强制落盘」则 continuity 永远读到空表 |
| P0 | W3 | continuity 必须已是 `issues[]`、无 `excerpts` |
| P1 | W19 | MD 外部写入 / Accept 后缓冲同步（restore 正文依赖同类路径） |

Round H **可以**在 W 项未全绿时开始拷贝纯逻辑模块（YAML schema / 断言），但 **不得**标「AI 已对齐」直到 H1–H4 + 相关 W 项通过真机验收。

---

## 1. Win → Android 文件映射

| Win（源真相） | Android 目标 | 改造要点 |
|---------------|--------------|----------|
| `win/src/main/ai/yamlUtil.ts` | `android/src/ai-runtime/yamlUtil.ts` | 依赖 `js-yaml`（或等价）；无 Node 特有 API |
| `win/src/main/ai/storyState.ts` | `ai-runtime/storyState.ts` | 纯逻辑；读写由调用方注入 bytes |
| `win/src/main/ai/foreshadow.ts` | `ai-runtime/foreshadow.ts` | 同上 |
| `win/src/main/ai/voiceFiles.ts` | `ai-runtime/voiceFiles.ts` | 含 `compareVoiceStats` 薄统计 |
| `win/src/main/ai/glossaryMaterials.ts` | `ai-runtime/glossaryMaterials.ts` | 列目录改 `WorkspaceIo.readdir` |
| `win/src/main/ai/revisions.ts` | `ai-runtime/revisions.ts` | `cpSync/mkdir` → WorkspaceIo copy/mkdir；**禁止** Git/Shell |
| `win/src/main/ai/proofread.ts` | `ai-runtime/proofread.ts` | 纯启发式 |
| `win/src/main/ai/literaryContinuity.ts` | `ai-runtime/literaryContinuity.ts` | `runLiteraryContinuity`；`buildStoryStateL5Summary` 可 re-export 自 memoryNudge |
| `win/src/main/ai/memoryNudge.ts` | `ai-runtime/memoryNudge.ts` | **防遗忘**：`memoryToolsDisciplinePrompt` / `proseMemoryHint` / L5 CTA；散文结果字段 `memoryHint`（勿塞进 reviewHint） |
| `win/src/main/ai/literaryTools.ts` | 并入 `ai-runtime/tools.ts` 或独立 `literaryTools.ts` 再由 tools 调用 | **所有** `readFileSync/writeFileSync/join` → WorkspaceIo + pathUtil；description 保留 CALL WHEN 措辞 |
| `win/src/main/ai/proposalGate.ts` | `ai-runtime/proposalGate.ts` | 同步 `ProposalKind` + `MEMORY_KINDS` + `TOOL_API_VERSION` |
| `win/src/main/ai/tools.ts` | `ai-runtime/tools.ts` | 注册工具定义、`continuity_check` aspects、`PLAN_TOOLS`/`OUTLINE_TOOLS`、系统提示 |
| `win/src/main/ai/agentLoop.ts` | `ai-runtime/agentLoop.ts` | L5：`buildStoryStateL5Summary` 注入 Editor context |
| `win/src/main/ai/aiSettings.ts` | `ai-runtime/aiSettings.ts` | 增加 `maxRevisionSnaps`（默认 20） |
| `win/src/main/ai/chatSessions.ts` | `ai-runtime/chatSessions.ts` | `FileProposal.kind` 联合类型扩展 |
| `win/dev-data/data/ai-skills/reader-critique/SKILL.md` | Android skills 目录等价路径 | 应用私有 `kentucky-data/ai-skills/`（非工作区） |

**工作区文件（跨端同一约定，用户可见）**

| 相对路径 | 角色 | 创建策略 |
|----------|------|----------|
| `story_state.yaml` | 章级状态 + `current`；M3 起可有 `scenes[]` | **按需**；首次 upsert 才创建 |
| `foreshadow.yaml` | 伏笔台账 | 按需 |
| `voice_anchor.yaml` | 风格锚点 | 按需 |
| `voice_bank.yaml` | 角色声线（**不**进 `characters.csv`） | 按需 |
| `glossary.yaml` | 译名 | 按需 |
| `materials/` + `materials/index.yaml` | 素材库 | 按需；正文 `.md` 按 prose 门禁 |
| `revisions/manifest.yaml` + `revisions/snaps/<id>/` | 文件快照（非 Git） | 按需；满额拒建 |

`.kentucky/` **不**放上述世界书文件（仅 refs 等工具内部状态）。

---

## 2. 工具清单与模式白名单

### 2.1 只读（plan / outline / agent）

`read_story_state` · `read_foreshadow` · `read_voice_anchor` · `read_voice_bank` · `compare_voice` · `read_glossary` · `list_materials` · `search_materials` · `list_revisions` · `reader_critique` · `proofread_check` · `read_scene_state` ·（扩展后的）`continuity_check`

### 2.2 写入（仅 agent）

`propose_upsert_story_state` · `propose_upsert_foreshadow` · `propose_set_voice_anchor` · `propose_upsert_voice` · `propose_upsert_glossary` · `propose_upsert_material` · `propose_upsert_scene` · `propose_create_revision` · `propose_restore_revision` · `propose_upsert_volume`

### 2.3 `continuity_check` aspects（Win 已扩）

`character` | `timeline` | `prop` | `foreshadow` | `scene` | `voice` | `glossary` | `proof`

可选参数（**进 M1 冻结面**）：

- `chapterId?: string` — 加速，非唯一开关  
- `assertions?: Array<{ prop?, holder?, location?, character?, characterStatus? }>` — 空/`[]`/缺省 = 忽略；未知字段忽略  

---

## 3. 写入门禁（必须与 Win 一致）

`ProposalKind` 新增并加入 `MEMORY_KINDS`（行为对齐 characters）：

`story_state` · `foreshadow` · `voice_anchor` · `voice_bank` · `glossary` · `materials_index` · `revision_meta`

| 规则 | 行为 |
|------|------|
| 记忆类 YAML | **始终 auto** + **强制落盘**（`shouldPersistAutoToDisk`），即使全局「仅标脏」 |
| `forceReviewAllWrites` | 仍可压成 pending |
| `materials/<slug>.md` | **prose**（新建 auto；覆盖现有 → Accept） |
| `materials/index.yaml` | `materials_index` → auto+强制盘 |
| `propose_restore_revision` 正文 | prose/other → **Accept**；Accept 后同步脏缓冲（对齐 DocumentHub / Android 等价缓冲） |
| 故事语义冲突 | **永不**改变 `decideAutoApply`；只出 `issues[]` |

`gateDetail.reason` 记忆类：`memory_yaml_upsert`。  
`toolApi` 必须与 Win 当前字符串一致（移植完成时至少 `2026-08-11-j`；若 Win 已再 bump 则以 Win 为准）。

路径推断（`inferKind`）需识别 basename：

- `story_state.yaml` / `foreshadow.yaml` / `voice_anchor.yaml` / `voice_bank.yaml` / `glossary.yaml`
- `materials/index.yaml`
- `revisions/manifest.yaml`

---

## 4. 核心语义（移植时勿改）

### 4.1 启用态（stale + L5 共用）

```
enabled = story_state.yaml 存在 AND chapters.length >= 1
```

- 未启用：不报 `story_state_stale`；不注入 L5 状态摘要  
- `story_state_missing`：**info**，仅当用户/aspect 明确要查 prop/timeline/foreshadow 但无表  

### 4.2 Stale 映射

1. 若至少一条 chapter 有 `sourcePath`：focus 路径规范化后无命中 → `story_state_stale` **warn**  
2. 若全部无 `sourcePath`：不报路径 stale；报 **info** `story_state_unlinked`  
3. 可选 `chapterId` 不存在于表 → `story_state_stale` warn  

路径规范化：反斜杠→`/`、去 `./`、小写比较（与 Win `normRelPath` 一致）。

### 4.3 道具断言（诚实工具）

- **只做表内一致性**（如 rollup props vs `current.props`、`propsNew` 缺失等）→ `prop_table_conflict`  
- **禁止**在正文里搜道具名（幽灵名误报教训）  
- `assertions[]`：模型提出，工具只对照表 → `assertion_failed`  

### 4.4 伏笔

- 始终可列 open → `foreshadow_unpaid`（info，事实清单）  
- `foreshadow_overdue`：**仅当** `dueBy` **精确等于**某 `chapter.id`，且 chapters 数组序上已有更晚章，且仍 `open`  
- 自由文本 dueBy（如「第三部」）→ **永不**自动 overdue  

### 4.5 Schema 演进

- M1 冻结：`version` + `current{location,dayOffset,props,characterStatus}` + `chapters[]`（字段见需求/Win `storyState.ts`）  
- M3：**同文件增量** `scenes[]` + 可选 `current.sceneId`；解析**忽略未知键**  
- **禁止**独立 `scene_state.yaml`  

### 4.6 L5 摘要

启用态才注入；计数部分尽量 ≤~200 字，只含：

- `location`（截断）  
- `dayOffset`  
- 道具**数量**  
- open 伏笔**数量**  

另附短 CTA（可略超预算）：`Before write: read_story_state. After chapter: propose_upsert_story_state+sourcePath.` — **优先保留 CTA**，必要时截断 counts。

**禁止**注入道具名、伏笔标题/正文。摘要防忘；关键操作仍 `read_story_state` / `read_foreshadow`。

Win 挂载点：`agentLoop` → Editor context（紧挨 cast 摘要）；实现见 `memoryNudge.buildStoryStateL5Summary`（`literaryContinuity` 可 re-export）。

### 4.6b 防遗忘（`memoryNudge`，与 M1 语义正交）

| 机制 | 行为 | 禁止 |
|------|------|------|
| 系统提示块 | `memoryToolsDisciplinePrompt()` 并入 LITERARY system prompt：写前读 / 写后 upsert / 伏笔 / 声线 / 快照时机；随笔勿脚手架 | 改 `decideAutoApply`；把语义冲突做成硬门禁 |
| `memoryHint` | 散文 `propose_write_text` / `propose_text_patch` 结果附加；启用态催同轮 upsert；章路径未启用则轻量提示可开启 | 塞进 UI `reviewHint`；对 materials/plans 乱刷 |
| 工具 description | 关键 literary 工具以 `CALL WHEN/BEFORE/AFTER…` 起头 | 仅列 schema 无时机 |

移植时：`emitProposal` 同 Win 挂 `proseMemoryHint`；系统提示同调 `memoryToolsDisciplinePrompt`。

### 4.7 Voice / 读者 / 出版

| 能力 | 工具行为 | 禁止 |
|------|----------|------|
| `compare_voice` | 句长 / 口头禅命中等薄统计 → `voice_drift` issues | 工具内嵌套 LLM；全文 dump |
| `reader_critique` | 骨架：persona、字数、标题 hint、glossary 条目数；`issues: []` | 假校对引擎；嵌套 LLM；章文进 tool result |
| `proofread_check` | 引号配对、重复标点、小词表、代码围栏 | 完整拼写引擎 / 云端校对 |

#### 4.7.1 `voice_anchor` schema（易踩坑 · 指纹 j）

文档形状：

```yaml
version: 1
default:
  person: third          # 合法键见下
  tense: past
  sentence: 短句
  metaphorDensity: low
  lexicon: …
  notes: 冷静旁白
byPov:
  <povId>: { …同块键… }
```

**合法块键**：`person` · `tense` · `sentence` · `metaphorDensity` · `lexicon` · `notes`。  
**禁止依赖 `narrator`**：读回 `parseBlock` 会剥掉未知键 → `default:{}` 假空。写入时 `narrator` **仅作 alias→`notes`**（`mergeVoiceAnchorBlock`）。  
工具参数须声明上述 properties；`read`/`set` 结果附 `schemaHint`（`voiceAnchorSchemaHint()`）。  
亦接受把 person/tense/… 误放在 **顶层**（无 `default` 包装）时，合并进 `default`。

### 4.8 Revisions

- 目录：`revisions/snaps/<id>/files/` 镜像相对路径 + `meta.yaml`；索引 `revisions/manifest.yaml`  
- `maxRevisionSnaps`（设置，默认 20，建议 clamp 1–100）  
- 满额 → **报错拒建**，提示删旧；**禁止**自动删最旧  
- 无 Git、无 Shell  

---

## 5. Issue kinds 速查（continuity / compare / proof）

| kind | severity | 来源 |
|------|----------|------|
| `empty_cast` / `ghost_character` / `cast_ok` / `missing_file` | error/warn/info | 既有 character |
| `story_state_missing` | info | 无表且查了 story aspects |
| `story_state_stale` | warn | 启用 + 路径/章未登记 |
| `story_state_unlinked` | info | 启用但全无 sourcePath |
| `prop_table_conflict` | warn | 表内道具不一致 |
| `assertion_failed` | warn | assertions 与表不符 |
| `timeline_day_gap` | info | dayDelta 累加异常（弱） |
| `foreshadow_unpaid` | info | open 清单 |
| `foreshadow_overdue` | warn | 精确 dueBy 过期 |
| `scene_cast_mismatch` / `scene_prop_mismatch` | warn/info | M3 scene |
| `voice_drift` | warn/info | compare_voice / aspect voice |
| `name_inconsistency` | warn | glossary（宁可漏报） |
| `quote_unbalanced` / `typo_suspect` / `format_glitch` | warn/info | proof |

信封附加（continuity）：`storyStateSummary`、`foreshadowOpenCount`、`storyEnabled`；**禁止** `excerpts` 全文。

---

## 6. Android 特有风险（Round H）

1. **记忆 YAML 强制落盘**：与 cast 相同，杀进程后 `continuity_check` 必须能读到 upsert 结果；禁止只标脏。  
2. **`propose_restore_revision`**：多文件同轮可能 multi-file pending；正文 Accept 后必须刷新打开中的编辑缓冲（对照 Win `docApplyExternalWrite` / Android Accept 强制写盘路径）。  
3. **`revisions/snaps` 树拷贝**：SAF/WorkspaceIo 需支持递归 mkdir + 按相对路径写文件；大章注意配额与进度。  
4. **`list_materials` / search**：目录枚举走 WorkspaceIo；index 缺失时回退扫 `materials/*.{md,txt,yaml}`。  
5. **js-yaml**：确认 Android 打包（Vite）能打进 `ai-runtime`；若体积敏感可抽「本 schema 子集」但必须保持 dump/load 与 Win 互操作（用户可能 Win/Android 换端打开同一文件夹）。  
6. **设置项 `maxRevisionSnaps`**：Preferences / settings JSON 读写；UI 可后做，但设置字段要能读写。  
7. **Skills**：`reader-critique` 拷到 Android skills 根；`list_skills`/`read_skill` 能发现。  
8. **窄宽抽屉**：restore 多提案卡 + diff 仍须可滚可点（≤1100px）。

---

## 7. 建议移植顺序（Android）

1. **门禁**：`proposalGate` MEMORY_KINDS + kind 推断 + `TOOL_API_VERSION`  
2. **纯模块**：yamlUtil → storyState → foreshadow →（可测表内断言）  
3. **literaryContinuity + continuity_check 接线**（H1）  
4. **literary 读写工具** upsert/read（WorkspaceIo）  
5. **L5 + memoryNudge** agentLoop / system prompt / emitProposal.`memoryHint`  
6. **H2** voice  
7. **H3** scenes + revisions  
8. **H4** glossary / materials / proofread / reader_critique + skill  
9. **真机**跑 §8 验收；勾选 OPEN H1–H4  

---

## 8. 验收清单（与 Win 基线 §四对齐）

指纹：结果含 `toolApi`（与 Win 当前一致，至少 `2026-08-11-j`）。

1. 空工作区随笔：`continuity_check` aspects 含 timeline → `story_state_missing` info，**无** stale，**无** L5 状态摘要  
2. `propose_upsert_story_state` 一章（含 `sourcePath`）→ 启用；L5 出现计数摘要 + 调用 CTA（无道具名/伏笔正文）  
3. 表内道具冲突 → `prop_table_conflict`；`assertions` 失败 → `assertion_failed`；**正文搜道具名不得存在**  
4. foreshadow open → `foreshadow_unpaid`；精确 `dueBy=chapter.id` 且后续章已写 → `foreshadow_overdue`  
5. `compare_voice` / `proofread_check` / `reader_critique`：**无**全文 excerpts；reader 为骨架  
6. create revision 至 `maxRevisionSnaps` → 报错拒建；restore 正文 pending Accept，Accept 后内容回到快照  
7. `materials/*.md` 覆盖现有 → Accept；`glossary` upsert → auto 且杀进程后仍在盘上  
8. 与 Win 同工作区文件夹（若可挂载）互读 YAML 不炸  
9. **防遗忘**：系统提示含 `Story memory tools (CRITICAL…)`；启用态章文件写入结果含 `memoryHint`（非 `reviewHint`）  

全部通过后：将本文件状态改为 **CLOSED**，`BOARD.md` 中 H1–H4 打 ✅，`changelog.md` 留一条。

---

## 9. Grill 定稿摘要（勿在移植时推翻）

详见 Win 计划 / 需求讨论；Android 必须遵守：

1. M1 契约冻结，后续只增不改；空数组/未知字段忽略  
2. 冲突只警告；反转靠显式 upsert  
3. 启用态 = 文件 + ≥1 章；按需创建、不脚手架  
4. 提醒靠 continuity，不污染每条 write 的 reviewHint  
5. 工具不装假智能；禁止工具内嵌套 LLM；禁止正文道具启发式  
6. 快照满额报错不自动删；restore 走提案通道  
7. glossary auto；materials 正文 prose  

---

## 10. 相关文档

- Win 实现入口：`win/src/main/ai/literaryTools.ts`（工具总表）  
- Win continuity 扩展：`win/src/main/ai/literaryContinuity.ts`  
- 总 Agent 反馈 OPEN：[`BOARD.md`](../BOARD.md)  
