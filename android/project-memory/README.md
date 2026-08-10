# KENTUCKY Android — project memory

安卓软件根自有记忆目录（与 `../win/project-memory` 分离）。当前版本 **0.2.0**，
功能对齐 `../win` 0.2.0，并包含 Android 平板专属 system bars、WindowInsets、
界面缩放、AI 覆盖抽屉、返回键、SAF 与触控板适配。

| 文档 | 内容 |
|------|------|
| [SESSION-HANDOFF.md](./SESSION-HANDOFF.md) | **清空上下文后续聊先看这份** |
| [PORTING-WIN-TO-ANDROID.md](./PORTING-WIN-TO-ANDROID.md) | **Win 正式功能持续移植到 Android 的完整操作手册** |
| [how-to-run.md](./how-to-run.md) | 安装、Vite、Capacitor、真机 Run |
| [product-decisions.md](./product-decisions.md) | 产品边界 |
| [architecture.md](./architecture.md) | 结构与 Platform |
| [gotchas.md](./gotchas.md) | 移植 / 真机注意点 |
| [changelog.md](./changelog.md) | 改动时间线 |
| [OPEN-trackpad-md-ai-scroll.md](./OPEN-trackpad-md-ai-scroll.md) | **OPEN**：MD↔AI 触控板滚动（待真机验收原生分流） |
| [OPEN-dialogue-saf-corruption.md](./OPEN-dialogue-saf-corruption.md) | **OPEN/部分修复**：台词 SAF 脏名、Accept 落盘、状态栏 insets |

## 2026-08-10 会话摘要（已实现 / 待验收）

### 已落地（需 Android Studio **Run 重装** 因含 Java）

1. **0.2.0 移植**：Win 功能对齐、单窗、SAF 插件、`ai-runtime`、对话 v1.3、ghost tabs、全部保存等  
2. **触控板 Mac 语义（画布）**：RF `panOnScroll`、捏合缩放、次要点击、sash Pointer Events；禁 viewport `user-scalable=no`  
3. **MD↔AI 触控板冲突**：纯 JS 多次失败；现 `MainActivity` 截获 `ACTION_SCROLL` + `useSpatialWheelScroll` 按原生坐标分流 — **真机是否修好仍待确认**  
4. **状态栏重叠**：insets 绑 Capacitor Bridge `@id/webview` margin（勿绑不存在的 `main_content`）  
5. **台词损坏**：SAF 写入防 `.csv.txt` / `(N).txt`；Capacitor Accept **强制写盘**；历史脏文件需人工恢复  

### 明确未自动解决

- test2 工作区里已存在的 mangled 台词副本内容整理  
- MD↔AI 触控板：以真机验收为准  

### 真机最短路径

```bat
cd /d "d:\Working Directory\Kentucky\android"
npm run cap:sync
npm run cap:open
```

Android Studio → Run。改 Java 后不能只 sync 网页。
