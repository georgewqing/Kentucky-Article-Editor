---
name: 游戏设计文档
description: >-
  活 GDD、游戏设计文档、逐节填写、升格 concept；GDD, game design document, living spec. 首次只写 design/gdd.md 空节骨架。
---

# 游戏设计文档

WHEN：用户要建/改活 GDD、把创意升格成规格、补某一节。不要一次灌满全文。

## 路径

- 活文档：**`design/gdd.md`**（硬约定）
- 若存在 `design/concept.md`，升格前先读，把已砍范围带进 GDD，然后注明 concept 已吸收（可留文件作历史）

## 第一次落盘

若 `design/gdd.md` 不存在：只写**带空节标题的骨架**，每节下一行 `<!-- 待填 -->`，不要写长文。建议节：

1. 卖点 / Pitch
2. 核心循环
3. 玩家幻想与范围（含非目标）
4. 系统索引（链到 `design/systems/`）
5. 叙事与世界（轻量则写「叙事服务玩法，细节见 narrative/」）
6. 关卡与节奏（链到 `design/levels/`）
7. 数值与表（链到 `design/balance/`，数字不进散文）
8. 音频 / 画面（各三行以内）
9. 技术约束（引擎一句；不写实现）
10. 开放问题 `[待确认]`

然后问用户下一节填哪一块。

## 之后

- 一次只填用户点名的节。
- 散文禁止发明 `design/balance/*.csv` 里没有的数字；引用写成表名与列。
- 系统细节放到 `design/systems/<系统>.md`，GDD 只留索引。

## 禁止

- 一轮写完可交给发行的巨文档
- 无用户要求时改 Steam 文案（`/game-store`）
