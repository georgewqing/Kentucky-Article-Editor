# 产品决策（Android）

| 项 | 决定 |
|----|------|
| 形态 | Capacitor + React；**独立软件根**，不 import `../win` |
| 版本 | **0.2.0**，功能对齐 Win 0.2.0（写作 / kmind / 对话 v1.3 / 角色 / 多工作区 / AI） |
| 设备 | 大屏安卓平板；**优先外接键盘**；不做手机窄屏布局 |
| 窗口 | **单窗**；不实现新建窗口 / DocumentHub 跨窗（桌面专属） |
| 工作区 | 浏览器：File System Access + IndexedDB。真机：**SAF tree URI**（`KentuckySaf`）；Documents/`kentucky-workspace` 仅作降级 |
| 菜单 | **不显示桌面 AppMenuBar**；保留文档标签。打开/保存/设置/AI 走 Welcome、ActivityBar、Sidebar 与快捷键 |
| 系统栏 | Android 原生状态栏 / 导航栏固定黑底浅色图标；原生 WindowInsets 保证 WebView 不被遮挡 |
| 界面缩放 | `uiScale` 仅缩放应用 chrome；`fontSize` 独立控制 Monaco / TipTap 编辑器字号 |
| 窄宽布局 | 小于约 1100px 时 AI 为右侧覆盖抽屉；不压缩主编辑器，且禁用编辑器分屏 |
| AI | WebView 内 `src/ai-runtime/`（由 win `main/ai` 改编）；密钥走 Preferences；app-body 数据在 `Directory.Data/kentucky-data/` |
| 对话协议 | 与 Win 一致 **v1.3**（见 `../win/extras/godot-kentucky-dialogue/`） |
| 开发策略 | 冻结已解除；以 Win 为功能真源，但源码分家且禁止整目录覆盖；按 [持续移植手册](./PORTING-WIN-TO-ANDROID.md) 同步；进度 [`BOARD.md`](./BOARD.md) |
| 触控板 UX | 平板 + 磁吸键盘：**画布语义对齐 Mac**（双指平移、捏合缩放、Ctrl/Meta+滚轮缩放、次要点击）；菜单/快捷键文案仍写 **Ctrl**（键帽无 ⌘） |

## 明确不做

- 手机布局
- 多窗口 / 精简浮窗
- 在本目录附带 Electron
- 与 `win/` 共享 npm workspace
- Godot 同盘热编联调（格式兼容，联调请用 Win）
- 真正模拟 ⌘ 键帽；为触控板改 `win/`
