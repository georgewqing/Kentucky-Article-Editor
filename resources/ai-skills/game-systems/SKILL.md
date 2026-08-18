---
name: 游戏系统策划
description: >-
  单个游戏系统、玩法循环、规则编号、背包/战斗/经济/任务；system design, game systems, rules. 写入 design/systems/，未定标 [待确认]。
---

# 游戏系统策划

WHEN：设计**一个**系统（背包、技能、经济、任务、社交等）的循环与规则。不要同时开三个系统。数值表交给 `/game-numbers`。

## 落盘

- `design/systems/<系统英文或拼音id>.md`
- GDD 的「系统索引」里加一行链接（若已有 `design/gdd.md`）

## 文档结构

1. 玩家幻想（一句话）
2. 核心循环（动词）
3. **规则**（编号 R1、R2…；未定写 `[待确认]`）
4. 状态与交互
5. 与其它系统依赖
6. 边界 / 失败态
7. 开放问题

## 规则

- 一次只深入一个系统。
- 散文里的数字必须能指到 `design/balance/*.csv` 的列；没有表就不要写死数值，改 `[待确认]` 并建议 `/game-numbers`。
- 先读 `design/gdd.md`（若存在）。

## 禁止

- 用新设定掩盖与世界观/数值的冲突（交给 `/game-consistency` 列两案）
- 假装已经平衡
