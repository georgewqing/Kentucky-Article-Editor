# Agent 工具 · 测试结论基线（干净复盘）

> **记录时间**：2026-08-11（工作区清空后复盘）  
> **测试范围**：随笔 → 艾尔德兰三部曲 15 章 → 归档 → 雾港信使计划 → 多轮连续性校验  
> **工具版本轨迹**：旧版 → `d` → `e` → `f` → **`2026-08-11-g`**（MD patch 修复）  
> **状态**：正式工作区已清空；本文为后续参考基线  
> **权威缺陷/契约表**：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)  
> **Android 对齐**：[`../../android/project-memory/OPEN-agent-tool-feedback-parity.md`](../../android/project-memory/OPEN-agent-tool-feedback-parity.md)

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

## ❌ 四、agent 测试噪声（非工具缺陷）

误判无 FS 权限；CSV `""人""`；reviewHint「未部署」；test1–6 污染 cast。

---

## 📌 五、结论

核心流程已稳定；P3（MD patch）为新发现并已修；P1 仍可打磨。
