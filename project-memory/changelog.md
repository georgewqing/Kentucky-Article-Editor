# 改动时间线

按对话演进记录，便于回溯「为什么现在是这样」。

## 1. MVP 脚手架与工作台

- Electron + Vite + React + TS（electron-vite 布局）
- Platform 抽象 + preload `window.kentucky`
- VS Code 风格壳：活动栏 / 侧栏 / 多标签 / 状态栏
- 打开文件夹、文件树、Monaco 编辑与保存
- `.kmind` + Mind Elixir
- 中英 i18n、快捷键 Ctrl+S/W/B/O
- 文档化 Android 预备（Platform）

## 2. Cursor 风格 UI + 设置 + 欢迎卡片

- `settingsStore` + `applyTheme`（深/浅 + accent 衍生变量）
- `global.css` 去硬边框、弱化状态栏高饱和底
- `SettingsPage`、活动栏齿轮、`Ctrl+,`
- Monaco / Mind 跟主题
- 欢迎页最多 6 张 recent 工作区卡片；recent 改为 `{ path, lastOpened }`

## 3. 资源管理器新建修复

- Electron 下 `window.prompt` 不可用 → 侧栏 **内联输入框** 新建文件/文件夹/思维导图

## 4. 菜单汉化 + 右键

- `src/main/menu.ts`：文件/编辑/查看/窗口/帮助（中英随语言切换）
- 资源管理器右键：新建文件/文件夹/思维导图、删除
- 思维导图右键：子节点 / 同级 / 删除；locale `zh_CN`；自有 ctx 菜单兜底
- `create*` 支持 `parentDir`；`deleteEntry`

## 5. 侧栏可见性 + 思维导图根节点过大

- 活动栏提高对比度与 z-index；打开工作区强制 `sidebarVisible: true`
- Mind Elixir 默认根节点 25px + 大 padding → 紧凑主题 + CSS 覆盖；关掉内置 toolBar
- 画布 `overflow: hidden`，避免盖住左侧栏

## 6. 项目记忆目录

- 新增 `project-memory/`，固化架构与决策，防上下文丢失

## 7. 开源发布

- MIT License（Copyright leyang chen）
- README 标明功能、与 AI 协作开发、优先个人需求自用更新
- 仓库：https://github.com/CCFOX12/Kentucky-Article-Editor
