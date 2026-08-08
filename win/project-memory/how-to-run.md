# 如何运行

## 安装

```bash
cd "d:\Working Directory\Kentucky\win"
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

1. 用 Cursor 打开工作区容器 `Kentucky/`（内含 `win/` 与 `android/` 两个软件根）
2. 左侧 **Run and Debug**（或 `Ctrl+Shift+D`）
3. 顶部下拉选 **Debug All**
4. 按 **F5**（或点绿色三角）

会在 **`win/`** 下执行 `npm run dev -- --sourcemap`，并同时附加：

- **主进程**（Node 调试，`autoAttachChildProcesses`）
- **渲染进程**（Chrome 远程调试端口 `9222`）

在 `win/src/main/**` 或 `win/src/renderer/src/**` 打断点即可命中。只需主进程时选 **Win: Debug Main Process**；只想跑起来不调试选 **Win: Run Dev**。

配置文件：工作区根 [`.vscode/launch.json`](../../.vscode/launch.json)（`cwd` = `win/`）。

若 F5 立刻失败且终端出现 `Invalid package config .../win/package.json`：多半是 `package.json` 含非 UTF-8 字节（例如错误编码的 `©`）。用纯 UTF-8 重存即可。

## 构建 / 检查

```bash
npm run typecheck
npm run build
```

产物在 `out/`（main、preload、renderer）。

### Windows 目录版（文件夹内可运行）

```bash
npm run dist
```

产物：`release/KENTUCKY-<version>/`（内含 `KENTUCKY.exe`）。把整个文件夹拷走即可，双击 exe 运行。体积含 Chromium，通常一百多 MB 起。

若仍要单文件 portable：`npm run dist:portable` → `release/KENTUCKY-<version>-portable.exe`。

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
| Ctrl+L | 打开/关闭右侧 AI 对话栏 |

## AI 代理人（v0.2.0）

1. 设置 → **AI**：填写 OpenAI 兼容 Base URL、模型、API Key（加密存软件本体 `data/`，开发态为 `win/dev-data/data/`）。
2. 活动栏 AI 图标或 `Ctrl+L` 打开右侧栏。
3. 打开工作区后可启用代理人工具；文件变更**自动写入**（无需点 Apply）。可选「改完直接写盘」或「改完标黄待 Ctrl+S」。
4. 改过的文件标签/侧栏为**黄 ●**，新建为**蓝 ●**；保存后圆点消失。AI 改多文件时**不切换**当前编辑页。
5. 等待回复时有「思考中 / 正在调用工具」指示；上下文占用见顶栏进度条；接近满时请新建对话。
6. 浮窗（精简窗）不带 AI 栏。
7. DeepSeek 等：Base URL 可用 `https://api.deepseek.com`（或带 `/v1`）；`fetch failed` 多为网络/代理连不上，不是模型名写错（错模型一般是 HTTP 4xx）。

## 建议自测路径

1. 欢迎页打开文件夹 → 出现在 recent 卡片（最多 6）
2. 新建 `.md`：默认写作视图用工具栏排版；可切源码看 Markdown；保存；右键删除
3. 新建 `.txt`：无工具栏的软化 Monaco
4. 新建 `.kmind`：自由拖节点、改三种形状、从边缘拖出连线；拖到空白可弹出「添加节点」并自动连边；Delete 删除
5. 新建台词 `.dialogue.csv`：先「创建角色」，再选说话人写台词；改字后 id 不变；导出管线/本地化 CSV
6. 设置：深/浅色、改主体色、刷新仍保留
7. 语言中英切换 → 顶栏原生菜单语言同步
8. AI：配 Key → 润色当前 md → 确认不闪页、标签/侧栏有黄或蓝点 → Ctrl+S 圆点消失

## Godot 台词热编辑（同路径联动）

Kentucky **不**内嵌 Godot，**不**在本仓附带引擎插件，也不做双向实时协议。热编辑靠「两边读同一份磁盘文件」。

**Godot 执行器参考实现：** [CCFOX12/ai_river_godot](https://github.com/CCFOX12/ai_river_godot)（AI River）。其它工程也可按协议自研。

```text
YourGodotProject/
  dialogue/                 ← Kentucky「打开文件夹」选这里（工作区根）
    characters.csv          ← 含 model_node
    tavern_intro.dialogue.csv
    tavern_intro.dialogue.meta.json
  scripts/
    dialogue_loader.gd      ← 运行时读 res://dialogue/...
  addons/
    (ai_river_godot 等)     ← 监视/重载；参考仓库见上
```

1. 在 Kentucky 打开 `dialogue/`（因 `characters.csv` 固定在工作区根）。
2. **新建台词**信息卡：只填 Godot 场景 + 对话标识 → 自动生成文件名并写 `*.dialogue.meta.json`（卡上无改名入口）。
3. **创建角色**须填模型节点名 `model_node`（写入 `characters.csv`）；也可直接打开 `characters.csv` 用卡片页管理；台词里可「编辑当前角色」。
4. 需要改文件名：资源管理器 **右键 → 重命名**（台词会同步改 meta）。
5. 编辑 `.dialogue.csv`（详情里可展开「Godot 演出」填对焦/字号/颜色），`Ctrl+S` → 磁盘立刻更新（写回 11 列）。
6. 游戏直接读这些路径；**不要**再维护一份平行导出副本当热编辑主路径。
7. **完整协议 v1.1**：[`extras/godot-kentucky-dialogue/README.md`](../extras/godot-kentucky-dialogue/README.md)。

类比：Kentucky ≈ 外部 DCC；Godot 读盘——联动靠路径，不是进程间推送。
