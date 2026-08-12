# Gotchas（Android）

> 踩坑与禁止项。入口见 [`README.md`](./README.md)；进度见 [`BOARD.md`](./BOARD.md)。

## 分家与移植

1. **不要** `import` `../win` — 两软件根独立；从 Win 移植时复制后改 Platform。
2. 从 Win 同步正式功能时**禁止整目录覆盖** `android/src`；尤其 Platform、Workbench、App、Settings、CSS、触控板 hooks 与 `native/` 必须人工合并。完整流程见 [`PORTING-WIN-TO-ANDROID.md`](./PORTING-WIN-TO-ANDROID.md)。
3. **多窗口 API** 存在仅为类型对齐，调用是 no-op。
4. **AI 无 Node main**：工具读写必须走注入的 `WorkspaceIo`；密钥在 Preferences，勿明文写盘。
5. **Monaco 需打包进 bundle**（CSP / 离线）；勿用 CDN。

## SAF / 文件

6. **SAF 路径**是相对 tree 的；`workspacePath` 多为显示名，读写用 `relativeTo` + `KentuckySaf`。
7. **禁止**对 SAF 文本文件使用 MIME `text/plain` 创建 — 会得到 `foo.csv.txt` / `foo.md.txt`。用 `application/octet-stream`（`mimeForPath`）。
8. **台词/SAF 文件名**：写入用 octet-stream；mangled（`.csv.txt` / `(N).txt`）需 rename 纠正或拒绝。`KentuckySafPlugin.writeStream` 已加固；**历史脏副本内容需人工整理**（代码不改已有文件正文）。
9. **真机 `openFolder`** 必须先 `Capacitor.isNativePlatform()` 再走 SAF；WebView 可能存在不可用的 `showDirectoryPicker`。
10. Capacitor 7：`PluginMethod` 在 `com.getcapacitor`；`ActivityResult` 在 `androidx.activity.result`。
11. `takePersistableUriPermission` 的 flags **只能**是 READ 和/或 WRITE。
12. AI 新建文件默认脏标记、可能未落盘 — 侧栏靠 ghost tabs；用户需「全部保存」或单文件保存后才稳定在磁盘上。
13. **对话 sidecar 命名**：`foo.dialogue.choices.json` / `.layout.json` / `.meta.json`（不是 `.dialogue.csv.meta.json`）；`graphReady` 前不要刷空 CSV。
14. 改 `KentuckySafPlugin.java` 后需重新编译原生工程；仅 `cap sync` 不够。
15. 本机若 JDK 过新（class file 69+），Gradle 8.11 可能无法编译 — 使用 JDK 17/21 构建 `native/`。

## Agent 落盘（与 Win U13+ 对齐时注意）

16. Capacitor 真机历史上曾对 Accept **强制落盘**（防杀进程丢缓冲）。Win 现已 **始终写盘、无 Accept**，并演进到 `toolApi: 2026-08-12-l`（Git L5 等，见 [`../win/project-memory/AGENT-GIT.md`](../win/project-memory/AGENT-GIT.md)）。Android 移植 U14 时必须 `WorkspaceIo.write` 真写 SAF，不能只标脏；契约镜像 [`open/auto-apply-git.md`](./open/auto-apply-git.md)。
17. 角色 upsert / 小台词 append 的 auto 路径同理：杀进程比桌面更危险。

## 系统栏 / 布局 / 触控

18. Android system bars：Capacitor Bridge 布局是 `@id/webview`（**不是** `main_content`）。insets 打在 WebView **layout margins**；勿在 Web CSS 再叠 top safe-area。
19. `uiScale` 只允许通过 CSS chrome tokens 缩放；禁止给 `#root` 加 `transform: scale` / `zoom`。
20. `<=1100px` 的 AI 是覆盖抽屉；改 `.ai-pane` 须同时回归宽屏三栏和窄宽 drawer。
21. **React Flow 画布**：默认滚轮/双指滑动是**平移**；缩放用捏合或 **Ctrl/Meta + 滚轮**。
22. **禁止**在 `index.html` viewport 写 `maximum-scale=1` / `user-scalable=no` — 会吃掉列表滚动。整页缩放靠 MainActivity `setSupportZoom(false)` + 画布 `touch-action: none`。
23. 手指长按画布/文件树**不会**开上下文菜单；触控板双指点按与 Ctrl+左键会开。
24. 改 `MainActivity` 后需 **Run 重装**；仅 `cap sync` 网页不够。
25. **A1 待真机验收**：MD TipTap 与 AI 在触控板上曾互斥；现由 `MainActivity` 截获 `ACTION_SCROLL` 经 `kentucky:native-wheel` 重派发。详见 [`open/trackpad-scroll.md`](./open/trackpad-scroll.md)。

## 其它

26. Toast / 对话框退出动画需保留 DOM；尊重 `prefers-reduced-motion`。
27. 清空上下文后续聊：先读 [`README.md`](./README.md) → [`BOARD.md`](./BOARD.md)。
