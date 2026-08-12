# 契约：Shell UX（U8–U12）

> **状态**：OPEN  
> **指纹**：`toolApi: "2026-08-12-a"`（含主进程变更须重启 Electron）  
> **进度**：[`../BOARD.md`](../BOARD.md) · 互补 [`./workbench-chrome.md`](./workbench-chrome.md) / [`./agent-ui.md`](./agent-ui.md)  
> **移植顺序**：U12 → U10 → U8 → U9 验收 → U11 验收

## 1. U8 · 设置页 UI 重置 + 分段开关动效

### 1.1 目标

旧设置：标签左右挤、AI 平铺、可读性差。  
新设置：卡片分区、输入标签在上、开关左右对齐；分段控件用 **clip-path 揭示**（animate tab-indicator 配方）。

### 1.2 Win 文件

| Win | Android |
|-----|---------|
| `win/src/renderer/src/workbench/SettingsPage.tsx` | `android/src/workbench/SettingsPage.tsx` |
| `win/src/renderer/src/workbench/SegmentedControl.tsx` | **新建**同构组件 |
| `win/src/renderer/src/styles/global.css`（`.settings-*` · `.seg-control*`） | `android/src/styles/global.css` |

### 1.3 结构契约

```
.settings-page.kentucky-overlay-scroll
  .settings-page-inner (max ~720px)
    .settings-header (h1 + .settings-lead)
    .settings-card × N
      .settings-card-head (h2 + optional .settings-card-desc)
      .settings-group? (AI 内：配置档 / Agent / 网页搜索 / Skills)
        .settings-group-title
        .settings-card-body
          .settings-field | .settings-field--inline
          .settings-field-row (model + context 两列)
```

- 文本字段：标签在上（stacked）。  
- 开关/主题：`.settings-field--inline`（标签左、控件右）。  
- AI 大段用 `.settings-group` 拆开，勿再用挤在一起的旧 `.settings-row`。

### 1.4 SegmentedControl

- 双层 grid：base（可点）+ active（`pointer-events: none`，`clip-path` 跟 active 段）。  
- 测量：`ResizeObserver` + `useLayoutEffect`。  
- Token：`--ease-in-out` · `--duration-toggle`（200ms）· `--duration-press`（140ms）· `active: scale(0.97)`。  
- `prefers-reduced-motion`：关掉 clip / scale。  
- 配置档多选 pills **不要**用 Seg（会换行）— 保留 `.theme-toggle.settings-profile-pills`。

### 1.5 验收

1. 外观 / 语言 / AI 卡片分区清晰，输入可读。  
2. 开/关、主题等切换有 clip 滑动；reduced-motion 下即时切换。  
3. 配置档新建 / 密钥 / Skills 开关仍可用。

---

## 2. U9 · 设置页滚动条跟主题色

### 2.1 契约

与侧栏 / AI 消息一致：

- 根节点：`className="settings-page kentucky-overlay-scroll"` + `ref` + `useOverlayScroll(pageRef)`。  
- 滚动时 `.is-scrolling` → thumb 用 `var(--accent)`（见既有 `.kentucky-overlay-scroll` CSS）。  
- **不要**再出现系统默认灰滑块。

### 2.2 文件

Win/Android：`SettingsPage.tsx` + 既有 `hooks/useOverlayScroll.ts` + global overlay CSS。

Android：SettingsPage 已接 hook（2026-08-12）；移植 U8 时勿丢掉 `kentucky-overlay-scroll` / `pageRef`。

---

## 3. U10 · 上下文用量跟随主体色

### 3.1 取代旧固定冷色板

旧（Agent UI OPEN §3.4）：`BUCKET_COLORS` 固定 slate/blue。  
新：同一主体色相，按桶 **strength 0→1** 调饱和度/明度。

### 3.2 Win 文件

| Win | Android |
|-----|---------|
| `win/src/renderer/src/theme/applyTheme.ts` → `accentTone` · `CONTEXT_BUCKET_STRENGTH` · `normalizeAccent` | 同步 `android/src/theme/applyTheme.ts`（若路径不同则对等） |
| `win/src/renderer/src/ai/AiPanel.tsx` → `ContextBar` | `android/src/ai/AiPanel.tsx` |

### 3.3 API

```ts
accentTone(accent: string, strength: number, mode: 'dark' | 'light'): string
CONTEXT_BUCKET_STRENGTH = {
  system: 0.12,
  tools: 0.32,
  skills: 0.5,
  rules: 0.68,
  conversation: 0.88
}
```

- ContextBar 读 `useSettingsStore` 的 `accent` + `themeMode`。  
- 近灰/白 accent：借用冷青 hue carrier（`h ≈ 195/360`）。  
- **剩余容量**图例点仍中性灰（`.is-free`），不跟 accent。  
- 无 buckets 时 fallback fill 仍 `var(--accent)`；warn/critical 逻辑保留。

### 3.4 验收

换设置里主体色 → 打开上下文弹层 → 分段与图例点色相跟随，深浅可区分；剩余为灰。

### 3.5 与 Agent UI OPEN 关系

移植 U2 时：**不要**再写死旧 BUCKET_COLORS 表；以本 §3 为准。在 [`agent-ui.md`](./agent-ui.md) §3.4 加「已由 U10 取代」交叉引用。

---

## 4. U11 · 开始页多开工作区

### 4.1 产品意图

打开工作区后回起始页，应能从**最近记录**再开其它文件夹，行为与活动栏「+」一致（**加开**，不关掉已开）。

### 4.2 Win 文件

| Win | Android |
|-----|---------|
| `appStore.goHome` / 强化 `openWorkspace` | `android/src/state/appStore.ts` |
| `ActivityBar` → `goHome` | 同构 |
| `WelcomePage.tsx` | 同构（Win 已拷过一版，需验） |
| i18n `welcome.alreadyOpen` · `welcome.multiHint` | Android locales |
| CSS `.workspace-card.is-open` · `.welcome-multi-hint` · badge | global.css |

### 4.3 契约

1. **`goHome()`**：`snapshotActiveSession` → `set({ openWorkspaces: parked, activeView: 'home' })`。**禁止**清 `workspacePath` / 关工程。  
2. **`openWorkspace(path)`**：先 park；已在 `openWorkspaces` → `switchWorkspace`；否则 `[...parked, session]` **追加**。  
3. **Welcome 主按钮**：有已开工程时用 `addWorkspaceViaDialog()`（与「+」相同），文案 `activity.addWorkspace`；否则 `welcome.openFolder`。  
4. **最近卡片**：`openWorkspace(item.path)`；已开显示「已打开」badge（`.is-open`）。  
5. 提示文案：`welcome.multiHint`（说明不会关已开工程）。

### 4.4 验收

1. 开 A → 点起始页 → 最近点 B → 活动栏有 A、B 两个徽章。  
2. 再点已开 A 的卡片 → 切回 A，不新建重复会话。  
3. 起始页主按钮再开 C → 三工程并存。

---

## 5. U12 · 纸夹挂载 CRITICAL 注入（修「挂了却不认」）

### 5.1 根因

Skill（U5）走 CRITICAL turnHint 注入正文；文件挂载旧实现只塞弱 `@mentions` Editor context → 模型常当成「没挂上 / 不是 skill」。

### 5.2 Win 文件

| Win | Android |
|-----|---------|
| `win/src/main/ai/agentLoop.ts` → `buildMountedFilesHint` · `pathKey`/`readAbsSafe` | `android/src/ai-runtime/agentLoop.ts` |
| `proposalGate.TOOL_API_VERSION` → `2026-08-12-a` | runtime 同名字段 |

### 5.3 契约

发送时对 `editor.attachedPaths`：

1. `buildMountedFilesHint(workspace, paths)` 读 `readWorkspaceMention`（文件正文 / 目录浅列表）。  
2. 拼进 **turnSystemHint**（可与 skill 正文同轮；mount 块建议在前或明确分段）。  
3. 文案要点：  
   - `CRITICAL: User mounted file(s)…`  
   - 明确 **不是 skill**  
   - 正文在 `"""…"""` 内；读失败要写明 sandbox/缺失。  
4. `@mentions` 循环：**跳过**已在 `attachedPaths` 的路径，避免正文双份。  
5. `readAbsSafe`：统一 `\` 再比前缀（修 Win `/` vs `\` 误拒）。

### 5.4 验收

1. Composer 纸夹挂 `.md` → 发送 → Agent **直接依据挂载正文**回答，不说「看不到 / 不是 skill」。  
2. 挂文件夹 → 注入浅列表。  
3. 区外导入仍进 `.kentucky/refs/` 再挂（沙箱不变）。  
4. 工具结果 `toolApi` 为 `2026-08-12-a`（或 Android 对齐后的同版字符串）。

### 5.5 与 chrome OPEN

[`workbench-chrome.md`](./workbench-chrome.md) §2.4 已注明 CRITICAL；移植 U4 时 **必须含 U12**，勿只搬 chip UI。

---

## 6. Grill / 勿回退

1. 文件挂载 = CRITICAL 注入，与 Skill 同级；禁止退回「仅 @mentions」。  
2. 设置分段动效用 clip-path + token；勿 `transition: all` / `scale(0)`。  
3. 上下文色跟 accent strength；勿写死旧冷色 hex 表（U2 移植时注意）。  
4. `goHome` 不关工程；开始页开文件夹与「+」同为加开。  
5. 禁止 `import` from `win/`；对照后在 android 重写。

---

## 7. 总验收清单

- [ ] U12：挂文件发送，Agent 认正文（CRITICAL）  
- [ ] U10：换主题色，上下文分段变色  
- [ ] U8：设置页卡片 + Seg 动效  
- [ ] U9：设置页滚动条主题色  
- [ ] U11：开始页连续开多工程  
- [ ] 文学 / Skill / 旧 U1–U7 回归不破  

全部通过：本文件 → **CLOSED**；进度板 U8–U12 ✅；`android/project-memory/changelog.md` 留一条。
