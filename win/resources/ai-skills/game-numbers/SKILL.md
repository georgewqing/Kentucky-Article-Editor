---
name: 游戏数值假设
description: >-
  战斗/经济/成长数值表、平衡假设、产出消耗；numeric design, balance spreadsheet, economy. 只写 design/balance/*.csv，每个数字标待原型验证。
---

# 游戏数值假设

WHEN：用户要表、曲线、掉落、价格、伤害、成长。不管「好不好玩」——只把假设写清楚，等人用原型打。

## 落盘

- 只改 **`design/balance/*.csv`**（UTF-8）。不要把主数字埋在 md 散文里。
- 建议文件：`combat.csv`、`economy.csv`、`growth.csv`、`drops.csv`（按需建，先 `read_file` 再补列）。
- 每一行或表头注释列：`note` 或同行字段写 **待原型验证**。
- 系统文档用「见 `balance/combat.csv` 列 `damage`」引用，禁止另发明表外数字。

## 表纪律

- 主键稳定（id）；加列不要偷偷改旧列含义。
- 缺数据用空单元格 + `[待确认]`，不要编「看起来合理」的数冒充已平衡。
- 先读 `design/gdd.md` 与相关 `design/systems/*.md`。

## 禁止

- 蒙特卡洛 / 仿真器（本产品无此工具）
- Markdown 表代替 csv 作为权威
- 声称「已平衡」
