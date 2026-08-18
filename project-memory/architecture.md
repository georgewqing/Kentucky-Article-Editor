# 架构

> **扫描**：先读 [`README.md`](./README.md)「现状」。本文是当前技术结构，不是 changelog。  
> **当前**：Win **0.3.2** · `toolApi: 2026-08-14-a` · 2026-08-15。  
> AI 代理人功能从 **0.2.0** 起内置；下节「AI 数据流」描述的是该子系统，不是整包版本号。

## 定位

**KENTUCKY**：本地文本写作桌面应用。UI 气质从「VS Code 工作台」演进为「更接近 Cursor」：少硬边框、统一色阶、可调深浅色与主体色。

## 技术栈

| 层 | 技术 |
|----|------|
| 壳 | Electron 37 + electron-vite |
| UI | React 19 + TypeScript |
| 状态 | Zustand（`appStore` + `settingsStore` + `aiStore`） |
| 文本编辑 | `.md`：TipTap WYSIWYG + Monaco 源码；其它：软化 Monaco（`monacoSetup.ts` 本地打包） |
| 思维导图 | @xyflow/react 自由白板；自有 `.kmind` v2（nodes + edges） |
| 分镜头 | `.kyboard` v1 + `*.kyboard.assets/`；主进程 pngjs / ffmpeg；见 [`STORYBOARD.md`](./STORYBOARD.md) |
| AI | OpenAI 兼容流式 chat；主进程 `src/main/ai/`；会话/密钥落本体 `data/` |
| i18n | i18next（`zh-CN` / `en`） |
| 主题 | CSS 变量 + `applyTheme(mode, accent)` |

## 目录结构（真实路径）

```
Kentucky/                  ← 本软件根（Windows / Electron）
  project-memory/          ← 本记忆目录
  electron.vite.config.ts
  package.json             ← version 0.3.2
  dev-data/                ← 开发态本体数据（gitignore）
  src/
    shared/                kyboardSchema 等跨进程契约
    main/                  Electron 主进程
      index.ts             IPC：对话框、fs、菜单、多窗口、DocumentHub、AI、Git、Storyboard；kentucky-file
      ipcSandbox.ts        窗口工作区绑定、对话框 allowlist、导航锁（§121）
      windowsFileAssociation.ts  打包 exe 的 HKCU .md「打开方式」（不抢默认；dev 不注册）
      ai/                  OpenAI 兼容客户端、agent loop、tools、kmindLayout（dagre）、本体 data 路径
                           workspacePath.ts = 路径沙箱（Agent + IPC + Git + Storyboard 共用）
                           askGuard.ts = Ask 拒工具 + 清洗 DSML；designGddL5.ts = 游戏策划 L5
      storyboard/          分镜头空白/切片 PNG + ffmpeg MP4
      pdf/                 隐藏 print 窗 + printToPDF + dialog:savePdf + Agent export_workspace_pdf
      git/                 gitService（ensure/status/diff/add/commit/remote/pull/push/bare/L5）+ registerGitIpc；无任意 argv
                           完整契约 → project-memory/AGENT-GIT.md
      menu.ts              原生菜单（中/英）
      documentHub.ts       跨窗文件正文权威（含 docApplyAgentWrite / docReloadFromDisk）
      windowRegistry.ts    main/float 元数据
    preload/
      index.ts             contextBridge → window.kentucky（含 ai:* / storyboard:*）
    renderer/
      index.html
      pdf-print.html       印刷稿（Vite extra input；printToPDF 用，禁止 data: URL）
      src/                 React 渲染层（业务都在这）
        App.tsx
        main.tsx           启动时 hydrate 主题
        platform/          FS + AI + Storyboard IPC 抽象
        state/
          appStore.ts
          settingsStore.ts
          aiStore.ts       会话、流式、自动写入同步、思考态
        ai/                AiPanel、simpleMarkdown
        export/            markdownToPrintHtml + exportPdf
        theme/
        i18n/
        workbench/         含 EditorArea（标签滚轮/改序、分屏「此栏」菜单）、explorerNames、叠加滚动条、fitContextMenu
        editors/           StoryboardEditor + storyboardDocFlush / ImagePreviewEditor / VideoPreviewEditor / PdfPreviewEditor
        styles/global.css
```

路径别名：`@/*` → `src/renderer/src/*`；`@shared/*` → `src/shared/*`（见 `tsconfig` / `electron.vite.config.ts`）。

## 进程与数据流

```
Renderer (React)
  → getPlatform() 
  → window.kentucky (preload)
  → ipcMain (main)
  → Node fs / dialog / Menu / DocumentHub / BrowserWindow / AI agent loop
```

- UI **不得** `require('fs')` 或散落 `window.kentucky`（菜单监听等经 `Platform` 封装）。
- 安卓平板为**独立工程**（本机常见 `../Kentucky for Android/`，Capacitor 0.3.0），不在本 Electron 树内换 Platform。
- **多窗口：** `role: main | float`（`windowRegistry`）；文件正文权威在主进程 `documentHub`；各窗 Zustand 仅本地 UI。媒体预览（PNG/MP4/PDF）**不**进 DocumentHub。

### `kentucky-file` 协议

渲染层本地媒体一律 `toMediaUrl` → `kentucky-file://local/?path=`（CSP 禁止随意 `file://`）。`main/index.ts` `protocol.handle`：

- `.mp3` / `.mp4` / `.pdf` → `streamLocalMedia`：`Range` → **206** + `Content-Range` / `Accept-Ranges`；无 Range 仍声明 Accept-Ranges。MIME：`audio/mpeg` / `video/mp4` / `application/pdf`。
- 其它扩展（含 `.png`）→ `net.fetch(file URL)`。
- **路径必须**本会话 `fs:toMediaUrl` 登记过，或对话框 read allowlist（§122）。不能凭「另一窗口已打开该工程」读盘。未通过则 404。
- 改 handler / CSP / 导航锁须**完整退出 Electron**；热重载无效。详见 [`STORYBOARD.md`](./STORYBOARD.md) §5、[`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)。

### 本机沙箱（§121）

渲染层 **没有** Node `fs`。所有磁盘操作经 preload IPC，主进程强制：

```
窗口 meta.workspacePath（windowRegistry）
  → ipcSandbox.requireSenderWorkspace
  → resolveWorkspacePath / assertSafeWorkspaceRoot
  → Node fs
```

| 面 | 规则 |
|----|------|
| 工作区根 | 拒盘符根、系统目录、`C:\Users`、用户主目录 |
| `fs:*` / `doc:*` | 仅该窗工作区内；delete/rename 不打根目录 |
| 对话框 | 打开的文件 → read allowlist；另存 → write allowlist（最多 512） |
| `kentucky-file` | `toMediaUrl` 登记 ∪ read allowlist（§122；不跨窗） |
| 导航 | 禁止整页跳到外站（preload 不回收） |
| Git | IPC 根 = 窗口工作区；只认 `.git` 目录；worktree 指针拒绝；git.exe 须 `git version` |
| Agent | 每轮覆盖为窗口根；会话 list/load/send 绑该窗 |

对话框 `openDirectory`（选导出文件夹）**本身不**当工作区打开，故不走 `assertSafeWorkspaceRoot`；真正 `openWorkspace` / `reportWorkspace` 才拒危险根。

**详解（通道表、拒绝清单、手测、禁止回退）：** [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)「现契约详解」。Git walk-up 废止：[`AGENT-GIT.md`](./AGENT-GIT.md)。

## AI 数据流（0.2.0 起；当前 app 0.3.2）

```
AiPanel / aiStore
  → ai:send（含编辑器上下文）
  → main agentLoop（OpenAI 兼容 SSE + tools）
     Ask：tool_choice none + askGuard（不执行任何 tool_call）
     Agent：propose_* → applyProposalToDisk
            → commitProposal：status=applied，upsert session.proposals
            → ai:proposal（只读变更卡；无 Accept）
  → aiStore 合并 proposals（同 gitOps）+ syncAppliedFile
  → appStore.applyAiFileEdit（不抢焦点；黄●；agentChangeRanges）
  → 误改：Source Control discard / Undo；Ctrl+S 清脏与高亮
```

- 本体路径：`appBodyPaths.ts` → 开发 `dev-data/data/`，打包为 exe 旁 `data/`
- 会话：`data/ai-chats/*.json`（含 Mirror `plan[]` + `planFileRel`）；设置：`data/ai-settings.json`；密钥：`data/ai-key.bin`
- Plan：`create_plan` → 工作区 `plans/<slug>.plan.md`（`planFiles.ts`）；对话栏无常驻计划列表；Agent InjectPath；md 顶栏 Build
- 工作区结构：`workspace_mkdir` / `copy` / `move` / `delete`（`tools.ts` + `ai:workspaceOp`）
- `.kmind`：`kmindLayout.ts`（dagre Sugiyama）；`propose_kmind_edit`（shape/子树；非法 id → skipped）/ `layout_kmind`
- `.dialogue.csv`：`formats.ts`；performance 校验 font_size/text_color；reorder 可报 openingChanged
- Git：`main/git/gitService.ts` + Agent `git_*`（自动写 + 高亮卡 + L5/playbook + 本地裸仓 + 空提交可读错误）。**完整契约**：[AGENT-GIT.md](./AGENT-GIT.md)；当前指纹 `toolApi: 2026-08-14-a`（changelog §80–§95 为 Git 专档史）
  ```
  openWorkspace → gitEnsure
  agentLoop → Git (L5) + GIT_AGENT_PLAYBOOK
  git_add/commit/remote_* → commitGitOp → ai:gitOp → GitResultCard + Toast
  git_remote_add / git_push（本地）→ ensureLocalBareRepo
  ```
- Skills：`skills.ts` → `data/ai-skills/`；仓内 `resources/ai-skills/` copy-if-missing（含 examples.md）；`seenBundledSkillIds`；catalog 注入系统提示；`list_skills` / `read_skill`；挂载时注入 extraFiles；Design playbook + Design L5（存在探测）：`designGddL5.ts`
- 联网：`webSearch.ts`（DuckDuckGo）；`web_search` / `web_research`；设置开关
- 设置页 AI 档案：本地 draft，失焦写入。流式：连接 45s 只等到响应头（立刻清 timer）。MD 排版复制为人话。现行契约：[PACKAGED-AI-UX.md](./PACKAGED-AI-UX.md)


## 应用状态

### `appStore`

- `windowRole`、`workspacePath`、`fileTree`、`tabs`（含 `docRev`、`dirty`、`isNew`）、`activeTabId`
- 分屏：`splitEnabled` / `splitTabId`；`enableSplit` / `disableSplit` / `setSplitTab`；`reorderTabs(id, insertBefore)`
- `activeView`: `'explorer' | 'settings' | 'home' | 'scm'`
- `recentFolders`: `{ path, lastOpened }[]`（欢迎页最多展示 6；存储可更多）
- 文件：`openFile` / `saveTab` / `discardTab` / `applyDocSnapshot` / **`applyAiFileEdit`**（AI 安静写回）/ `spawnNewWindow` 等
- `detectKind` / `isMediaPreviewKind`（`image | video | pdf`）：媒体标签跳过 `docOpen`；`saveTab` 直接成功；`closeTab` 不 `docUnsubscribe`
- `unsavedDialogStore`：应用内未保存三按钮对话框
- `lineFlash` + `clearLineFlash`：导图段落跳转后浅色高亮（编辑器内绝对定位遮罩）
- `linePickSession` / `linePickResult`：分屏点行设链

### `aiStore`

- 会话列表 / 当前会话（含 `proposals` + **`gitOps`**）、流式缓冲、`agentPhase`（idle/thinking/streaming/tool）
- `syncAppliedFile`：收到 `ai:proposal` 后更新标签与树，不切换当前页；并把提案 merge 进当前会话 `proposals`（status=`applied`）
- `ai:gitOp`：更新 `gitOps` + Toast（Git 高亮卡由 AiPanel 渲染）

### `settingsStore`（localStorage: `kentucky.settings`）

- `themeMode`: `'dark' | 'light'`（深色底 `DARK_BG` = RAL 9005 `#0A0A0A`；分区见 `DARK_ELEV_1`–`4`，`shared/theme.ts`）
- `accent`: hex
- `fontSize`

### 其它 localStorage

- `kentucky.locale`
- `kentucky.recentFolders`

## 界面结构

- **主窗**有 `ActivityBar`；**精简窗**为 `FloatWorkbench`（文件名标题 + 单编辑器，**无**顶栏菜单）
- Windows/Linux 顶栏 `AppMenuBar`（点击展开）；Win32 用 `titleBarOverlay` 把系统按钮叠在菜单栏右侧；macOS 用系统菜单
- Toast：`ToastLayer`（进出动画）；确认 / 未保存：`ConfirmDialog` / `UnsavedChangesDialog` + `AnimatedDialogShell`
- 动效 tokens 与 `prefers-reduced-motion`：`styles/global.css`；boot：`index.html` / `public/splash.html`
- 无工作区 → `WelcomePage`（品牌 + 打开文件夹 + 最多 6 张工作区卡片）
- 有工作区 → `Sidebar` + `EditorArea`
- `activeView`: `'explorer' | 'settings' | 'home' | 'scm'`
- `activeView === 'scm'` → `ScmPane`（Source Control）
- `activeView === 'settings'` → `SettingsPage`（可无工作区打开）
- `activeView === 'home'`（或无工作区）→ `WelcomePage`；已开项目时侧栏隐藏，工作区与标签保留
- `activeView === 'explorer'` + 有工作区 → `EditorArea` + 可选侧栏 + 可选右侧 `AiPanel`
- 「窗口」菜单：新建窗口 / 新建主窗口 / 最小化 / 关闭
- 应用图标：底稿 `build/icon.svg` → `build/icon.png`（主进程 `windowIcon()` + electron-builder；changelog **§129**）
- **右键菜单**（changelog **§116**）：`.ctx-menu` 为 `position:fixed`。打开时走 `workbench/fitContextMenu.ts`（`clampMenuPosition` + `useFittedMenuPos` 量完再钳），下方不够则翻到光标上方。接入：`FileTree`、`MindMapEditor`、`ActivityBar`、`SelectionContextMenu`、分屏 **`PaneFilePicker`**。CSS：`max-height: calc(100vh - 16px)` + `overflow-y: auto`。禁止只把 `top` 设成 `clientY`。

## 标签栏 / 分屏（changelog §160–§161）

一条顶栏管**打开顺序**；分屏只决定**这一栏看哪个已打开文件**。不要把「指定分屏文件」绑回标签右键（与改序冲突）。

```
.tab-bar
  .tab-bar-scroll          ← 唯一横滑容器；滚轮 deltaY→scrollLeft
    .tab[data-tab-id]      ← 单击激活；拖过 5px 改序；不 splice DOM
    .tab-drop-line         ← 插入竖线（相对 scrollLeft）
  .tab-bar-actions         ← 「分屏编辑 / 关闭分屏」只在这里，不按栏重复
.editors-split
  .editor-pane ×1 或 ×2
    .pane-file-picker      ← 仅 splitEnabled；自定义按钮，禁止原生 <select>
    编辑器本体
```

| 键 | 行为 |
|----|------|
| `tabs[]` | 打开顺序；`reorderTabs` 按 `insertBefore` splice（`from < dest` 时 dest−1） |
| `activeTabId` | 左栏（主栏）文件；单击标签或左栏「此栏」菜单 |
| `splitTabId` | 右栏文件；仅右栏「此栏」菜单 `setSplitTab` |
| 关闭分屏 | `disableSplit`；标签顺序不变 |

**滚轮：** `.tab-bar-scroll` 上 `{ passive: false }` 的 `wheel`：若 `scrollWidth > clientWidth`，取 `|deltaX|` 与 `|deltaY|` 较大者加到 `scrollLeft`。CSS `scrollbar-width: none`。

**改序：** 指针手势，不是 HTML5 drag。左键或右键在 `.tab` 上按下 → 拖过 **5px** 才进入改序（否则单击仍 `setActiveTab`）。拖动中按指针 X 算插入下标，画 `.tab-drop-line`；靠近左右缘自动 `scrollLeft`。松手才 `reorderTabs`。拖动中禁止重排标签 DOM。完成的拖动用 `suppressClickRef` 吃掉随后的 click。

右键必须：`pointerdown`/`mousedown` `preventDefault`（`button===2`）；对该 **tab 节点** `setPointerCapture`；窗口捕获阶段跟 `pointermove` **和** `mousemove`（Chromium 右键常不发 pointermove）；手势期间 document 捕获 `contextmenu` 也 `preventDefault`（Windows 菜单往往在 mouseup）。**不要**监听 `lostpointercapture` 当结束条件（右键捕获可能立刻丢失，会拆掉 mousemove 兜底）。`SelectionContextMenu` 的 `SKIP_SELECTOR` 含 `.tab-bar, .pane-file-picker, .pane-file-menu`。

**此栏菜单：** Windows 原生 `<select>` 弹出层是系统浅色，无法跟主题。`PaneFilePicker`：kicker「此栏」+ `.pane-file-picker-btn`（`--bg-input` / `--fg-bright`）→ `createPortal` 到 `document.body` 的 `.ctx-menu.pane-file-menu`（编辑器 `overflow:hidden` 会裁切非 portal）。当前栏文件 `.is-active` + `--accent-soft`。位置 `useFittedMenuPos`。

**文件：** `workbench/EditorArea.tsx` · `state/appStore.ts` `reorderTabs` · `workbench/fitContextMenu.ts` · `styles/global.css`（`.tab-bar*` / `.pane-file-*` / `.tab-drop-line`）· i18n `editor.paneFile` / `paneFileTitle` / `reorderTabsHint`。精简窗 `FloatWorkbench` **无**这条顶栏。须 **Ctrl+R**。

## 编辑器路由

| 扩展名 | 编辑器 |
|--------|--------|
| `.md` | MarkdownArticleEditor（TipTap WYSIWYG + Monaco 源码）。排版复制为人话（`transformCopiedText: false`）；粘贴仍解析 Markdown |
| `.txt` 等文本 | MonacoTextEditor（软化） |
| `.kmind` | MindMapEditor（React Flow 白板） |
| `.kyboard` | StoryboardEditor（稿纸 / 时间线 / 导出；见 [`STORYBOARD.md`](./STORYBOARD.md)） |
| `.png` | ImagePreviewEditor（只读预览；`kentucky-file://`；不经 DocumentHub） |
| `.mp4` | VideoPreviewEditor（只读预览；`kentucky-file://` Range/206；不经 DocumentHub） |
| `.pdf` | PdfPreviewEditor（pdf.js 自绘只读预览；工作台配色 / 叠加滚动条 / 可拖宽缩略图；不经 DocumentHub） |
| `.dialogue.csv` | DialogueEditor（节点图画布；普通 `.csv` 仍走 Monaco） |
| `characters.csv` | CharactersEditor（角色卡片；basename 匹配） |
| 工作区根 `characters.csv` | 同上（角色表；台词编辑器也会读写） |

## 台词 CSV

- **台词文件** `*.dialogue.csv`：列 `id,speaker,text,note,emotion,scene,condition,audio,focus_node,font_size,text_color`（写回始终 11 列；旧 8 列可读）；CSV 首行=开场（检视器可显式指定唯一开场）；播放序看 choices；`speaker`=角色 id；`text_color` 空=引擎默认（≠ 角色色）
- **播放图** `*.dialogue.choices.json`（空 text=确认续句/NPC 自动，取决于 `characters.operable`；非空=选项 UI）；**布局** `*.dialogue.layout.json`（仅 Kentucky）
- **角色表** 工作区根 `characters.csv`：`id,name,color,note,model_node,operable`（路径固定不可配）
- 解析/序列化：`dialogueCsv.ts` + `dialogueGraphMap.ts`（`resolveOpeningId` / `withExclusiveOpening`）；落盘 flush：`dialogueSidecarFlush.ts`（须 `graphReady`，防空覆盖）
- UI：`DialogueEditor` 节点画布 + `DialogueLineNode` / `DialogueInspector`（开场开关 + text_color hint）/ `DialogueMiniMap`
- 稳定 id：`allocateDialogueId` 在工作区所有 `.dialogue.csv` 内查重顺延
- Godot 契约：`extras/godot-kentucky-dialogue/README.md`（协议 **v1.3**）；执行器：[ai_river_godot](https://github.com/CCFOX12/ai_river_godot)

## `.kmind` 格式（v2）

自由图（非树）：

```json
{
  "version": 2,
  "nodes": [
    {
      "id": "n1",
      "text": "主题",
      "shape": "rounded",
      "x": 120,
      "y": 80,
      "width": 160,
      "height": 48,
      "link": { "path": "notes/a.md", "kind": "line", "line": 42 },
      "image": { "src": "ideas.assets/img_xxx.png", "name": "sketch.png" },
      "imageOnly": true,
      "note": "参考说明",
      "noteOpen": true,
      "noteLink": { "path": "notes/a.md", "kind": "file" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "sb", "targetHandle": "tt" }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

`shape`: `"rect" | "rounded" | "ellipse"`。边可选 `sourceHandle` / `targetHandle`（如 `sb`/`tt`）；缺失时按节点相对位置推断，避免 smoothstep 并到同一条主干。节点可选 `link`（`kind: file|line`，`line` 为 1-based 行号，路径相对工作区根）与 `image`（`src` 相对工作区）；`imageOnly: true` 表示空白导入的参考图（无文字区，可锁比例缩放）。可选 `note`（字段存在即有批注下巴，可为空串）、`noteOpen`、`noteLink`（批注超链，结构同 `link`）。旧 `kind: heading` 打开时降级为整文件链接。插图落盘到与导图同级的 `basename.assets/`。v1 树格式已废弃，打开时提示并给空白画布。

## 导图链接与插图

- Platform：`openImage`（单选，节点插图）/ `openImages`（多选，参考图）/ `copyFile` / `toMediaUrl` / `showItemInFolder`；主进程自定义协议 `kentucky-file://` 供渲染层显示工作区内图/音/视频（mp3/mp4 流式 Range，见上节）
- 「链接到段落」：选文件 → `beginLinePick`（`linkTarget: node|note`）分屏 → Monaco 点行 → `linePickResult` 写回节点 `link` 或 `noteLink`
- `openFile(path, { line? })` → `lineFlash`；Markdown 在 WYSIWYG 用遮罩高亮目标段（不显示行号）；纯文本 Monaco 跳转时临时隐藏行号栏
- 参考图：空白右键 → `openImages` → 复制进 `名.assets/` → `imageOnly` 节点；选中挂 `NodeResizer`（`keepAspectRatio`）
- 批注下巴：绝对定位在节点下方，不写入 `height`、不影响底边连线；展开态持久化 `noteOpen`；节点描边保留，下巴侧线同色延长；输入区自适应增高

## 字数与资源管理器

- 文章字数：`countArticleWords` — 非空白码点计数（与 UI「字」一致）
- 侧栏右键 reveal：文件 `shell.showItemInFolder`；目录/工作区根 `shell.openPath`（打开该夹，而非上一级）
- 显示名：`explorerNames.ts` 隐藏已知后缀（含 `.kyboard` / `.png` / `.mp4` / `.pdf`）；新建/重命名只改主名；分镜头图标 **SB**；PNG / MP4 / PDF 图标
- 脏/新建标记：标签 `.tab-dirty`（黄）/ `.tab-new`（蓝）；树 `.tree-name-dirty` / `.tree-name-new` 跟 `tabs[]` 同步
- 资源树可见扩展：主进程 `TEXT_EXTS`（含 `.png` / `.mp4` / `.pdf`）

## 视频预览（`.mp4`，changelog §119）

- `detectKind('.mp4')` → `EditorKind 'video'` → `VideoPreviewEditor`（`editors/VideoPreviewEditor.tsx`）。
- 主进程 `TEXT_EXTS` 含 `.mp4`（否则树不可见）。`TEXT_EXTS` 是可见白名单，**不是**「当文本打开」。
- 与 PNG 共用 `isMediaPreviewKind`：**不**走 DocumentHub；关标签不 `docUnsubscribe`；`saveTab` 直接成功。
- `toMediaUrl` → `kentucky-file://`；`.mp4` 走 `streamLocalMedia`（**流式 + Range/206** + `video/mp4`，与 BGM `.mp3` 同一函数）。改协议须整进程重启。
- 原生 `<video controls playsInline preload="metadata">`；舞台 contain；工具栏时长 + Reveal。
- 资源树：图标 **MP4**（`tree-icon-video`）；`explorerNames` `STRIP_EXTS` 含 `.mp4`。
- **不做**：jpg/webp/webm/mov；自定义播放器皮肤；把 MP4 当文本。

## 图片预览（`.png`）

- `EditorKind 'image'` → `ImagePreviewEditor`（`editors/ImagePreviewEditor.tsx`）。
- `isMediaPreviewKind`（与 MP4 共用）：**不**走 DocumentHub/`docOpen`（避免按 UTF-8 读二进制）；关标签不 `docUnsubscribe`；`saveTab` 直接成功。
- 显示经 `toMediaUrl` → `kentucky-file://`。
- 交互：非 passive `wheel` 定点缩放；指针拖拽平移；双击 / 「适应」按舞台尺寸 fit；工具栏 ± / 100% / Reveal。
- 只读；`saveTab` 直接成功。
- 资源树：`TEXT_EXTS` 含 `.png`；图标 **PNG**；`explorerNames` 隐藏后缀。

## PDF 预览与导出（changelog §127–§128）

- `detectKind('.pdf')` → `EditorKind 'pdf'` → `PdfPreviewEditor`。列入 `isMediaPreviewKind`（与 PNG/MP4 相同：不进 DocumentHub）。
- 预览：`toMediaUrl` → `fetch` ArrayBuffer → **pdf.js** 画布（工作台配色、`kentucky-overlay-scroll`、缩略图栏可拖 sash）。不要用 Chromium PDF iframe（改不了滚动条/侧栏，重挂会空白）。Worker：`pdfjs-dist/build/pdf.worker.min.mjs`。适应/缩放是我们自己的页宽，不是插件 hash。
- 协议：`.pdf` 走 `streamLocalMedia(..., 'application/pdf')`（Range/206）。
- 导出：`export/exportPdf.ts` 收集当前 `.md` HTML 或 `.kmind` 位图 → `dialog:savePdf` → `pdf:export`。
- 主进程 `printHtmlToPdf`（`registerPdfIpc` 与 Agent 共用）：隐藏窗加载 `pdf-print.html`（Vite extra input；**不能** `data:` URL）→ `printToPDF` A4；HTML ≤ 2MB、PDF ≤ 50MB。
- Agent `export_workspace_pdf`：工作区 `.md` → 主进程 GFM→HTML → 同管道写 `dest`（默认 sibling `stem.pdf`，无对话框）。`.kmind` 拒绝。
- `.kmind`（UI）：渲染层 `html-to-image` 栅格化（长边 ≤ 4096，滤 minimap/controls），横版一页。
- 入口：MarkdownToolbar / MindMapEditor 工具栏、文件菜单、FileTree 右键；Agent 工具仅 `.md`。
- **不做**：批注/全文搜索、puppeteer、导图矢量/分页、台词图/分镜头/纯 txt、Agent 导图 PDF。Android **要移植**（BOARD A4；导出不抄 `printToPDF`）。

## 分镜头 / 简化 PR（`.kyboard`，v0.3.0）

完整契约 → [`STORYBOARD.md`](./STORYBOARD.md)（§96 首发；polish **§97–§119**、**§150–§155** 改序/persist；**§121** 路径/导出上限；§116 为工作台右键）。

### 数据流

```
Renderer StoryboardEditor / ImagePreviewEditor / VideoPreviewEditor
  → platform.storyboard* / dialogs / toMediaUrl（preload）
  → main/storyboard IPC + kentucky-file（mp3/mp4 走 streamLocalMedia Range/206）
  → pngjs 空白/切片 · ffmpeg MP4（ensure-ffmpeg / extraResources）
  → 工作区内路径（默认 *.kyboard.assets/）
```

### 模块

| 层 | 路径 |
|----|------|
| Schema | `src/shared/kyboardSchema.ts`（v1；V1/A1–A4 trim、`storedCameraKeys` / `cameraAtClip`、`appendPanelClipsMut`、`reorderVideoClipMut` / `repackVideoClipStartsMut`、split/remove/snap；主进程 re-export） |
| 主进程 | `src/main/storyboard/{pngUtil,storyboardService,registerStoryboardIpc}.ts`；`main/index.ts` 注册 `kentucky-file`；`ipcSandbox` 绑定工作区 |
| 预加载 | `kentucky.storyboard*` + `openPng/Mp3` / `savePng/Mp4` / `toMediaUrl` / progress |
| UI | `editors/StoryboardEditor.tsx` + `storyboardTimelineHelpers.ts` + `storyboardDocFlush.ts` |
| 样式 | `styles/storyboard-nle.css`（时间线壳）· `styles/storyboard-pages.css`（稿纸/导出/检视器）· `global.css` 共享 |
| PNG | `editors/ImagePreviewEditor.tsx` |
| MP4 预览 | `editors/VideoPreviewEditor.tsx` |
| ffmpeg | `scripts/ensure-ffmpeg.js` → `resources/ffmpeg/ffmpeg.exe`；`resolveFfmpeg()` 探活 |
| 路由 | `EditorKind 'storyboard' \| 'image' \| 'video' \| 'pdf'`；`EditorArea` / `FloatWorkbench` |
| 新建 | `createStoryboard`；Sidebar / FileTree |

### 持久化与跨窗

- `.kyboard`：`persistDoc` = 序列化 → `rememberStoryboardJson` + `updateTabContent` + `writeFile`。Save / 关标签保存前 `flushStoryboardForSave`。不要只 `writeFile` 而留下打开时的空 `tab.content`（Ctrl+S 会盖掉时间线）。改序后 `repackVideoClipStartsMut`，禁止再 `packVideoClipsMut`。**无**一键铺轨。
- 媒体路径：工作区相对 `imageRel` / `audioRel`；预览/播放用 `toMediaUrl` → `kentucky-file://`。
- 多稿本：`sheets[]` + `panels[].sheetId`；UI `activeSheetId`（非多序列）。

### 空白生成 / 导出路径

- 空白：`generateBlank({ fileName, targetDirAbs })`；目录须在工作区内；表单 touched 防文件名被布局同步覆盖。
- 导出页：文件夹 + 文件名；另存为回写；区外 MP4 经 assets 中转。

### 时间线 / 音频 / 镜头

- **自定义** `.storyboard-scrub*`（非原生 range accent）；详见 STORYBOARD §5。
- 固定 px/秒轨道；隐藏横滑条；滚轮横移。
- A1–A4：`listAudioClips`；播放每 clip 一个 `HTMLAudioElement`；导出 `anull`/`amix`；仅校正 `outSec===60`；mp3/**mp4** 协议均流式 + Range（改协议须重启）。
- 镜头：监视器拖/滚轮 / **I** 在播放头 `upsertCameraKeyMut`；菱形只用 `storedCameraKeys`（不注入 t=0/t=1）；播放/导出 `cameraAtClip`（有 keys 则 hold，无 keys 才 from→to）。

### 导出编码

- PNG：复制最近 sheet 文件到用户路径。
- MP4：主进程 `cameraAtClip` 渲帧 → `.kentucky/storyboard-export/` → ffmpeg（多轨 amix）→ 目标（区外则先 assets 再 copy）。
- ffmpeg 解析顺序（每个候选 `-version` 探活）：`KENTUCKY_FFMPEG` → 打包 `process.resourcesPath/ffmpeg/ffmpeg.exe`（extraResources 映射）→ 开发态 `out/main` 相对 `../../resources/ffmpeg/ffmpeg.exe` → 常见 Win 路径 → PATH。`npm run ensure-ffmpeg` 写入开发副本；`dist*` 先跑再打包。缺则 `FFMPEG_NOT_FOUND` → i18n。**禁止** `ffmpeg-static`。
