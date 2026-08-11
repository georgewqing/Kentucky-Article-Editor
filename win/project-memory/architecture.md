# 架构

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
| AI | OpenAI 兼容流式 chat；主进程 `src/main/ai/`；会话/密钥落本体 `data/` |
| i18n | i18next（`zh-CN` / `en`） |
| 主题 | CSS 变量 + `applyTheme(mode, accent)` |

## 目录结构（真实路径）

```
Kentucky/                  ← Cursor 工作区容器（非本软件根）
  win/                     ← 本软件根（Windows / Electron）
    project-memory/        ← 本记忆目录
    electron.vite.config.ts
    package.json           ← version 0.2.0
    dev-data/              ← 开发态本体数据（gitignore）
    src/
      main/                Electron 主进程
        index.ts           IPC：对话框、fs、菜单、多窗口、DocumentHub、AI
        ai/                OpenAI 兼容客户端、agent loop、tools、kmindLayout（dagre）、本体 data 路径
        menu.ts            原生菜单（中/英）
        documentHub.ts     跨窗文件正文权威
        windowRegistry.ts  main/float 元数据
      preload/
        index.ts           contextBridge → window.kentucky（含 ai:*）
      renderer/
        index.html
        src/               React 渲染层（业务都在这）
          App.tsx
          main.tsx         启动时 hydrate 主题
          platform/        FS + AI IPC 抽象
          state/
            appStore.ts
            settingsStore.ts
            aiStore.ts     会话、流式、自动写入同步、思考态
          ai/              AiPanel、simpleMarkdown
          theme/
          i18n/
          workbench/       含 explorerNames（隐藏后缀）、叠加滚动条
          editors/
          styles/global.css
```

路径别名：`@/*` → `src/renderer/src/*`（见 `tsconfig.json` / `electron.vite.config.ts`）。

## 进程与数据流

```
Renderer (React)
  → getPlatform() 
  → window.kentucky (preload)
  → ipcMain (main)
  → Node fs / dialog / Menu / DocumentHub / BrowserWindow / AI agent loop
```

- UI **不得** `require('fs')` 或散落 `window.kentucky`（菜单监听等经 `Platform` 封装）。
- 安卓平板为**独立软件根** `../android/`（Capacitor），不在本 Electron 树内换 Platform。
- **多窗口：** `role: main | float`（`windowRegistry`）；文件正文权威在主进程 `documentHub`；各窗 Zustand 仅本地 UI。

## AI 数据流（v0.2.0）

```
AiPanel / aiStore
  → ai:send（含编辑器上下文）
  → main agentLoop（OpenAI 兼容 SSE + tools）
  → propose_* 工具 → 立即写盘（可选）+ ai:proposal
  → aiStore.syncAppliedFile → appStore.applyAiFileEdit（不抢焦点；标 dirty/isNew）
  → 标签栏 / 资源管理器黄蓝标记；Ctrl+S 清除
```

- 本体路径：`appBodyPaths.ts` → 开发 `win/dev-data/data/`，打包为 exe 旁 `data/`
- 会话：`data/ai-chats/*.json`（含 Mirror `plan[]` + `planFileRel`）；设置：`data/ai-settings.json`；密钥：`data/ai-key.bin`
- Plan：`create_plan` → 工作区 `plans/<slug>.plan.md`（`planFiles.ts`）；对话栏无常驻计划列表；Agent InjectPath；md 顶栏 Build
- 工作区结构：`workspace_mkdir` / `copy` / `move` / `delete`（`tools.ts` + `ai:workspaceOp`）
- `.kmind`：`kmindLayout.ts`（dagre Sugiyama）；`propose_kmind_edit` / `layout_kmind`
- `.dialogue.csv`：`formats.ts`（choices/layout 解析 + `layoutDialogueGraph`）；`propose_dialogue_graph` / `layout_dialogue` / `propose_set_dialogue_choices` 等
- Skills：`skills.ts` → `data/ai-skills/`；catalog 注入系统提示；`list_skills` / `read_skill`
- 联网：`webSearch.ts`（DuckDuckGo）；`web_search` / `web_research`；设置开关


## 应用状态

### `appStore`

- `windowRole`、`workspacePath`、`fileTree`、`tabs`（含 `docRev`、`dirty`、`isNew`）、`activeTabId`、分屏
- `activeView`: `'explorer' | 'settings' | 'home'`
- `recentFolders`: `{ path, lastOpened }[]`（欢迎页最多展示 6；存储可更多）
- 文件：`openFile` / `saveTab` / `discardTab` / `applyDocSnapshot` / **`applyAiFileEdit`**（AI 安静写回）/ `spawnNewWindow` 等
- `unsavedDialogStore`：应用内未保存三按钮对话框
- `lineFlash` + `clearLineFlash`：导图段落跳转后浅色高亮（编辑器内绝对定位遮罩）
- `linePickSession` / `linePickResult`：分屏点行设链

### `aiStore`

- 会话列表 / 当前会话、流式缓冲、`agentPhase`（idle/thinking/streaming/tool）
- `syncAppliedFile`：收到 `ai:proposal` 后更新标签与树，不切换当前页

### `settingsStore`（localStorage: `kentucky.settings`）

- `themeMode`: `'dark' | 'light'`
- `accent`: hex
- `fontSize`

### 其它 localStorage

- `kentucky.locale`
- `kentucky.recentFolders`

## 界面结构

- **主窗**有 `ActivityBar`；**精简窗**为 `FloatWorkbench`（文件名标题 + 单编辑器，**无**顶栏菜单）
- Windows/Linux 顶栏 `AppMenuBar`（点击展开）；macOS 用系统菜单
- Toast：`ToastLayer`（进出动画）；确认 / 未保存：`ConfirmDialog` / `UnsavedChangesDialog` + `AnimatedDialogShell`
- 动效 tokens 与 `prefers-reduced-motion`：`styles/global.css`；boot：`index.html` / `public/splash.html`
- 无工作区 → `WelcomePage`（品牌 + 打开文件夹 + 最多 6 张工作区卡片）
- 有工作区 → `Sidebar` + `EditorArea`
- `activeView`: `'explorer' | 'settings' | 'home'`
- `activeView === 'settings'` → `SettingsPage`（可无工作区打开）
- `activeView === 'home'`（或无工作区）→ `WelcomePage`；已开项目时侧栏隐藏，工作区与标签保留
- `activeView === 'explorer'` + 有工作区 → `EditorArea` + 可选侧栏 + 可选右侧 `AiPanel`
- 「窗口」菜单：新建窗口 / 新建主窗口 / 最小化 / 关闭
- 应用图标：`build/icon.png`（主进程 `windowIcon()` + electron-builder）

## 编辑器路由

| 扩展名 | 编辑器 |
|--------|--------|
| `.md` | MarkdownArticleEditor（TipTap WYSIWYG + Monaco 源码） |
| `.txt` 等文本 | MonacoTextEditor（软化） |
| `.kmind` | MindMapEditor（React Flow 白板） |
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

- Platform：`openImage`（单选，节点插图）/ `openImages`（多选，参考图）/ `copyFile` / `toMediaUrl` / `showItemInFolder`；主进程自定义协议 `kentucky-file://` 供渲染层显示工作区内图片
- 「链接到段落」：选文件 → `beginLinePick`（`linkTarget: node|note`）分屏 → Monaco 点行 → `linePickResult` 写回节点 `link` 或 `noteLink`
- `openFile(path, { line? })` → `lineFlash`；Markdown 在 WYSIWYG 用遮罩高亮目标段（不显示行号）；纯文本 Monaco 跳转时临时隐藏行号栏
- 参考图：空白右键 → `openImages` → 复制进 `名.assets/` → `imageOnly` 节点；选中挂 `NodeResizer`（`keepAspectRatio`）
- 批注下巴：绝对定位在节点下方，不写入 `height`、不影响底边连线；展开态持久化 `noteOpen`；节点描边保留，下巴侧线同色延长；输入区自适应增高

## 字数与资源管理器

- 文章字数：`countArticleWords` — 非空白码点计数（与 UI「字」一致）
- 侧栏右键 reveal：文件 `shell.showItemInFolder`；目录/工作区根 `shell.openPath`（打开该夹，而非上一级）
- 显示名：`explorerNames.ts` 隐藏已知后缀；新建/重命名只改主名
- 脏/新建标记：标签 `.tab-dirty`（黄）/ `.tab-new`（蓝）；树 `.tree-name-dirty` / `.tree-name-new` 跟 `tabs[]` 同步
