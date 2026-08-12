# 契约：Auto-apply + Git + kmind 子树（U13–U18）

> **状态**：OPEN · **本大版本 Android 不实施**（仅契约镜像；**无** `android/src` Git 代码）  
> **Win 实现真源**：[`../../win/project-memory/AGENT-GIT.md`](../../win/project-memory/AGENT-GIT.md)  
> **指纹（须与 Win 当前一致）**：`toolApi: "2026-08-12-l"`  
> **进度**：[`../BOARD.md`](../BOARD.md) U13–U18 均为 ⏭  
> **移植顺序**：U14 → U13 → U18 → U15 → U16/U17（U16 或永久跳过）

**分工勿混：** Win `AGENT-GIT.md` = 已实现说明；本文 = Android 他日移植时的对照契约。改行为先改 Win，再同步本文指纹与表格。

## 1. U13 · 去掉 Accept / 只读变更反馈

### 1.1 产品

- 无 pending 变更卡、无 Accept / Reject / Apply-all / 底部 pending 条。  
- 助手气泡下挂 **只读**「已更新」卡：文件名、黄/蓝●、可展开 `formatProposalDiff`。  
- 工具 / 系统提示：**禁止**要求用户 Accept；写明已落盘、黄● 至 Ctrl+S、误改走 Source Control。

### 1.2 Win 文件 → Android

| Win | Android（他日） |
|-----|-----------------|
| `win/src/renderer/src/ai/AiPanel.tsx` | `android/src/ai/AiPanel.tsx`（或等价 Agent 面板） |
| `win/src/renderer/src/ai/proposalDiff.ts` | 同构拷贝（含 `computeChangeRanges`） |
| `win/src/renderer/src/state/aiStore.ts` | 可留 apply/reject IPC 壳，**UI 不调用** |
| `win/src/renderer/src/i18n/locales/{en,zh-CN}.json` | 删/改 Accept 文案；加 `settings.aiAutoWriteHint`、`scm.*` |
| `win/src/renderer/src/workbench/SettingsPage.tsx` | **删除**「Accept 后写盘 / 强制全部可审」控件 |

### 1.3 会话迁移

加载聊天 JSON 时：`proposals[].status === 'pending'` →  
- 有 `after` → `'applied'`  
- 否则 → `'rejected'`  
并回写会话文件。  
Win：`win/src/main/ai/chatSessions.ts` → `loadSession`。

### 1.4 验收

1. 新 Agent 写入不出现 Accept 按钮。  
2. 旧会话打开后不再卡 pending 条。  
3. 只读卡可展开看到 −/+。

---

## 2. U14 · 始终写盘 + DocumentHub 脏契约

### 2.1 为何不能「只缓冲」

Git 工作树必须等于磁盘。旧默认 `applyWritesToDisk: false` 与 SCM **互斥**，已推翻。  
`forceReviewAllWrites`：加载 **强制 false**，设置 UI **移除**，勿再持久化为 true。

### 2.2 门禁（proposalGate）

| 项 | 契约 |
|----|------|
| `decideAutoApply` | **恒 `auto: true`**（reason/kind 仅遥测） |
| `shouldPersistAutoToDisk` | **恒 `true`** |
| `TOOL_API_VERSION` | `"2026-08-12-l"` |
| Agent Git | 打开工作区 **自动 ensure**；`git_*` **全部立即执行**（无 force）；`git_add`/`git_commit`/`git_remote_add` → **高亮结果卡 + Toast**（无 Confirm）；discard 仍 SCM UI |
| `WRITE_GATE_SUMMARY` / `proposalToolNote` | 已写盘；勿提 Accept；误改 → SCM |

Win：`win/src/main/ai/proposalGate.ts`、`agentLoop.ts`（`commitProposal` 总是 `applyProposalToDisk`）。

Android：`android/src/ai-runtime/` 对齐同名逻辑；**勿**再实现 multi_file → pending。

### 2.3 DocumentHub API

| API | 行为 |
|-----|------|
| `docApplyAgentWrite(path, content, baseline?)` | 磁盘已是 `content`；更新 hub `content`；**保留**既有 `originalContent`（首建时用 `baseline`/`before`）；**`dirty=true`**；`rev++`；广播 |
| `docApplyExternalWrite` | **仅** Soft 非 Agent 路径（如 `update_plan_step` 勾选）→ content=original、dirty=false。**Agent 禁止调用** |
| `docReloadFromDisk(path)` | 读盘 → content=original=磁盘、dirty=false、广播（Git discard 后） |
| `docEvict(path)` | 删 hub 条目（untracked 丢弃删除文件后） |

Win：`win/src/main/documentHub.ts`；`applyProposalToDisk` → `docApplyAgentWrite(..., proposal.before)`（`win/src/main/ai/tools.ts`）。

### 2.4 渲染层黄●

- `applyAiFileEdit`：`dirty: true`，`originalContent = before`；后台挂 tab（不抢焦点）。  
- Ctrl+S / `docSave`：original 追上 content，清脏，并 `clearAgentChangeRanges`。  
- `applyDocSnapshot`：当 hub 以更高 `rev` 且 `dirty===false` 且 content===original 推送时（Git reload），**信任 hub 清脏**并清高亮（勿再「本地 dirty 压过 hub clean」）。

Win：`win/src/renderer/src/state/appStore.ts`。

### 2.5 黄● vs Git M（文案）

| 标记 | 含义 |
|------|------|
| 黄 ● | 相对上次 **用户 Ctrl+S / 打开 / Git 重载** 的 baseline，编辑器未「确认」 |
| 蓝 ● | 新建 tab（`isNew`） |
| Git 字母 M/A/? | 相对 **HEAD**（旁路字母，**不要**复用 ●） |

**保存 ≠ commit。**

### 2.6 验收

1. Agent 写 md 后：磁盘已是新内容；标签黄●；hub.dirty=true；hub.original 仍为改前。  
2. Ctrl+S：黄●消失；Git 仍可能显示 M 直至 commit。  
3. 旧设置里 `applyWritesToDisk:false` 不再导致「编辑器已改、Git 空白」。

---

## 3. U15 · 段内高亮

### 3.1 数据

- Store：`agentChangeRanges: Record<pathKey, { startLine, endLine }[]>`（pathKey = 反斜杠小写）。  
- 由 `computeChangeRanges(before, after)` 计算（`proposalDiff.ts`，单外层 hunk，1-based 行号）。  
- 清除：Ctrl+S、关 tab、Git reload（hubClean）。

### 3.2 编辑器

| 编辑器 | 实现 |
|--------|------|
| Monaco（源码 / 其它文本） | `deltaDecorations` + CSS `.monaco-agent-change` |
| TipTap WYSIWYG | **不要求**字节级 decoration；可用多段 `lineFlash` 遮罩近似，或不做。切换源码可见精确高亮即可 |
| 台词 / kmind / 角色表 | **不做**段内高亮；仅黄● + 只读卡 |

### 3.3 验收

1. Agent 改 `.txt`/Monaco：改动行有浅色底。  
2. 保存后高亮消失。

---

## 4. U16–U17 · Git SCM + Agent 只读工具

### 4.1 UI

- `ActiveView` 增加 `'scm'`（原仅 `explorer | settings | home`）。  
- 活动栏独立图标 → `ScmPane`（侧栏 body；**勿**占用工程徽章逻辑）。  
- i18n 键空间：`scm.*`（标题用「版本控制 / Source Control」，与文学 `revisions/` **区分**）。

Win：

| 文件 | 职责 |
|------|------|
| `win/src/main/git/gitService.ts` | probe / findRoot / init / status / diff / stage / unstage / commit / discard |
| `win/src/main/git/registerGitIpc.ts` | `git:*` IPC |
| `win/src/preload/index.ts` + `platform/index.ts` | 暴露 API |
| `win/src/renderer/src/workbench/ScmPane.tsx` | UI |
| `ActivityBar.tsx` / `Sidebar.tsx` / `Workbench.tsx` | view 切换 |
| `aiSettings.gitPath` | 可选自定义 `git.exe` |

### 4.2 行为契约

| 项 | 决定 |
|----|------|
| 仓根 | 从 **当前工作区根** **向上**找 `.git`；若无则 **自动 init 于工作区根**（`ensureWorkspaceGit`）；SCM 绑定 `activeWorkspacePath` |
| 仓根 ≠ 工作区 | UI 显示「仓库根：…」提示（仅当祖先仓时） |
| 未建仓 | **自动创建**；仅 ensure 失败时显示重试按钮（不静默打扰） |
| init 时 | 写入/确保默认 `.gitignore`（含 `.kentucky/`）；`kentucky.autoInit=true`；**已有** ignore 时 `ensureKentuckyGitignore` 幂等补行 |
| 可见性 | **`.git` 与点文件不出现在资源管理器 / Agent `list_dir`**（磁盘仍有标准 `.git`） |
| 分支 | 只读显示当前分支名（无 checkout） |
| status 刷新 | 进 SCM / 手动刷新；建议：保存后、Agent 写入后再 debounce（Win 首版以进页+手动为主） |
| commit | **禁止空 message**（UI）；Agent `git_commit` **立即执行** + 高亮卡 |
| discard 已跟踪 | `git restore` → `docReloadFromDisk`（打开标签强制跟盘） |
| discard untracked | **二次确认** → 删文件 → `docEvict`；若 tab 打开则 force close |
| Agent | `git_status` / `git_diff` / `git_log` / `git_pull` / `git_push` / `git_add` / `git_commit` / `git_remote_add` 均立即执行；写操作高亮卡；**无** force / 任意 argv / Shell |

### 4.3 默认 `.gitignore`（init + ensure）

```
# Kentucky defaults
.DS_Store
Thumbs.db
desktop.ini
node_modules/
*.tmp
*.temp
~$*
.kentucky/
```

- 新建：整份写入。  
- 已有仓：`ensureKentuckyGitignore(repoRoot)` 若缺 `.kentucky/` 则追加（`git init` 与 `git_status` summary 均调用）。

### 4.4 Agent 工具契约（`toolApi >= 2026-08-12-l`）

| 工具 | 入参 | 成功形状（要点） | 失败 |
|------|------|------------------|------|
| `git_status` | — | `repoRoot, branch, remotes[], files[], gitignoreUpdated?, repoCreated?, toolApi`；可 auto-init + 写 ignore | 无 git |
| `git_diff` | `path`, `staged?` | `ok, diff, note?, toolApi`；路径 UTF-8 | 缺文件/目录 → `error`；`staged=true` **不对** untracked 做全文 fallback |
| `git_log` | `maxCount?` | `ok, lines[], toolApi` | 无仓 / 无提交 |
| `git_pull` | `remote?, branch?, ffOnly?` | `ok, stdout, stderr` | 无 remote；pull 非 0 |
| `git_push` | `remote?, branch?, setUpstream?` | 同上；本地 remote 缺失则先 `git init --bare`（`bareCreated`） | 无 remote；`setUpstream` 缺 branch；**永不 force** |
| `git_add` | `all?` / `paths[]` | `executed:true, opId` — **立即** stage + 高亮卡 | 缺参数 / git 失败 |
| `git_commit` | `message` | 同上 — 立即 commit | 空 message；identity/空暂存等 |
| `git_remote_add` | `name`, `url` | 立即 `remote add`；本地/`file://` 可含空格；**缺失路径自动建裸仓** | 非法；远程已存在；路径存在但非 Git |
| `git_remote_remove` | `name` | 立即 `remote remove` | 不存在 |

路径可读：所有 git 子进程前缀 `-c core.quotepath=false`；`unquoteGitPath` 兜底解码八进制（UTF-8 字节拼 Buffer）。

**高亮卡契约：** 会话 `gitOps[]`；事件 `ai:gitOp`；只读卡 + flash + Toast；无 Confirm/Reject。

**自动建仓：** Win `ensureWorkspaceGit` / IPC `git:ensure`；打开工作区与 `git:status` 调用。

Win：`win/src/main/git/gitService.ts` · `registerGitIpc.ts` · `tools.ts` · `agentLoop.ts`（`commitGitOp`）· `AiPanel` `GitResultCard` · `appStore.openWorkspace`。

### 4.5 冒烟回归要点（移植时勿丢）

详表见 Win [`changelog.md`](../../win/project-memory/changelog.md) **§81–82**。摘要：

- kmind 非法 id → `skipped`/`warnings`（moveSubtree/connect **区分**哪一端缺失）  
- continuity 未知角色状态 → `unknown_character`  
- reorder → `openingChanged`  
- performance：`font_size` 数字或空；`text_color` hex 或空  
- append / voice：未注册 id → `warnings`（仍可写）
- **OPEN**：无产品拍板缺口（Win `-g`…`-l` 已关 §七）；Android 仍 ⏭ 不写代码，移植时跟 Win `AGENT-GIT.md` + 本文。

### 4.6 验收

1. 无 Git：可读错误（安装 Git / 配 gitPath）。  
2. init 或首次 status / 打开工作区 → 自动有仓；`.gitignore` 含 `.kentucky/`；资源树**看不到** `.git`。  
3. Agent 改文件后 status 有条目；discard 后打开中的 md 回退。  
4. 空 message 无法提交（UI）。  
5. Agent `git_add`/`git_commit`/`git_remote_add` **立即执行**并出高亮卡；有 pull/push；无 remote 时报错。  
6. `git_diff` 缺路径报错；`staged=true`+untracked 不为全文假 diff。

---

## 5. U18 · 导图 `propose_kmind_edit` 增强

### 5.1 Schema 增量

| 字段 | 说明 |
|------|------|
| `updateNodes[].shape` | `'rect' \| 'rounded' \| 'ellipse'` |
| `updateNodes[].width` / `height` | 数字 |
| `addNodes` 亦可带 width/height | |
| `removeSubtree: string[]` | 每个 root：删自身 + **出边可达后代** + **所有触及这些 id 的边** |
| `moveSubtree: { rootId, newParentId }[]` | 去掉指向 root 的入边，再连 `newParentId → rootId` |
| `autoLayout` | 默认 **true**（含 moveSubtree 后） |

**不做**：节点填色、插图 / `imageOnly` / `.assets` 复制。

### 5.2 文件

Win：`win/src/main/ai/tools.ts`（`propose_kmind_edit` case + tool def）。  
Android：`ai-runtime` 同构 kmind 编辑。

### 5.3 验收

1. update 可改 shape。  
2. removeSubtree 不留悬空边。  
3. moveSubtree 后默认 relayout。

---

## 6. Android 特有风险（移植时）

| 风险 | 说明 |
|------|------|
| **无系统 Git** | 平板通常无 `git` CLI。选项：(a) 本版永久跳过 U16/U17；(b) 嵌入 isomorphic-git / libgit2；(c) 仅「会话 before 还原」弱替代。**开移植前必须产品拍板** |
| **pull/push 凭据** | 真机无交互式 credential helper 时 push/pull 易失败；须产品定「仅本机已配 SSH/凭据」或降级关掉 Agent push/pull |
| **SAF / 内容 URI** | 无稳定「工作区根路径」时 findGitRoot / status porcelain 路径映射困难 |
| **杀进程** | 始终写盘有利于防丢；须确认 WorkspaceIo 在 auto 路径真写 SAF |
| **DocumentHub 等价层** | Android 若无跨窗 hub，仍需统一「Agent 写盘 + original baseline + dirty」单一真相，避免重复旧三套状态 bug |
| **活动栏** | Android 若无 ActivityBar，SCM 入口改抽屉/设置子页，但契约不变 |
| **勿半套** | 只搬去 Accept 却仍 buffer-only → Git/黄● 语义再次崩盘 |

文学记忆 `revisions/` **不是** Git；工具文案继续写「非 Git」。

---

## 7. 他日移植验收清单（Android）

- [ ] U14：Agent 写后磁盘正确；黄●；Ctrl+S 清脏  
- [ ] U13：无 Accept UI；旧 pending 迁移  
- [ ] U15：文本编辑器高亮（能力范围内）  
- [ ] U18：kmind 子树 / shape + 非法 id → skipped  
- [ ] U16/U17：若做 Git——probe、ensure `.kentucky/`、`git_diff` 缺路径报错、staged 语义；pull/push 凭据策略已定  
- [ ] 冒烟对等：unknown_character、openingChanged、performance 校验、append/voice warnings  
- [ ] `toolApi` 与 Win 当前字符串一致（现 `2026-08-12-l`）  
- [ ] 不 `import` `win/`

全部通过：本文 → **CLOSED**；勾选 [`../BOARD.md`](../BOARD.md)；`changelog.md` 留一条。

---

## 8. Win 自检对照

- [x] Agent 写后：磁盘=新内容，hub.original=旧基线，hub.dirty=true  
- [x] Ctrl+S：original 追上，黄●与高亮清  
- [x] 缓冲-only 设置被忽略  
- [x] discard → reload / evict  
- [x] 旧 pending 迁移  
- [x] 无 git 时 SCM 提示  
- [x] 冒烟 d/e（§81–82）+ `git_pull`/`git_push`  
- [x] Android 契约在 `open/auto-apply-git.md`
