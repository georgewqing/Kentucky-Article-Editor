# Agent / SCM Git — 完整记录（Win）

> **状态**：已定稿落地 · 当前指纹 `toolApi: "2026-08-14-a"`（全局工具版本；Git 专档历史见表）；**本机沙箱扩展见 changelog §121**（须完整重启 Electron）  
> **时间线**：[`changelog.md`](./changelog.md) §80–§95、**§120–§121**  
> **产品表**：[`product-decisions.md`](./product-decisions.md) · **踩坑**：[`gotchas.md`](./gotchas.md)  
> **Android：** 独立工程（本机常见 `../Kentucky for Android/`）用 isomorphic-git，禁止 `git.exe`。契约在该工程 `project-memory/open/auto-apply-git.md`。  
> **交接**：[`SESSION-TOOL-FEEDBACK.md`](./SESSION-TOOL-FEEDBACK.md)

本文是 Kentucky Win **Git（SCM UI + Agent 工具）** 的单一完整说明：产品决定、工具契约、自动行为、UI、冒烟结论、源码索引。后续对话改 Git **先读本文**。

---

## 1. 产品决定（摘要）

| 项 | 决定 |
|----|------|
| 安全网 | Agent 文件始终写盘；误改靠 **Source Control 丢弃** / Undo；**保存 ≠ commit** |
| 建仓 | 打开/切换工作区 → `ensureWorkspaceGit`：**只看工作区根** `.git`（不向上找父仓）；没有则 `git init` + 默认 `.gitignore` + `kentucky.autoInit=true` |
| 可见性 | **`.git` / 点文件**在资源管理器与 Agent `list_dir` 中**不可见**（磁盘仍有标准 `.git`） |
| SCM UI | 活动栏 Source Control：status / diff / stage / unstage / commit / discard；用户可手动 init（ensure 失败时） |
| Agent 写 | `git_add` / `git_commit` / `git_remote_add` / `git_remote_remove` **立即执行**（无 Confirm）；聊天 **高亮结果卡** + Toast |
| Agent 读/同步 | `git_status` / `git_diff` / `git_log` / `git_pull` / `git_push` 立即执行 |
| Remote URL | https / ssh / git@ / `file://` / **本地路径（可含空格）** |
| 裸仓 | 本地 remote 目标不存在 → 自动 `git init --bare`（add 时与 push 前） |
| 空提交 | `git_commit` 无暂存/干净树 → **清晰** `Nothing to commit` / `Nothing staged`（非 `Command failed: git …`） |
| 上游 | `remote_remove` + 再 `remote_add` 后分支 upstream 丢失 → 下次 `git_push(setUpstream, branch)`（GIT-3） |
| 禁止 | 任意 Shell；`--force` / `--force-with-lease`；任意 git argv |
| 新对话 | 每轮 **Git (L5)** + **`GIT_AGENT_PLAYBOOK`**；若 L5 点名本根 env 说明 → **先 read 再 `git_status`**；**禁止**把其它工作区的 remote/路径带过来 |

**演变（勿回退到中间态）：**

- `-g`：曾用独立 Confirm 卡 → **`-i` 已废止**，改为自动执行 + 高亮卡  
- `-f` 报告 §七「OPEN」→ **已由 `-g`…`-q` 关闭**

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
| `2026-08-12-l` | Git L5 + playbook；工具 WHEN 描述 |
| `2026-08-12-m` | 空提交可读错误（GIT-1）；allowFail 不再吞 stdout；playbook 整 index（GIT-2） |
| `2026-08-12-n` | 三轮压力结论入库；GIT-3 playbook（remote 重加后 setUpstream） |
| `2026-08-12-o` | 工作区 `agent-GIT环境说明.md` 防遗忘；L5 探测并提示先读 |
| `2026-08-12-p` | 工具通用性：禁止跨工作区复用 remote/路径；L5/playbook 仅信任本根 |
| **`2026-08-12-q`** | **工作区沙箱：文件工具禁逃逸；跨盘符/symlink 拦截；裸仓拒盘符根与系统目录** |
| （§121，未改 toolApi） | **IPC/窗口绑定 + 拒危险工作区根 + git.exe 探活 + `findGitRoot` 不再向上** |

---

## 3. Agent 工具契约

所有写类结果须含 `toolApi`。写操作另经 `onGitOp` → 会话 `gitOps[]` + 事件 `ai:gitOp`。

| 工具 | 模式 | 行为要点 |
|------|------|----------|
| `git_status` | Plan/Outline/Agent | ensure 仓；返回 branch/remotes/files/`repoCreated?`/`gitignoreUpdated?`；**非纯只读** |
| `git_diff` | 同上 | `path` + `staged?`；缺路径/目录 → error；越界 → **`Path escapes workspace: <完整路径>`**（与 `git_add` 相同，路径不截断）；`staged=true` 不对 untracked 做全文 fallback |
| `git_log` | 同上 | `maxCount?`≤50；oneline |
| `git_pull` | 同上 | 无 remote → 清晰 error；可选 `ffOnly` |
| `git_push` | 同上 | **永不 force**；本地 remote 缺失则先 bare；可选 `setUpstream`+`branch`；可返回 `bareCreated` |
| `git_add` | **仅 Agent** | `all=true` 或 `paths[]`；立即执行 + 高亮卡 |
| `git_commit` | **仅 Agent** | `message` 必填；立即执行 + 高亮卡；**空 index/干净树 → 明确 Nothing to commit / Nothing staged**（整 index 一次提交） |
| `git_remote_add` | **仅 Agent** | `name`+`url`；本地缺失 → bare；`bareCreated` 写入结果文案 |
| `git_remote_remove` | **仅 Agent** | `name`；清占位 remote |

**推荐配方：** `git_status` →（`git_diff`）→ `git_add` → `git_commit` → `git_push`  
**拆 commit：** 每批 `git_add(paths)` → 立刻 `git_commit`（多次 add 再一次 commit 会合并全部暂存）。  
**意图关键词（playbook）：** 备份 / 提交 / 推送 / 同步 / remote / 裸仓 / commit / push

### URL 校验（`isValidGitRemoteUrl`）

允许：`https?://` · `git://` · `ssh://` · `file://` · `user@host:path` · Windows 盘符 · UNC · `/` `./` `../` · `*.git` 相对名。**允许空格**（勿再 `/\s/` 一刀切）。

### 自动裸仓（`ensureLocalBareRepo`）

- 路径不存在 → `mkdir` 父目录 + `git init --bare`  
- 已是 Git 目录（有 `HEAD`/`objects`）→ 复用  
- 存在但非 Git → **报错不覆盖**

### 失败文案（`formatGitCommitFailure` / `git` allowFail）

- `allowFail`：**勿**用空 `stderr` 回退到 `Command failed: git …`（会盖住 stdout 里的真实原因）。  
- 空提交映射：`Nothing to commit — working tree clean…` / `Nothing staged to commit…`

---

## 4. 每轮上下文（防新对话失忆）

| 注入 | 位置 | 内容 |
|------|------|------|
| **Git (L5)** | 本轮 user 末尾（`buildGitL5Summary`，进 `while` 前冻结一次） | 本根 repo/branch/remotes/dirty；同轮写盘后以 `git_status` 为准，勿把 L5 当盘面真相 |
| **GIT_AGENT_PLAYBOOK** | 系统提示（`proposalGate.ts`） | CRITICAL：**仅本工作区**；env 说明仅当 L5 点名；禁止跨仓复用 URL |
| 工具 description | `tools.ts` | `WHEN: … Next: …` |
| **工作区 env 说明** | 根目录约定文件（可选） | `agent-GIT环境说明.md` / `AGENT-GIT-ENV.md`：仅描述**该根**的远程/分支（例：test2）；其它工作区可没有 |

### 通用性（路径不写死）

- 所有 `git_*` / 读写工具以 `ctx.workspaceRoot`（当前会话工作区）解析；**源码中无** `test2` / 绝对盘符写死。
- 约定文件名（`characters.csv`、`story_state.yaml`、`plans/`、env 说明）均为**相对本根**的产品约定，缺省则工具报缺失/跳过，不指向其它文件夹。
- 相对 local remote 相对**本根** `resolve`；绝对 URL 按用户/本根 env 说明传入。
- 聊天按工作区路径隔离；仍须靠 L5/playbook 防止模型把其它仓的 remote「记」过来。

### 工作区沙箱（防整盘破坏）

- 真源：`src/main/ai/workspacePath.ts`（`resolveWorkspacePath` / `assertInsideWorkspace` / `assertSafeExternalGitPath` / **`assertSafeWorkspaceRoot`**）+ `src/main/ipcSandbox.ts`（窗口绑定）。
- 文件工具（read/write/delete/move/copy/mkdir、提案落盘、plan、revision 快照、git stage/unstage/discard）：路径必须落在**打开的工作区根**内。
- Windows：跨盘符时 `path.relative` 会返回绝对路径（不是 `..`）——旧逻辑拦不住；`-q` 已用 `isAbsolute(rel)` 拒绝。
- Symlink/junction：对已存在祖先做 `realpath`；失败则 **拒绝**（§121 fail-closed，勿再吞错）。
- 禁止删除/改写工作区根本身（`assertNotWorkspaceRoot`）。
- **打开工作区**拒绝盘符根、系统目录、`C:\Users`、用户主目录（§121）。Agent 仍可清空**已打开项目**内的子项——这是产品行为，靠用户不要把家目录当项目打开。
- 本地裸仓可在工作区外创建，但**拒绝**盘符根与系统目录。
- **`findGitRoot`（§121–§122）：只认该工作区根的 `.git` 目录**（`inspectWorkspaceGit`），禁止向上走。`.git` 文件/symlink（worktree、submodule 指针）视为 `foreign`：不复用父仓、也不 `git init` 覆盖。打开普通子文件夹会嵌套 init。不要改回「找祖先 `.git`」。
- Git IPC：`workspaceRoot` 参数必须等于该窗 `windowRegistry.workspacePath`（`requireSenderWorkspace`）。
- `git:setPath` / 启动加载：`configureGitExecutable` 要求 `--version` 输出 `git version …`，否则不保存、不替换当前 git。
- Agent 每轮把 `session.workspacePath` 覆盖为窗口工作区，渲染层不能把 Agent 指到另一个盘。
- **无**通用 Shell / 任意 argv。

Plan/Outline：仅提示读/同步工具；写工具须切 Agent。

---

## 5. UI / IPC

| 层 | 内容 |
|----|------|
| SCM | `ScmPane`；`git:probe` / `ensure` / `status` / `diff` / stage / commit / discard / pull / push / remotes；IPC 根 = 窗口工作区 |
| 打开工作区 | `appStore.openWorkspace`：**先** `reportWorkspace`（`assertSafeWorkspaceRoot`）再 `readDir` / `gitEnsure` |
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

## 7. 冒烟 / 压力结论（test2 · 三轮合并）

**总结论（2026-08-12 三轮）：**

1. Agent git 工具链完整可用且稳定：读（status/diff/log）+ 写（add/commit/push/pull/remote）全链路真实跑通。  
2. 批量压力：18 文件（第一轮）+ 8 文件多轮链（第二轮）一次性 add/commit/push 无异常。  
3. 特殊路径（中文/深层/特殊字符）三轮均无问题：提交、推送、diff 全正确。  
4. 拉取专项：高频幂等、参数组合、错误路径、多 remote 切换全通过。  
5. 自动建裸仓：push 到不存在本地路径 → `init --bare`；`remote_add` 到不存在路径（含工作区内）→ 自动建裸仓。  
6. 遗留项处置见下表。

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
| 压力：中文/深层/特殊字符；批量 add/commit/push | ✅ 三轮 |
| 拉取专项（幂等/参数/错误路径/多 remote） | ✅ 三轮 |
| 空提交报错笼统（GIT-1） | ✅ 已修（`-m`） |
| 多次 add 一次 commit 合并 index（GIT-2） | ℹ️ Git 语义；playbook 已写明 |
| remote 删除重加后需重设上游（GIT-3） | ℹ️ Git 正常；`git_push(setUpstream+branch)` |

---

## 8. 源码索引

| 路径 | 职责 |
|------|------|
| `src/main/ai/workspacePath.ts` | **工作区沙箱**（resolve/assert/safe bare/**safe workspace root**/dialog allowlist） |
| `src/main/ipcSandbox.ts` | 窗口工作区绑定、导航锁、`requireSenderWorkspace` |
| `src/main/git/gitService.ts` | probe / **configureGitExecutable** / ensure / status / diff / add / commit / remote* / pull / push / bare / **Git L5** / `formatGitCommitFailure` / `findWorkspaceGitEnvDoc`；**inspectWorkspaceGit / findGitRoot 只认 .git 目录** |
| `src/main/git/registerGitIpc.ts` | `git:*` IPC（绑定窗口工作区） |
| `src/main/ai/tools.ts` | 工具 def + cases；mode 前缀 |
| `src/main/ai/agentLoop.ts` | `commitGitOp`；消息组装注入 L5 |
| `src/main/ai/proposalGate.ts` | `TOOL_API_VERSION` · `WRITE_GATE_SUMMARY` · `GIT_AGENT_PLAYBOOK` |
| `src/main/ai/chatSessions.ts` | `GitPendingOp` / `gitOps` |
| `src/renderer/.../AiPanel.tsx` | `GitResultCard` |
| `src/renderer/.../aiStore.ts` | `ai:gitOp` → 会话 + Toast |
| `src/renderer/.../workbench/ScmPane.tsx` | SCM UI |
| `src/renderer/.../state/appStore.ts` | open/switch → `gitEnsure` |

---

## 9. 验收清单（重启后）

```
toolApi === "2026-08-14-a"
打开无仓文件夹 → 自动有 .git（资源树看不见）
git_status → remotes/branch/dirty；可能 repoCreated / gitignoreUpdated
L5 点名 env 说明 → 先 read_file；无则勿臆造其它仓 remote（如 test2-remote）
workspace_delete / propose_write 指向 C:\ 或其它盘 → Path escapes workspace
git_diff / git_add 越界路径 → Path escapes workspace: <完整原路径>（不截断）
打开用户主目录 / C:\ → Toast unsafeWorkspace，不进入工作区（§121）
打开 git 仓的子文件夹 → 该层嵌套 .git；status 不是父仓（§121，勿恢复 walk-up）
打开 git worktree 子目录（.git 文件）→ ensure 失败，不操作父仓（§122）
git:setPath 指向非 git exe → 拒绝，不保存
git_remote_add 裸仓到 D:\ → 拒绝盘符根
git_add / git_commit → 高亮卡 + Toast（无 Confirm）
空 index 再 git_commit → error 含 Nothing to commit / Nothing staged（非 Command failed: git）
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
- 在 Android 上 `execFile(git.exe)` / 假设系统已装 git
