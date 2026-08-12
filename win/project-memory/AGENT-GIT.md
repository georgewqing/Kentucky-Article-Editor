# Agent / SCM Git — 完整记录（Win）

> **状态**：已定稿落地 · 当前指纹 `toolApi: "2026-08-12-l"`（须完整重启 Electron）  
> **时间线**：[`changelog.md`](./changelog.md) §80–§89  
> **产品表**：[`product-decisions.md`](./product-decisions.md) · **踩坑**：[`gotchas.md`](./gotchas.md)  
> **Android 契约**：[`../../android/project-memory/open/auto-apply-git.md`](../../android/project-memory/open/auto-apply-git.md)（本大版本不移植代码）  
> **交接**：[`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md)

本文是 Kentucky Win **Git（SCM UI + Agent 工具）** 的单一完整说明：产品决定、工具契约、自动行为、UI、冒烟结论、源码索引。后续对话改 Git **先读本文**。

---

## 1. 产品决定（摘要）

| 项 | 决定 |
|----|------|
| 安全网 | Agent 文件始终写盘；误改靠 **Source Control 丢弃** / Undo；**保存 ≠ commit** |
| 建仓 | 打开/切换工作区 → `ensureWorkspaceGit`：无祖先 `.git` 则在**工作区根** `git init` + 默认 `.gitignore` + `kentucky.autoInit=true` |
| 可见性 | **`.git` / 点文件**在资源管理器与 Agent `list_dir` 中**不可见**（磁盘仍有标准 `.git`） |
| SCM UI | 活动栏 Source Control：status / diff / stage / unstage / commit / discard；用户可手动 init（ensure 失败时） |
| Agent 写 | `git_add` / `git_commit` / `git_remote_add` / `git_remote_remove` **立即执行**（无 Confirm）；聊天 **高亮结果卡** + Toast |
| Agent 读/同步 | `git_status` / `git_diff` / `git_log` / `git_pull` / `git_push` 立即执行 |
| Remote URL | https / ssh / git@ / `file://` / **本地路径（可含空格）** |
| 裸仓 | 本地 remote 目标不存在 → 自动 `git init --bare`（add 时与 push 前） |
| 禁止 | 任意 Shell；`--force` / `--force-with-lease`；任意 git argv |
| 新对话 | 每轮注入 **Git (L5)** + 系统提示 **`GIT_AGENT_PLAYBOOK`**，不依赖旧聊天记忆 |

**演变（勿回退到中间态）：**

- `-g`：曾用独立 Confirm 卡 → **`-i` 已废止**，改为自动执行 + 高亮卡  
- `-f` 报告 §七「OPEN」→ **已由 `-g`…`-l` 关闭**

---

## 2. 指纹年表

| toolApi | 要点 |
|---------|------|
| `2026-08-12-c` | SCM UI + Agent `git_status`/`git_diff`；始终写盘 |
| `2026-08-12-d` | quotepath / 中文路径；默认 ignore 含 `.kentucky/`（新建） |
| `2026-08-12-e` | `git_pull`/`git_push`；`ensureKentuckyGitignore` 幂等 |
| `2026-08-12-f` | FIND-J/K；status 非纯只读说明 |
| `2026-08-12-g` | （历史）Confirm 卡 add/commit/remote_add |
| `2026-08-12-h` | 打开工作区自动 init；点文件隐藏 |
| `2026-08-12-i` | 取消 Confirm；高亮卡 + Toast；`ai:gitOp` |
| `2026-08-12-j` | 本地/`file://` URL（含空格）；`git_remote_remove` |
| `2026-08-12-k` | 本地 remote 自动 `git init --bare` |
| **`2026-08-12-l`** | **Git L5 + playbook；工具 WHEN 描述（当前）** |

---

## 3. Agent 工具契约

所有写类结果须含 `toolApi`。写操作另经 `onGitOp` → 会话 `gitOps[]` + 事件 `ai:gitOp`。

| 工具 | 模式 | 行为要点 |
|------|------|----------|
| `git_status` | Plan/Outline/Agent | ensure 仓；返回 branch/remotes/files/`repoCreated?`/`gitignoreUpdated?`；**非纯只读** |
| `git_diff` | 同上 | `path` + `staged?`；缺路径/目录 → error；`staged=true` 不对 untracked 做全文 fallback |
| `git_log` | 同上 | `maxCount?`≤50；oneline |
| `git_pull` | 同上 | 无 remote → 清晰 error；可选 `ffOnly` |
| `git_push` | 同上 | **永不 force**；本地 remote 缺失则先 bare；可选 `setUpstream`+`branch`；可返回 `bareCreated` |
| `git_add` | **仅 Agent** | `all=true` 或 `paths[]`；立即执行 + 高亮卡 |
| `git_commit` | **仅 Agent** | `message` 必填；立即执行 + 高亮卡 |
| `git_remote_add` | **仅 Agent** | `name`+`url`；本地缺失 → bare；`bareCreated` 写入结果文案 |
| `git_remote_remove` | **仅 Agent** | `name`；清占位 remote |

**推荐配方：** `git_status` →（`git_diff`）→ `git_add` → `git_commit` → `git_push`  
**意图关键词（playbook）：** 备份 / 提交 / 推送 / 同步 / remote / 裸仓 / commit / push

### URL 校验（`isValidGitRemoteUrl`）

允许：`https?://` · `git://` · `ssh://` · `file://` · `user@host:path` · Windows 盘符 · UNC · `/` `./` `../` · `*.git` 相对名。**允许空格**（勿再 `/\s/` 一刀切）。

### 自动裸仓（`ensureLocalBareRepo`）

- 路径不存在 → `mkdir` 父目录 + `git init --bare`  
- 已是 Git 目录（有 `HEAD`/`objects`）→ 复用  
- 存在但非 Git → **报错不覆盖**

---

## 4. 每轮上下文（防新对话失忆）

| 注入 | 位置 | 内容 |
|------|------|------|
| **Git (L5)** | Editor context（`buildGitL5Summary`） | repo / branch / remotes / dirty 样本 + 短配方 |
| **GIT_AGENT_PLAYBOOK** | 系统提示（`proposalGate.ts`） | CRITICAL：新对话也要用 `git_*`；配方与关键词 |
| 工具 description | `tools.ts` | `WHEN: … Next: …` |

Plan/Outline：仅提示读/同步工具；写工具须切 Agent。

---

## 5. UI / IPC

| 层 | 内容 |
|----|------|
| SCM | `ScmPane`；`git:probe` / `ensure` / `status` / `diff` / stage / commit / discard / pull / push / remotes |
| 打开工作区 | `appStore.openWorkspace` / `switchWorkspace` → `gitEnsure` |
| Agent 写反馈 | `AiPanel` `GitResultCard`（flash 高亮）；Toast；无 Confirm/Reject |
| 会话 | `ChatSession.gitOps[]`；`message.gitOpIds`；旧 pending 加载 → rejected |
| 事件 | `ai:gitOp` `{ sessionId, op, highlight }` |
| 遗留 IPC | `ai:confirmGitOp` / `ai:rejectGitOp` 仍注册但 UI 不再调用 |

---

## 6. 默认 `.gitignore`（init / ensure）

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

`ensureKentuckyGitignore`：已有 ignore 时幂等补 `.kentucky/`。

---

## 7. 冒烟结论（test2 摘要）

| 项 | 结果 |
|----|------|
| 自动建仓 / 点文件隐藏 | ✅ |
| HTTPS `git_remote_add` | ✅ |
| 本地路径曾因空格被拒 | ✅ 已修（`-j`） |
| `git_remote_remove` | ✅ |
| push/pull 链路（假 GitHub URL） | ✅ 真实报错 |
| 本地裸仓缺失 | ✅ 自动 bare（`-k`）；推送前工作区须有 commit |
| 高亮卡 / 自动写 | ✅（`-i`） |
| 新对话仍调用 git | ✅ L5+playbook（`-l`） |

---

## 8. 源码索引

| 路径 | 职责 |
|------|------|
| `win/src/main/git/gitService.ts` | probe / ensure / status / diff / add / commit / remote* / pull / push / bare / **Git L5** |
| `win/src/main/git/registerGitIpc.ts` | `git:*` IPC |
| `win/src/main/ai/tools.ts` | 工具 def + cases；mode 前缀 |
| `win/src/main/ai/agentLoop.ts` | `commitGitOp`；消息组装注入 L5 |
| `win/src/main/ai/proposalGate.ts` | `TOOL_API_VERSION` · `WRITE_GATE_SUMMARY` · `GIT_AGENT_PLAYBOOK` |
| `win/src/main/ai/chatSessions.ts` | `GitPendingOp` / `gitOps` |
| `win/src/renderer/.../AiPanel.tsx` | `GitResultCard` |
| `win/src/renderer/.../aiStore.ts` | `ai:gitOp` → 会话 + Toast |
| `win/src/renderer/.../workbench/ScmPane.tsx` | SCM UI |
| `win/src/renderer/.../state/appStore.ts` | open/switch → `gitEnsure` |

---

## 9. 验收清单（重启后）

```
toolApi === "2026-08-12-l"
打开无仓文件夹 → 自动有 .git（资源树看不见）
git_status → remotes/branch/dirty；可能 repoCreated / gitignoreUpdated
git_add / git_commit → 高亮卡 + Toast（无 Confirm）
git_remote_add 本地带空格路径 → ok；缺失目录 → bareCreated
git_remote_remove → 可清 origin
git_push 本地 remote → 可补建裸仓；无 force
新开对话问「提交并推送」→ Agent 调用 git_*（见 L5）
无 remote 时 pull/push → 可读错误
```

---

## 10. 明确不做

- Agent Shell / 任意 git argv  
- force push  
- 分支图 / checkout UI（当前只读显示分支名）  
- 把 Confirm 卡加回写操作  
- Android 本大版本实现 Git（详约仍跟 Win 指纹）
