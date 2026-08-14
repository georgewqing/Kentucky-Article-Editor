# 契约：Agent UI（U1–U3）

> **状态**：OPEN  
> **进度**：[`../BOARD.md`](../BOARD.md)  
> **互补**：挂载/Skill → [`./workbench-chrome.md`](./workbench-chrome.md)；文学工具 → [`./literary-memory.md`](./literary-memory.md)

## 0. 范围与非目标

| 纳入 | 不纳入（另文） |
|------|----------------|
| Composer `/` 菜单（Skills + Commands） | M1–M4 文学 YAML 工具实现（→ literary OPEN） |
| 上下文 `buckets` + ContextBar | 挂载 chip / Skill 胶囊最终形态 / 选区菜单 / 展开记忆（→ [`workbench-chrome.md`](./workbench-chrome.md)） |
| `ai:contextUsage` → `{ used, limit, buckets[] }` | Monaco / TipTap 编辑器行为 |
| ContextBar 点击弹层 + 色条按 **limit** 比例 | Electron `bindClientAreaFill`；Cursor MCP 桶 |
| 消息区无横向滑块、slash 可滑无滑块 | — |

---

## 1. Win → Android 文件映射

| Win（源真相） | Android 目标 | 改造要点 |
|---------------|--------------|----------|
| `win/src/main/ai/contextEstimate.ts` | `android/src/ai-runtime/contextEstimate.ts` | 纯估算；依赖 `LITERARY_SYSTEM_PROMPT` / `getWritingToolsForMode` / `skillsCatalogText` / `estimateSessionTokens` |
| `win/src/main/ai/registerAiIpc.ts` → `ai:contextUsage` | `ai-runtime` 或 Platform bridge 等价 handler | 签名：`(sessionId, mode?)`；无 session 仍返回固定开销桶 |
| `win/src/preload/index.ts` `aiContextUsage` | `platform` / Capacitor bridge | 返回含 `buckets` |
| `win/src/renderer/src/state/aiStore.ts` | `android/src/state/aiStore.ts` | `contextBuckets`；`refreshContextUsage(mode)`；`send` 解析 `/skillId` |
| `win/src/renderer/src/ai/AiComposer.tsx` | `android/src/ai/AiComposer.tsx` | slash 菜单；触屏点选优先；**skill/挂载见 chrome OPEN** |
| `win/src/renderer/src/ai/AiPanel.tsx` `ContextBar` | `android/src/ai/AiPanel.tsx` | 弹层勿裁切；UserMessageBody 见 chrome OPEN |
| `win/src/renderer/src/styles/global.css`（`.ai-slash-*` / `.ai-context-*`） | `android/src/styles/global.css` | 同步选择器；色板见 §4；mount/skill 类见 chrome OPEN |
| `win/src/renderer/src/i18n/locales/{zh-CN,en}.json` | Android 同名 i18n | `ai.slash*` / `ai.contextUsage*` / `ai.contextBucket.*` |
| `win/src/main/ai/voiceFiles.ts`（schemaHint / narrator→notes） | `ai-runtime/voiceFiles.ts` | 随 literary H2；键见 §5 |
| `win/src/main/ai/memoryNudge.ts` | `ai-runtime/memoryNudge.ts` | 随 literary H1 |

---

## 2. `/` Skills + Commands 预览（图1 对齐）

### 2.1 触发

- Composer `draft` 匹配：末尾 token 为 `/` 或 `/partial`（正则语义：`/(?:^|[\s])(\/[^\s]*)$/`）。
- 打开时拉取 `listSkills()`，**仅 `enabled: true`**。

### 2.2 分区

| 区 | 内容 |
|----|------|
| **Skills** | `/<skillId>` + description（frontmatter）；默认预览 4 条，其余「显示另外 N 个」展开 |
| **Commands** | `/agent` `/plan` `/outline` `/ask`（切 `agentMode`）· `/new`（`newChat` + 清空 draft） |

过滤：query 对 id / name / label 子串匹配（小写）。

### 2.3 选择行为

| 项 | 行为 |
|----|------|
| Skill | **见 chrome OPEN**：设 `composerSkillId`，暖色胶囊；**不要**只写入 `/id ` 纯文本 |
| Mode 命令 | `setAgentMode`；去掉 slash token |
| `/new` | `newChat()`；`draft=''` |

键盘（桌面/外接键盘）：↑↓ / Enter / Tab 确认；Esc 关闭。触屏：点击即可。

### 2.4 发送时 skill 调用契约

**权威**：[`workbench-chrome.md`](./workbench-chrome.md) §3。

摘要：`composerSkillId` / 文本 `/id` → `aiSend.skillId`；runtime **注入 SKILL.md 正文**；气泡展示胶囊。历史「仅 turnSystemHint 催 read_skill」已不够。

Agent 必须已有 `read_skill` / `list_skills` / `loadSkill`（既有工具；随 W/H 移植）。

### 2.5 UI 类名（便于 CSS 对齐）

`.ai-slash-menu` · `.ai-slash-section` · `.ai-slash-section-title` · `.ai-slash-item` · `.ai-slash-item-label` · `.ai-slash-item-desc` · `.ai-slash-more` · `.ai-slash-empty`

滚动：`overflow-y: auto` 保留滚轮/触控滑动，但 **隐藏滑块**（`scrollbar-width: none` + `::-webkit-scrollbar { display:none }`），与 tab-bar 一致。

占位文案：`ai.composerPlaceholder` 含「/ 技能」。

### 2.6 消息区滚动（同轮修 · 勿回退）

| 选择器 | 契约 |
|--------|------|
| `.ai-messages` / `.ai-history` | `overflow-x: hidden`；`overflow-y: auto` — **禁止**面板底部横向滑块 |
| `.ai-msg` / `.ai-msg-body` | `min-width: 0`；`max-width: 100%` |
| `.ai-msg-body pre` | `max-width: 100%`；内部 `overflow-x: auto`（代码块可单独横滚） |
| `.ai-proposal-diff` | `overflow-x: hidden`；竖滚 |
| `.ai-pane` / `.ai-messages-wrap` | `overflow: hidden`；`min-width: 0` |

### 2.7 Android 注意

- 抽屉高度有限：菜单 `bottom: calc(100% + 6px)` 可能被裁；可改为 `max-height: min(40vh, 320px)` + 内部滚动，或贴输入框上方且保证在 drawer 内。
- slash 菜单：**可滑、无滑块**（同 Win）。
- 不要实现 Cursor 的 MCP/Commands 全家桶；只对齐上表。

---

## 3. 上下文结构用量（图2 对齐）

### 3.1 API

```ts
aiContextUsage(sessionId: string, mode?: AgentMode): Promise<{
  used: number
  limit: number
  buckets: Array<{ id: string; tokens: number }>
}>
```

- `sessionId` 空 / 无会话：仍估算固定开销（system/tools/skills/rules），`conversation: 0`。
- `used` **必须**等于各桶 `tokens` 之和（与 UI 头数字一致）。
- `limit` = 设置里的 `contextWindow`。

### 3.2 桶定义（Win `contextEstimate.ts`）

| id | 估算来源 |
|----|----------|
| `system` | `LITERARY_SYSTEM_PROMPT('', mode, { skillsCatalog:'', webSearchEnabled })` |
| `tools` | `JSON.stringify(getWritingToolsForMode(mode, …))` |
| `skills` | `skillsCatalogText()`（可 0） |
| `rules` | 非空 `styleMemo` → `Style memo:\n…`（可 0，UI 可隐藏 0 桶） |
| `conversation` | `estimateSessionTokens(session)`（约 `ceil(len/4)`） |

Token 启发：`estimateTokensFromText` ≈ `ceil(chars/4)`（与会话估算同一函数）。

**禁止**把色条按「分项合计」拉满 100%——必须按 **`tokens / limit`**；剩余轨道 = 未用容量。

### 3.3 UI

- 顶栏可点 → 弹层标题「上下文用量」+ `pct%` + `used / limit`。
- 分段色条（顶栏细条 + 弹层粗条）同一比例。
- 图例：各桶 + **剩余容量**（`limit - used`）。
- Store：`contextUsed` / `contextLimit` / `contextBuckets`；切换 `agentMode`、会话变更、弹层打开时 `refreshContextUsage`。

### 3.4 色板（低饱和冷色 · 浅→深）

与 Win `AiPanel.tsx` `BUCKET_COLORS` 一致：

| id | hex |
|----|-----|
| system | `#8a9aa8` |
| tools | `#6f8798` |
| skills | `#5a7d8c` |
| rules | `#4a6e80` |
| conversation | `#3d5a6c` |
| free（图例点） | 半透明 muted + inset border |

勿改回高饱和紫/橙/红。


> **2026-08-12**：固定冷色板已由 Win **U10** 取代——分段色用 `accentTone(accent, strength, themeMode)`（见 [`shell-ux.md`](./shell-ux.md) §3）。移植 U2 时勿再写死旧 hex 表；剩余容量点仍中性灰。

色条宽度 = `tokens / limit * 100%`（**不是** `tokens / used`）；剩余灰轨 = 未用容量。头栏 `used` 必须等于各桶之和。

### 3.5 CSS 类名

`.ai-context-bar` · `.ai-context-trigger` · `.ai-context-track` · `.ai-context-seg` · `.ai-context-popover` · `.ai-context-popover-head` · `.ai-context-popover-track` · `.ai-context-legend` · `.ai-context-dot` · `.ai-context-hint`

弹层：`z-index` 高于消息列表；窄抽屉内 `left/right: 8px`，避免横向溢出。

---

## 4. 关联：文学记忆增量（须与 literary OPEN 一并读）

以下已在 Win 落地，指纹 **`2026-08-11-j`**；详约以 literary OPEN 为准，此处只列移植易漏点：

| 项 | 契约 |
|----|------|
| 防遗忘 | `memoryNudge.ts`：系统 CRITICAL 清单；散文结果 `memoryHint`（非 `reviewHint`）；L5 CTA 优先保留 |
| voice_anchor 块键 | `person` · `tense` · `sentence` · `metaphorDensity` · `lexicon` · `notes`；**无** `narrator`（写入时 alias→`notes`） |
| 读写回显 | `read_voice_anchor` / `propose_set_voice_anchor` 结果含 `schemaHint` |
| 工具 description | literary 工具以 `CALL WHEN/BEFORE/AFTER…` 起头 |

---

## 5. 布局铺满（部分适用 Android）

Win Electron 另有 `bindClientAreaFill`（maximize 重申 contentSize）——**Android 不移植**。

两端 CSS 应对齐：

```css
html, body, #root { width:100%; height:100%; min-width:100%; min-height:100%; }
.app-root, .workbench { width:100%; /* + 既有 flex/min-height:0 */ }
```

避免 WebView 内工作台未撑满抽屉/全屏区域。

---

## 6. 建议移植顺序（Android）

1. Platform / bridge：`aiContextUsage` 返回 `buckets`（可先 stub 再接 `contextEstimate`）  
2. `contextEstimate.ts`（依赖 tools/skills 提示词已存在或可临时简化桶）  
3. `aiStore`：`contextBuckets` + `refreshContextUsage` + send skill hint  
4. `AiPanel` ContextBar 弹层 + 色板 + **按 limit 比例**  
5. `AiComposer` slash 菜单 + i18n  
6. 随 H1/H2：`memoryNudge` + `voiceFiles` schemaHint  
7. 真机 §7 验收；勾选 OPEN U1–U3  

---

## 7. 验收清单

指纹：任意写入类工具结果 `toolApi` 与 Win 当前一致（现 `2026-08-14-a`）。

1. 输入 `/` → 菜单出现 Skills（若有启用 skill）+ Commands；点 skill 得到 `/id `；菜单**无可见滑块**但仍可滚轮滑动  
2. 仅发 `/literary-voice`（或其它 id）→ 本轮 agent 应调用 `read_skill`（或至少收到 turnSystemHint）  
3. `/plan` → 模式切到计划且 slash 清除  
4. 点「上下文」→ 弹层；`used` = 分项之和；色条对话段宽度 ≈ `conversation/limit`（非拉满整条）  
5. 色条为冷灰蓝阶，无高饱和紫/橙/红  
6. 图例含「剩余容量」  
7. 窄宽 AI drawer（≤1100px）菜单与弹层可滚可点、不被裁切  
8. 长对话 / 宽表格消息区：**底部无横向滑块**；竖滚正常  
9. 挂载文件：Composer 行内冷青蓝 chip；发送后气泡含 chip + 正文；可从文件树拖入；会话 JSON 有 `attachedPaths`

全部通过后：本文件 → **CLOSED**；`BOARD.md` 中 U1–U4 ✅；`changelog.md` 留一条。

---

## 8. Grill / 产品约束（勿回退）

- 上下文数字是 **启发式估算**，不宣称与供应商 tokenizer 一致。  
- 色条相对 **contextWindow**，不是相对 used。  
- Skill 斜杠是 UX 加速；真正执行仍靠 `read_skill`，不在客户端跑 skill 脚本。  
- 不把 `memoryHint` 塞进面向用户的 `reviewHint`。
