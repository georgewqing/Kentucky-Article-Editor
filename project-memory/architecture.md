# 架构

## 定位

**KENTUCKY**：本地文本写作桌面应用。UI 气质从「VS Code 工作台」演进为「更接近 Cursor」：少硬边框、统一色阶、可调深浅色与主体色。

## 技术栈

| 层 | 技术 |
|----|------|
| 壳 | Electron 37 + electron-vite |
| UI | React 19 + TypeScript |
| 状态 | Zustand（`appStore` + `settingsStore`） |
| 文本编辑 | `.md`：TipTap WYSIWYG + Monaco 源码；其它：软化 Monaco（`monacoSetup.ts` 本地打包） |
| 思维导图 | @xyflow/react 自由白板；自有 `.kmind` v2（nodes + edges） |
| i18n | i18next（`zh-CN` / `en`） |
| 主题 | CSS 变量 + `applyTheme(mode, accent)` |

## 目录结构（真实路径）

```
Kentucky/
  project-memory/          ← 本记忆目录
  electron.vite.config.ts
  package.json
  src/
    main/                  Electron 主进程
      index.ts             IPC：对话框、fs、菜单、多窗口、DocumentHub
      menu.ts              原生菜单（中/英）
      documentHub.ts       跨窗文件正文权威
      windowRegistry.ts    main/float 元数据
    preload/
      index.ts             contextBridge → window.kentucky
    renderer/
      index.html
      src/                 React 渲染层（业务都在这）
        App.tsx
        main.tsx           启动时 hydrate 主题
        platform/          FS 抽象（禁止组件直接碰 Electron）
        state/
          appStore.ts      工作区、标签、文件树、recent、多窗
          settingsStore.ts 主题 / 字号
        theme/
          applyTheme.ts    由 accent + mode 衍生 CSS 变量
        i18n/
        workbench/         活动栏、侧栏、欢迎页、设置、编辑区、FloatWorkbench
        editors/           TipTap 文章、Monaco、MindMap、Dialogue、kmind/dialogueCsv
        styles/global.css
    state/
      appStore.ts          仅 re-export（IDE 旧路径兼容）
  .vscode/
    launch.json            Cursor/VS Code：F5 调试 Electron（主进程+渲染）
```

路径别名：`@/*` → `src/renderer/src/*`（见 `tsconfig.json` / `electron.vite.config.ts`）。

## 进程与数据流

```
Renderer (React)
  → getPlatform() 
  → window.kentucky (preload)
  → ipcMain (main)
  → Node fs / dialog / Menu / DocumentHub / BrowserWindow
```

- UI **不得** `require('fs')` 或散落 `window.kentucky`（菜单监听等经 `Platform` 封装）。
- 未来大屏安卓：换 `Platform` 实现（如 Capacitor），复用同一套 React 工作台。
- **多窗口：** `role: main | float`（`windowRegistry`）；文件正文权威在主进程 `documentHub`；各窗 Zustand 仅本地 UI。

## 关键状态

### `appStore`

- `windowRole`、`workspacePath`、`fileTree`、`tabs`（含 `docRev`）、`activeTabId`、分屏
- `activeView`: `'explorer' | 'settings'`
- `recentFolders`: `{ path, lastOpened }[]`（欢迎页最多展示 6；存储可更多）
- 文件：`openFile` / `saveTab` / `discardTab` / `applyDocSnapshot` / `spawnNewWindow` / `spawnNewMainWindow` / `handleWindowCloseRequest` 等
- `unsavedDialogStore`：应用内未保存三按钮对话框
- `lineFlash` + `clearLineFlash`：导图段落跳转后浅色高亮（编辑器内绝对定位遮罩）
- `linePickSession` / `linePickResult`：分屏点行设链

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
- 无工作区 → `WelcomePage`（品牌 + 打开文件夹 + 最多 6 张工作区卡片）
- 有工作区 → `Sidebar` + `EditorArea`
- `activeView === 'settings'` → `SettingsPage`（可无工作区打开）
- 「窗口」菜单：新建窗口 / 新建主窗口 / 最小化 / 关闭

## 编辑器路由

| 扩展名 | 编辑器 |
|--------|--------|
| `.md` | MarkdownArticleEditor（TipTap WYSIWYG + Monaco 源码） |
| `.txt` 等文本 | MonacoTextEditor（软化） |
| `.kmind` | MindMapEditor（React Flow 白板） |
| `.dialogue.csv` | DialogueEditor（聊天式台词；普通 `.csv` 仍走 Monaco） |
| 工作区根 `characters.csv` | Monaco（角色表；由对话编辑器自动读写） |

## 台词 CSV

- **台词文件** `*.dialogue.csv`：列 `id,speaker,text,note,emotion,scene,condition,audio`；行序=播放序；`speaker`=角色 id
- **角色表** 工作区根 `characters.csv`：`id,name,color,note`（路径固定不可配）
- 解析/序列化：`src/renderer/src/editors/dialogueCsv.ts`
- 稳定 id：`allocateDialogueId` 在工作区所有 `.dialogue.csv` 内查重顺延

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
