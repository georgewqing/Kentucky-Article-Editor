# Win 工具反馈对接 · SESSION 交接

> 更新：2026-08-11（Round H + Agent UI + Workbench Chrome §70–73）  
> **基线**：[`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)  
> **总清单**：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)  
> **需求归档**：[`REQ-literary-agent-capability-upgrade.md`](./REQ-literary-agent-capability-upgrade.md)  
> **Android 文学记忆**：[`../../android/project-memory/OPEN-literary-memory-parity.md`](../../android/project-memory/OPEN-literary-memory-parity.md)  
> **Android Agent UI（U1–U3）**：[`../../android/project-memory/OPEN-agent-ui-parity.md`](../../android/project-memory/OPEN-agent-ui-parity.md)  
> **Android Workbench Chrome（U4–U7）**：[`../../android/project-memory/OPEN-workbench-chrome-parity.md`](../../android/project-memory/OPEN-workbench-chrome-parity.md) ← **本轮移植主入口**

## 部署指纹

`toolApi: "2026-08-11-j"`（完整重启 Electron）

## Round H · 文学记忆（M1–M4）

- 工作区按需 YAML：`story_state.yaml` / `foreshadow.yaml` / `voice_*` / `glossary.yaml`；`materials/`；`revisions/`（非 Git）
- 启用态 = story_state 存在且 `chapters.length≥1`（stale + L5）
- continuity：表内一致性 + 可选 `assertions[]`；不搜正文道具名；冲突只警告
- 记忆类 YAML 始终 auto+强制落盘；materials 正文按 prose；restore 走提案 + DocumentHub
- L5：启用态计数摘要 + Before/After 调用 CTA（优先保留 CTA）
- 防遗忘：`memoryNudge.ts` — 系统 CRITICAL 清单；散文结果 `memoryHint`（**非** `reviewHint`）；工具 description `CALL WHEN…`
- `voice_anchor` 合法键：`person|tense|sentence|metaphorDensity|lexicon|notes`；`narrator`→`notes`；读写带 `schemaHint`
- Win 入口：`literaryTools.ts` / `literaryContinuity.ts` / `memoryNudge.ts` / `voiceFiles.ts` / `proposalGate` MEMORY_KINDS

## Agent UI（Composer / 上下文）· U1–U3

- `/` 菜单：Skills + Commands；↑↓/Enter；**选 skill → 暖色胶囊**（非 draft 纯文本）
- 上下文条可点：`contextEstimate` buckets；色条按 **limit**；冷灰蓝；剩余容量图例
- 滚动：消息区禁横向滑块；slash 可滑无滑块
- 详约：Android `OPEN-agent-ui-parity.md`

## Workbench Chrome · U4–U7（changelog §70–73）

**移植请整份对照** → Android [`OPEN-workbench-chrome-parity.md`](../../android/project-memory/OPEN-workbench-chrome-parity.md)

| ID | 摘要 | Win 入口 |
|----|------|----------|
| **U4** | 文件/文件夹挂载 chip；树拖入 Composer；目录尾 `/`；气泡无缩略图；`attachedPaths` + `readWorkspaceMention` | `FileMountChip` · `AiComposer` · `dnd.ts` · `agentLoop` |
| **U5** | Skill 胶囊；`composerSkillId` / `ChatMessage.skillId`；**发送时注入 SKILL.md 正文** | `AiComposer` · `aiStore` · `agentLoop` + `loadSkill` |
| **U6** | 选区右键 Copy / Select All / Google；`shell:openExternal` | `SelectionContextMenu` · `App` |
| **U7** | 文件夹展开记忆；默认子夹收起；`localStorage` 按工作区 | `explorerExpandPrefs` · `FileTree` ExpandCtx |

### 关键勿回退

- 无挂载「示意页」缩略图（曾黑坨）
- Skill 挂载 = 注入正文，不只靠模型自觉 `read_skill`
- Composer mounts / skill 与 textarea **分行**；气泡 chips 与正文 **分行**
- Electron letterbox fill **不移植**

## 布局 letterbox（Win Electron）

- CSS：`html/#root/.app-root/.workbench` 铺满
- 主进程：`bindClientAreaFill` — Android 只搬 CSS

```
重启后确认 toolApi:"2026-08-11-j"
U4：拖文件/夹进 Composer → chip；发出后气泡有 chip、无黑块
U5：/ 选 skill → 胶囊；Agent 按 skill 行事（正文已注入）
U6：选中文字右键 → Copy / 全选 / Google
U7：进工作区子夹默认收起；展开后重进仍展开
Android 移植：OPEN-workbench-chrome-parity.md（U4–U7）+ OPEN-agent-ui-parity.md（U1–U3）
勿 import win/
```
