# Agent 工具 · 测试结论基线（干净复盘）

> **记录时间**：2026-08-11（工作区清空后复盘）  
> **测试范围**：随笔 → 艾尔德兰三部曲 15 章 → 归档 → 雾港信使计划 → 多轮连续性校验  
> **工具版本轨迹**：旧版 → `d` → `e` → `f` → **`2026-08-11-g`**（MD patch 修复）  
> **状态**：正式工作区已清空；本文为后续参考基线  
> **权威缺陷/契约表**：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)  
> **Android：** 从零独立工程。交接 [`../android-port-brief/`](../android-port-brief/README.md)。忽略旧 BOARD。

---

## ✅ 一、已实证修复（9 项，全部实测通过）

| # | 反馈点 | 验证证据 |
|---|--------|----------|
| 1 | 写入门禁可预测 | `gateDetail` + `reviewHint` |
| 2 | 批量 upsert 始终 auto | 6 张 → `character_upsert` |
| 3 | dialogue append 自动建表头 | `createdFile` + 11 列 |
| 4 | 表头列序告知 | `columnOrder` / `headerNote` |
| 5 | update_plan_step 返回值 | `fileWritten` / `contentChanged` / `steps[]` |
| 6 | 计划双真相源同步 | Todos + Plan-body |
| 7 | continuity 结构化输出 | `issues[]`，无全文 |
| 8 | web_search 带内容 | snippet/excerpt |
| 9 | 归档/移动/删除 | `workspace_move` / `delete` |

---

## ⚠️ 二、残余 / 新修

### P1. continuity 幽灵误报
启发式精度问题；f 轮已挡「钟楼会/张船票/老人」等；完整 POS 不做。

### P2. UI diff/批量 agent 不可见
结果含 `uiReview`；仍需人眼看面板一次。

### P3. `propose_text_patch` 破坏 MD 表格 / `>` — Round G **已修待复验**
- 根因：TipTap 无 Table + `setContent`→`getMarkdown` 往返污染缓冲
- 修复：Table 扩展、`emitUpdate:false`、落盘同步 DocumentHub、read/patch 对齐脏缓冲
- 指纹：`toolApi: "2026-08-11-g"`
- 复验样例：write 含表格+多行引用 → read → patch 一行 → read 格式完好

---

## ⏳ 三、设计取舍

- **kmind 坐标 vs autoLayout**：刻意未做（B1）

---

## 📚 四、Round H · 文学记忆（M1–M4）自测清单

指纹：`toolApi: "2026-08-14-a"`

1. 空工作区随笔：`continuity_check` aspects timeline → `story_state_missing` info，**无** stale  
2. `propose_upsert_story_state` 一章（含 sourcePath）→ 启用；L5 出现计数摘要 + 「Before write / After chapter」调用提示（无道具名）  
3. 故意让 `current.props` 与 rollup 不一致 → `prop_table_conflict`；`assertions:[{prop,holder}]` 失败 → `assertion_failed`  
4. `propose_upsert_foreshadow` open 项 → continuity foreshadow 出 `foreshadow_unpaid`；精确 dueBy=chapter.id 且后续章已写 → overdue  
5. `compare_voice` / `proofread_check` / `reader_critique` 无全文 excerpts  
6. `propose_create_revision` 满 maxRevisionSnaps → 删最旧再写入（结果 `evicted[]`）；restore 正文自动写盘（无 Accept）  
7. **防遗忘**：系统提示含 `Story memory tools (CRITICAL…)`；对启用态章文件 `propose_write_text`/`propose_text_patch` 结果含 `memoryHint`（非 `reviewHint`），同轮应再调 upsert  
8. **voice_anchor**：`propose_set_voice_anchor({default:{notes:"…"}})` 读回非空；误传 `narrator` 应落入 notes；结果含 `schemaHint`  
9. **Agent UI**：`/` 菜单无可见滑块仍可滚；上下文弹层色条按 limit；消息区底部无横向滑块  

---

## ❌ 五、agent 测试噪声（非工具缺陷）

误判无 FS 权限；CSV `""人""`；reviewHint「未部署」；test1–6 污染 cast。

---

## 📌 六、结论

核心流程已稳定；P3（MD patch）已修；Round H 文学记忆 + 防遗忘 + voice_anchor schema + Agent UI（`/` / 上下文 / 滑块）已落地 Win（Android OPEN：literary + agent-ui）。
