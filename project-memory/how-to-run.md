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

## 构建 / 检查

```bash
npm run typecheck
npm run build
```

产物在 `out/`（main、preload、renderer）。

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
2. 新建 `.md`、保存；右键删除
3. 新建 `.kmind`，右键加节点，根节点应紧凑而非巨大胶囊
4. 设置：深/浅色、改主体色、刷新仍保留
5. 语言中英切换 → 顶栏原生菜单语言同步
