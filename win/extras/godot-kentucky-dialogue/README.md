# KENTUCKY ↔ Godot 台词兼容说明（协议 v1.2）

> **本仓库不附带 Godot 插件代码/二进制。** 本文是声明器（Kentucky）与执行器（Godot 插件）的**数据契约与接入说明书**。  
> Kentucky 权威实现：`src/renderer/src/editors/dialogueCsv.ts`、`dialogueGraphMap.ts`、`DialogueEditor.tsx`、`appStore`（改名/删除/移动同步 sidecar）。  
> **Godot 侧参考实现：** [CCFOX12/ai_river_godot](https://github.com/CCFOX12/ai_river_godot) — Autoload **Louisville Station**（`addons/louisville_station/`）。

Kentucky 只保证：打开文件夹后编辑，`Ctrl+S` **写同一路径磁盘文件**。引擎内热更新 / 播放 / UI 由 Godot 插件负责。

**相对 v1.1 的增量：** 可选分支旁路 `*.dialogue.choices.json`；Kentucky 侧改为**节点图画布**声明器；可选 `*.dialogue.layout.json`（仅编辑器坐标，执行器忽略）。

---

## 0. 协议速览

| 项 | 约定 |
|----|------|
| 工作区 | Kentucky 打开 Godot 工程的 `dialogue/`（或等价目录）为根 |
| 角色表 | 根目录 `characters.csv`：`id,name,color,note,model_node` |
| 台词源 | `*.dialogue.csv`：**11 列**（旧 8 列可读，写回升为 11 列） |
| 分支旁路 | 可选 `*.dialogue.choices.json`（`version: 1`）；**缺文件 = 纯线性** |
| 布局旁路 | 可选 `*.dialogue.layout.json`（**仅 Kentucky**；Godot **必须忽略**） |
| 演出声明 | CSV 列 `focus_node` / `font_size` / `text_color` |
| 文件级绑定 | `*.dialogue.meta.json`：`godot_scene` + `dialogue_id` |
| 新建文件名 | **自动** `{sceneStem}_{dialogueId}.dialogue.csv` |
| 改名/删除/移动 | 同步 **meta + choices + layout** |
| Kentucky UI | 节点图画布：顺序边→CSV 行序；选项边→choices；End→`end: true` |
| 联动方式 | **同路径磁盘**，无 IPC / 无内嵌引擎 |

例：`res://scenes/tavern.tscn` + `intro` →  
`tavern_intro.dialogue.csv` + `tavern_intro.dialogue.meta.json`  
（+ 可选 `tavern_intro.dialogue.choices.json` / `tavern_intro.dialogue.layout.json`）。

### 0.1 声明器 / 执行器

| Kentucky（声明器） | Godot 插件（执行器） |
|--------------------|----------------------|
| 节点图编辑并序列化 CSV / choices / layout | 读盘 CSV / meta / characters / **choices** |
| `Ctrl+S` 覆盖同路径文件 | 播完一行后查 `choices.nodes[line_id]` |
| **不**播放、不校验场景节点是否存在 | `goto` 跳转行 id，或 `end: true` 结束对话 |
| **不**写 `.import` / Keep File | 建议对台词 CSV 使用 Keep File，避免当 Translation 导入 |

### 0.2 版本对照

| 版本 | 内容 |
|------|------|
| v1 | 8 列台词 + characters + meta |
| v1.1 | 11 列（+ `focus_node` / `font_size` / `text_color`） |
| **v1.2** | + `*.dialogue.choices.json` 分支握手；Kentucky 节点图声明器；+ layout（仅编辑器） |

---

## 1. 推荐工程布局

```text
YourGodotProject/
  dialogue/                         ← Kentucky「打开文件夹」指向这里
    characters.csv
    tavern_intro.dialogue.csv       ← 台词源（热编辑真相）
    tavern_intro.dialogue.meta.json
    tavern_intro.dialogue.choices.json   ← 可选分支
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
| `*.dialogue.choices.json` | 分支声明；画布选项边读写；树里挂在 csv 下 |
| `*.dialogue.layout.json` | 画布坐标；Godot 忽略；树里挂在 csv 下 |
| basename `characters.csv` | CharactersEditor 卡片 UI |
| 其它 `*.csv` | Monaco，**不当**台词编辑 |

路径匹配：大小写不敏感；台词后缀必须是 `.dialogue.csv`。

---

## 3. `characters.csv`（角色表）

**位置：** Kentucky 工作区根（建议即 `res://dialogue/characters.csv`）。路径**不可配置**。

```text
id,name,color,note,model_node
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 稳定角色 id；台词行 `speaker` **引用此值** |
| `name` | 是 | UI 显示名 |
| `color` | 否 | 如 `#88c0d0` |
| `note` | 否 | 作者备注 |
| `model_node` | 创建时必填 | Godot 节点名；**`focus_node` 为空时的对焦回退** |

规则：须先有角色才能在检视器选说话人；删除角色后旧 `speaker` 仍保留，UI 显示「未知角色」；无 `display_name` 列；写回始终 5 列。

```csv
id,name,color,note,model_node
guard,守卫,#d08770,酒馆门口,NPC_Guard
narrator,我 (叙述者),#88c0d0,,
```

---

## 3.1 `*.dialogue.meta.json`

与 csv **同 stem**：

```json
{
  "godot_scene": "res://scenes/tavern.tscn",
  "dialogue_id": "intro"
}
```

| 字段 | 必须 | 说明 |
|------|------|------|
| `godot_scene` | 是 | 场景路径或约定名（Kentucky 不校验存在） |
| `dialogue_id` | 是 | 场景内对话标识；新建行默认 `scene` 列也用此值 |

新建信息卡必填二者；文件名自动 `{sceneStem}_{dialogueId}.dialogue.csv`。改名走资源管理器（同步 sidecar）。

执行器：用 `dialogue_id`（或 `dialogue_file_override`）在 `dialogue_dir` 下定位 csv。

---

## 3.2 `*.dialogue.choices.json`（分支 · 执行器必读）

**可选。** 与 csv/meta **同 stem**。缺文件 = 整段按 CSV **行序**线性播放。

```json
{
  "version": 1,
  "nodes": {
    "<after_line_id>": {
      "options": [
        { "text": "走进面馆", "goto": "tavern_owner_001" },
        { "text": "离开", "goto": "", "end": true }
      ]
    }
  }
}
```

| 规则 | 说明 |
|------|------|
| 触发 | 播完一行后查 `nodes[该行 id]`；有非空 `options` → 显示选项并**暂停** CSV 行序前进 |
| 选择 | `end: true`（推荐同时 `goto: ""`）→ **结束对话**；否则跳到 `goto` 对应**行 id**（按 id 查表，不是「下一行」） |
| 无 node | 按 CSV **行序**取下一句 |
| 文件末 | 无下一句且无 options → 可结束 |
| 离开 | **不要**另造「离开」字段；用某个 option 的 `end: true` |
| 缺文件 | 合法；纯线性 |
| 编码 | UTF-8 普通 JSON（**不是** CSV Translation） |

### 执行器建议 API（与 Louisville 对齐）

```text
load_choices(csv_path) -> ChoicesFile | empty
get_choices_after(csv_path, line_id) -> Option[] | []
```

Kentucky 画布映射：

- 选项边 A→B（文案=边 label）→ `nodes[A].options[] = { text, goto: B }`
- 选项边 A→End → `{ text, goto: "", end: true }`
- 有选项出边的节点**禁止**再有顺序出边（与「有 options 则暂停行序」一致）

---

## 3.3 `*.dialogue.layout.json`（仅 Kentucky）

```json
{
  "version": 1,
  "nodes": { "<line_id>": { "x": 80, "y": 40 } },
  "end": { "x": 400, "y": 200 }
}
```

- **Godot 必须忽略**（不要当播放数据）。  
- 改名/删除台词文件时 Kentucky 会同步处理。  
- 旧文件无 layout：打开时自动排版（内存）；**首次 Ctrl+S** 才写盘。

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
| `note` / `emotion` / `scene` / `condition` / `audio` | 否 | 自由文本；`emotion` 在 Kentucky UI 称「配音」 |
| `focus_node` | 否 | 相机对焦节点名 |
| `font_size` | 否 | 正整数串；空/`0` = UI 默认（磁盘写空串） |
| `text_color` | 否 | `#RGB` / `#RRGGBB` / `#RRGGBBAA` 或空 |

**无 choices 时：CSV 行序 = 播放顺序。** 有 choices 时：选项跳转按 id；未点选项前不按行序前进。

### 4.1 演出列与对焦回退

```text
focus_node（非空）
  → characters[speaker].model_node（非空）
    → 触发器默认 subject
      → warning，跳过对焦
```

Kentucky **不**校验节点存在。写回始终 **11 列**。

### 稳定 id

- 格式：`{scene|stem}_{character_id}_{###}`  
- 改字 / 演出字段 **不改 id**  
- 冲突时扫工作区全部 `.dialogue.csv` 顺延  

---

## 5. CSV 编码

- UTF-8（可带 BOM，解析剥 `\uFEFF`）  
- 近似 RFC4180 引号转义  
- 写回 `\n`；读入忽略单独 `\r`  
- 表头大小写不敏感；历史可用 `key` 代替 `id`  

**Godot 导入：** 勿把 `*.dialogue.csv` / `characters.csv` 当 CSV Translation。建议 `.import` 使用 `importer="keep"`（参考 Louisville 事件驱动纠正 Keep File；避免 mtime+`scan()` 轮询卡死）。

---

## 6. 导出产物（非热编辑主路径）

Kentucky 画布工具栏可导出：

1. **管线 CSV** `{stem}-pipeline.csv`  
2. **本地化** `{stem}-locale-zh.csv`（`keys,<lang>` + `id,text`）  

普通 `.csv`，不用 DialogueEditor 打开。执行器**不要**监视这些导出文件当真相。

---

## 7. 磁盘联动（Kentucky 保证）

| 行为 | 说明 |
|------|------|
| 打开工作区 | 用户选 `dialogue/` |
| 保存 | `Ctrl+S` → csv +（非空）choices + layout；choices 清空则**删除** choices 文件 |
| DocumentHub | 多窗口同路径共享缓冲 |
| 不推送 | 无 WebSocket / IPC；**不**通知引擎进程 |

### 执行器应监视

```text
{dialogue_dir}/characters.csv
{dialogue_dir}/**/*.dialogue.csv
同 stem 的 *.dialogue.meta.json
同 stem 的 *.dialogue.choices.json
```

（**不必**监视 `*.dialogue.layout.json`。）

热更时机建议：下次开始对话时重载。

参考仓库职责（细节以 ai_river_godot 为准）：

- `dialogue_dir` 在 DialogueNPC 检查器配置（勿用已废弃的 Project Settings 轮询方案）  
- 解析并执行 `focus_node` / `font_size` / `text_color`  
- `load_choices` / 选项 UI（确认键 / 鼠标 / 数字键等由项目实现）  
- Keep File 纠正台词 CSV  

---

## 8. Godot 加载器建议契约

```text
load_characters(path) -> Dictionary[id -> { name, color, note, model_node }]
load_dialogue(path)   -> Array[Line]   # 保持 CSV 行序
load_meta(path)       -> { godot_scene, dialogue_id }
load_choices(csv_path)-> { version, nodes } | empty
get_choices_after(csv_path, line_id) -> Option[]
resolve_speaker(line) -> character | fallback
resolve_focus(line)   -> focus_node | model_node | default_subject
apply_ui(line)        -> font_size / text_color（空或 0 → 默认）
```

播放伪代码：

```text
line = first CSV row   # 或由 dialogue_id 定位文件后的首行
loop:
  show(line); wait advance
  opts = get_choices_after(csv, line.id)
  if opts non-empty:
    pick = show_options(opts)
    if pick.end: break
    line = find_by_id(pick.goto)
  else:
    line = next_csv_row(line) or break
```

缺角色：兜底显示名，**不要丢弃该行**。

---

## 9. Kentucky 节点图声明器（供对照，非 Godot 职责）

| 图元素 | 落盘 |
|--------|------|
| Line 节点 | CSV 一行 |
| 顺序边 A→B | 序列化时 B 紧接 A（无选项时的行序） |
| 选项边 A→B | `choices.nodes[A].options` |
| 选项边 A→End | `end: true` |
| 多根 | 允许；画布最左上根链 → CSV 第一行（开场） |
| 顺序成环 | 编辑器禁止 |
| 顺序+选项同出 | 编辑器禁止 |

Godot **只消费 CSV + choices + characters + meta**，不读图、不读 layout。

---

## 10. 明确不做

**Kentucky：** IPC、内嵌播放、校验节点、表达式引擎、用图格式替代 CSV、打包插件、android 同步。  

**执行器侧建议永久避免（见 ai_river_godot 现行契约）：**  
ProjectSettings 注册 `louisville_station/*`、EditorPlugin mtime+`scan()` 轮询、插件设置页塞 `dialogue_dir`、恢复旧 excel/`DialogueLineConfig` 活路等。

---

## 11. 自测清单

### Kentucky

1. 旧仅 csv 打开 → 纵向链；未保存前不强制写 layout/choices  
2. 选项边 → 合法 `choices.json`；连 End → `end: true`  
3. 保存后重启 → **台词不丢**（画布未就绪时不得写空 CSV）  
4. 重命名/删除 csv → meta+choices+layout 同步  
5. 线性顺序边与 CSV 行序一致  

### 联调（推荐 ai_river_godot）

1. Kentucky 打开工程 `dialogue/`  
2. 改 text / 加分支，`Ctrl+S`  
3. Godot 下次开对话读到新 text 与选项  
4. 无 choices 文件时仍线性播放  
5. `focus_node` / `model_node` 对焦回退正常  

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
| Kentucky 解析 / 图映射 | `win/src/renderer/src/editors/dialogueCsv.ts`、`dialogueGraphMap.ts` |
| Kentucky 画布 UI | `DialogueEditor.tsx`、`DialogueLineNode.tsx`、`DialogueInspector.tsx` |
| Kentucky AI Agent（排版/写分支） | `win/src/main/ai/formats.ts`、`tools.ts`：`propose_dialogue_graph` / `layout_dialogue` / `propose_set_dialogue_choices` / `read_dialogue` |
| 产品决策 | `win/project-memory/product-decisions.md` |
| 改动时间线 | `win/project-memory/changelog.md` |
| Godot 执行器 | https://github.com/CCFOX12/ai_river_godot |
