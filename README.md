# KENTUCKY

本地文本写作桌面应用（Electron + React + TypeScript）。界面气质接近 Cursor 工作台：少硬边框、统一色阶，支持深色 / 浅色与可调主体色。

> **开发说明：** 本项目由作者与 AI（Cursor Agent）协作开发。  
> **更新原则：** 优先以作者个人写作与使用需求迭代，**在一定程度上是自用软件**。公开仓库欢迎围观与参考；功能路线、交互取舍可能不完全面向通用产品化。

**License:** [MIT](./LICENSE)

架构与决策备忘见 [`project-memory/`](./project-memory/README.md)。

## 功能

- **工作区：** 打开本地文件夹；欢迎页以卡片展示最近工作区（最多 6 个）
- **资源管理器：** 文件树、顶栏 / 右键新建文件·文件夹·思维导图、删除；侧栏宽度可拖
- **文本写作：** Monaco 多标签编辑（侧重 `.md` / `.txt`），脏标记与保存
- **思维导图：** 独立 `.kmind`（JSON），径向层级编辑，右键增删节点；与正文弱联动、不同步
- **分屏：** 编辑器左右分栏
- **设置：** 深色 / 浅色、主体色（预设 + 取色器）、字号、中英 UI；原生菜单随语言切换
- **架构预留：** 渲染层通过 `Platform` 抽象访问文件系统，便于未来大屏安卓复用 UI

## 明确不做（现阶段）

- Markdown 实时预览、正文 ↔ 导图自动同步
- 命令面板 / 扩展 / Git / 云同步
- 手机窄屏布局

## 快速开始

```bash
npm install
npm run dev
```

Windows PowerShell 若禁止 npm 脚本：

```bat
cmd /c npm run dev
```

```bash
npm run typecheck
npm run build
```

产物在 `out/`。

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| Ctrl+S | 保存 |
| Ctrl+W | 关闭标签 |
| Ctrl+B | 侧栏相关 |
| Ctrl+O | 打开文件夹 |
| Ctrl+, | 设置 |

## 技术栈

Electron · electron-vite · React 19 · TypeScript · Zustand · Monaco · Mind Elixir · i18next

## 贡献与反馈

因以个人需求为优先，不保证接受所有功能请求或 PR 节奏。Issue / PR 仍可开，作者会按自身使用优先级决定是否合入。
