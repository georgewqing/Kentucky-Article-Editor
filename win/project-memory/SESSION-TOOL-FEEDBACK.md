# Win 工具反馈对接 · SESSION 交接

> 更新：2026-08-12（**Git 完整落地** · toolApi **l** · L5/playbook）  
> **Git 专档（完整）**：[`AGENT-GIT.md`](./AGENT-GIT.md)  
> **基线**：[`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)  
> **总清单**：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)  
> **需求归档**：[`REQ-literary-agent-capability-upgrade.md`](./REQ-literary-agent-capability-upgrade.md)  
> **Android 进度板**：[`../../android/project-memory/BOARD.md`](../../android/project-memory/BOARD.md)  
> **Android 详约**：[`open/literary-memory.md`](../../android/project-memory/open/literary-memory.md) · [`agent-ui.md`](../../android/project-memory/open/agent-ui.md) · [`workbench-chrome.md`](../../android/project-memory/open/workbench-chrome.md) · [`shell-ux.md`](../../android/project-memory/open/shell-ux.md) · [`auto-apply-git.md`](../../android/project-memory/open/auto-apply-git.md)  
> **Android 入口**：[`../../android/project-memory/README.md`](../../android/project-memory/README.md)

## 部署指纹

`toolApi: "2026-08-12-l"`（完整重启 Electron）

## Git（当前态 · 摘要）

权威全文：[AGENT-GIT.md](./AGENT-GIT.md)。

- 打开工作区自动 `git init`（点文件对 UI/`list_dir` 隐藏）
- Agent：`git_status`/`diff`/`log`/`pull`/`push`/`add`/`commit`/`remote_add`/`remote_remove` — **全部立即执行**；写操作高亮卡+Toast
- 本地/`file://` remote（可含空格）；缺失路径自动 bare
- 每轮 **Git (L5)** + **GIT_AGENT_PLAYBOOK**（新对话仍会调 git_*）
- **禁止** force / Shell / 任意 argv

## 冒烟轮次（test2）摘要

权威详表：[`changelog.md`](./changelog.md) **§81–§89**。

| 轮 | 指纹 | 要点 |
|----|------|------|
| 三 | `2026-08-12-d` | FIND-A kmind skipped；B unknown_character；C openingChanged；D 中文路径 |
| 四 | `2026-08-12-e` | FIND-03/.kentucky ensure；E/F git_diff；G performance 校验；H/I warnings；**git_pull/git_push** |
| 五 | `2026-08-12-f` | FIND-J moveSubtree 文案；FIND-K status 非纯只读说明 |
| — | `2026-08-12-g` | （历史）独立 Git 确认卡 → 已被 `-i` 取代 |
| — | `2026-08-12-h` | 打开工作区**自动 init**；`.git` 资源树/`list_dir` 隐藏 |
| — | `2026-08-12-i` | Git 写操作**取消确认**；高亮卡 + Toast |
| — | `2026-08-12-j` | `git_remote_add` 接受本地/`file://`（含空格）；`git_remote_remove` |
| — | `2026-08-12-k` | 本地 remote 缺失时自动 `git init --bare`（add/push） |
| — | `2026-08-12-l` | Git L5 每轮注入 + playbook；工具 WHEN 描述 |

回归清单见文末 code fence（须重启后验 `toolApi`）。

## Round H · 文学记忆（M1–M4）

- 工作区按需 YAML：`story_state.yaml` / `foreshadow.yaml` / `voice_*` / `glossary.yaml`；`materials/`；`revisions/`（非 Git）
- 启用态 = story_state 存在且 `chapters.length≥1`（stale + L5）
- continuity：表内一致性 + 可选 `assertions[]`；不搜正文道具名；冲突只警告
- 记忆类 YAML 始终 auto+强制落盘；materials 正文按 prose；restore 走提案 + DocumentHub
- L5：启用态计数摘要 + Before/After 调用 CTA（优先保留 CTA）
- 防遗忘：`memoryNudge.ts` — 系统 CRITICAL 清单；散文结果 `memoryHint`（**非** `reviewHint`）；工具 description `CALL WHEN…`

## Agent UI / Shell（U1–U12 摘要）

详见 Android `open/agent-ui.md` · `open/shell-ux.md` · `open/workbench-chrome.md`。Win 已落地；Android 跟 BOARD。

### 关键勿回退

- 无挂载「示意页」缩略图（曾黑坨）
- Skill 挂载 = 注入正文，不只靠模型自觉 `read_skill`
- **文件挂载 = CRITICAL 注入正文**（与 Skill 同级）；勿仅依赖弱 `@mentions` Editor context
- Composer mounts / skill 与 textarea **分行**；气泡 chips 与正文 **分行**
- Electron letterbox fill **不移植**
- Git：**勿**把 Confirm 卡加回写操作；勿去掉 L5/playbook；勿禁用本地 bare 自动创建

## 布局 letterbox（Win Electron）

- CSS：`html/#root/.app-root/.workbench` 铺满
- 主进程：`bindClientAreaFill` — Android 只搬 CSS

```
重启后确认 toolApi:"2026-08-12-l"
Git 专档：win/project-memory/AGENT-GIT.md
打开无仓文件夹 → 自动 .git（树里看不见点文件）
git_status → remotes/branch；可能 repoCreated / gitignoreUpdated
git_add/commit/remote_* → 高亮卡+Toast（无 Confirm）
本地带空格 remote URL → ok；缺失目录 → bareCreated
git_remote_remove → 可清 origin
git_push 本地 remote → 可补建裸仓；无 force
新开对话「提交并推送」→ 调用 git_*（L5+playbook）
FIND-J：moveSubtree 未知父 → "unknown parent … (root … ok)"
FIND-K：git_status note 提及 .gitignore 自愈 / 非纯只读
FIND-03：git_status 后 .gitignore 含 .kentucky/
FIND-E：git_diff 缺文件/目录 → error
FIND-F：staged=true + untracked → 空 diff（非全文）
FIND-G：font_size=abc / 非法 text_color 被拒并 warnings
FIND-H/I：append/voice 未注册 id → warnings
git_pull/git_push：无 remote 时报错；有 remote 可拉取/推送（无 force）
FIND-D：git_status 中文路径可读（非八进制）
FIND-A：kmind connect 错 id → skipped/warnings（区分 source/target）
FIND-B：continuity 未注册角色 characterStatus → unknown_character
FIND-C：部分 reorder → openingChanged + openingId
U4：拖文件/夹进 Composer → chip；发出后气泡有 chip、无黑块；Agent 认挂载正文（U12 CRITICAL）
U5：/ 选 skill → 胶囊；Agent 按 skill 行事（正文已注入）
U6：选中文字右键 → Copy / 全选 / Google
U7：进工作区子夹默认收起；展开后重进仍展开
U8–U11：设置卡片+Seg / overlay 滚动条 / 上下文随 accent / 开始页多开
烟雾回归：setCurrent:false 不改 sceneId；append 返回 addedLineIds；那串风铃无 ghost；plan 勾选不同轮不触发 multi_file
Android 移植：`BOARD.md` + `open/auto-apply-git.md`（Git）+ `open/shell-ux.md` + `open/workbench-chrome.md` + `open/agent-ui.md`
勿 import win/
```
