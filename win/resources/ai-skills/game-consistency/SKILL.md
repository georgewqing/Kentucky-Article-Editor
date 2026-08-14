---
name: 游戏设定一致性
description: >-
  跨文档矛盾、世界观与数值打架、台词与 GDD 不一致；consistency, lore conflict, contradiction. 列两案不硬圆。扫 design/ 与文学 YAML、角色台词。
---

# 游戏设定一致性

WHEN：用户要找矛盾、对稿、发售前检查、或觉得「设定和表对不上」。本 skill **不发明新玩法**。

## 扫描范围（有文件就读）

- `design/`（gdd、concept、systems、narrative、levels、balance csv、marketing）
- 文学记忆：`story_state.yaml`、`foreshadow.yaml`、`glossary.yaml`、`voice_bank.yaml`
- `characters.csv` 与相关 `*.dialogue.csv` / choices
- 可建议再跑工具 `continuity_check`（文学侧）

## 输出格式

对每个问题：

1. **冲突**：引用两边原文/字段（短）
2. **案 A / 案 B**：改文档还是改表/改台词，不要编第三套设定把两边圆上
3. **建议谁拍板**（玩法 vs 叙事 vs 数值）

典型：世界缺水但商店无限卖补给；GDD 无某系统但 Steam 文案在卖；角色 id 与台词 speaker 不一致。

## 禁止

- 硬圆（「其实商店进了流水线」而无 GDD 依据）
- 顺手大改数值或重写整章（只列案，用户选了再用对应 skill 改）
