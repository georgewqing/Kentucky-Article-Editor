# KENTUCKY ↔ Godot 台词兼容说明（给 Godot 侧自研插件）

> **本仓库不附带 Godot 插件。** 以下为数据契约与联动约定（协议），便于你在自己的 Godot 工程里写监视/重载逻辑。  
> 权威实现对照：`src/renderer/src/editors/dialogueCsv.ts`、`DialogueEditor.tsx`、`appStore.createDialogue` / `renameEntry`。

Kentucky 只保证：打开文件夹后编辑，`Ctrl+S` **写同一份磁盘文件**。引擎里「热更新」完全由你的 Godot 代码负责（读盘 / 监视 mtime / `EditorFileSystem.scan` 等）。

---

## 0. 协议速览（v1.1）

| 项 | 约定 |
|----|------|
| 工作区 | Kentucky 打开 Godot 工程的 `dialogue/`（或等价目录）为根 |
| 角色表 | 根目录 `characters.csv`：`id,name,color,note,model_node` |
| 台词源 | `*.dialogue.csv`：11 列（见下；旧 8 列可读，写回升为 11 列） |
| 演出声明 | 可选列 `focus_node,font_size,text_color`（与 emotion/audio 同级） |
| 文件级绑定 | 同 stem 旁路 `*.dialogue.meta.json`：`godot_scene` + `dialogue_id` |
| 新建文件名 | **自动** `{sceneStem}_{dialogueId}.dialogue.csv`（信息卡不提供改名） |
| 改名 | 资源管理器右键重命名；若为台词文件则同步改 `.meta.json` |
| 删除 | 删 `.dialogue.csv` 时尝试删对应 `.meta.json` |
| `speaker` | 存角色 **id**；`model_node` 供插件找场景节点 / 对焦回退 |
| 联动方式 | **同路径磁盘**，无 IPC / 无内嵌引擎 |

文件名中 `sceneStem`：取 `godot_scene` 路径最后一段，去掉 `.tscn` / `.scn` / `.res` 后做 id 净化。  
例：`res://scenes/tavern.tscn` + `intro` → `tavern_intro.dialogue.csv` + `tavern_intro.dialogue.meta.json`。

### 0.1 声明器 / 执行器

| Kentucky（声明器） | Godot 插件（执行器） |
|--------------------|----------------------|
| 作者填写并序列化声明字段 | 监视 mtime、重载 CSV / meta / characters |
| `Ctrl+S` 覆盖同路径文件 | 解析字段为运行时数据 |
| **不**校验 Godot 节点是否存在 | `focus_node` / `model_node` → 查找 `Node3D` |
| **不**播放对话、不锁输入 | 调用 DialogueManager / DialogueUI |

---

## 1. 推荐工程布局

把 **台词目录本身** 设为 Kentucky 工作区根（因 `characters.csv` 路径固定为工作区根，不可配置）：

```text
YourGodotProject/
  dialogue/                    ← Kentucky「打开文件夹」指向这里
    characters.csv             ← 角色表（含 model_node）
    intro.dialogue.csv         ← 台词源
    intro.dialogue.meta.json   ← 文件级 Godot 绑定（场景 + 对话 id）
  scripts/
    your_dialogue_loader.gd
  addons/
    your_plugin/
```

热编辑主路径 = 上述 **源文件**。Kentucky「导出管线 CSV / 本地化 CSV」是可选副本，**不要**当成热编辑真相，除非你自己再接线。

---

## 2. 文件识别

| 文件 | Kentucky 行为 |
|------|----------------|
| `*.dialogue.csv` | 打开 → 对话编辑器（聊天 UI） |
| `*.dialogue.meta.json` | 旁路元数据（普通 JSON 文本）；新建台词时写入 |
| `characters.csv` | 普通文本（Monaco）；由对话编辑器创建/更新角色时自动读写 |
| 其它 `*.csv` | Monaco，**不会**当台词编辑 |

路径匹配：大小写不敏感，后缀必须是 `.dialogue.csv`（例如 `foo.Dialogue.CSV` 也认）。

---

## 3. `characters.csv`（角色表）

**位置：** Kentucky 工作区根 = 建议的 `res://dialogue/characters.csv`。

**表头（固定列名，顺序建议如下）：**

```text
id,name,color,note,model_node
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 稳定角色 id；台词行的 `speaker` **引用此值**，不是显示名 |
| `name` | 是 | UI 显示名 |
| `color` | 否 | 气泡/名字颜色，如 `#88c0d0`；缺省 Kentucky 用默认色 |
| `note` | 否 | 作者备注 |
| `model_node` | 创建时必填 | Godot 模型/角色节点名（如 `NPC_Guard`）；插件按节点联动；**`focus_node` 为空时的默认对焦回退** |

规则：

- 必须先有角色才能在 Kentucky 里发言（`@` / 说话人选择器只列已创建角色）。
- 可删除角色：仍被引用的台词保留原 `speaker` id，UI 显示「未知角色」。
- **没有** `display_name` 列。
- 旧文件缺 `model_node` 列时解析为空字符串；写回时始终输出 5 列。

示例：

```csv
id,name,color,note,model_node
guard,守卫,#d08770,酒馆门口,NPC_Guard
rea,莉娅,#88c0d0,,NPC_Rea
```

---

## 3.1 台词文件级元数据 `*.dialogue.meta.json`

与 `*.dialogue.csv` 同目录、同 stem：

```text
intro.dialogue.csv
intro.dialogue.meta.json
```

```json
{
  "godot_scene": "res://scenes/tavern.tscn",
  "dialogue_id": "intro"
}
```

| 字段 | 必须 | 说明 |
|------|------|------|
| `godot_scene` | 是 | Godot 场景路径或约定名（自由文本，Kentucky 不校验存在） |
| `dialogue_id` | 是 | 该场景内对话标识；新建台词行默认 `scene` 列也用此值 |

新建台词（资源管理器信息卡）必填上述两字段后才创建文件；**文件名自动生成**为 `{场景名}_{对话标识}.dialogue.csv`（场景取路径最后一段并去掉 `.tscn` 等，例如 `res://scenes/tavern.tscn` + `intro` → `tavern_intro.dialogue.csv`）。信息卡**不提供**改名入口；需要改名时在资源管理器右键「重命名」（台词会同步改对应 `.meta.json`）。删除 `.dialogue.csv` 时会尝试一并删除对应 `.meta.json`。

Godot 插件建议：监视目录时同时读 meta，用 `godot_scene` + `dialogue_id` 挂到场景/对话资源。

---

## 4. `*.dialogue.csv`（台词源）

**表头（固定列名与顺序；写回始终齐全）：**

```text
id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 全工作区稳定唯一；Godot 应用此键引用句子 |
| `speaker` | 是 | **character `id`**，不是 `name` |
| `text` | 是 | 台词正文（可含逗号/换行，见 CSV 转义） |
| `note` | 否 | 作者备注 |
| `emotion` | 否 | 配音向自由文本（UI 称「配音」；列名仍为 `emotion`） |
| `scene` | 否 | 场景标签；新建默认 = meta 的 `dialogue_id`（无 meta 则用文件 stem） |
| `condition` | 否 | 简单条件/标记，自由文本，**非**表达式引擎 |
| `audio` | 否 | 音频文件名（仅字段，Kentucky 不播放） |
| `focus_node` | 否 | 本句相机对焦的场景节点名（非 NodePath，例 `CSGBox3D_[Box]`、`NPC_Guard`） |
| `font_size` | 否 | 本句正文字号（像素约定由 Godot UI 解释） |
| `text_color` | 否 | 本句正文颜色 |

**行序 = 播放/阅读顺序**（不要按 id 排序当播放序）。

### 4.1 演出声明列（v1.1）

| 列 | 类型 | 空值 / 默认含义 |
|----|------|-----------------|
| `focus_node` | string | 空 → 执行器用 `characters[speaker].model_node`；再空 → 触发器默认 subject |
| `font_size` | 正整数串，或空 | **空与 `0` 均 = 用 Godot UI 默认字号**。Kentucky **磁盘统一写空串**（读到 `0` 也会 normalize 为空再写回）。Godot 读到 `0` 也应当作默认。 |
| `text_color` | string | 空 = Godot 默认（通常白） |

**`text_color` 合法格式（大小写均可）：**

- 空字符串
- `#RGB`（3 位 hex）
- `#RRGGBB`（6 位）
- `#RRGGBBAA`（8 位）

非法格式：Kentucky 保存前清空并提示；Godot 侧也应忽略非法值。

**`focus_node`：** 允许任意字符串；**禁止** Kentucky 调用 Godot 校验节点存在性。

**执行器对焦回退链（Kentucky 不实现，双方对齐用）：**

```text
focus_node（非空）
  → characters[speaker].model_node（非空）
    → 对话触发器默认 subject
      → warning，跳过对焦
```

序列化规则：

- **读：** 缺这三列的旧 8 列文件合法；缺失字段视为空。
- **写：** Kentucky 始终写出 **11 列**（含三个新列，即使为空字符串）。
- 改 `focus_node` / `font_size` / `text_color`：**不得改变行 id**（与改 `text` 相同）。
- 表头匹配大小写不敏感。
- **「复制为新台词」：** 浅拷贝含演出三字段，仅分配新 `id`。

示例：

```csv
id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color
tavern_guard_001,guard,站住！,入口第一句,alert,tavern,,,CSGBox3D_[Box],28,#ffffff
tavern_rea_001,rea,"你好，我是莉娅。",,,tavern,,,,,
```

### 稳定 id 规则

- 格式：`{scene|文件stem}_{character_id}_{三位序号}`  
  例：`tavern_guard_001`
- `scene` 空则用文件 stem。
- 改 `text` / `note` / `emotion` / `speaker` / `scene` / 演出三字段：**默认不改 id**。
- 仅 Kentucky「复制为新台词」会生成新 id（并复制演出字段）。
- 冲突时在 **整个 Kentucky 工作区** 所有 `.dialogue.csv` 内顺延序号。

Godot 侧应用：用 `id` 做字典键；不要假设 id 会因改字而变。

---

## 5. CSV 编码与转义（解析时注意）

Kentucky 使用近似 RFC4180：

- UTF-8；可能带 BOM（解析时应剥掉 `\uFEFF`）。
- 字段含 `,` `"` 换行时：用双引号包裹，内部 `"` → `""`。
- 行结束：`\n`（写回时 Kentucky 用 `\n`）；读入时忽略单独 `\r`。
- 空文件/仅表头：合法（0 句台词）。
- 表头列名匹配时 **大小写不敏感**；台词文件若缺 `id`/`speaker`/`text` 列则视为无效（打开为空列表）。历史兼容：表头可用 `key` 代替 `id`。

序列化时 Kentucky **始终写出完整 11 列**（即使可选列为空字符串）。角色表始终写出 5 列（含 `model_node`）。

---

## 6. 导出产物（非热编辑主路径）

用户可从当前文件或勾选句子导出到同目录旁路文件：

1. **管线 CSV**：列 `id,speaker,text,note,scene` + 可选 `emotion` / `condition` / `audio` / `focus_node` / `font_size` / `text_color`  
   文件名例：`{stem}-pipeline.csv`
2. **本地化精简**：`keys,<lang>`，每行 `id,text`（**不含**演出列）  
   文件名例：`{stem}-locale-zh.csv`

这些是普通 `.csv`，Kentucky 不会用对话编辑器打开它们。热联动请盯源文件 `*.dialogue.csv` + `characters.csv`。

---

## 7. 磁盘联动行为（Kentucky 侧保证）

| 行为 | 说明 |
|------|------|
| 打开工作区 | 用户选 `dialogue/`（或任意含角色表与台词的目录） |
| 保存 | `Ctrl+S` → 直接 `writeFile` 覆盖磁盘；无中间缓冲「仅内存」长期态 |
| DocumentHub | 多窗口同路径共享缓冲；最终落盘仍是同一文件 |
| 不推送 | **没有** WebSocket / IPC / Godot 专用端口；Kentucky **不**通知引擎 |

因此 Godot 侧需要自行：

1. **编辑器内：** 轮询 `FileAccess.get_modified_time` 或 OS 监视；变更后 `EditorFileSystem.update_file` + `scan()`（或你项目惯用的重载方式）。
2. **运行时：** 连接你自己的信号总线，或 play 时同样轮询；收到变更后重新 `FileAccess` 解析 CSV。
3. **建议监视：** `{dialogue_dir}/characters.csv`、`{dialogue_dir}/**/*.dialogue.csv`、同 stem 的 `*.dialogue.meta.json`。

### 建议的插件职责（供你实现时对照）

伪需求清单（实现细节由你定）：

- [ ] 可配置监视根路径（默认 `res://dialogue`）
- [ ] 检测 mtime / 增删（`*.dialogue.csv`、`*.dialogue.meta.json`、`characters.csv`）
- [ ] 读 meta 的 `godot_scene` / `dialogue_id`，读角色的 `model_node`
- [ ] 解析并执行行级 `focus_node` / `font_size` / `text_color`（含对焦回退链与字号/颜色默认）
- [ ] 通知 `EditorFileSystem`（若需要 FileSystem 面板刷新）
- [ ] 向游戏对话系统发「这些路径变了」事件（路径列表）
- [ ] 热更时机：建议下次开始对话时生效

Kentucky **不会**注册名为 `KentuckyDialogueBus` 的 autoload——那只是此前草案命名；你的总线叫什么都可以。

---

## 8. Godot 加载器建议契约

最小可用：

```text
load_characters(path) -> Dictionary[id -> { name, color, note, model_node }]
load_dialogue(path)   -> Array[{ id, speaker, text, note, emotion, scene, condition, audio,
                                 focus_node, font_size, text_color }]
load_meta(path)       -> { godot_scene, dialogue_id }  # from *.dialogue.meta.json
                         # 台词行保持 CSV 行序
resolve_speaker(line) -> character or fallback "unknown"
resolve_focus(line)   -> line.focus_node or char.model_node or trigger.default_subject
apply_ui(line)        -> font_size / text_color（空或 0 → UI 默认）
```

播放时用 `speaker` 查角色表；缺角色时应用兜底名（Kentucky UI 文案为「未知角色」），**不要丢弃该行**（id 仍有效）。

---

## 9. 明确不做（Kentucky 侧）

- Godot ↔ Kentucky 双向实时同步协议 / IPC / 内嵌引擎  
- Kentucky 内预览对焦、播放打字机、校验节点存在  
- Kentucky 监视外部改盘并自动重载已打开标签（另开需求）  
- `characters.csv` 路径可配置  
- 分支/条件可视化、表达式编辑器  
- 多语言对照编辑、音频播放资源库  
- Markdown 内嵌台词  
- 附带官方 Godot 插件二进制（插件由 Godot 工程自研；契约在 extras）  
- 旁路 `*.dialogue.stage.json`（v1.1 选用主 CSV 加列）

---

## 10. 自测清单

### Kentucky 侧

1. 新建台词文件写回表头含 **11 列**；旧 8 列文件打开后保存升为 11 列且原数据不丢、id 不变。  
2. 只改 `focus_node` / `font_size` / `text_color` 存盘后，`id` / `speaker` / `text` 不变。  
3. 三字段均可清空；清空后磁盘为空字符串。  
4. UI 写入 `font_size=0` 存盘后为空串。  
5. 「复制为新台词」：新 id，演出三字段与源相同。  
6. `characters.model_node` 仍可创建/编辑；缺列旧角色表读入兼容。  
7. meta.json 行为与 v1 一致（创建/重命名/删除同步）。  
8. 文档 extras 与 `dialogueCsv.ts` 行为一致。

### 联调（Godot 侧另验）

1. Kentucky 打开 `YourGodotProject/dialogue`。  
2. 改一句 `text` 或演出字段，`Ctrl+S`，用文本编辑器确认磁盘已变、**id 未变**。  
3. Godot 插件在不切换焦点（或短延迟内）检测到变更；下次开对话读到新值。  
4. 删除角色后，旧 `speaker` id 仍留在 CSV；加载器兜底显示。  

---

## 参考实现位置（Kentucky 源码）

| 内容 | 路径 |
|------|------|
| 解析/序列化/id 分配 / 字号颜色归一 | `src/renderer/src/editors/dialogueCsv.ts` |
| 编辑器 UI / 存盘 / Godot 演出区 | `src/renderer/src/editors/DialogueEditor.tsx` |
| 产品决策 | `project-memory/product-decisions.md` |
| 工作流简述 | `project-memory/how-to-run.md` |
