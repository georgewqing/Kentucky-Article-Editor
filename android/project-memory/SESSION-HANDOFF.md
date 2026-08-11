# Session handoff — Android 0.2.0 + 平板原生体验 + 触控板 UX

> 供清空上下文后下一轮对话直接接着干。最后更新：2026-08-11。

## 当前状态

- **版本**：`kentucky-android@0.2.0`（`package.json` + `native/app/build.gradle` `versionName 0.2.0` / `versionCode 2`）
- **目标**：功能对齐 `../win` 0.2.0，但 Android 使用独立平板 chrome（单窗、无桌面
  AppMenuBar、原生 system bars / Back、窄宽 AI drawer）；触控板画布语义对齐 Mac
- **验证**：改完后请跑 `npm run typecheck` / `npm run build` / `npx cap sync android`
- **真机**：改过 `MainActivity.java` / `KentuckySafPlugin.java` → 必须 Android Studio **Run 重装**
- **本轮（状态栏 + 台词）**：
  - 状态栏 insets 绑到 Capacitor Bridge WebView（修复 tab 与系统状态栏重叠）
  - SAF 写入防 `.csv.txt` / 编号副本；Accept 真机强制落盘
  - 详情：[OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md)
  - test2 里已损坏的 night_cafe 文件需**人工恢复一次**（代码不会自动改历史副本内容）
- **OPEN — Agent 工具反馈对齐（2026-08-11）**：Win Round A–D（写入门禁、characters 落盘、continuity、Plan、append、FS、snippet、批量 upsert 等）**尚未**移植到 `ai-runtime`。权威清单 [`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md)；Android 进度板 [OPEN-agent-tool-feedback-parity.md](./OPEN-agent-tool-feedback-parity.md)
- **后续同步 Win 正式功能**：必须先读
  [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md)。禁止整目录覆盖
  `android/src`；按 renderer / Platform / Electron / Node / 协议 / Android UX 分类移植

## 本轮完成的大块工作

### A. 一比一移植骨架

| 区域 | 说明 |
|------|------|
| UI | 从 Win 覆盖 `editors/`、`workbench/`、`ai/`、`state/`、`i18n/`、`styles/`、`common/kmindDirty.ts` |
| 对话 | v1.3 图编辑器（`DialogueEditor` + inspector + sidecars） |
| AI | 新建 `src/ai-runtime/`（由 `win/src/main/ai` 改编，无 Electron）；`bridge.ts` → Platform `ai*` |
| Platform | 签名对齐 Win（含 `openContextFiles`、全部 `ai*`） |
| 菜单 | 去掉「新建窗口」；多窗口 API no-op |
| 依赖 | 增加 `@dagrejs/dagre` |

### B. SAF 原生插件

- **Java**：[`native/.../KentuckySafPlugin.java`](../native/app/src/main/java/com/ccfox12/kentucky/KentuckySafPlugin.java)
- **注册**：[`MainActivity.java`](../native/app/src/main/java/com/ccfox12/kentucky/MainActivity.java) 在 `super.onCreate` **之前** `registerPlugin`
- **TS**：[`src/plugins/kentuckySaf.ts`](../src/plugins/kentuckySaf.ts)
- 能力：`openTree` / `restoreTree` / 读写删 / mkdir / copy / base64 / `pickImages` / `pickFiles`

**Import 注意（Capacitor 7）：**

```java
import com.getcapacitor.PluginMethod;                    // 不是 annotation 包
import androidx.activity.result.ActivityResult;          // 不是 com.getcapacitor.activity
```

### C. 真机问题修复（重要）

| 问题 | 根因 | 修复位置 |
|------|------|----------|
| Vite build 失败 `boot-theme.js` | 相对路径被当模块 | `index.html` → `/boot-theme.js` |
| Vite `html-inline-proxy` | 路径含空格 + 内联 `<style>` | 抽到 `public/boot-splash.css` |
| 文件夹选择打不开 | WebView 假 `showDirectoryPicker` 抢先；SAF 失败静默降级 | `platform/index.ts`：**原生优先 SAF**；失败弹明确错误 |
| AI 面板打不开 | 无工作区时禁用；CSP 拦外网 | ActivityBar 提示；CSP `connect-src` 加 `https: http:` |
| CSV/MD 当纯文本 | SAF `text/plain` 写出 `foo.csv.txt` / `foo.md.txt` | Java 改用 `application/octet-stream`；读写兼容 `.txt` 后缀；`stripSafTextSuffix` |
| 侧栏无「角色表」 | AI 创建的 `characters.csv` 未落盘，树里没有 | FileTree **ghost tabs**（脏/新建未上盘也显示）；标签显示「角色表」 |
| 要一键保存 | — | Sidebar `+` 旁 **⬇** → `saveAllTabs()` |
| 顶部与状态栏重叠 | Capacitor 实际是 Bridge `@id/webview`，旧代码绑错 `main_content` / 仅根 padding | `MainActivity.configureSystemBars` → WebView **layout margins** |
| 台词 mangled / Accept 丢 | SAF 脏名；Accept 默认只标脏 | `KentuckySafPlugin.writeStream` 加固；`agentLoop` 真机强制落盘 — [OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md) |
| Settings 触控板不滚 | 原生消费 `ACTION_SCROLL` 后合成 wheel 无默认滚动 | `useSpatialWheelScroll` 通用 overflow ancestor fallback |
| tab 关闭无效 | 顶部重叠 + pointer 冒泡 | 修正 inset；close 独立 pointer |
| MD↔AI 触控板互斥 | TipTap 焦点 / latching（纯 JS 无效） | 原生 `ACTION_SCROLL` 重派发 — [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md) **待验收** |
| Agent 工具反馈未对齐 | Win Round A–D 门禁/落盘/continuity/Plan/FS 等 | **OPEN** — [OPEN-agent-tool-feedback-parity.md](./OPEN-agent-tool-feedback-parity.md)；总清单 [`../win/project-memory/AGENT-TOOL-FEEDBACK.md`](../win/project-memory/AGENT-TOOL-FEEDBACK.md) |

### D. 触控板对齐 Mac（仅 `android/`）

| 行为 | 实现 |
|------|------|
| 双指滑动画布 | RF `panOnScroll` + `zoomOnScroll={false}`（MindMap / Dialogue） |
| 捏合缩放 | `zoomOnPinch`；WebView `setSupportZoom(false)`（**不要**在 viewport 写 `user-scalable=no`，会破坏 MD/AI 滚动） |
| Ctrl/Meta+滚轮缩放 | `zoomActivationKeyCode={['Meta','Control']}` |
| 次要点击 | `hooks/useSecondaryClick.ts`：contextmenu + Ctrl/Meta+左键；抑制 touch 长按 |
| 列表滚动 | **原生修复待真机验收**：Activity 截获 `ACTION_SCROLL`，按真实指针坐标重派发；MD/AI/Sidebar 专用路由，其余 overflow 容器走通用 ancestor fallback；见 [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md)。 |
| 分隔条 | Sidebar / AI / Dialogue inspector sash → Pointer Events + `setPointerCapture` |
| 快捷键文案 | 仍写 Ctrl；运行时继续 `ctrlKey \|\| metaKey` |

关键文件：`src/editors/rfTrackpadProps.ts`、`src/hooks/useSecondaryClick.ts`、`src/hooks/useSpatialWheelScroll.ts`、MindMap/Dialogue、FileTree、ActivityBar、MainActivity。

### E. Android 平板原生体验

| 区域 | 实现 |
|------|------|
| 顶部 | 删除 Win 风格 File/Edit/View/Help `AppMenuBar`；保留文档 tabs |
| 系统栏 | 黑底浅色图标；WindowInsets 作为 WebView margins 避开状态栏、导航栏、刘海与软键盘（不要改回根 padding） |
| 返回键 | 关闭对话框 / AI / 设置层级，根页面最小化，不直接丢脏标签 |
| 字体 | 设置新增 `uiScale` 90%–130%；编辑器字号继续独立 |
| 窄宽 | `<=1100px` AI 改右侧覆盖抽屉，自动关闭编辑器分屏 |
| 触屏 | coarse pointer 放大主要操作、tab 关闭、菜单和 sash 命中区 |

## OPEN：MD / AI 触控板滚动（2026-08-10）

**原生修复候选已实现，待真机验收。** 完整记录：[OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md)

- 触屏 OK；触控板下 MD 与 AI「先滑谁只能滑谁」
- MindMap / 对话图与 AI **可以**并存（RF 空间处理 wheel，对照组）
- 已试 viewport / CSS / 全局 wheel 分流 / focus / spatial hit-test → **均无效**
- 新方案由 `MainActivity.dispatchGenericMotionEvent` 截获原生 `ACTION_SCROLL`，
  通过 `kentucky:native-wheel` 按真实坐标重建 wheel，绕过 WebView focus/overflow latch
- 改动含 Java：下一轮必须 Android Studio **Run 重装**后验收

## 关键路径速查

```
android/
  package.json                          # 0.2.0
  index.html                            # CSP + viewport（无 maximum-scale）+ boot assets
  public/boot-splash.css
  src/platform/index.ts                 # FSA / SAF / AI bridge / openFolder 原生优先
  src/plugins/kentuckySaf.ts
  src/hooks/useSecondaryClick.ts        # 次要点击 / touch 长按抑制
  src/hooks/useAndroidBackButton.ts     # Android 系统返回键层级
  src/hooks/useSpatialWheelScroll.ts    # MD/AI 滚轮：按矩形命中（对齐 RF）
  src/editors/rfTrackpadProps.ts        # RF Mac 触控板 props
  src/ai-runtime/                       # 全套 AI
  src/ai/                               # AiPanel UI
  src/editors/dialogueCsv.ts
  src/state/appStore.ts
  src/workbench/Sidebar.tsx             # ⬇ + sash Pointer Events
  src/workbench/FileTree.tsx
  src/workbench/ActivityBar.tsx
  src/workbench/Workbench.tsx           # AI sash + 窄宽覆盖抽屉
  native/app/.../KentuckySafPlugin.java
  native/app/.../MainActivity.java      # SAF + system bars/insets + WebView/wheel
  project-memory/
```

## 真机流程（下一轮可直接贴给用户）

```bat
cd /d "d:\Working Directory\Kentucky\android"
npm run cap:sync
npm run cap:open
```

Android Studio 选平板 → Run。  
`adb` 若不在 PATH：

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" devices
```

改 **Java** 后必须 Run 重装；只改 `src/` 则 `cap:sync` + Run 或热更即可。

## 触控板验收（磁吸键盘）

1. MindMap / 对话图：双指滑动平移；捏合缩放；Ctrl+双指滑动缩放
2. 文件树：双指点按或右键出菜单；Ctrl+左键也能出菜单
3. 手指长按画布不误开菜单；触控板次要点击正常
4. 侧栏拖宽、AI 拖宽可用触控板按住拖
5. Ctrl+S/O/L 等快捷键仍可用
6. 整页不被 WebView 捏合放大
7. **待验收**：MD 与 AI 同时打开时，反复交替滚动不再互斥 — 见 OPEN 文档

## 建议下一轮优先验证 / 可能跟进

1. **优先**：Android Studio Run 重装后确认顶部 tabs 已完全位于状态栏下方、关闭按钮可用、Settings 可用触控板滚动
2. 按 [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md) 真机验收 MD↔AI；失败再加原生 + JS wheel 日志
3. 真机：打开文件夹 → 建/开 `.md` / `.dialogue.csv` / `characters.csv` → 正确编辑器
4. AI Accept 后点 **⬇**，确认角色表落盘
5. 可选：Win 侧同步「全部保存」；嵌套目录 ghost tabs

## 产品边界（勿推翻）

- 独立根 `android/`，不 `import ../win`，不共享 npm
- 单窗；不做手机窄屏
- 触控板画布对齐 Mac；快捷键文案仍 Ctrl
- Godot 同盘热编以 Win 为主；安卓只保证同格式文件
