# KENTUCKY ↔ Godot 台词兼容说明（协议 v1.3）

> **本仓库不附带 Godot 插件代码/二进制。** 本文是声明器（Kentucky）与执行器（Godot 插件）的**数据契约与接入说明书**。  
> Kentucky 权威实现：`src/renderer/src/editors/dialogueCsv.ts`、`dialogueGraphMap.ts`、`DialogueEditor.tsx`、`appStore`（改名/删除/移动同步 sidecar）。  
> **Godot 侧参考实现：** [CCFOX12/ai_river_godot](https://github.com/CCFOX12/ai_river_godot) — Autoload **Louisville Station**（`addons/louisville_station/`）。

Kentucky 只保证：打开文件夹后编辑，`Ctrl+S` **写同一路径磁盘文件**。引擎内热更新 / 播放 / UI 由 Godot 插件负责。

**相对 v1.2 的增量（v1.3）：**

- **播放图统一为 options**：每句后续都走 `choices.nodes[line_id].options`（含线性「下一句」）
- **角色 `operable`**：`characters.csv` 增列；仅**可操作（玩家）**角色对空 `text` 等确认；**非可操作（NPC）**空 `text` **自动** `goto`
- **空 `text`**：不弹多选列表；行为由当前行 `speaker` 的 `operable` 决定（见上）；非空 `text` → 选项 UI（与是否可操作无关）
- **废除**「缺 choices 文件 = 按 CSV 行序播放」作为执行器**正式语义**（仅 Kentucky 读盘迁移）
- Kentucky 画布：**仅底边**拉选项出边（无顺序边 / 无右侧柄）；同节点禁止空 text 与非空 text 混排；芯片区分「下一句」/「自动」

---

## 0. 协议速览

| 项 | 约定 |
|----|------|
| 工作区 | Kentucky 打开 Godot 工程的 `dialogue/`（或等价目录）为根 |
| 角色表 | 根目录 `characters.csv`：`id,name,color,note,model_node,operable` |
| 台词源 | `*.dialogue.csv`：**11 列**（旧 8 列可读，写回升为 11 列） |
| 播放图 | `*.dialogue.choices.json`（`version: 1`）；**正式播放边**；空 `nodes` 才可删文件 |
| 布局旁路 | 可选 `*.dialogue.layout.json`（**仅 Kentucky**；Godot **必须忽略**） |
| 演出声明 | CSV 列 `focus_node` / `font_size` / `text_color` |
| 文件级绑定 | `*.dialogue.meta.json`：`godot_scene` + `dialogue_id` |
| 新建文件名 | **自动** `{sceneStem}_{dialogueId}.dialogue.csv` |
| 改名/删除/移动 | 同步 **meta + choices + layout** |
| Kentucky UI | 节点图：底边 option；芯片「下一句」(可操作空 text) /「自动」(NPC 空 text) / 文案 /「结束」；End→`end: true` |
| CSV 行序 | **非播放序**；仅开场 = 第一行（Kentucky 可显式指定唯一开场）；播放只跟 `goto` / `end` |
| 联动方式 | **同路径磁盘**，无 IPC / 无内嵌引擎 |

例：`res://scenes/tavern.tscn` + `intro` →  
`tavern_intro.dialogue.csv` + `tavern_intro.dialogue.meta.json`  
（+ `tavern_intro.dialogue.choices.json` / 可选 `tavern_intro.dialogue.layout.json`）。

### 0.1 声明器 / 执行器

| Kentucky（声明器） | Godot 插件（执行器） |
|--------------------|----------------------|
| 节点图编辑并序列化 CSV / choices / layout | 读盘 CSV / meta / characters（含 **operable**）/ **choices** |
| `Ctrl+S` 覆盖同路径文件 | 播完一行后 **必**查 `choices.nodes[line_id]` |
| **不**播放、不校验场景节点是否存在 | 空 text → 按 `speaker.operable` 确认或自动；非空 → 选项 UI；`end` → 结束 |
| **不**写 `.import` / Keep File | 建议对台词 CSV 使用 Keep File，避免当 Translation 导入 |

### 0.2 版本对照

| 版本 | 内容 |
|------|------|
| v1 | 8 列台词 + characters + meta |
| v1.1 | 11 列（+ `focus_node` / `font_size` / `text_color`） |
| v1.2 | + `*.dialogue.choices.json`；节点图；顺序边+选项边；缺 choices=CSV 行序 |
| **v1.3** | 全 option 播放图；`characters.operable`；空 text=可操作确认 / NPC 自动；无顺序边；缺 choices **不是**正式线性语义 |

---

## 1. 推荐工程布局

```text
YourGodotProject/
  dialogue/                         ← Kentucky「打开文件夹」指向这里
    characters.csv
    tavern_intro.dialogue.csv       ← 台词源（热编辑真相）
    tavern_intro.dialogue.meta.json
    tavern_intro.dialogue.choices.json   ← 播放图（几乎总有）
    tavern_intro.dialogue.layout.json    ← 可选，仅 Kentucky
  addons/
    louisville_station/             ← 或你的自研执行器
```

热编辑主路径 = 上述源文件。Kentucky「导出管线 / 本地化 CSV」是可选副本，**不要**当热编辑真相。

DialogueNPC / 运行时检查器应填写：`dialogue_dir`（如 `res://dialogue`）+ `dialogue_id`（与 meta 一致）。`dialogue_dir` 下**必须**能读到 `characters.csv`。

---

## 2. 文件识别（Kentucky）

| 文件 | Kentucky 行为 |
|------|----------------|
| `*.dialogue.csv` | 打开 → **节点图画布** DialogueEditor |
| `*.dialogue.meta.json` | 旁路元数据；新建台词时写入；树里挂在 csv 下 |
| `*.dialogue.choices.json` | 播放图；底边选项读写；树里挂在 csv 下 |
| `*.dialogue.layout.json` | 画布坐标；Godot 忽略；树里挂在 csv 下 |
| basename `characters.csv` | CharactersEditor 卡片 UI |
| 其它 `*.csv` | Monaco，**不当**台词编辑 |

路径匹配：大小写不敏感；台词后缀必须是 `.dialogue.csv`。

---

## 3. `characters.csv`（角色表）

**位置：** Kentucky 工作区根（建议即 `res://dialogue/characters.csv`）。路径**不可配置**。

```text
id,name,color,note,model_node,operable
player,Player,#88c0d0,,PlayerBody,1
barkeep,Barkeep,#d08770,,BarkeepBody,
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 稳定角色 id；台词行 `speaker` **引用此值** |
| `name` | 是 | UI 显示名 |
| `color` | 否 | 如 `#88c0d0` |
| `note` | 否 | 作者备注 |
| `model_node` | 创建时必填 | 默认对焦节点名 |
| `operable` | 否 | `1`/`true`/`yes`/`y` = **可操作（玩家）**；空/`0`/`false` = 非可操作（NPC）。**缺列 / 缺字段视为不可操作** |

**可操作 vs 自动过句（执行器必实现）：**

| 当前行 speaker | 后续 options | 执行器行为 |
|----------------|--------------|------------|
| `operable` 真 | 单条 `text === ""` 且非 `end` | **不**弹列表；**等确认/点击** 后 `goto` |
| `operable` 假 / 缺 | 单条 `text === ""` 且非 `end` | **不**弹列表；**立即** `goto`（自动过句） |
| 任意 | 任一条 `text` 非空 | 弹出选项 UI（与 operable 无关） |
| 任意 | `end: true` | 结束对话 |

- 「是否可操作」看**该行台词的 `speaker`**，不是选项文案作者
- 旧表无 `operable` 列：全部按 NPC 自动过；玩家角色须在 Kentucky 角色创建/列表勾选后写回 `1`

---

## 3.1 `*.dialogue.meta.json`

```json
{ "version": 1, "godot_scene": "res://scenes/tavern.tscn", "dialogue_id": "intro" }
```

---

## 3.2 `*.dialogue.choices.json`（播放图 · 执行器必读）

与 csv **同 stem**。JSON `version` 仍为 `1`（字段形状不变）；**语义按协议 v1.3**。

```json
{
  "version": 1,
  "nodes": {
    "<line_id>": {
      "options": [
        { "text": "", "goto": "line_b" },
        { "text": "离开", "goto": "", "end": true }
      ]
    }
  }
}
```

| 规则 | 说明 |
|------|------|
| 触发 | 播完一行后查 `nodes[该行 id]` |
| 无 node / `options` 空 | **结束对话**（不要再按 CSV 下一行前进） |
| 单条且 `text === ""` 且非 `end` | 查 `characters[speaker].operable`：可操作 → **不弹列表，等确认** 后 `goto`；不可操作 → **自动** `goto` |
| 任一条 `text` 非空 | 弹出选项 UI（协议保证：不与空 text 同节点混排） |
| `end: true` | 结束对话（推荐同时 `goto: ""`） |
| 非法混排 | 同一 `options` 内同时有空 text 与非空 text → Kentucky 拒绝；执行器可 warning |
| 缺文件 | **不是**正式线性语义。Kentucky 打开旧文件会内存合成空 text 链；保存后写出 choices。升级后的执行器应要求有 choices（或自行做一次性迁移） |
| 编码 | UTF-8 普通 JSON |

### 执行器建议 API

```text
load_choices(csv_path) -> ChoicesFile | empty
get_choices_after(csv_path, line_id) -> Option[]
```

Kentucky 画布映射：

- 底边 A→B（空文案）→ `{ text: "", goto: B }`
- 底边 A→B（有文案）→ `{ text, goto: B }`
- 底边 A→End → `{ text: "" \| "…", goto: "", end: true }`
- **无**顺序边；**无**右侧出边

---

## 3.3 `*.dialogue.layout.json`（仅 Kentucky）

```json
{
  "version": 1,
  "nodes": { "<line_id>": { "x": 80, "y": 40 } },
  "end": { "x": 200, "y": 400 }
}
```

- **Godot 必须忽略**。  
- 旧文件无 layout：打开时自动排版；**首次 Ctrl+S** 才写盘。

---

## 4. `*.dialogue.csv`（台词源）

```text
id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 全工作区稳定唯一；choices 的 `goto` / 节点键 |
| `speaker` | 是 | character **id** |
| `text` | 是 | 正文 |
| `text_color` | 否 | **正文色**；空 = 执行器默认正文色（通常白）。**不是** `characters.color` |
| 其它列 | 否 | 同 v1.1 / v1.2 |

**CSV 第一行 = 开场。** 行序**不是**播放序；播放只跟 choices。

### 4.1 演出列与对焦回退

```text
focus_node（非空）
  → characters[speaker].model_node（非空）
    → 触发器默认 subject
      → warning，跳过对焦
```

`font_size`：空或 `0` → 执行器默认字号。  
`text_color`：空 → 执行器默认正文色；**禁止**把 `characters.color`（画布名牌/描边色）当作正文色默认写入。仅高亮/强调行才填 `#RGB` / `#RRGGBB` / `#RRGGBBAA`。

Kentucky **不**校验节点存在。写回始终 **11 列**。

### 4.2 作者 / 声明器注意（联调协调）

| 项 | 约定 |
|----|------|
| `text_color` | 要默认白正文就**留空**；勿填角色色。角色色只用于 Kentucky 画布 speaker 名牌/描边 |
| 开场 operable | 协议允许开场 speaker 为可操作；若希望**进对话立刻听 NPC**，开场 speaker 须 **非 operable**（空 text 自动过） |
| 不可达节点 | 播放只跟 choices 的 `goto`。CSV 有行但从开场经 option 边**到不了** → **播不到**；须在画布接上 |
| 切换台词文件 | Kentucky 只写磁盘。换篇由 Godot 侧 `dialogue_id` / 工程内 `dialogue_file_override` 决定（playground 锁死 override 时须改或清空）——**非** Kentucky API |
| Keep File | Kentucky **永不**读写 `*.dialogue.csv.import`；作者在 Godot 保存/重导后须确认 `importer="keep"`，避免 Translation 副产品 |

### 稳定 id

- 格式：`{scene|stem}_{character_id}_{###}`  
- 改字 / 演出字段 **不改 id**  
- 冲突时扫工作区全部 `.dialogue.csv` 顺延  

---

## 5. CSV 编码

- UTF-8（可带 BOM，解析剥 `\uFEFF`）  
- 近似 RFC4180 引号转义  

---

## 6. Godot 导入建议

台词 `*.dialogue.csv` 建议 **Keep File**（`importer="keep"`），避免当 Translation。  

- Kentucky **不**创建、修改或删除 `*.dialogue.csv.import`。  
- 在 Godot 中保存或触发重导后，作者应确认 `.import` 仍为 Keep File，避免再出 translation 副产品。

---

## 7. 磁盘联动（Kentucky 保证）

| 行为 | 说明 |
|------|------|
| 打开工作区 | 用户选 `dialogue/` |
| 保存 | `Ctrl+S` → csv +（有 options 则）choices + layout；`nodes` 空则**删除** choices |
| DocumentHub | 多窗口同路径共享缓冲 |
| 不推送 | 无 WebSocket / IPC |

### 执行器应监视

```text
{dialogue_dir}/characters.csv
{dialogue_dir}/**/*.dialogue.csv
同 stem 的 *.dialogue.meta.json
同 stem 的 *.dialogue.choices.json
```

（**不必**监视 `*.dialogue.layout.json`。）

---

## 8. Godot 加载器建议契约

```text
load_characters(path) -> Dictionary[id -> { name, color, note, model_node, operable }]
load_dialogue(path)   -> Array[Line]   # CSV；首行 = 开场
load_meta(path)       -> { godot_scene, dialogue_id }
load_choices(csv_path)-> { version, nodes } | empty
get_choices_after(csv_path, line_id) -> Option[]
resolve_speaker(line) -> character | fallback
resolve_focus(line)   -> focus_node | model_node | default_subject
apply_ui(line)        -> font_size / text_color（空或 0 → 引擎默认正文样式；text_color 空 ≠ characters.color）
```


播放伪代码（v1.3）：

```text
line = first CSV row
loop:
  show(line); wait advance   # 显示台词正文
  opts = get_choices_after(csv, line.id)
  if opts is empty:
    break                    # 结束（无 CSV 下一行兜底）
  if len(opts) == 1 and opts[0].text == "" and not opts[0].end:
    if characters[line.speaker].operable:
      wait confirm_or_click    # 可操作：不弹列表
    # else: NPC — auto continue
    line = find_by_id(opts[0].goto) or break
  else:
    pick = show_options(opts)  # 非空 text；或 end
    if pick.end: break
    line = find_by_id(pick.goto) or break
```

**禁止**主路径再使用 `next_csv_row` 作为播放前进。

缺角色：兜底显示名，**不要丢弃该行**。

---

## 9. Kentucky 节点图声明器（供对照，非 Godot 职责）

| 图元素 | 落盘 |
|--------|------|
| Line 节点 | CSV 一行 |
| 底边 A→B（空文案） | `{ text: "", goto: B }` |
| 底边 A→B（有文案） | `{ text, goto: B }` |
| 底边 A→End | `{ text: "", end: true }`（可非空告别） |
| 开场 | Kentucky 可显式指定（检视器「开场」）；落盘 = CSV 第一行。未指定时缺省为无入边根中最左上 |
| 空/非空混排 | 编辑器即时拒绝 |
| 环 / 回跳 | 允许 |

Godot **只消费 CSV + choices + characters + meta**，不读图、不读 layout。

### 读盘迁移（仅 Kentucky）

1. **无 choices 文件**：按 CSV 相邻行合成空 text option 链（内存）；保存后写出 choices  
2. **有 choices 但部分行无 options**：对该行补 CSV 下一行空 text 边；已有 options 的行不动  

执行器升级后勿依赖「缺文件线性」。

---

## 10. 明确不做

**Kentucky：** IPC、内嵌播放、校验节点、表达式引擎、用图格式替代 CSV、打包插件、android 同步。  

**执行器侧建议永久避免：** ProjectSettings 轮询、`dialogue_dir` 塞插件设置页、恢复旧 excel/`DialogueLineConfig` 活路等。

---

## 11. 自测清单

### Kentucky

1. 旧仅 csv 打开 → 底边空 text 链；保存后有 choices  
2. 有 choices 缺行 options → 补邻接空 text；已有分支不动  
3. 底边连 End → `end: true`；空文案芯片「结束」  
4. 同节点空+非空混排 → toast 拒绝  
5. 角色创建/列表可勾选「可操作」；写回 `characters.csv` 的 `operable`；芯片：可操作空 text「下一句」、NPC「自动」  
6. 保存后重启 → **台词不丢**；角色 operable 徽章保留  

### 联调（推荐 ai_river_godot · 需按 v1.3 改执行器）

1. Kentucky 打开工程 `dialogue/`；`load_characters` 带上 `operable`  
2. **可操作** speaker + 空 text 链：等确认后前进，**无**选项列表  
3. **非可操作** speaker + 空 text 链：**自动**前进，不等确认、**无**选项列表  
4. 多选项（非空 text）：弹出 UI（与 operable 无关）；`end` 结束  
5. **勿**再测「无 choices 文件仍按行序播」为正式行为  
6. `focus_node` / `model_node` 对焦回退正常  

### 作者侧联调检查

1. 默认白正文：`text_color` **留空**（勿写成角色色）；仅刻意高亮才填 hex  
2. 若需进对话立刻听 NPC：开场 speaker **非 operable**  
3. 每条要播到的行：从开场经 choices 可达（无「CSV 有、图未接」孤儿）  
4. Godot 换篇：改 `dialogue_id` 或 playground 的 `dialogue_file_override`（勿以为 Kentucky 会切运行时篇）  
5. 保存/重导后：`*.dialogue.csv.import` 仍为 `importer="keep"`  

参考 smoke（以参考仓库为准）：

```text
kentucky_dialogue_store_smoke.gd
kentucky_dialogue_choices_smoke.gd
kentucky_dialogue_focus_smoke.gd
```

---

## 参考路径

| 内容 | 位置 |
|------|------|
| Kentucky 解析 / 图映射 | `src/renderer/src/editors/dialogueCsv.ts`、`dialogueGraphMap.ts` |
| Kentucky 画布 UI | `DialogueEditor.tsx`、`DialogueLineNode.tsx`、`DialogueInspector.tsx` |
| Kentucky AI Agent | `src/main/ai/formats.ts`、`tools.ts` |
| 产品决策 | `project-memory/product-decisions.md` |
| 改动时间线 | `project-memory/changelog.md` |
| Godot 执行器 | https://github.com/CCFOX12/ai_river_godot |
