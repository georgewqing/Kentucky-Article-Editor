---
name: 游戏叙事文案
description: >-
  游戏剧情、世界观规则、角色声线、任务文本、对白；narrative, lore, branching, dialogue. 对白走 .dialogue.csv / characters.csv，先读 glossary。
---

# 游戏叙事文案

WHEN：世界观、角色弧、分支、任务/物品描述、对白。结构用本文；具体对白用 Kentucky 台词工具，不要另造剧本格式。

## 必读（有则先读）

- `design/gdd.md`、`design/concept.md`、`design/narrative/`
- `glossary.yaml`、`story_state.yaml`、`voice_bank.yaml` / `voice_anchor.yaml`
- `characters.csv`
- 相关 `*.dialogue.csv` 与 choices

## 落盘

- 设定、任务文本、物品描述 → `design/narrative/` 下 md
- **对白** → 现有 `*.dialogue.csv`（协议 v1.3：speaker=角色 id，options，空 text 链）。用 `read_dialogue` / `propose_dialogue_graph` 等，不要写 `.fountain` / 独立剧本文件
- 写对白前对照同目录 **`examples.md`**（合格短句 + 有代价选项；不合格清单）
- 新角色先 `propose_upsert_character`，再写台词
- 写完对白：`dialogue_cast_check`

## 规则

- 先写世界**能发生 / 不能发生**，再写故事。不能发生的事不要用新设定硬圆。
- 分支要有代价；可忽略的选项不要假装重要。
- 声线跟 `voice_bank` / 角色表；漂移就标出来。
- 叙事服务玩法：GDD 写明「叙事轻量」则短写。

## 禁止

- 与 `characters.csv` / glossary 矛盾还不声明
- 把对白只写在 md 里让程序无法导入 Godot
