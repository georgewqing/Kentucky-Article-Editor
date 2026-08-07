# 如何运行

## 安装

```bash
cd "d:\Working Directory\Kentucky"
npm install
```

## 开发

```bash
npm run dev
```

PowerShell 脚本策略报错时：

```bat
cmd /c npm run dev
```

### Cursor / VS Code 一键调试（推荐）

1. 打开本仓库为工作区
2. 左侧 **Run and Debug**（或 `Ctrl+Shift+D`）
3. 顶部下拉选 **Debug All**
4. 按 **F5**（或点绿色三角）

会启动 `electron-vite`（带 sourcemap），并同时附加：

- **主进程**（Node 调试）
- **渲染进程**（Chrome 远程调试端口 `9222`）

在 `src/main/**` 或 `src/renderer/src/**` 打断点即可命中。只需主进程时选 **Debug Main Process**。

配置文件：`.vscode/launch.json`（跟 electron-vite 官方调试指南一致）。

## 构建 / 检查

```bash
npm run typecheck
npm run build
```

产物在 `out/`（main、preload、renderer）。

### Windows 便携 exe（下载即开、无需解压）

```bash
npm run dist
```

产物：`release/KENTUCKY-<version>-portable.exe`（electron-builder `portable`）。用户双击即可；体积含 Chromium，通常一百多 MB 起。

国内若下载 Electron/NSIS 工具超时，可先设镜像再打包：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| Ctrl+S | 保存当前标签 |
| Ctrl+W | 关闭当前标签 |
| Ctrl+B | 切换侧栏（实现上活动栏点击会强制打开侧栏） |
| Ctrl+O | 打开文件夹 |
| Ctrl+, | 打开设置 |

## 建议自测路径

1. 欢迎页打开文件夹 → 出现在 recent 卡片（最多 6）
2. 新建 `.md`：默认写作视图用工具栏排版；可切源码看 Markdown；保存；右键删除
3. 新建 `.txt`：无工具栏的软化 Monaco
4. 新建 `.kmind`：自由拖节点、改三种形状、从边缘拖出连线；拖到空白可弹出「添加节点」并自动连边；Delete 删除
5. 新建台词 `.dialogue.csv`：先「创建角色」，再选说话人写台词；改字后 id 不变；导出管线/本地化 CSV
6. 设置：深/浅色、改主体色、刷新仍保留
7. 语言中英切换 → 顶栏原生菜单语言同步

## Godot 台词热编辑（同路径联动）

Kentucky **不**内嵌 Godot，**不**附带引擎插件，也不做双向实时协议。热编辑靠「两边读同一份磁盘文件」：

```text
YourGodotProject/
  dialogue/                 ← Kentucky「打开文件夹」选这里（工作区根）
    characters.csv          ← 含 model_node
    tavern_intro.dialogue.csv
    tavern_intro.dialogue.meta.json
  scripts/
    dialogue_loader.gd      ← 运行时读 res://dialogue/...
  addons/
    (your plugin)           ← 监视/重载由你在 Godot 工程实现
```

1. 在 Kentucky 打开 `dialogue/`（因 `characters.csv` 固定在工作区根）。
2. **新建台词**信息卡：只填 Godot 场景 + 对话标识 → 自动生成文件名并写 `*.dialogue.meta.json`（卡上无改名入口）。
3. **创建角色**须填模型节点名 `model_node`（写入 `characters.csv`）；也可直接打开 `characters.csv` 用卡片页管理；台词里可「编辑当前角色」。
4. 需要改文件名：资源管理器 **右键 → 重命名**（台词会同步改 meta）。
5. 编辑 `.dialogue.csv`（详情里可展开「Godot 演出」填对焦/字号/颜色），`Ctrl+S` → 磁盘立刻更新（写回 11 列）。
6. 游戏直接读这些路径；**不要**再维护一份平行导出副本当热编辑主路径。
7. **完整协议 v1.1**：[`extras/godot-kentucky-dialogue/README.md`](../extras/godot-kentucky-dialogue/README.md)。

类比：Kentucky ≈ 外部 DCC；Godot 读盘——联动靠路径，不是进程间推送。
