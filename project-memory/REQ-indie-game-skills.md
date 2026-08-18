# 需求 · 独立游戏文案 / 策划 Agent 技能包

> **状态**：已定稿落地（changelog **§124–§126**）  
> **Grill**：文学 + 游戏策划双主线；8 个中文 skill 默认开；`design/` 硬约定；copy-if-missing + `seenBundledSkillIds`  
> **产品表**：[`product-decisions.md`](./product-decisions.md) Skills 行

Kentucky 已有文学写作、台词图、导图、分镜。本包给独立游戏的**文案与策划**加可开关的全局 `SKILL.md`，不引入子 Agent、不执行 skill 脚本、不做数值仿真器。

## 参考（可借 / 不抄）

| 来源 | 可借 | 不抄 |
|------|------|------|
| [chantezy/game-skills](https://github.com/chantezy/game-skills) | 按职能拆 skill，任意阶段介入 | 强制流水线 |
| [AIGD](https://github.com/ProdaZhang/aigd-zh) | 规则编号、数字进表、`[待确认]` | `config_check` 脚本 |
| [策划桌 Swarm 实验](https://gitcode.csdn.net/6a0c3b5810ee7a33f273b797.html) | 一致性编辑、数值标假设、冲突两案 | 多 Agent |
| [ityes22 GDD skill](https://explainx.ai/skills/ityes22/game-design-document/game-design-document) | 章节清单、叙事轻量则短 | 一轮灌满 GDD |
| [game-architect](https://github.com/rhino-ty/game-architect) | Steam / 宣发文案 | 引擎/LiveOps |
| GameStudio / Claude-Code-Game-Studios-CN | `/brainstorm`、逐节设计 | 49+ 子 Agent |
| GameStory Lab | 一致性检查分类 | 独立 Web 应用 |

## 工作区树（硬约定）

```text
design/
  concept.md          # /game-brainstorm，未升格
  gdd.md              # 活 GDD；Design L5 会报是否存在
  systems/
  narrative/
  levels/
  balance/            # *.csv only
  marketing/          # steam-store.md、devlog.md
```

文学 YAML（`story_state.yaml` 等）、`characters.csv`、台词、`.kyboard` 仍在工作区根或各自目录。游戏 skill **先读再写 lore**。

## 八个 skill

| id | 中文名 | 落盘 |
|----|--------|------|
| `game-brainstorm` | 游戏创意砍刀 | `design/concept.md` |
| `game-gdd` | 游戏设计文档 | 首次只写 `gdd.md` 空节骨架；可读 concept 升格 |
| `game-narrative` | 游戏叙事文案 | `design/narrative/`；对白走 `.dialogue.csv` |
| `game-systems` | 游戏系统策划 | `design/systems/` |
| `game-numbers` | 游戏数值假设 | `design/balance/*.csv` |
| `game-levels` | 游戏关卡节奏 | `design/levels/`；可引用 `.kyboard` |
| `game-store` | Steam与宣发文案 | `design/marketing/`；无 GDD 须标草稿 |
| `game-consistency` | 游戏设定一致性 | 不写新设定；扫 design/ + 文学 YAML + 角色/台词 |

仓内真源：`resources/ai-skills/<id>/SKILL.md` → 用户 `data/ai-skills/`（缺则拷，已有不覆盖）。

## 播种 / 开关

- `enabledSkillIds === null`：全部开启（含新拷的 game-*）。
- 白名单数组：仅把 **`seenBundledSkillIds` 里从未出现过** 的 bundled id 追加进去。
- 用户关掉后重启不得再打开。
- 厂家改 SKILL 正文不覆盖用户已有文件。`examples.md` / `reference.md` 同样 copy-if-missing（老用户缺文件会补上，已有不覆盖）。

## 常驻纪律（§125）

工作区出现 `design/gdd.md`、`design/concept.md` 或 `design/{systems,narrative,levels,balance,marketing}` 时，系统提示注入 `DESIGN_AGENT_PLAYBOOK`（与 Git playbook 同类）：对白走 CSV、数字进表、专有名词先读 glossary，**不要求**用户先挂 `/game-*`。

`/game-narrative` 挂载时注入同目录 `examples.md`（合格短句 / 有代价选项）。

## Design L5（§126）

有 `design/` 树即注入（不要求已有 `gdd.md`）。一行内列出**实际存在**的：`design/gdd.md`、`design/concept.md`、`characters.csv`、`glossary.yaml`、浅扫到的 `*.dialogue.csv`（最多 3 个文件名）。只报存在，不灌正文。纯小说工作区无 `design/` 则不注入（角色表仍走 Cast 摘要）。

## 禁止

- 子 Agent、skill `scripts/`、数值蒙特卡洛、`nameEn`
- 工作区 `.cursor/skills`、Unity/Godot 出码
- 改文学 M1 schema；Android 本轮不移植
