# KENTUCKY ↔ Godot 台词兼容说明（给 Godot 侧自研插件）

> **本仓库不附带 Godot 插件。** 以下为数据契约与联动约定，便于你在自己的 Godot 工程里写监视/重载逻辑。

Kentucky 只保证：打开文件夹后编辑，`Ctrl+S` **写同一份磁盘文件**。引擎里「热更新」完全由你的 Godot 代码负责（读盘 / 监视 mtime / `EditorFileSystem.scan` 等）。

---

## 1. 推荐工程布局

把 **台词目录本身** 设为 Kentucky 工作区根（因 `characters.csv` 路径固定为工作区根，不可配置）：

```text
YourGodotProject/
  dialogue/                    ← Kentucky「打开文件夹」指向这里
    characters.csv             ← 角色表（必须在此根目录）
    tavern.dialogue.csv        ← 台词源文件（扩展名必须是 .dialogue.csv）
    intro.dialogue.csv
  scripts/
    your_dialogue_loader.gd    ← 你的加载器：读上述路径
  addons/
    your_plugin/               ← 你自己的监视插件（本仓库不提供）
```

热编辑主路径 = 上述 **源文件**。Kentucky「导出管线 CSV / 本地化 CSV」是可选副本，**不要**当成热编辑真相，除非你自己再接线。

---

## 2. 文件识别

| 文件 | Kentucky 行为 |
|------|----------------|
| `*.dialogue.csv` | 打开 → 对话编辑器（聊天 UI） |
| `characters.csv` | 普通文本（Monaco）；由对话编辑器创建/更新角色时自动读写 |
| 其它 `*.csv` | Monaco，**不会**当台词编辑 |

路径匹配：大小写不敏感，后缀必须是 `.dialogue.csv`（例如 `foo.Dialogue.CSV` 也认）。

---

## 3. `characters.csv`（角色表）

**位置：** Kentucky 工作区根 = 建议的 `res://dialogue/characters.csv`。

**表头（固定列名，顺序建议如下）：**

```text
id,name,color,note
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 稳定角色 id；台词行的 `speaker` **引用此值**，不是显示名 |
| `name` | 是 | UI 显示名 |
| `color` | 否 | 气泡/名字颜色，如 `#88c0d0`；缺省 Kentucky 用默认色 |
| `note` | 否 | 作者备注 |

规则：

- 必须先有角色才能在 Kentucky 里发言（`@` / 说话人选择器只列已创建角色）。
- 可删除角色：仍被引用的台词保留原 `speaker` id，UI 显示「未知角色」。
- **没有** `display_name` 列。

示例：

```csv
id,name,color,note
guard,守卫,#d08770,酒馆门口
rea,莉娅,#88c0d0,
```

---

## 4. `*.dialogue.csv`（台词源）

**表头（固定列名）：**

```text
id,speaker,text,note,emotion,scene,condition,audio
```

| 列 | 必须 | 说明 |
|----|------|------|
| `id` | 是 | 全工作区稳定唯一；Godot 应用此键引用句子 |
| `speaker` | 是 | **character `id`**，不是 `name` |
| `text` | 是 | 台词正文（可含逗号/换行，见 CSV 转义） |
| `note` | 否 | 作者备注 |
| `emotion` | 否 | 情绪（配音向，自由文本） |
| `scene` | 否 | 场景标签；新建默认 = 文件名 stem（去掉 `.dialogue.csv`） |
| `condition` | 否 | 简单条件/标记，自由文本，**非**表达式引擎 |
| `audio` | 否 | 音频文件名（仅字段，Kentucky 不播放） |

**行序 = 播放/阅读顺序**（不要按 id 排序当播放序）。

示例：

```csv
id,speaker,text,note,emotion,scene,condition,audio
tavern_guard_001,guard,站住！,入口第一句,alert,tavern,,
tavern_rea_001,rea,"你好，我是莉娅。",,,tavern,,
```

### 稳定 id 规则

- 格式：`{scene|文件stem}_{character_id}_{三位序号}`  
  例：`tavern_guard_001`
- `scene` 空则用文件 stem。
- 改 `text` / `note` / `emotion` / `speaker` / `scene`：**默认不改 id**。
- 仅 Kentucky「复制为新台词」会生成新 id。
- 冲突时在 **整个 Kentucky 工作区** 所有 `.dialogue.csv` 内顺延序号。

Godot 侧应用：用 `id` 做字典键；不要假设 id 会因改字而变。

---

## 5. CSV 编码与转义（解析时注意）

Kentucky 使用近似 RFC4180：

- UTF-8；可能带 BOM（解析时应剥掉 `\uFEFF`）。
- 字段含 `,` `"`` 换行时：用双引号包裹，内部 `"` → `""`。
- 行结束：`\n`（写回时 Kentucky 用 `\n`）；读入时忽略单独 `\r`。
- 空文件/仅表头：合法（0 句台词）。
- 表头列名匹配时 **大小写不敏感**；台词文件若缺 `id`/`speaker`/`text` 列则视为无效（打开为空列表）。历史兼容：表头可用 `key` 代替 `id`。

序列化时 Kentucky **始终写出完整 8 列**（即使可选列为空字符串）。

---

## 6. 导出产物（非热编辑主路径）

用户可从当前文件或勾选句子导出到同目录旁路文件：

1. **管线 CSV**：列 `id,speaker,text,note,scene` + 可选 `emotion` / `condition` / `audio`  
   文件名例：`{stem}-pipeline.csv`
2. **本地化精简**：`keys,<lang>`，每行 `id,text`  
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
3. **建议监视：** `{dialogue_dir}/characters.csv` 与 `{dialogue_dir}/**/*.dialogue.csv`（至少一层目录内所有 `.dialogue.csv`）。

### 建议的插件职责（供你实现时对照）

伪需求清单（实现细节由你定）：

- [ ] 可配置监视根路径（默认 `res://dialogue`）
- [ ] 检测 mtime / 增删
- [ ] 通知 `EditorFileSystem`（若需要 FileSystem 面板刷新）
- [ ] 向游戏对话系统发「这些路径变了」事件（路径列表）
- [ ] （可选）运行时 `start_watch`，方便编辑器 F5 边玩边改

Kentucky **不会**注册名为 `KentuckyDialogueBus` 的 autoload——那只是此前草案命名；你的总线叫什么都可以。

---

## 8. Godot 加载器建议契约

最小可用：

```text
load_characters(path) -> Dictionary[id -> { name, color, note }]
load_dialogue(path)   -> Array[{ id, speaker, text, note, emotion, scene, condition, audio }]
                         # 保持 CSV 行序
resolve_speaker(line) -> character or fallback "unknown"
```

播放时用 `speaker` 查角色表；缺角色时应用兜底名（Kentucky UI 文案为「未知角色」），**不要丢弃该行**（id 仍有效）。

---

## 9. 明确不做（Kentucky 侧）

- Godot ↔ Kentucky 双向实时同步协议  
- Kentucky 监视外部改盘并自动重载已打开标签（另开需求）  
- `characters.csv` 路径可配置  
- 分支/条件可视化、表达式编辑器  
- 多语言对照编辑、音频播放资源库  
- Markdown 内嵌台词  

---

## 10. 自测清单（你做完插件后）

1. Kentucky 打开 `YourGodotProject/dialogue`。  
2. 改一句 `text`，`Ctrl+S`，用文本编辑器确认磁盘已变、**id 未变**。  
3. Godot 插件在不切换焦点（或短延迟内）检测到变更并刷新/发信号。  
4. 运行时对话系统重载后读到新 `text`。  
5. 删除角色后，旧 `speaker` id 仍留在 CSV；加载器兜底显示。  

---

## 参考实现位置（Kentucky 源码）

| 内容 | 路径 |
|------|------|
| 解析/序列化/id 分配 | `src/renderer/src/editors/dialogueCsv.ts` |
| 编辑器 UI / 存盘 | `src/renderer/src/editors/DialogueEditor.tsx` |
| 产品决策 | `project-memory/product-decisions.md` |
| 工作流简述 | `project-memory/how-to-run.md` |
