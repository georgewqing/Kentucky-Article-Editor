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
      index.ts             IPC：对话框、fs、菜单语言
      menu.ts              原生菜单（中/英）
    preload/
      index.ts             contextBridge → window.kentucky
    renderer/
      index.html
      src/                 React 渲染层（业务都在这）
        App.tsx
        main.tsx           启动时 hydrate 主题
        platform/          FS 抽象（禁止组件直接碰 Electron）
        state/
          appStore.ts      工作区、标签、文件树、recent
          settingsStore.ts 主题 / 字号
        theme/
          applyTheme.ts    由 accent + mode 衍生 CSS 变量
        i18n/
        workbench/         活动栏、侧栏、欢迎页、设置、编辑区、状态栏
        editors/           TipTap 文章、Monaco、MindMap、kmind 格式
        styles/global.css
    state/
      appStore.ts          仅 re-export（IDE 旧路径兼容）
```

路径别名：`@/*` → `src/renderer/src/*`（见 `tsconfig.json` / `electron.vite.config.ts`）。

## 进程与数据流

```
Renderer (React)
  → getPlatform() 
  → window.kentucky (preload)
  → ipcMain (main)
  → Node fs / dialog / Menu
```

- UI **不得** `require('fs')` 或散落 `window.kentucky`（菜单监听等经 `Platform` 封装）。
- 未来大屏安卓：换 `Platform` 实现（如 Capacitor），复用同一套 React 工作台。

## 关键状态

### `appStore`

- `workspacePath`、`fileTree`、`tabs`、`activeTabId`、分屏
- `activeView`: `'explorer' | 'settings'`
- `recentFolders`: `{ path, lastOpened }[]`（欢迎页最多展示 6；存储可更多）
- 文件：`createFile/Folder/MindMap(name, parentDir?)`、`deleteEntry`、`openFile`、`saveTab`

### `settingsStore`（localStorage: `kentucky.settings`）

- `themeMode`: `'dark' | 'light'`
- `accent`: hex
- `fontSize`

### 其它 localStorage

- `kentucky.locale`
- `kentucky.recentFolders`

## 界面结构

- **始终有** `ActivityBar`（资源管理器 / 设置）
- 无工作区 → `WelcomePage`（品牌 + 打开文件夹 + 最多 6 张工作区卡片）
- 有工作区 → `Sidebar`（文件树 + 顶栏新建 + 右键菜单）+ `EditorArea`
- `activeView === 'settings'` → `SettingsPage`（可无工作区打开）
- 底栏 `StatusBar`（弱化底色，非 VS 亮蓝条）

## 编辑器路由

| 扩展名 | 编辑器 |
|--------|--------|
| `.md` | MarkdownArticleEditor（TipTap WYSIWYG + Monaco 源码） |
| `.txt` 等文本 | MonacoTextEditor（软化） |
| `.kmind` | MindMapEditor（React Flow 白板） |

## `.kmind` 格式（v2）

自由图（非树）：

```json
{
  "version": 2,
  "nodes": [
    { "id": "n1", "text": "主题", "shape": "rounded", "x": 120, "y": 80, "width": 160, "height": 48 }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "sb", "targetHandle": "tt" }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

`shape`: `"rect" | "rounded" | "ellipse"`。边可选 `sourceHandle` / `targetHandle`（如 `sb`/`tt`）；缺失时按节点相对位置推断，避免 smoothstep 并到同一条主干。v1 树格式已废弃，打开时提示并给空白画布。
