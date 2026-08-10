# OPEN: 台词文件损坏 / 未 Accept 丢失（部分修复）

> 状态：代码已加固（2026-08-10），**需真机 Run 重装**验证；工作区已损坏文件需人工或 Agent 恢复一次。  
> 相关：状态栏 insets 同轮修复见下方「状态栏」。

## 现象（用户 + 内置 Agent）

- 缺少规范名 `night_cafe.dialogue.csv`，只有 `.csv.txt` / `(1).txt` 等副本
- choices / CSV 多版本不一致；工作区疑似被重置；未 Accept 更改在更新后丢失

## 根因（工程侧）

1. **SAF `createFile`**：早期 MIME `text/plain` 会变成 `foo.dialogue.csv.txt`；冲突时再生成 `foo.dialogue.csv (1).txt`
2. **Accept 默认 `applyWritesToDisk: false`**：只标脏 tab，WebView 重载 / 进程被杀后缓冲丢失
3. **工作区「像示例」**：多为 SAF 权限/树 URI 未恢复或打开了 Documents 降级根，不是内置示例包

## 本轮代码修复

| 项 | 改动 |
|----|------|
| SAF 写入 | `KentuckySafPlugin.writeStream`：octet-stream、`renameTo` 纠正 mangled 名、回收 `.txt` / `(N).txt` 后删残留 |
| Accept 落盘 | Capacitor 真机 **始终** `applyProposalToDisk`（`agentLoop.shouldPersistProposalToDisk`） |
| 状态栏 | insets 挂到 Capacitor 真实 `@id/webview`（原先错误找 `main_content`，从未生效） |

## 用户侧恢复（当前 test2）

1. 将 `night_cafe.dialogue.csv (1).txt` 内容整理为规范 `night_cafe.dialogue.csv`（行序按约定）
2. choices / layout 与 CSV 分支版对齐后保存
3. 删除 mangled 副本；用 App **重新授权打开** test2 文件夹（避免 Documents 降级根）
4. 安装含本修复的包后：Accept 应直接写盘

## 未解决 / 勿混淆

- MD↔AI 触控板滚动：见 [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md)
- **Pending（未点 Accept）** 仍只在会话里；不会自动写盘——这是产品设计，不是 bug
