# 契约：MD↔AI 触控板滚动（A1）

> **状态**：原生分流已实现 · **待真机验收**  
> **进度**：[`../BOARD.md`](../BOARD.md) · 仅 `android/`

## 现象（用户确认）

| 场景 | 触屏（手指） | 触控板（双指/滚轮） |
|------|--------------|---------------------|
| Markdown 编辑器单独滚动 | 正常 | 有问题 / 与 AI 冲突 |
| AI agent 面板单独滚动 | 正常 | 有问题 / 与 MD 冲突 |
| **先滑 MD，再滑 AI** | — | 只能继续滑 MD，AI 无法滑 |
| **先滑 AI，再滑 MD** | — | 只能继续滑 AI，MD 无法滑 |
| **MindMap / 对话图 + AI 并存** | — | **正常**（可交替滑） |
| 文件树等列表 | 大致正常 | 未作为主诉 |

要点：不是「完全不能滚」，而是 **MD（TipTap）与 AI（overflow 列表）在触控板上互斥锁定**；画布类编辑器与 AI 无此问题。

## 对照：为何思维导图 / 台词可以和 AI 并存

- MindMap / Dialogue 用 **React Flow** + `RF_TRACKPAD_PROPS`（`panOnScroll` 等）。
- RF 在**画布 DOM 矩形内**自己消费 `wheel` 并平移视口，**不依赖** `contentEditable` 焦点。
- 指针在 AI 上时，事件不落在 RF 容器上 → AI 走自己的滚动。
- 结论：RF 的「面板矩形内处理 wheel」模型在真机上**可取**；问题出在 MD/AI 两条 **overflow +（MD）TipTap** 路径。

## 可疑根因（待验证，尚未证实）

1. **Android WebView + 触控板**：`wheel` 常送给**焦点节点**，不是指针下节点；TipTap `contentEditable` 获焦后吸走后续 wheel。
2. **Chrome scroll latching**：同一手势序列里 `wheel.target` 粘在第一次滚动的可滚节点上（「先滑谁锁死谁」与此吻合）。
3. MD 与 AI 都是 `overflow:auto` 列表，互相抢同一套 latching；RF 用自定义 pan，不走同一套 overflow latch。
4. `wheel.clientX/Y` 在部分驱动上可能不准（曾怀疑，未单独证实）。

触屏走 touch 滚动、不经 `wheel`，故手指一直正常——与「只坏触控板」一致。

## 已尝试且用户反馈无效的方案

按时间顺序（均已落地过代码，**真机仍判失败**）：

1. viewport 加/撤 `maximum-scale=1` / `user-scalable=no`（撤后 MD 曾短暂好转，后与 AI 仍冲突）
2. CSS：`touch-action: pan-y`、`overscroll-behavior: contain`、flex `min-height:0` / `height:0` 强制溢出
3. AI 面板本地 `wheel` + `preventDefault` 手动 `scrollTop`
4. 全局 `usePointerWheelScroll`（`elementFromPoint` / 区域状态机 / `pointermove` 坐标）
5. `scrollZone` + `pointerenter` 切换区域；换区 `focus` 滚动容器
6. **删除**全局劫持，仅原生 overflow + `focusScrollHost`
7. 现行 `useSpatialWheelScroll`：按指针坐标命中 `.ai-panel` / `.article-editor` 矩形（意图对齐 RF）— **用户确认仍无效**

## 2026-08-10 原生修复候选（待真机确认）

- `MainActivity.dispatchGenericMotionEvent` 在 WebView 之前截获指针设备的
  `ACTION_SCROLL`，读取原生 `rawX/rawY` 与 `AXIS_HSCROLL/VSCROLL`。
- 原生事件不再交给 WebView 的 overflow/focus latch，而是发送
  `kentucky:native-wheel`；坐标用 WebView 内归一化比例，避免 Android 物理像素与
  CSS 像素不一致。
- `useSpatialWheelScroll` 在真实坐标下向 `elementFromPoint` 命中的元素重建
  `WheelEvent`：MD / AI / Sidebar 继续走显式 `scrollTop`，React Flow 继续收到
  wheel 并保持双指平移、Ctrl/Meta+滚轮缩放。
- 2026-08-10 首轮真机发现 Settings 因原生事件已被消费而无法依赖 WebView 默认
  滚动；现补充通用 overflow ancestor fallback，Settings / inspector / 普通列表
  同样显式滚动。后续新增 `overflow:auto|scroll` 面板无需再逐个硬编码。
- WebView 避让系统栏改用 layout margins 后，原生 `rawX/rawY` 仍先减
  `getLocationOnScreen()`，因此 wheel 的 WebView 内坐标不会被顶部 inset 推偏。
- 触屏不走 `ACTION_SCROLL`，不受此改动影响。
- 此改动包含 Java，必须 `npm run cap:sync` 后在 Android Studio **Run 重装**；
  仅网页热更不能验收。

相关代码（现状，勿假定已修好）：

- `src/hooks/useSpatialWheelScroll.ts`（Workbench 挂载）
- `src/editors/rfTrackpadProps.ts`（画布，工作正常）
- `src/editors/MarkdownArticleEditor.tsx`（TipTap + `.article-editor`）
- `src/ai/AiPanel.tsx`（`.ai-messages`）

## 明确不要再盲试的方向

- 再堆一层「zone 状态机 / 只用 wheel.target」而不做真机坐标与焦点日志。
- 再改 viewport `user-scalable=no`（会伤列表滚动）。
- 为修 MD/AI 去改 RF 画布语义（画布路径是对照组，应保持）。

## 下一轮真机验收

1. 首先按验收标准反复测试 MD ↔ AI，并回归 MindMap / Dialogue ↔ AI。
2. 若仍失败，在 `dispatchGenericMotionEvent` 与 `wheel` capture 同时记录
   `rawX/rawY`、归一化坐标、`wheel.target`、`activeElement`、命中面板，确认是
   原生事件未进入还是坐标/轴值异常。
3. 若原生 `ACTION_SCROLL` 未出现，再对比无 TipTap 的纯 `overflow:auto` 长文；
   若纯 div 与 AI 可并存，则坐实 contentEditable 吸焦点，并考虑：
   - TipTap `editorProps.handleDOMEvents.wheel` 在指针几何落在 AI 时 `blur` 并转发；
   - 或 MD 不用可滚 contentEditable 外壳（滚动只在非编辑层 / 与 RF 一样显式接管 wheel）；
4. 验收标准：MD 与 AI 开着时，光标移到哪一侧，触控板只滚那一侧，且可反复切换；触屏回归不坏；MindMap+AI 仍正常。

## 产品影响

- 平板 + 磁吸键盘写 MD 同时看 AI 时，触控板滚动体验坏。
- 画布工作流（kmind / 对话图 + AI）触控板可用。
- 手指触屏写 MD + AI 可用（权宜）。
