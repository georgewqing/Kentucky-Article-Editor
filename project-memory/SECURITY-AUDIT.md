# Win 本机安全审计（计算机破坏风险）

**审计日期：** 2026-08-13（changelog **§120**，只记不改）  
**落地日期：** 2026-08-13（changelog **§121**，P0–P2 已修）  
**范围：** 本仓库 Electron 桌面端（不含 Android 独立工程、不含 `node_modules`）  
**状态：** **当前以本文「现契约详解」+ changelog §121–§122 为准。** 新 IPC / 协议 / 自定义 scheme **禁止**绕过 `ipcSandbox.ts` 与 `workspacePath.ts`。改协议、preload、导航锁须**完整退出 Electron**；热重载无效。

**读序**

1. 现产品该怎么防 → **现契约详解**（本文后半）+ changelog **§121**  
2. 为什么这么防 → 本文前半「威胁模型 / 审计当时发现」  
3. 条目 ↔ 代码 → **§121 落地对照**  
4. Git 专档 → [`AGENT-GIT.md`](./AGENT-GIT.md)；分镜头上限 → [`STORYBOARD.md`](./STORYBOARD.md)；踩坑 → [`gotchas.md`](./gotchas.md)

---

## 威胁模型

Kentucky 是**本机工作区编辑器**。用户级权限下，真正危险的不是「网站 XSS」，而是主进程把 Node `fs` / `execFile` / 协议交给渲染层或 Agent。

| 攻击者 | 典型入口 | 最坏结果（审计当时） | §121 后 |
|--------|----------|----------------------|---------|
| 恶意工作区（下载的 zip / 别人的 `.kyboard`） | 打开文件夹 → 打开分镜头 / 预览媒体 | 读工作区外文件；导出时拷贝敏感文件；导出撑爆磁盘 | 媒体路径须在工作区或对话框 allowlist；导出时长/PNG/layout 有上限 |
| 被注入的 LLM / 恶意 Skill | Agent `workspace_delete` / `git_*` / `propose_write` | 清空**当前工作区**；若工作区是用户主目录则等同毁家 | **拒**主目录/盘符根当工作区；已打开的项目内写删仍是产品行为 |
| 渲染层被控（导航到外站、预加载泄漏） | 无沙箱的 `fs:*` / `git:setPath` | 任意读写下用户能碰的全部路径；换成任意 exe 当 git | 导航锁 + IPC 绑窗口工作区 + git.exe 探活 |
| 用户误操作 | 把 `C:\` / `C:\Users\…` 当工作区打开 | Agent 递归删除工作区内几乎所有东西 | Toast `errors.unsafeWorkspace`，不进入工作区 |

Electron 基线（审计前已有，**勿回退**）：主窗 `contextIsolation: true`、`nodeIntegration: false`；`shell:openExternal` 仅 `http:`/`https:`。Agent 文件工具走 `workspacePath.ts`。沙箱落地当时指纹 `2026-08-12-q`（§121 **未** bump）；**当前全局** `toolApi: 2026-08-25-a`。

---

## 审计当时的结论（§120）

**没有发现「Agent 工具可直接删 `C:\Windows`」这种越沙箱写删。**  
**当时发现**「渲染层 IPC 仍可对任意路径 `rm -rf`」以及「打开系统目录当工作区时 Agent 可清空该目录」。这两条才是「破坏用户计算机」的主路径。**均已由 §121 关闭。**

| 级别 | 条数 | 含义 | §121 |
|------|------|------|------|
| **P0** | 3 | 可导致本机数据被删 / 任意程序被拉起 | 已修 |
| **P1** | 6 | 恶意工程可读/拷工作区外文件，或把磁盘/内存打满 | 已修 |
| **P2** | 4 | 加固；单独不成灾 | 已修（`'unsafe-eval'` 有意保留） |

下文 P0–P2 **详述保留审计原文**（含当时的代码片段与建议），便于对照落地，**不要当成仍开放的漏洞清单**。

---

## 发现一览（审计当时）

| 级别 | 位置 | 问题 | §121 |
|------|------|------|------|
| P0 | `src/main/index.ts` `fs:delete` / `fs:writeFile` / `fs:rename` / `fs:mkdir` / `fs:copyFile` / `doc:*` | 主进程 IPC **不校验工作区**。渲染层任意路径可读写下删；`fs:delete` 对目录 `rm({ recursive: true, force: true })` | 已修 |
| P0 | `src/main/index.ts` `createWindow` | **无** `will-navigate` / `setWindowOpenHandler`。若窗口导航到外站，preload 的 `window.kentucky` 仍在 | 已修 |
| P0 | `src/main/git/registerGitIpc.ts` `git:setPath`；打开工作区无系统路径拒绝 | `git:setPath` 可把任意 exe 当 git；用户若把盘符根 / `C:\Users\…` 当工作区打开，Agent `workspace_delete` 可清空其下全部内容 | 已修 |
| P1 | `src/main/index.ts` `kentucky-file` + `fs:toMediaUrl` | 协议按 query `path` **原样读任意本地文件**（含 Range 流 MP3/MP4） | 已修 |
| P1 | `src/renderer/src/editors/StoryboardEditor.tsx` + `platform.joinPath` | `.kyboard` 的 `imageRel`/`audioRel` 含 `..` 时拼出工作区外绝对路径 | 已修（renderer 消化 `..`；主进程仍拒） |
| P1 | `src/main/storyboard/storyboardService.ts` `exportMp4` | clip `duration` 无上限 → 巨量 PNG 帧 + 最长 600s ffmpeg，可把磁盘写满 | 已修（15 分钟） |
| P1 | `src/main/storyboard/pngUtil.ts` `decodePng`；`generateBlankSheet` / `sheetPixelSize` | PNG 无宽高上限；layout `cols`/`rows` 无上限 → 内存炸弹 / 卡死 | 已修 |
| P1 | `src/main/storyboard/storyboardService.ts` `importSheetFile` | `sourceAbs` 任意可读文件可被拷进工作区 | 已修（allowlist） |
| P1 | `src/main/git/gitService.ts` `gitInit` / `ensureWorkspaceGit` / `findGitRoot` | Git IPC 的 `workspaceRoot` 不跟窗口工作区绑定；`findGitRoot` 向上 40 层可能操作到**父仓** | 已修（不向上） |
| P2 | `src/main/ai/workspacePath.ts` `assertInsideWorkspace` | `realpath` 失败被吞掉，symlink/junction 检查可能跳过 | 已修（fail-closed） |
| P2 | `src/main/storyboard/storyboardService.ts` ffmpeg `filter_complex` | `fadeInSec` 等来自 JSON；`execFile` 无 shell，数值异常多为 `NaN` | 已修（`finiteNum`） |
| P2 | `src/main/ai/webSearch.ts` `fetchPageExcerpt` | 已限 `http(s)`；仍可打内网 URL（SSRF） | 已修（拒私网） |
| P2 | `src/renderer/index.html` CSP | `script-src` 含 `'unsafe-eval'`（Monaco 需要） | **保留** |

---

## P0 详述（审计原文）

### 1. 无沙箱的 `fs:*` / `doc:*` — 任意路径递归删除

```754:757:src/main/index.ts
ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  const s = await stat(targetPath)
  await rm(targetPath, { recursive: s.isDirectory(), force: true })
```

（行号为审计当时；落地后 handler 已改。）`writeFile` / `rename` / `mkdir({ recursive: true })` / `copyFile` / `doc:save` 同样不看当前工作区。

**为何危险：** preload 把这些全部暴露给渲染层。资源管理器删除、导图清 assets、标签保存都走这里——正常 UI 只传工作区内路径，但**主进程不强制**。一旦渲染层被控（见 P0-2），或恶意 `.kyboard` 拼出绝对路径再 `copyFile`/`readFile`，就能碰用户桌面、文档、启动文件夹。

**当时建议（已落地）：**

- 所有 `fs:*` / `doc:*` 默认 `resolveWorkspacePath(窗口工作区, path)`。
- 例外只允许**本会话文件对话框返回的路径**（打开图片/导入 PNG 的 source），用一次性 allowlist，不要「任意绝对路径」。
- `fs:delete` 额外拒绝盘符根、`C:\Windows`、`C:\Users`、用户主目录（复用并扩展 `assertSafeExternalGitPath`）。打开工作区时直接拒绝这些根，比只在 delete 上拦更有效。

### 2. 窗口可导航，preload 不回收

`createWindow` 未绑定：

- `will-navigate` / `will-redirect` 拦到非应用源
- `setWindowOpenHandler`（外链应只走已有的 `shell:openExternal`）
- `setPermissionRequestHandler`

CSP 能挡不少 XSS，但**整页导航**到 `https://evil` 后，preload 仍挂在该 webContents 上——这是 Electron 经典升级路径。

**当时建议（已落地）：** 只允许 `ELECTRON_RENDERER_URL`（dev）和打包 `file:` 且在 `out/renderer/` 内；其它 `event.preventDefault()`。新窗 `deny`，http(s) 走 `openExternal`。

### 3. `git:setPath` + 把系统目录当工作区

```31:35:src/main/git/registerGitIpc.ts
  ipcMain.handle('git:setPath', async (_e, gitPath: string | null) => {
    const path = (gitPath || '').trim()
    setGitExecutable(path || null)
    saveAiSettings({ gitPath: path })
```

之后 `execFile(configuredGitPath, gitArgs)`。渲染层可把 git 指到任意可执行文件。

Agent `workspace_delete` 有 `assertNotWorkspaceRoot`，但**可以删工作区里的每一个子项**。用户若打开 `C:\Users\<name>` 或 `D:\`，Agent / 误点删除都能毁掉个人数据。`gitInit` / `ensureWorkspaceGit` 也不调用 `assertSafeExternalGitPath`。

**当时建议（已落地）：**

- `git:setPath`：必须 `execFile(path, ['--version'])` 输出匹配 `/^git version /i`，否则拒绝。
- 打开文件夹：拒绝盘符根、Windows / Program Files / Users 根、当前用户主目录。
- Git IPC 的 `workspaceRoot` 必须等于该窗 `windowRegistry` 里的工作区。

---

## P1 详述（审计原文）

### 4. `kentucky-file` 任意本地读

```337:345:src/main/index.ts
  protocol.handle('kentucky-file', async (request) => {
    ...
    const filePath = u.searchParams.get('path')
    ...
    return await net.fetch(pathToFileURL(filePath).href)
```

`fs:toMediaUrl` 只做 `encodeURIComponent`。打开不可信工程后，时间线/预览会按 `.kyboard` 里的相对路径去拉媒体。

### 5. 渲染层 `joinPath` 不规范化 `..`

```188:197:src/renderer/src/platform/index.ts
function joinPath(...parts: string[]): string {
  // 字符串拼接，不解析 ..
```

`StoryboardEditor`：`joinPath(workspacePath, ...imageRel.split('/'))`。`imageRel: "../../dev-data/data/ai-keys/..."` 会逃出工作区，再交给无校验的 `toMediaUrl` / `copyFile`（导出 PNG）。

主进程 storyboard API（切片 / 导出 MP4）已用 `resolveWorkspacePath`——**不要**让渲染层另开一条绝对路径旁路。

### 6–8. 本地 DoS 与任意拷入

- `exportMp4`：`totalFrames = ceil(duration * 24)`，duration 来自 clip，无上限。
- `decodePng` / `createRgba(sheetPixelSize(layout))`：恶意超大 PNG 或 `cols`/`rows`。
- `importSheetFile`：`sourceAbs` 任意 → `copyFileSync` 进 assets（可把密钥文件拷进工程）。

**当时建议（已落地）：** 导出总时长上限；PNG / 画布像素上限；`importSheetFile` 仅接受本会话对话框返回的路径或工作区内路径。

### 9. Git 根可在工作区之上

`findGitRoot` 向上找 `.git`。打开软件根时可能命中外层容器仓，Agent 的 commit/push 会碰到其它工程。`git:init` 的根路径未与窗口工作区绑定。

---

## 已做得对的地方（审计前已有，不要回退）

| 面 | 现状 |
|----|------|
| Agent / 提案写盘 | `resolveWorkspacePath` + symlink `realpath` + Windows 跨盘 `isAbsolute(relative)` |
| `workspace_delete` | 拒绝删工作区根；仍可清空其子树（靠拒危险工作区根，见现契约） |
| Git 参数 | `execFile` 固定 argv，无 shell；remote name 白名单；本地裸仓 `assertSafeExternalGitPath` |
| ffmpeg | `execFile`，输入路径经 `resolveWorkspacePath` |
| 外链 | `openExternal` 仅 http(s) |
| Electron | `contextIsolation` + 无 `nodeIntegration` |
| `web_fetch` | 仅 http(s)（§121 再拒私网） |
| 聊天 Markdown | 先 escape 再套标签；CSP 无 `unsafe-inline` |

---

## 现契约详解（§121）

实现入口：`src/main/ipcSandbox.ts`（窗口绑定、allowlist 断言、导航锁）+ `src/main/ai/workspacePath.ts`（路径几何、危险根、对话框 Set）。

### 数据流

```
BrowserWindow.webContents
  → preload window.kentucky
  → ipcMain
  → ipcSandbox.requireSenderWorkspace(e, claimed?)
       窗口 meta.workspacePath（windowRegistry）为准
       claimed 若有必须 samePath，否则 Workspace mismatch
  → resolveWorkspacePath / assertNotWorkspaceRoot / allowlist
  → Node fs / git execFile / ffmpeg / protocol
```

渲染层 **没有** Node `fs`。**不要**再加「UI 保证路径合法」的裸 `ipcMain.handle('fs:…')`。

### 导航锁（`bindNavigationGuard`）

绑在**主窗 + 闪屏**的 `webContents` 上。

| 事件 | 规则 |
|------|------|
| `will-navigate` / `will-redirect` | `isAllowedNavigationUrl`：dev 仅 Vite origin **且** pathname 是应用壳（`/`、`index.html`、`splash.html`、`pdf-print.html`）。打包仅 `file:` 且落在 `out/renderer/` **且** 文件名是上述壳。相对链解析成 `/ch.md` **不得**整页跳走。 |
| `setWindowOpenHandler` | **一律 `{ action: 'deny' }`**。真外站 `http:`/`https:` 才 `shell.openExternal`。**禁止**对 Vite origin / 应用壳 `openExternal`（`<a target="_blank" href="ch.md">` 会变成 `http://localhost:5173/ch.md`）。 |
| `setPermissionRequestHandler` | 全部 `callback(false)`（摄像头、通知、地理位置等） |

禁止再给主窗加 `nodeIntegration` 或关掉 `contextIsolation`。CSP `'unsafe-eval'` 留给 Monaco，**靠本锁 + IPC 沙箱兜底**，不要为了 Monaco 放开导航。

### 窗口工作区 IPC

每个窗的工作区以 `windowRegistry.getWindowMeta(win).workspacePath` 为准，**不信任**渲染层随口传来的绝对路径。

| 通道 | 解析 |
|------|------|
| `fs:readDir` / `readFile` / `writeFile` / `mkdir` / `exists` / `isDirectory` | `resolveInSenderWorkspace` |
| `doc:*`（打开/保存/快照） | 同上 |
| `fs:delete` / `fs:rename` | `resolveWriteInSenderWorkspace` = 上式 + `assertNotWorkspaceRoot` |
| `fs:copyFile` | 源：`assertReadableLocalPath`（**该窗**工作区 ∪ read allowlist）；目标：`assertWritableLocalPath`（工作区 ∪ write allowlist）。**不**跨到其它已开工作区 |
| `fs:toMediaUrl` | `assertReadableLocalPath` 后 `rememberMediaPath` |
| `kentucky-file` | `assertProtocolReadable`：仅 media allowlist ∪ read allowlist（§122） |
| `shell:showItemInFolder` | 可读或可写路径（该窗工作区 ∪ 对应 allowlist） |
| Git 全部 IPC | `requireSenderWorkspace(e, claimed)`；discard 用解析后的绝对路径刷新 DocumentHub |
| Storyboard IPC | `workspaceRoot` 必须等于窗口工作区；另存对话框 `defaultPath` 夹在工作区内 |
| `ai:send` / `runAgentTurn` | 把 `editor.workspacePath` 与 `session.workspacePath` **覆盖**为窗口工作区；session 须属于该窗 |
| `ai:listSessions` / `createSession` / `loadSession` / `deleteSession` / prefs / apply* | 一律窗口工作区；忽略渲染层 claimed 根 |

`kentucky-file://local/?path=`：handler **先** `assertProtocolReadable`，再 `streamLocalMedia` / `net.fetch`。伪造 query 即使指向另一已开工程也是 404。不要把 query 当可信。

### 对话框 allowlist

进程内两个 `Set`（`pathKey` = resolve + 反斜杠 + lowerCase），最多 **512** 条 FIFO。**重启 Electron 即空。** 不要把任意绝对路径当例外。

| 集合 | 写入时机 | 用途 |
|------|----------|------|
| **read** `rememberDialogReadPath` | `dialog:openImage` / `openImages` / `openContextFiles` / `openPng` / `openMp3` | 预览、`copyFile` 源、`importSheetFile` 源、Agent `readAbsSafe`（作曲器夹区外文件） |
| **write** `rememberDialogWritePath` | `dialog:savePng` / `saveMp4` | 导出另存到桌面等；`copyFile` 目标 |

Agent **写**工具（`propose_*`、`workspace_delete` / `copy` / `move`）仍只限工作区。夹进来的区外文件只能读进 LLM 上下文。

`dialog:openDirectory`（选导出文件夹）**本身不**当工作区打开，故不走 `assertSafeWorkspaceRoot`。真正 `openWorkspace` / `window:reportWorkspace` / `window:newMain` / `window:newFloat` 才拒危险根。

### 危险路径拒绝清单

`assertSafeExternalGitPath`（裸仓目标 + 工作区根都会走到）：

- 盘符根：`D:\` / `D:` / Unix `/` / UNC 份额根 `\\server\`
- 及其子树：**精确前缀** `C:\Windows`、`C:\Program Files`、`C:\Program Files (x86)`、`C:\ProgramData`、`C:\System Volume Information`、`C:\$Recycle.Bin`

`assertSafeWorkspaceRoot` 额外：

- `X:\Users`（Users 目录**本身**，不是某个用户下的项目）
- `os.homedir()` **本身**（当前用户主目录）

**允许：** `Documents`、`Desktop` 下的项目子文件夹、任意非上述的用户自建目录。

`assertNotWorkspaceRoot`：delete/rename 不能打工作区根目录本身（仍可清空其子项——产品行为）。

`openWorkspace`：**先** `window:reportWorkspace`（校验危险根）再 `readDir`；失败回滚上一工作区。Toast / 错误键：`errors.unsafeWorkspace`。

文案（zh-CN）：「不能把盘符根、系统目录或用户主目录当作工作区打开。请选择项目子文件夹。」

### Git（相对 §85 的破坏性变更）

changelog **§85** 曾规定：有父级 Git 仓时**不**嵌套 init，复用向上找到的仓根。**§121 废止 walk-up。**

| 项 | 现规则 |
|----|--------|
| `findGitRoot` | **只认该文件夹下的 `.git` 目录**（`lstat` / `inspectWorkspaceGit`），禁止向上。`.git` **文件**或 symlink（worktree / submodule 指针）为 `foreign`：不复用父仓、也不 `git init` 覆盖 |
| 打开本软件根（现已是独立 git 仓） | **不会**对旁边的安卓文件夹 add/commit/push |
| 打开已有 git 仓的子文件夹 | 无 `.git` 目录 → 嵌套 `git init`。该层是 worktree 指针 → SCM 报错，请打开真正的仓根。**不要改回「找祖先」** |
| Git IPC `workspaceRoot` | 必须 `samePath` 窗口工作区 |
| `configureGitExecutable` | `execFile(path, ['--version'])`，stdout 匹配 `/^git version /i` 才保存；启动时已存脏路径则清空 |
| `gitInit` / `ensureWorkspaceGit` | 先 `assertSafeWorkspaceRoot` |
| `gitUnstage` | 路径走 `resolveWorkspacePath` |
| 本地裸仓 | 可在工作区外，但仍走 `assertSafeExternalGitPath` |

完整 Git 产品契约：[`AGENT-GIT.md`](./AGENT-GIT.md)。§121 当时未 bump；**当前全局** `toolApi: 2026-08-25-a`。

### 分镜头 / 媒体上限

| 项 | 上限 / 规则 |
|----|-------------|
| MP4 时间线 | `MAX_EXPORT_DURATION_SEC = 15 * 60`；超限 `{ error: 'EXPORT_TOO_LONG' }` → Toast `storyboard.exportTooLong` |
| PNG 解码 | 先读 IHDR；`MAX_PNG_DIM = 16384`；`MAX_PNG_PIXELS = 80_000_000` |
| 稿纸 layout | `clampLayout`：cols/rows ≤ 8；panel 锁 1920×1080；gutter/labelBand ≤ 200 |
| ffmpeg 滤镜 | volume / fade / delay 一律 `finiteNum`，禁止把 JSON 字符串拼进 `filter_complex` |
| 导出临时帧 | `resolveWorkspacePath(.kentucky/storyboard-export/…)` |
| 导出目标 | 工作区内 **或** write allowlist |
| `importSheetFile` | 源 ∈ read allowlist **或** 工作区内 |
| renderer `joinPath` | 消化 `..`，不能越过盘符；**不能**代替主进程沙箱 |

详见 [`STORYBOARD.md`](./STORYBOARD.md)。

### Agent / 联网

- `assertInsideWorkspace`：symlink 祖先 `realpath`；失败 **抛** `Path escapes workspace (realpath failed)`（fail-closed，勿再 `catch` 后放行）。
- Windows 跨盘：`path.relative` 返回绝对路径时 `isAbsolute(rel)` 拒绝。
- `fetchPageExcerpt`：仅 `http:`/`https:`；再拒 localhost、`.local`、RFC1918、link-local。

### 产品副作用（有意，不要当 bug 修回去）

1. 打开用户主目录 / 盘符根 / `C:\Users` / `C:\Windows` 等 → Toast，**不进入**工作区。
2. 打开 git 仓库的**子文件夹** → 该层嵌套 `.git`；父仓不被 SCM/Agent 使用。
3. 时间线 **> 15 分钟**无法导出 MP4。
4. 恶意/损坏 `.kyboard` 里 `imageRel: ../..` → 协议/IPC 拒绝，预览空白属正常。
5. 作曲器夹的区外文件：可读入 LLM；Agent 不能写到区外。

### 手测（须完整退出 Electron 后再开）

- [ ] 打开普通项目文件夹：树、读写、删文件（非根）正常。
- [ ] 打开用户主目录 / `C:\`：Toast `errors.unsafeWorkspace`，工作区不切换。
- [ ] 资源树删除、重命名、复制；不能删工作区根。
- [ ] 分镜头：导入 PNG（对话框）、预览、导出 MP4；超 15 分钟 Toast `storyboard.exportTooLong`。
- [ ] 工作区 `.png` / `.mp4` 预览（`kentucky-file` Range）。
- [ ] SCM status；打开 git 子文件夹时 status 指向**该层**仓，不是父仓。
- [ ] 设置里自定义 git 路径：指向记事本等非 git exe 应拒绝，不保存。

`npm run typecheck`（web + node）在落地时已通过。

### 禁止回退（给后续 Agent）

- 裸 `fs:*` / `doc:*` / `kentucky-file` 不经 `ipcSandbox`。
- 协议用 `isInsideAnyOpenWorkspace` 或只靠 query `path`。
- 恢复 `findGitRoot` 向上 40 层，或把 `.git` **文件**当成本仓根。
- 去掉 MP4 15 分钟上限或 PNG/layout 限额「方便导出」。
- `realpath` 失败后放行。
- `web_fetch` 打内网。
- `git:setPath` 存任意 exe。
- 为 Monaco 关掉导航锁或加回 `nodeIntegration`。

### 明确不做 / 非本轮

- Android（移植时须按本文 + [`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md) 对齐沙箱，不得只抄 UI）
- 用户**自愿**打开自己的小说项目后，Agent 改写该项目内文件（产品行为；沙箱内）
- `ensure-ffmpeg.js` 的 winget（仅开发/打包脚本）
- Monaco 所需 `'unsafe-eval'`（无替代则保留）

---

## §121 落地对照

实现细节见上一节与 changelog **§121「现契约」**。下表把审计条目映射到代码，后续改 IPC / 协议时对照。

| 审计 | 落地 | 关键符号 |
|------|------|----------|
| P0-1 无沙箱 `fs:*`/`doc:*` | 一律 `resolveInSenderWorkspace`；delete/rename 拒工作区根；copy 源/目标分 read/write allowlist | `ipcSandbox.ts`；`index.ts` `fs:*` / `doc:*` |
| P0-2 可导航外站 | `bindNavigationGuard`：同源/`renderer/` 才放行；新窗 deny；权限全拒 | `ipcSandbox.bindNavigationGuard` |
| P0-3 git exe + 危险工作区 | `configureGitExecutable` 校验 `git version`；`assertSafeWorkspaceRoot`；Git IPC `requireSenderWorkspace` | `gitService.ts`；`registerGitIpc.ts`；`appStore.openWorkspace` |
| P1-4 `kentucky-file` 任意读 | §121 工作区检查；**§122** 改为 `assertProtocolReadable`（`toMediaUrl` 登记 ∪ dialog read），禁止跨窗读另一工程 | `assertProtocolReadable`；`rememberMediaPath` |
| P1-5 `joinPath` + `..` | renderer 消化 `..`；媒体/导出仍走主进程沙箱 | `platform/index.ts` `joinPath` |
| P1-6 MP4 时长 | `MAX_EXPORT_DURATION_SEC = 900`；`EXPORT_TOO_LONG` | `kyboardSchema.ts`；`storyboardService.exportMp4` |
| P1-7 PNG/layout 炸弹 | IHDR 限额；`clampLayout` ≤ 8×8 | `pngUtil.ts`；`kyboardSchema.clampLayout` |
| P1-8 任意 import 源 | 仅对话框 allowlist 或工作区内 | `importSheetFile`；`dialog:openPng` |
| P1-9 父仓 Git | 不向上；**§122** `.git` 必须是目录，worktree 指针拒绝 | `inspectWorkspaceGit` / `findGitRoot` |
| P2 realpath 吞错 | fail-closed | `assertInsideWorkspace` |
| P2 ffmpeg 滤镜 | `finiteNum` 夹紧 | `storyboardService.ts` |
| P2 SSRF | 拒私网/localhost | `webSearch.fetchPageExcerpt` |
| P2 `'unsafe-eval'` | **保留**（Monaco）；靠导航锁 + IPC 沙箱 | `index.html` CSP |

### §122 收紧（IPC / 协议 / Git 根）

§121 之后仍可能：A 窗构造 `kentucky-file` 读 B 窗已开工程；`.git` 文件把 git 指到父仓；AI `listSessions`/`loadSession` 信渲染层路径。

| 项 | 规则 |
|----|------|
| 协议 | 仅 `rememberMediaPath`（`fs:toMediaUrl` 通过沙箱后登记）∪ dialog read allowlist |
| 跨窗读 | `assertReadableLocalPath` 在有 sender 时**不**落到其它已开工作区 |
| `window:newFloat` | 工作区必须 `requireSenderWorkspace`；文件路径 `resolveWorkspacePath` |
| `window:newMain` | 只能克隆发送窗工作区或已在 `listWorkspaceRoots` 里的根，不能任意路径开新窗 |
| AI 会话 | list/create/load/delete/prefs/send/apply* 均绑窗口工作区（`sameWorkspace`） |
| `git:discard` | DocumentHub 用解析后的绝对路径 |
| Git 根 | `inspectWorkspaceGit`：`repo` / `foreign` / `none` |

**源码索引：** `src/main/ipcSandbox.ts`；`src/main/ai/workspacePath.ts`；`src/main/index.ts`；`src/main/windowRegistry.ts`（`listWorkspaceRoots`）；`src/main/git/{gitService,registerGitIpc}.ts`；`src/main/storyboard/*`；`src/shared/kyboardSchema.ts`；`src/main/ai/{agentLoop,registerAiIpc,webSearch}.ts`；`src/renderer/src/platform/index.ts`；`src/renderer/src/state/appStore.ts`；`src/preload/index.ts`；i18n `errors.unsafeWorkspace` / `storyboard.exportTooLong`。
