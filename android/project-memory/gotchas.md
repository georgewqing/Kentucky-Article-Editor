# Gotchas（Android）

1. **不要** `import` `../win` — 两软件根独立；从 Win 移植时复制后改 Platform。
2. **对话 sidecar 命名**：`foo.dialogue.choices.json` / `.layout.json` / `.meta.json`（不是 `.dialogue.csv.meta.json`）；`graphReady` 前不要刷空 CSV。
3. **SAF 路径**是相对 tree 的；`workspacePath` 多为显示名，读写用 `relativeTo` + `KentuckySaf`。
4. **AI 无 Node main**：工具读写必须走注入的 `WorkspaceIo`；密钥在 Preferences，勿明文写盘。
5. **多窗口 API** 存在仅为类型对齐，调用是 no-op。
6. **Monaco 需打包进 bundle**（CSP / 离线）；勿用 CDN。
7. 改 `KentuckySafPlugin.java` 后需重新编译原生工程；仅 `cap sync` 不够。
8. 本机若 JDK 过新（class file 69+），Gradle 8.11 可能无法编译 — 使用 JDK 17/21 构建 `native/`。
9. Toast / 对话框退出动画需保留 DOM；尊重 `prefers-reduced-motion`。
10. **禁止**对 SAF 文本文件使用 MIME `text/plain` 创建 — 会得到 `foo.csv.txt` / `foo.md.txt`，编辑器认不成类型。用 `application/octet-stream`（见 `mimeForPath`）。
11. **真机 `openFolder`** 必须先 `Capacitor.isNativePlatform()` 再走 SAF；WebView 可能存在不可用的 `showDirectoryPicker`。
12. Capacitor 7：`PluginMethod` 在 `com.getcapacitor`；`ActivityResult` 在 `androidx.activity.result`。
13. `takePersistableUriPermission` 的 flags **只能**是 READ 和/或 WRITE。
14. AI 新建文件默认脏标记、可能未落盘 — 侧栏靠 ghost tabs 显示；用户需「全部保存」或单文件保存后才稳定在磁盘上。
15. 清空上下文后续聊：先读 [SESSION-HANDOFF.md](./SESSION-HANDOFF.md)。
16. **React Flow 画布**：默认滚轮/双指滑动是**平移**，不是缩放；缩放用捏合或 **Ctrl/Meta + 滚轮**。
17. 改 `MainActivity` WebView 缩放设置后需 **Run 重装**原生包；仅 `cap sync` 网页不够。
18. 手指长按画布/文件树**不会**开上下文菜单（抑制 touch 合成 `contextmenu`）；触控板双指点按与 Ctrl+左键会开。
19. **禁止**在 `index.html` viewport 写 `maximum-scale=1` / `user-scalable=no` — Android WebView 会吃掉列表滚动；整页缩放靠 MainActivity `setSupportZoom(false)` + 画布 `touch-action: none`。
20. **OPEN（待真机验收）**：MD TipTap 与 AI 面板在**触控板**上曾滚动互斥；纯 JS 修复均无效。现由 `MainActivity.dispatchGenericMotionEvent` 截获 `ACTION_SCROLL`，经 `kentucky:native-wheel` 按原生指针坐标重派发。改动含 Java，必须 Android Studio Run 重装。详见 [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md)。
21. Android system bars：Capacitor `BridgeActivity` 实际布局是 `bridge_layout_main` 的 `@id/webview`（**不是** app 里 `activity_main` 的 `main_content`）。insets 必须 `setOnApplyWindowInsetsListener` 打在 Bridge WebView 的 **layout margins** 上；只给根 padding 或绑错 id 会导致 tab 顶进状态栏。不要在 Web CSS 再叠 top safe-area（会双倍留白）。
22. `uiScale` 只允许通过 CSS chrome tokens 缩放；禁止给 `#root` 加 `transform: scale` / `zoom`，否则 React Flow、Monaco 与原生 wheel 坐标会错位。
23. `<=1100px` 的 AI 是覆盖抽屉，不占 flex 宽度；修改 `.ai-pane` 时必须同时回归宽屏三栏和窄宽 drawer。
24. 从 Win 同步正式功能时**禁止整目录覆盖** `android/src`；尤其 Platform、Workbench、App、Settings、CSS、触控板 hooks 与 `native/` 必须人工合并。完整流程见 [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)。
25. **台词/SAF 文件名**：写入用 octet-stream，mangled（`.csv.txt` / `(N).txt`）需 rename 纠正或拒绝；Capacitor 上 Accept **强制落盘**。见 [OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md)。
