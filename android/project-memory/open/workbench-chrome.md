# 契约：Workbench Chrome（U4–U7）

> **状态**：OPEN  
> **Win**：changelog §70–73  
> **进度**：[`../BOARD.md`](../BOARD.md) · 互补 [`./agent-ui.md`](./agent-ui.md) · U4 须含 U12 CRITICAL  
> **顺序**：U7 → U4（+U12）→ U5 → U6

## 1. 总文件映射

| Win（源真相） | Android 目标 | 备注 |
|---------------|--------------|------|
| `win/src/renderer/src/ai/FileMountChip.tsx` | `android/src/ai/FileMountChip.tsx` | 新建；文件夹 `path/` + Folder 图标 |
| `win/src/renderer/src/ai/AiComposer.tsx` | `android/src/ai/AiComposer.tsx` | mounts 行、skill 胶囊、DnD、`composerSkillId` |
| `win/src/renderer/src/ai/AiPanel.tsx` | `android/src/ai/AiPanel.tsx` | `UserMessageBody`：chips 行 + 正文行 |
| `win/src/renderer/src/state/aiStore.ts` | `android/src/state/aiStore.ts` | 见 §2.3 / §3.3 |
| `win/src/renderer/src/workbench/dnd.ts` | `android/src/workbench/dnd.ts` | `KENTUCKY_PATH_MIME` |
| `win/src/renderer/src/workbench/FileTree.tsx` | `android/src/workbench/FileTree.tsx` | `effectAllowed: copyMove`；ExpandCtx |
| `win/src/renderer/src/workbench/explorerExpandPrefs.ts` | `android/src/workbench/explorerExpandPrefs.ts` | **已拷贝**；验展开记忆 |
| `win/src/renderer/src/workbench/SelectionContextMenu.tsx` | `android/src/workbench/SelectionContextMenu.tsx` | 新建；挂 `App` |
| `win/src/renderer/src/App.tsx` | Android 根组件 | 挂 `SelectionContextMenu` |
| `win/src/main/ai/chatSessions.ts` | `ai-runtime` 会话类型 | `attachedPaths` / `skillId` |
| `win/src/main/ai/agentLoop.ts` | `ai-runtime` agent loop | `readWorkspaceMention`；skill 正文注入 |
| `win/src/main/index.ts` `shell:openExternal` | Capacitor Browser / `window.open` | 仅 http(s) |
| `win/src/preload` + `platform` | Android Platform | `openExternal`；`aiSend.skillId`；`editor.attachedPaths` |
| `win/.../styles/global.css` | `android/.../styles/global.css` | `.ai-mount-*` `.ai-skill-*` `.ctx-menu-item` 等 |
| `win/.../i18n/locales/{zh-CN,en}.json` | Android 同名 | 见 §6 |

---

## 2. U4 · 文件 / 文件夹挂载

### 2.1 Composer UI

- 挂载区在输入框**上方单独一行**（`.ai-composer-mounts`），**不要**与 textarea 同行 flex（会挤断中文）。
- Chip：冷青蓝；`FileDown`（文件）/ `Folder`（目录）；可 × 移除。
- 目录路径约定：工作区相对路径，**尾部 `/`**（如 `chapters/`）；显示名 `basename/`。
- 输入：`placeholder` 始终显示；`rows≈2`；textarea `width:100%`。
- 拖入高亮：`.ai-composer.is-drop-target`。

### 2.2 拖放

- MIME：`application/x-kentucky-path`（`workbench/dnd.ts`）+ `text/plain` 绝对路径。
- FileTree `effectAllowed = 'copyMove'`（树内 move，Composer copy）。
- 仅接受**工作区内**路径；区外忽略（回形针导入 `.kentucky/refs/` 仍走原逻辑）。
- 文件夹：允许；写入 `composerAttachments` 时规范化为尾 `/`。
- 触屏：可无拖放，保留回形针选文件；文件夹可用 SAF/目录选择器后续加（非必须本轮）。

### 2.3 Store / 发送

```ts
composerAttachments: string[]  // 相对路径；目录带尾 /
addComposerAttachment / removeComposerAttachment  // 按去尾 / 去重
```

`aiSend.editor.attachedPaths` = 本轮纸夹挂载（可与 `@` mentions 合并进 `mentionedPaths`）。

`ChatMessage.attachedPaths?: string[]` 持久化到会话 JSON。

**不要**再写 `attachmentPreviews` / 示意页缩略图（已废弃）。

### 2.4 Runtime：目录挂载上下文

对 `mentionedPaths` / 挂载路径：

- 若为**文件**：读正文（既有截断策略）。
- 若为**目录**：浅层列表（跳过 `.git` / `node_modules`，最多 ~48 项），形如：

```
Mounted directory chapters/
[dir] act1
[file] notes.md
```

Win：`agentLoop.readWorkspaceMention`（`readAbsSafe` 先去尾 `/`）。

### 2.5 气泡

```
.ai-msg-user-content
  .ai-msg-user-chips   ← skill + file chips（flex wrap）
  .ai-msg-user-text    ← 正文（独立块，pre-wrap）
```

### 2.6 CSS 类（对齐）

`.ai-composer-input-wrap` · `.ai-composer-mounts` · `.ai-mount-chip` · `.ai-mount-chip-composer` · `.ai-mount-chip-message` · `.ai-mount-chip-icon` · `.ai-mount-chip-name` · `.ai-mount-chip-x` · `.ai-mount-chip.is-dir` · `.ai-composer.is-drop-target` · `.ai-msg-user-content` · `.ai-msg-user-chips` · `.ai-msg-user-text`

---

## 3. U5 · Skill 暖色胶囊 + 注入正文

### 3.1 交互（相对旧 U1 §2.3 的**变更**）

| 动作 | 行为 |
|------|------|
| `/` 菜单选 **Skill** | **不要**把 `/id ` 写进 draft；设 `composerSkillId = id`，draft 去掉 slash token |
| 胶囊 UI | 暖棕底 + 杏色字，圆角 pill：`/{id}`，可 × → `composerSkillId = null` |
| 与挂载并存 | 同一 `.ai-composer-mounts` 行：skill 在前，文件 chip 在后 |
| 发送按钮 | `draft.trim() \|\| composerSkillId` 即可发 |
| 纯文本 `/id …` | 仍兼容：整条匹配时解析 skill（无胶囊） |

### 3.2 发送契约

```ts
composerSkillId: string | null
aiSend({ text, skillId?, turnSystemHint?, editor })
```

- `text`：用户正文；若空且有 skill → `"Follow skill /{id} for this request."`
- `skillId`：写入 `ChatMessage.skillId`
- **主进程 / ai-runtime（关键）**：若有 `skillId`，`loadSkill(id)` 后把 **SKILL.md body** 注入本轮系统提示（CRITICAL），并说明用户消息里的 `/…` 是字面量不是命令。  
  → **不依赖**模型先调 `read_skill`（仍可调以取 extraFiles）。
- 气泡：若 content 恰为默认 Follow 句且有 `skillId`，**只显示胶囊**不显示样板句。

### 3.3 旧文档勘误

[`agent-ui.md`](./agent-ui.md) §2.3「选 skill 写入 `/id `」与 §2.4「仅 turnSystemHint 催 read_skill」以**本文为准**（胶囊 + 正文注入）。

### 3.4 CSS

`.ai-skill-chip` · `.ai-skill-chip-msg` · `.ai-skill-chip-label` · `.ai-skill-chip-x`  
色：背景 `color-mix(#9a6a32 …)`，字 `#f0c090`，边框暖棕。

---

## 4. U6 · 选中文段右键菜单

### 4.1 行为

- `document` capture `contextmenu`：有非空 `getSelection()` 才弹出。
- `preventDefault`；跳过：`.file-tree-wrap` · `.mindmap-host` · `.activity-bar` · `.app-menu-bar` · `.ctx-menu` · `.ai-slash-menu` · `.ai-context-popover`。
- 项：**Copy**（Ctrl/⌘+C）· 分隔 · **Select All**（Ctrl/⌘+A）· **Search with Google**（无快捷键）。
- Google：`https://www.google.com/search?q=…` → `openExternal`（仅 http/https）。
- Esc / 外点 / scroll 关闭；菜单项 `onMouseDown preventDefault` 保选区。

### 4.2 平台

| Win | Android |
|-----|---------|
| `shell:openExternal` IPC | `Browser.open` 或 `window.open`；Platform.`openExternal` |

### 4.3 CSS

复用 `.ctx-menu` / `.ctx-sep`；增 `.ctx-menu-item`（label + shortcut 两端对齐）· `.ctx-menu-shortcut`（`--fg-muted`）。

i18n：`menu.copy` / `menu.selectAll` / `menu.searchWithGoogle`。

---

## 5. U7 · 文件夹展开记忆

### 5.1 问题

旧逻辑：`useState(depth <= 1)` → 一进工作区子文件夹几乎全开。

### 5.2 契约

- Storage key：`kentucky:explorer-expand:<workspacePath归一化>`
- Value JSON：

```ts
{ rootOpen: boolean, expanded: string[] }
```

- `expanded`：工作区**相对路径**，`/` 分隔、小写。
- **默认**：`rootOpen: true`（能看见顶层条目）；`expanded: []`（子文件夹收起）。
- 切换工作区时 load；展开/收起时 save（跳过刚 load 的回写）。
- ExpandCtx：`isExpanded` / `setExpanded` / `toggle`；拖放到文件夹可 `setExpanded(true)`。

Win / Android：`explorerExpandPrefs.ts`（Android **已拷贝**）；FileTree 接 ExpandCtx。

### 5.3 验收

1. 新工作区（无记忆）：顶层可见，子夹关闭。  
2. 展开某夹 → 关应用再开同一工作区 → 仍展开。  
3. 换另一工作区 → 互不串记忆。

---

## 6. i18n 键

| Key | zh | en |
|-----|----|----|
| `menu.searchWithGoogle` | 使用 Google 搜索 | Search with Google |
| `ai.attachFiles` | 添加参考文件或文件夹 | Attach reference files or folders |
| `ai.removeAttachment` | 移除 | Remove |
| `ai.removeSkill` | 移除技能 | Remove skill |

（既有 `menu.copy` / `menu.selectAll` 复用。）

---

## 7. Grill / 产品约束（勿回退）

1. **无挂载示意页缩略图**（曾用真实正文撑出大黑块）。  
2. Skill 斜杠是 UX；芯片挂载时 **runtime 注入 SKILL 正文**，不是只靠模型自觉 `read_skill`。  
3. 不执行 skill `scripts`。  
4. 挂载路径不出工作区沙箱（区外导入仍进 `.kentucky/refs/`）。  
5. 展开记忆按工作区隔离；默认不要全开子文件夹。  
6. Electron `bindClientAreaFill` **不移植**；选区菜单可用 Web API。

---

## 8. 验收清单（Android）

1. U7：进工作区子夹默认收起；展开后重进恢复。  
2. U4：回形针 / 拖入文件与文件夹 → Composer chip；发送后气泡有 chip、无黑缩略图；Agent 能看到目录列表或文件内容。  
3. U5：`/` 选 skill → 暖色胶囊；发送后气泡有胶囊；Agent 行为符合该 skill（正文已注入）。  
4. U5：胶囊 + 正文里写 `/skills` → `/skills` 仍是字面量，不顶替胶囊 skill。  
5. U6：选中编辑器/消息文字右键 → Copy / Select All / Google；文件树右键仍是资源菜单。  
6. 窄 AI drawer：Composer mounts / skill 不裁切；消息 chips 与正文分行可读。

全部通过：本文件 → **CLOSED**；进度板 U4–U7 ✅；`changelog.md` 留一条。
