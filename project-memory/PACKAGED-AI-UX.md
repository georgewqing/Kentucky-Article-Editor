# 打包 / 真机：AI 设置、流式、MD 复制

> **现行契约**（Win **0.3.2**）。changelog **§162 / §164 / §165** 是历史，不要当「现在怎么写代码」。  
> 安卓从零移植 **必须遵守**（交接 [`../android-port-brief/`](../android-port-brief/README.md)）。禁止回退到本节「禁止」列。  
> 不 bump `toolApi`（这些不是工具协议）。

两端源码独立：Win `src/main/ai` + renderer；新安卓工程自建 `ai-runtime` + WebView。行为对齐，禁止 `import` Win 树。不要假设旧 Capacitor 工程里已经有一份实现。

---

## 0. 扫描（先对现象，再改代码）

| 用户看到 | 不是 | 实际原因 | 节 |
|----------|------|----------|----|
| 设置里改 Base URL / 模型，字立刻弹回 `api.openai.com` / `gpt-4o-mini` | 磁盘坏了；DeepSeek 校验失败 | 每个按键 `upsertProfile` 再 `refreshProfiles`，受控 input 被旧值盖掉 | §1 |
| 点发送后代理人一直转圈，永远没有气泡/错误 | 模型名写错（错模型是 HTTP 4xx） | `fetch` 对默认 OpenAI 在国内常永不返回；或 `ai:send` 只回 `{ok:false}` 不发 `ai:error`/`ai:done` | §2 |
| 气泡空、红字 **`This operation was aborted`**、可点重试 | 用户填错 DeepSeek URL/模型（见 §5） | 连接 45s 定时器在 SSE 进行中仍活着，45s 到点 `abort()` 掐流（0.3.1 回归，0.3.2 已修） | §3 |
| 排版视图复制链接/任务项，贴到记事本变成 `[文字](url)` / `- [ ]` | 用户复制了源码模式 | TipTap `transformCopiedText: true` 把剪贴板改成 Markdown | §4 |

Win 目录包测（0.3.0→0.3.2）三件叠在一起：设置改不了 → 一直打默认 OpenAI → 转圈；修超时后又误杀长流 → abort。Android 真机网络更慢、WebView `fetch` 同样可 abort，**更容易复现 §2/§3**。

---

## 1. 设置栏被默认值顶掉

### 现象

设置 → AI：显示名称 / Base URL / 模型 / 上下文窗口，全选删除或改字，松手或下一键就被默认值顶回。密钥栏（点「保存密钥」才写）通常正常。

### 原因

1. 输入框 `value={profile.baseUrl}` 受控。
2. `onChange` 里立刻 `upsertProfile({ id, baseUrl: e.target.value })`。
3. `upsertProfile` 落盘后 `refreshProfiles()`，store 换成磁盘上的上一份（或键入空串时 `Number('') \|\| 128000` 把上下文打回 128000）。
4. 重渲染用旧 `baseUrl` 写回 input。用户永远改不掉默认 `https://api.openai.com/v1` + `gpt-4o-mini`。

新建档案可以继续用这组默认当**初始值**；禁止在编辑过程中用默认值覆盖正在打的字。

### 契约

- 四个栏位用 **本地 draft**（`draftLabel` / `draftBaseUrl` / `draftModel` / `draftContext`）。
- `useEffect` **只在 `editing?.id` 变化**时把档案灌进 draft。禁止依赖 `editing.baseUrl` 整对象，否则保存后也会把光标里的字打回去。
- **失焦（`onBlur`）才 `upsertProfile`**。值没变则不写盘。
- **思考强度**（High / Mid / Low）是分段控件，点选立刻 `upsertProfile`。不是文本栏，不要给它做 draft，也不适用「禁止每个按键写盘」。
- 上下文：`Number` 有限则钳到 `4096…2_000_000`；`Number('')` 不是合法窗口，回退到当前档案值。**禁止** `Number(x) \|\| 128000`。
- 空 Base URL 允许暂存（下一轮发送应立刻报「Base URL is empty」，不要再挂死）。
- 点「+ 新建」仍可种子默认 OpenAI URL/模型；那是新档案初始值，不是编辑时的回弹。

### 文件

| Win | Android |
|-----|---------|
| `src/renderer/src/workbench/SettingsPage.tsx` | 安卓 `src/workbench/SettingsPage.tsx`（**永远不能被 Win 整文件覆盖**，人工合并） |
| `src/main/ai/aiProfiles.ts` `upsertProfile` | 安卓 `src/ai-runtime/aiProfiles.ts` |

### 禁止

- 每个 `onChange` 调 `upsertProfile` / `saveSettings` / `refreshProfiles`。
- 用 `|| DEFAULT` 把空字符串变成 OpenAI 默认（`??` 才跳过 `undefined`；`''` 必须能保存）。
- 因「Android 输入法组字」把 draft 效果去掉再改回受控直写。

### 验收

改 Base URL 为 `https://api.deepseek.com/v1`、模型 `deepseek-v4-flash`、上下文 `1000000`，点栏外失焦，切走设置再回来，值还在。密钥「已保存」后发送不再打 OpenAI。

Android 额外：软键盘「完成」、点抽屉空白、切 ActivityBar，都应能失焦保存；不要只靠桌面 Tab。

---

## 2. Agent 一直转圈（没有错误、也不结束）

可叠加，打包版常三件同时发生。

### 2.1 `fetch` 永不返回

无 `AbortSignal` 超时的 `fetch`，打不通的主机（国内默认 `https://api.openai.com/v1`）可以**永远 pending**。渲染层 `streaming: true`，转圈到关进程。

**契约：** `openaiCompatClient.streamChatCompletion` 用**单独的** `AbortController` 做 **连接超时 45s**（只等到响应头，见 §3）。超时文案：

`Timed out connecting to the API (45s). Check Base URL, model, and network.`

同时发 `error` + `done`（`finishReason: 'error'`）。用户点停止走 `opts.signal`，不要和连接超时抢同一个「是否用户取消」判断。

空 Base URL：不要 `fetch`，立刻 error+done。

### 2.2 发送被拒但 UI 不知道

Win `ai:send` 若只 `return { ok: false }`（窗口没了、会话不存在、工作区不一致），**不**发 `ai:error` / `ai:done`，渲染层已经 `streaming: true`，结果同样转圈。

**契约：**

- 拒绝发送时：**先** `sender.send('ai:error')` 和 `'ai:done'`，再 `return { ok: false }`。
- 渲染层 `aiSend`：`try/catch`；`!res?.ok` 则清 `streaming`，错误用 `i18n.t('ai.sendFailed')`。
- 会话 `workspacePath == null` 且窗口已打开文件夹：允许本轮绑定（`runAgentTurn` 已 stamp `session.workspacePath = winRoot`）。禁止 `sameWorkspace(null, path) === false` 直接拒发。
- 会话确实属于**另一个**工作区：error「Start a new chat」+ done。
- `runAgentTurn` 里会话缺失 / 上下文将满：同样 error+done，不要只 error。

Android 无 IPC：`bridge.ts` `aiSend` 目前直接 `runAgentTurn` 并 `return { ok: true }`。仍须：

- `agentLoop` 开头会话不存在 → `emit('ai:error')` + `emit('ai:done')`。
- `aiStore.send` 同样处理 throw / `!ok`（与 Win 一致），防止以后 bridge 开始返回 `{ok:false}`。

### 2.3 文件

| Win | Android |
|-----|---------|
| `src/main/ai/openaiCompatClient.ts` | 安卓 `src/ai-runtime/openaiCompatClient.ts` |
| `src/main/ai/registerAiIpc.ts` `ai:send` | 安卓 `src/ai-runtime/bridge.ts` `aiSend` |
| `src/main/ai/agentLoop.ts` | 安卓 `src/ai-runtime/agentLoop.ts` |
| `src/renderer/src/state/aiStore.ts` | 安卓 `src/state/aiStore.ts` |
| i18n `ai.sendFailed` | 同 key |

### 验收

- 故意填一个不可达 Base URL，发送后 **约 45s 内**停转并出现超时/错误，不是无限转圈。
- 无工作区时发 Agent（若产品允许）或先开文件夹再发：不要静默 `{ok:false}`。
- Android 真机用蜂窝/错误 Wi‑Fi 复测；WebView 比 Electron 更容易挂死。

---

## 3. `This operation was aborted`（空气泡）

### 现象

设置已正确（DeepSeek 已保存、上下文用量在涨），发送后转一阵，代理人气泡 `(empty)`，红框 **This operation was aborted** + 重试。常见于 **带工具、超过约 45 秒**的一轮（兼容性查询、多步 `web_search` / `read_file`）。

### 原因（0.3.1 回归）

连接超时用 `setTimeout(..., 45000)` + `ac.abort()`，`fetch(..., { signal: ac.signal })`。

错误写法：只在函数 **`finally`（整段 SSE 读完）** 里 `clearTimeout`。响应头已到、body 还在流，45s 一到仍 `ac.abort()`。Chromium/WebView 的 `AbortError.message` 就是 **`This operation was aborted`**。此时 `opts.signal`（用户停止）并未 abort，于是当普通 error 推到 UI。

这 **不是** 用户把 DeepSeek 填错。填错是 HTTP 401/404/400，见 §5。

### 契约

```text
timer = setTimeout(() => { connectTimedOut = true; ac.abort() }, 45_000)
res = await fetch(...)          // 只这一段受 45s 约束
clearTimeout(timer)             // 响应头已到：立刻清。禁止拖到 finally
然后才读 res.body SSE           // 可数分钟；只跟用户 AbortSignal
finally: clearTimeout(timer)    // 仅兜底；不能当唯一清理点
```

- 用户停止：`opts.signal` abort → 转发到 `ac` → `done` `finishReason: 'abort'`，**不要**把 `AbortError` 文案当 `ai:error`。
- 连接阶段超时：`connectTimedOut` → 英文超时句 + `done` error。
- `fetch` 成功后 **禁止**再让该 timer 调用 `ac.abort()`。

### 禁止

- 用同一个 45s timer 限制「整轮 Agent」（工具循环会远超 45s）。
- 只在 `finally` 清 timer（0.3.1 的写法）。
- 看见 abort 就改用户的 Base URL/模型（先看是不是本回归）。
- 为「防 abort」去掉连接超时（国内打不通 OpenAI 会回到 §2 无限转圈）。

### 文件

同 §2 的 `openaiCompatClient.ts`（两端）。Win 主进程改动须**完整退出 exe**；Android 须重新加载 Web 包（`cap:sync` + 重装或清 WebView 缓存），热重载不够。

### 验收

DeepSeek 配置见 §5，Agent 模式发一条会跑工具、明显超过 45s 的任务。应持续「思考中 / 正在调用工具」，最后出正文；不得在 ~45s 空气泡 abort。点停止仍应马上停。

---

## 4. 排版 Markdown 复制带中括号

### 现象

`.md` **写作/排版视图**（TipTap WYSIWYG）复制，贴到记事本/微信变成 `[文字](链接)`、任务列表 `- [ ]`。源码模式复制本来就是 Markdown，那是对的。

### 原因

`tiptap-markdown`：`transformCopiedText: true` 把剪贴板序列化成 Markdown。

### 契约

```ts
Markdown.configure({
  transformPastedText: true,   // 粘贴 md 源仍排版
  transformCopiedText: false   // 复制给人话 / 系统 HTML+纯文本
})
```

### 文件

| Win | Android |
|-----|---------|
| `src/renderer/src/editors/MarkdownArticleEditor.tsx` | 安卓 `src/editors/MarkdownArticleEditor.tsx` |

其它 TipTap（若以后有预览-only 实例）同样禁止打开 `transformCopiedText`。`markdownToPrintHtml` 导出管线与剪贴板无关，不要跟着改。

### 验收

排版视图里复制带链接的一句和一项任务列表，贴到记事本：应是可见文字，不是 `[]`/`()`。再从外部粘贴一段 md 进排版视图：仍应变成标题/列表。

Android：系统分享/剪贴板与桌面相同扩展配置；真机用 Gboard 粘贴到备忘录复测。

---

## 5. DeepSeek 填写对照（排除「我是不是填错了」）

Kentucky 走 OpenAI 兼容 `POST {baseUrl}/chat/completions`。官方文档（2026）：

| 栏位 | 正确例子 | 说明 |
|------|----------|------|
| Base URL | `https://api.deepseek.com/v1` 或 `https://api.deepseek.com` | 两端都行；客户端会去尾 `/` 再拼 `/chat/completions` |
| 模型 | `deepseek-v4-flash` 或 `deepseek-v4-pro` | 不要填展示名「DeepSeek V4 Flash」；不要填仓库路径 |
| 上下文 | `1000000`（V4 为 1M） | 只影响本机进度条/截断，不是 abort 原因 |
| 密钥 | 平台 sk-…，点「保存密钥」 | 未保存则「API key is not set」 |

**不要改成** Anthropic 基址 `https://api.deepseek.com/anthropic`（本客户端不是 Anthropic 协议）。

| 真正的接口错误 | 用户会看到 |
|----------------|------------|
| 密钥错/没保存 | HTTP 401 或「API key is not set」 |
| 模型 ID 不存在 | HTTP 4xx，body 里 invalid model |
| 主机不可达 | §2 超时句（45s），不是 abort |
| 长轮被掐 | §3 `This operation was aborted` |

0.3.2 打包实测：上述 DeepSeek 四项正确时，abort 仍出现 → 按 §3 修客户端，不要改用户设置。

---

## 6. 文件对照（移植时打开这一对）

| 行为 | Win | Android | 覆盖策略 |
|------|-----|---------|----------|
| 设置 draft | `workbench/SettingsPage.tsx` | 同路径 | Android **禁止整文件覆盖**；合并 draft/blur |
| 档案 upsert | `main/ai/aiProfiles.ts` | `ai-runtime/aiProfiles.ts` | 对照；空串不要变默认 |
| 连接超时 + SSE | `main/ai/openaiCompatClient.ts` | `ai-runtime/openaiCompatClient.ts` | 可对照同步；**禁止**只 finally 清 timer |
| 发送门 | `main/ai/registerAiIpc.ts` | `ai-runtime/bridge.ts` | 重写形态；error+done / 绑 workspace 语义对齐 |
| 回合 | `main/ai/agentLoop.ts` | `ai-runtime/agentLoop.ts` | 早退必须 error+done |
| 转圈 | `renderer/.../state/aiStore.ts` | `state/aiStore.ts` | `!ok` / throw 清 `streaming` |
| 复制 | `editors/MarkdownArticleEditor.tsx` | 同路径 | `transformCopiedText: false` |
| 文案 | `i18n/locales/*/ai.sendFailed` | 同 key | 同步 |

`toolApi` / `proposalGate` **与本节无关**，勿借机 bump。

---

## 7. 禁止回退（PR / 对照移植自检）

改到上表任一文件时勾：

- [ ] Settings：draft + 仅 `editing?.id` 灌值 + blur 保存；无按键 upsert
- [ ] 无 `Number('') \|\| 128000`
- [ ] `fetch` 返回后立刻 `clearTimeout(connectTimer)`
- [ ] 45s 只用于连不上；不杀 SSE
- [ ] 用户停止 ≠ `ai:error` 里的 `This operation was aborted`
- [ ] 发送失败有 `ai:error` 和 `ai:done`（或 Android emit 等价）
- [ ] 无 workspace 会话可绑到当前打开的文件夹
- [ ] `aiStore` 在 `!ok`/throw 清转圈
- [ ] TipTap `transformCopiedText: false` 且 `transformPastedText: true`
- [ ] 没有为「修 abort」删掉连接超时

---

## 8. 两端最短验收

1. **设置**：改 DeepSeek URL/模型/1M → 失焦 → 重进设置还在。
2. **错主机**：不可达 URL → ≤45s 出错，停转圈。
3. **长 Agent**：正确 DeepSeek + 工具任务 >45s → 跑完，无 abort 空气泡。
4. **复制**：排版视图复制链接，记事本无人话括号语法。
5. **停止**：生成中点停止，立刻 idle，不要红框 abort（可选）。

Win：测 **目录包 exe**（0.3.2+）。Ctrl+R 不够覆盖 `openaiCompatClient`（main）。  
Android：测 **真机 APK**（`cap:sync` + Run 重装）。浏览器预览 ≠ 完成。

---

## 9. Android 额外（桌面没有的坑）

1. **WebView `fetch`**：移动网/代理下 pending 和 abort 都比桌面常见。§2 超时 + §3 清 timer 缺一不可。
2. **没有 `registerAiIpc`**：语义做在 `bridge.ts` + `agentLoop` emit。以后若让 `aiSend` 返回 `{ok:false}`，必须同时 emit error/done，且 `aiStore` 已处理 `!ok`。
3. **`SettingsPage.tsx` 在「永远不能被 Win 覆盖」名单**。从 Win 抄设置 UI 时只合并 AI 档案那一块，保留 `uiScale` / 触控 / 无工作区 toast。
4. **IME**：Android 组字过程会频繁 `onChange`。更不能按键写盘。失焦可能发生在点「保存密钥」、切抽屉、Back；draft 在这些路径都要能提交或至少不丢（blur 会提交）。
5. **进程被杀**：转圈时切走 App，WebView 可能直接撕掉 `fetch`（也会 AbortError）。那是系统回收，不是 §3 回归；不要因此去掉超时。
6. **缓存**：改 `ai-runtime` 后必须新 Web 包进 APK。用户继续跑旧 WebView 会以为「安卓也 abort」。
7. **密钥**：Preferences，不要抄 Electron `ai-key.bin`。§1 只谈 URL/模型栏位回弹，不要改密钥存储。

改安卓上述文件前先读本节。安卓工程有本契约的副本 `project-memory/PACKAGED-AI-UX.md`。
