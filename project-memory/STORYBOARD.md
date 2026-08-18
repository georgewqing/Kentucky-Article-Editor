# 分镜头稿本 + 简化 PR — 完整记录（Win 0.3.0）

> **状态**：已定稿落地 · `package.json` **0.3.0**（polish **§97–§119**；改序/persist **§150–§155**；**§121** 路径/导出上限）  
> **时间线**：[`changelog.md`](./changelog.md) **§96–§119**、**§121**、**§149–§155**（§116 为工作台右键贴边，非分镜专属）  
> **产品表**：[`product-decisions.md`](./product-decisions.md) · **踩坑**：[`gotchas.md`](./gotchas.md)  
> **架构索引**：[`architecture.md`](./architecture.md)  
> **Android：** 独立工程维护分镜实现（勿 import 本仓库）。进度见该工程 `project-memory/BOARD.md` A3。

本文是 Kentucky Win **分镜头稿本（sheet）+ 简化 Premiere 式时间线（PR）** 的单一完整说明：产品决定、schema、IPC、UI/UX、导出、**ffmpeg 捆绑**、工作区 **PNG / MP4 预览**、验收、源码索引。后续对话改本功能 **先读本文**。

---

## 1. 产品决定（摘要）

| 项 | 决定 |
|----|------|
| 画幅 | 每格 **1920×1080**；`列×行` 拼成大图 **外绘**，再按 layout 切片 |
| 纸面 | **格外** gutter + 标题条；内容区满格；浅灰底 + 安全框（仅空白稿）；格外编号；**生成空白**时可自定义工作区内文件夹 + 文件名 |
| 排版 | 总数 + 横/竖优先 → 自动推 `列×行`，可手改 |
| 绘制 | **仅外部**；Kentucky **不内绘**；工作区 `.png` 可打开只读预览（画布式滚轮缩放 / 拖拽平移）；导出的 `.mp4` 可点开原生播放预览 |
| 工程 | **单序列**；`*.kyboard` + 同级 `*.kyboard.assets/`；**多稿本** = 同一工程内多个 `sheets[]`（非多序列） |
| 导入 | 尺寸不符 **默认拒绝**；可选「强制缩放」二次确认；**导入只切片，不自动上 V1** |
| 时间线 | **无**一键铺轨；右侧分镜缩略图 **拖到 V1** 才加入；同一格可复用；左侧工具栏刀片分割 |
| 镜头 | 每 clip **from→to**；可选 `camera.keys`（**只存手动帧**，最多 6，不注入 t=0/t=1）。**Blender 式**：播放头时刻 + 拖监视器自动打帧 / **I** 打帧 / **Alt+I** 删播放头处任意手动帧 |
| 音频 | **A1–A4**（每轨一条 MP3）；裁剪 in/out、时间线起点、淡入淡出、音量；旧字段 `audioClip` 与 `audioClips[0]` 同步 |
| 视频导出 | **24fps** · H.264 · 1920×1080 · yuv420 · MP4；多轨 **amix**；导出页可自定义**文件夹路径**与**文件名**（另存为走系统对话框） |
| ffmpeg | 发版/开发均用 `npm run ensure-ffmpeg` 落到 `resources/ffmpeg/ffmpeg.exe`（gitignore）；`dist*` 经 `extraResources` 打进安装包。**禁止** `ffmpeg-static`。缺则错误码 `FFMPEG_NOT_FOUND` → i18n Toast |
| 工作区预览 | `.png` 画布式只读；`.mp4` 原生 `<video>` 只读（导出验收）。均 `kentucky-file://`，**不**经 DocumentHub |
| 停留 | 工程 `defaults.panelDurationSec` 可配，**出厂 2s** |
| 监视器 | 播放/暂停、**自定义 scrub 条**、时间码；拖拽/滚轮在**播放头**写入关键帧 |
| AI | **不参与**；无 Agent 工具 |
| 平台 | **Win 已发版**；Android **要移植**（BOARD A3；IO/ffmpeg 重写） |
| 发版标准 | Win 上 **稿纸 + 时间线 + MP4** 齐备才称 0.3.0 |

### 明确不做

多序列、内绘、关键帧缓动曲线、转场/调色/字幕、Agent 工具、独立「PR 深蓝皮肤」、jpg/webp/webm/mov 预览、工作区内嵌播放器皮肤、把 MP4 当文本、`ffmpeg-static` 依赖、一键铺轨 / 稿本分类自动上轨。  
（Android 要移植本功能，但是独立实现，不是 Win 安装包同发。）  
（用户已明确要求：**多音轨**与**监视器手势打点**，见 changelog **§113**；不再视为禁区。）

### Grill 共识（Q1–Q16）

上表已锁定；勿默认推翻。若要改须用户明确同意。

---

## 2. 工程文件与目录

```
storyboard.kyboard                 ← JSON 工程（schema v1）
storyboard.kyboard.assets/         ← 同级资源目录
  blank_3x2.png                    ← 空白/导入拼图
  import_….png
  blank_3x2_01.png                 ← 切片格（稿本文件名_格号）
  bgm_….mp3
  export_….mp4                     ← 若用户选区外路径，先写此处再 copy
```

- 新建：`appStore.createStoryboard` → 空 doc（默认 6 格 → suggest `3×2`）+ `mkdir` assets。
- 资源树：显示名隐藏 `.kyboard` 后缀；图标 **SB**（`tree-icon-storyboard`）。
- assets 目录规则对齐 `.kmind` sibling assets 惯例（树中可见；写入走工作区沙箱）。

**拼图像素公式**（含 gutter + label band）：

```
width  = cols * 1920 + (cols + 1) * gutterPx
height = rows * (labelBandPx + 1080) + (rows + 1) * gutterPx
```

出厂：`gutterPx=24`，`labelBandPx=48`。  
例：6 格 `3×2` → **5856×2328**（已冒烟）。

内容区矩形：`panelContentRect(layout, col, row)` — 切片只取内容区，不含标题条。

---

## 3. Schema v1（只增不改）

真源：`src/shared/kyboardSchema.ts`（主进程 re-export：`main/storyboard/kyboardSchema.ts`）。

常量：`MAX_AUDIO_TRACKS = 4`，`MAX_CAMERA_KEYS = 6`。

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `1` | 固定；不支持旧版 |
| `layout` | `KyboardLayout` | cols/rows/panelW/H/gutter/labelBand |
| `defaults.panelDurationSec` | number | 拖上 V1 时的默认片段时长 |
| `sheets[]` | sheet | 拼图引用 |
| `panels[]` | panel | 1920×1080 切片引用 |
| `timeline.videoClips[]` | VideoClip | V1 |
| `timeline.audioClips[]` | AudioClip[] | A1–A4（每轨一条；**增量**） |
| `timeline.audioClip` | AudioClip \| null | **兼容**：始终 = `audioClips[0]` |

### CameraKeyframe / CameraKey

`{ x, y, scale }` — 像素平移 + 缩放；默认 `scale=1`，`x=y=0`。  
`CameraKey` = 同上 + `t`（0..1，沿 clip）。

**插值契约（后续 Agent 必读，changelog §113–§115）**

| API | 用途 | 禁止 |
|-----|------|------|
| `storedCameraKeys(clip)` | 磁盘上的手动帧（经 `pruneIdentityBookends`）；**轨道菱形 / 检视器芯片 / 删帧**只用这个 | 不要用它来「补」头尾静止点 |
| `cameraKeysOf(clip)` | 播放辅助：有 stored → 原样；无 stored → 合成 from@0 + to@1 | **不要**拿去画菱形（会画出默认头尾） |
| `cameraAtClip(clip, localT)` | 监视器 + **MP4 每帧**；有 stored 则 `interpolateCameraKeys`（区间外 hold，单帧=整段钉住）；无 stored 才 `from→to` lerp | 导出禁止手写 from→to |
| `upsertCameraKeyMut` | 拖监视器 / 滚轮 / **I**：在播放头 `t` 插入或覆盖；满 6 返回 `false` | 满了不要默默丢掉别的帧 |
| `removeCameraKeyMut` | **Alt+I**：删播放头附近（eps≈0.02）的**任意**手动帧，含头尾 | 不要保留「入出点不能删」 |
| `nudgeNearestCameraKeyMut` | 遗留：改**最近**一帧的姿态 | **监视器拖拽禁止走这条**（播放头不在那一帧时画面会跳） |
| `writeCameraKeys` | 内部；空数组 → `keys = undefined`；**不**注入 t=0/t=1；有 keys 时同步 `from`/`to` 为首尾姿态 | 不要再写「始终保证两端 identity」 |

`pruneIdentityBookends`：旧工程曾自动写入 identity@0 与 identity@1。若两端是静止且中间有真实帧，读取时丢掉两端；若整段只有这两个静止点，整段清空（改走 from→to）。**不要**再注入它们，否则中间打的帧会「乱跑」（rest → pose → rest）。

刀片 `splitVideoClipAt`：只重映射 **stored** keys，切开处**不**注入默认帧。

### VideoClip

`id`, `panelId`, `start`, `duration`, `camera: { from, to, keys? }`

### AudioClip

`id`, `audioRel`, `start`, `inSec`, `outSec`, `mediaDurationSec?`, `volume`, `fadeInSec`, `fadeOutSec`, `track?`（0-based，缺省 0）

- `mediaDurationSec`：探测到的文件总长，作出点修剪上限；旧工程可缺省（回退为当前 `outSec`）。
- **禁止**把「`outSec` 远长于节目」当成虚长占位去反复探测——正常 BGM 会长于画面。
- 旧工程仅有 `audioClip`：`parseKyboard` 迁入 `audioClips`。

### 辅助函数

| 函数 | 用途 |
|------|------|
| `suggestLayout(count, prefer)` | 横/竖优先推列×行 |
| `sheetPixelSize` / `panelContentRect` | 拼图像素与切片矩形 |
| `assetsDirForKyboard` | `foo.kyboard` → `foo.kyboard.assets` |
| `parseKyboard` / `serializeKyboard` | 读写；缺字段填默认；serialize 同步 `audioClip` |
| `interpolateCamera` / `cameraAtClip` / `cameraKeysOf` / `storedCameraKeys` | 见上表：菱形用 stored；播放/导出用 `cameraAtClip` |
| `upsertCameraKeyMut` / `cameraKeyAt` / `removeCameraKeyMut` | 播放头打帧 / 当前时刻是否有手动帧 / 删帧 |
| `listAudioClips` / `ensureAudioClipsMut` / `firstEmptyAudioTrack` / `audioOnTrack` / `syncLegacyAudioClip` | 多轨读写 + 旧字段迁移；每轨一条 |
| `videoTimelineDurationSec` | **仅 V1** 节目时长（播放钟 / scrub） |
| `timelineDurationSec` | V + **全部**音轨最大结束时间 |
| `timelineLaneSec` | 时间线画布宽度（含尾部留白） |
| `packVideoClipsMut` / `trimVideoClipInMut` / `trimVideoClipOutMut` / `reorderVideoClipMut` | V1 涟漪 / 单边修剪 / **拖块改序** |
| `trimAudioClipInMut` / `trimAudioClipOutMut` / `audioMediaDurationSec` | 音轨边缘修剪 |
| `splitVideoClipAt` / `removeVideoClipMut` / `removeAudioClipMut` / `snapTimeToCuts` / `insertVideoClipAtMut` | 刀片 / 涟漪删 / 删音轨 / 吸附 / **从素材库拖入 V1** |

---

## 4. 主进程 / IPC

目录：`src/main/storyboard/`

| 文件 | 职责 |
|------|------|
| `pngUtil.ts` | RGBA 缓冲、fill/stroke、文字标签、pngjs 编解码、最近邻缩放、裁切 |
| `storyboardService.ts` | 空白稿、导入复制、切片、MP4 帧渲染 + ffmpeg |
| `registerStoryboardIpc.ts` | IPC + 系统对话框 |
| `kyboardSchema.ts` | re-export shared |

### IPC 通道

| Channel | 作用 |
|---------|------|
| `storyboard:generateBlank` | 写空白拼图 PNG；可选 `fileName` + `targetDirAbs`（**须在工作区内**；默认 `*.kyboard.assets`） |
| `storyboard:importSheet` | 复制源 PNG → assets（源须在**工作区内或本会话 read allowlist**，§121） |
| `storyboard:sliceSheet` | 按 layout 切 1080 格；`forceScale?`；`nameStem` → `{稿本文件名}_01.png` |
| `storyboard:sheetSize` | 返回期望宽高 |
| `storyboard:exportMp4` | 渲染帧序列 + ffmpeg；进度事件 |
| `storyboard:exportProgress` | `{ pct }` → renderer |
| `dialog:openPng` / `openMp3` / `saveMp4` / `savePng` | 系统对话框（save* 接受完整 `defaultPath`） |

注册：`main/index.ts` → `registerStoryboardIpc()`；`.kyboard`、**`.png`**、**`.mp4`** 均在资源树 `TEXT_EXTS`（后两者供预览可见，非文本编辑）。

### 路径沙箱

- 复用 `main/ai/workspacePath.ts`（`resolveWorkspacePath` / `toWorkspaceRel`）+ **`ipcSandbox.requireSenderWorkspace`**（§121：IPC 的 `workspaceRoot` 必须等于窗口工作区）。
- **写入**（assets、导出临时目录、区外导出回退路径）必须在工作区内。
- **例外（收紧后）**：`importSheet` / 用户选的 PNG·MP3 **源文件**仅当路径在本会话 **read allowlist**（`dialog:openPng` / `openMp3`）或已在工作区内。禁止渲染层伪造 `sourceAbs` 拷密钥进工程。
- MP4/PNG **另存**目标：`dialog:save*` → **write allowlist**；copyFile 才允许写到桌面等处。
- MP4 保存：若对话框选区外，先写 `*.kyboard.assets/export_*.mp4`，再 `copyFile` 到目标（Toast 提示）。
- `kentucky-file` 预览：路径必须在打开的工作区或 read allowlist（§121）。恶意 `.kyboard` 的 `imageRel: ../..` 会被主进程拒绝。
- 渲染层 `joinPath` 消化 `..`，**不能**代替主进程沙箱。
- 工作区点开该 MP4：见 §5「工作区 MP4 预览」（须 Range 协议）。

### 导出 / 解码上限（§121）

| 项 | 上限 |
|----|------|
| MP4 时间线 | `MAX_EXPORT_DURATION_SEC = 15 * 60`；超限 `EXPORT_TOO_LONG` → `storyboard.exportTooLong` |
| PNG | 边长 ≤ 16384；总像素 ≤ 80_000_000（先读 IHDR） |
| 稿纸 layout | `clampLayout`：cols/rows ≤ 8；panel 锁 1920×1080；gutter/labelBand ≤ 200 |
| ffmpeg 滤镜 | volume / fade / delay 数值夹紧，禁止把 JSON 字符串拼进 `filter_complex` |

### 空白稿像素

- 背景深灰；标题条更深；内容区浅灰 `#E4E4E8`。
- 安全框约 10% / 5% 边距描边；编号 `#n` 在标题条。
- **不依赖 sharp**（实现用 **pngjs**；计划中的 sharp 等价已用纯 JS）。

### ffmpeg 解析与捆绑（changelog §118）

导出页曾 Toast 英文 `ffmpeg not found…`：本机 PATH 常无 ffmpeg；从 Cursor 拉起的 Electron **不继承**用户后来改的 PATH。曾试 `ffmpeg-static`，npm postinstall 拉 GitHub 二进制 **ETIMEDOUT**（`20.205.243.166:443`）——**禁止加回 dependencies**。

**`resolveFfmpeg()`**（`storyboardService.ts`）候选顺序，每个存在的路径用 `-version` **探活**（不是只 `existsSync`）：

1. 环境变量 `KENTUCKY_FFMPEG`（可指向任意可执行文件）
2. 打包：`join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')`（electron-builder `extraResources`：`resources/ffmpeg/ffmpeg.exe` → `ffmpeg/ffmpeg.exe`）
3. 开发：`join(__dirname, '../../resources/ffmpeg/ffmpeg.exe')`（main bundle 在 `out/main`）
4. 常见 Win 路径：`Program Files/ffmpeg/bin`、`C:\ffmpeg\bin`、scoop、WinGet Links、`ProgramFiles(x86)`
5. PATH 上的 `ffmpeg`

找不到：主进程返回 `{ ok: false, error: 'FFMPEG_NOT_FOUND' }`（**勿**塞英文长句）；渲染层 Toast `storyboard.ffmpegNotFound`。

**`npm run ensure-ffmpeg`**（`win/scripts/ensure-ffmpeg.js`）：

- 已有可运行 ffmpeg → **复制**到 `resources/ffmpeg/ffmpeg.exe`
- 否则 `winget install -e --id Gyan.FFmpeg.Essentials` 再复制
- `ffmpeg.exe` **gitignore**（`resources/ffmpeg/*.exe`）；仓内只留 `resources/ffmpeg/README.txt`
- `package.json` 的 `dist` / `dist:dir` / `dist:portable` **先**跑此脚本再 build

开发机跑过 ensure-ffmpeg 后若 Electron 已在跑，须**完整退出再开**才会用到新复制的二进制（与协议热重载同样限制）。

### MP4 导出管线

1. 解析 ffmpeg：见上一小节（`KENTUCKY_FFMPEG` → 打包 extraResources → 开发 `resources/ffmpeg` → 常见 Win 路径 → PATH）。
2. 临时帧：`workspace/.kentucky/storyboard-export/<ts>/f_######.png`（结束后 `rmSync`）。
3. 每帧：按 playhead 找 clip → `cameraAtClip` → `blitCamera`（CPU 最近邻）。**禁止**手写 from→to lerp。
4. ffmpeg：`-framerate 24` 图序列 → `libx264` `-pix_fmt yuv420p`。
   - 音频：`listAudioClips`；每个 clip 作为独立 input：`-ss inSec -t (out-in)` + `volume` / `afade` in+out / `adelay`（按 `start` 毫秒，左右声道同值）。
   - 单轨：`[a0]anull[a]`；多轨：`amix=inputs=N:duration=longest:dropout_transition=0[a]`。
   - `-map 0:v -map [a] -shortest` + `-c:a aac`。无音轨则不加 `-filter_complex`。
5. 无 ffmpeg → `FFMPEG_NOT_FOUND` → i18n Toast（勿 silently fail；勿主进程塞英文长句）。

**依赖说明**：`pngjs` 已入 `package.json`。ffmpeg **不走** `ffmpeg-static`。本机/发版用 `ensure-ffmpeg`；仍可用 PATH / `KENTUCKY_FFMPEG`。

---

## 5. 渲染层 / UI

### 挂载点

| 位置 | 作用 |
|------|------|
| `appStore` | `EditorKind 'storyboard' \| 'image' \| 'video' \| 'pdf'`；`detectKind`；`isMediaPreviewKind`（含 pdf）；`createStoryboard`；PNG/MP4/PDF 打开跳过 DocumentHub |
| `EditorArea` / `FloatWorkbench` | 路由 `StoryboardEditor` / `ImagePreviewEditor` / `VideoPreviewEditor` |
| `Sidebar` / `FileTree` | 新建分镜头 + 右键；PNG / **MP4** 图标 |
| `explorerNames.ts` | `CREATE_STORYBOARD_EXT`；STRIP `.kyboard` / `.png` / `.mp4` |
| `StoryboardEditor.tsx` | 三模式 UI；`TransportScrubber`；空白/导出路径表单；工具栏保存 |
| `storyboardDocFlush.ts` | 活动 kyboard 的 live JSON，供 Save / 重新挂载，避免打开时缓冲盖盘 |
| `ImagePreviewEditor.tsx` | 工作区 PNG 画布式预览 |
| `VideoPreviewEditor.tsx` | 工作区 MP4 只读预览 |
| `platform` / `preload` | `kentucky.storyboard*` + 对话框 |
| `global.css` | `.storyboard-*` / `.image-preview-*` / `.video-preview-*` / `.storyboard-scrub*` |
| `en.json` / `zh-CN.json` | `storyboard.*` / `image.*` / `video.*` / `explorer.newStoryboard`；镜头：`camInsertKey` / `camKeysFull`；音频：`addBgm`；导出：`ffmpegNotFound` |

### 信息架构（顶栏 Seg，同 Settings 节奏）

1. **稿纸** — 格数/横竖优先/推算行列、手工列行、默认时长、**空白生成文件夹 + 文件名**（须工作区内）、生成空白、导入切片（**不上轨**）、分镜缩略图  
2. **时间线** — 左侧选择/刀片；监视器；右侧分镜库可拖到 V1；播放 / **自定义 scrub** / 时间码；检视器（时长、打帧/删帧、A 轨）  
3. **导出** — 导出文件夹 + PNG/MP4 文件名；一键导出或「另存为…」；导出进度；可从此加音轨  

### 空白稿生成（路径 / 命名）

| 项 | 行为 |
|----|------|
| 默认目录 | `*.kyboard.assets`（与工程同级） |
| 默认文件名 | `blank_{cols}x{rows}.png`（改行列时若仍是默认模式名则同步） |
| UI | 文件夹输入 + 浏览；文件名输入；预览完整路径 |
| 约束 | 目录**必须在当前工作区内**（`imageRel` 须可相对化）；越界 Toast `blankDirMustBeInside` |
| IPC | `fileName` + `targetDirAbs`；文件名剥离 `<>:"/\|?*` 等非法字符，缺 `.png` 自动补 |

### 导出页（路径 / 命名）

| 项 | 行为 |
|----|------|
| 默认目录 | 工程文件父目录 |
| 默认名 | `{kyboardStem}-sheet.png` / `{kyboardStem}.mp4` |
| 「导出」 | 直接写到 `文件夹/文件名` |
| 「另存为…」 | 系统对话框（`defaultPath`=建议完整路径）；回写目录与文件名 |
| 区外 MP4 | 先写 assets 再 `copyFile`；Toast 说明 |

### 时间线 NLE 工作台（单 V1 + A1–A4）

布局：运输条 → 监视器|检视器 → 可拖分栏 → 刻度尺 + 播放头 + V1 + A1–A4。

| 项 | 行为 |
|----|------|
| 运输 | 播放/暂停、±1 帧（24fps）、到头/尾、时间码 `HH:MM:SS:FF`、缩放 −/适应/+、**打帧 / 删帧**（同 I / Alt+I） |
| 分栏 | 监视器与时间线高度可拖；`localStorage kentucky.storyboard.timelineSplit`；上区 `minmax(0, fr)`，下区 `minmax(160px, fr)` |
| 刻度尺 / 播放头 | 点击拖拽 seek；吸附剪辑点；播放时自动滚入视口 |
| V1 | 加高轨 + panel 缩略图；**拖块改播放顺序**；**从右侧素材库拖入**；入/出点拖；Delete 涟漪删；左侧刀片/`C` 切开；菱形 = **手动**镜头帧 |
| 多稿本 | 导入可多次切片进 `panels[]`；**不**按稿本号分类上轨；从右侧缩略图逐格拖入 |
| 快捷键 | Space 播放；←/→ 帧步进；Home/End；Delete（选中音轨或视频）；C 刀片；**I** 打帧；**Alt+I** 删帧；Esc 退出刀片。快捷键避开输入框 |
| 节目时长 | `videoTimelineDurationSec`；仅校正经典 BGM `outSec===60`；长 BGM 正常保留 |
| A1–A4 | 每轨一条 MP3；空轨「添加音轨」写入第一条空轨；左右缘手柄修剪；可点选；Delete 删选中音轨 |
| 横向滚动 | **隐藏**滚动条；`wheel`（`passive: false`）映射为 `scrollLeft` |

助手：`splitVideoClipAt` · `removeVideoClipMut` · `snapTimeToCuts` · `trimAudioClip*`（`kyboardSchema.ts`）。

### 多稿本（同一 `.kyboard`）

- `sheets[]` 可含多张空白/导入拼图；`panels[].sheetId` 归属稿本。
- UI：`activeSheetId`（组件状态；进时间线/换稿本时校正到合法 id）。
- **导入并切片** = `importSheet` + `sliceSheet` + `push` sheet/panels，**不**自动写 `videoClips`。
- **上轨**：从监视器右侧缩略图拖到 V1，`insertVideoClipAtMut`（同一 panel 可重复）。
- **一键铺轨 / 稿本分类按钮**：已移除（§151）。

### 三模式页面 UI（§109–§112）

| 模式 | 结构 |
|------|------|
| 稿纸 | 分区卡片：排版 → **空白稿输出** → 导入切片 → 分镜格位卡片 |
| 时间线 | NLE 壳 + 检视器内紧凑稿本栏；监视器 canvas 填充分栏（取消全局 16:9 硬比例） |
| 导出 | 单卡片；路径预览条；主操作（MP4/PNG）与次操作（另存为/加音轨）分组 |

样式真源：

- `styles/storyboard-nle.css` — 时间线壳、轨道、尺、播放头  
- `styles/storyboard-pages.css` — 稿纸/导出分区、链接栏、检视器紧凑态、按压反馈  
- `styles/global.css` — 共享 `.storyboard-*` 输入/按钮兜底  

**布局硬约束（显示不全类 bug）：**

1. 稿纸/导出：`.storyboard-pane` 为纵向滚动容器；子 `.storyboard-section` 必须 `flex: 0 0 auto`，禁止被压扁后 `overflow:hidden` 裁掉「空白稿输出」等中间块。  
2. 时间线检视器：父行 `overflow:hidden` 时检视器须 `height/max-height: 100%` + 自身 `overflow-y: auto`；`max-height: none` 会撑破再被裁。  
3. 检视器窄宽：稿本按钮竖排；链接换行，避免「稿本 N」字被切成半截。

### 时间线 scrub（勿回退原生 range）

Windows Electron 上 `input[type=range]` + `accent-color`：**0% 填充方块溢出圆角**、**100% 拇指到不了轨道末端**。

- 实现：`TransportScrubber`（`StoryboardEditor.tsx` 内）  
- 轨道 `overflow: hidden` + 圆角裁剪填充；拇指 `left: pct%` + `translate(-50%, -50%)`（0%/100% 中心贴齐两端）  
- 指针拖拽 + 键盘方向键 / Home / End  
- 样式：`.storyboard-scrub*`（**禁止**再改回仅靠原生 range 的 accent 填充）

### V1 片段边缘拖拽（时长）

- **右缘（出点）**：按住 **Alt** 拖；只改该段 `duration`，入点不动；`trimVideoClipOutMut` + pack 涟漪后续。
- **左缘（入点，非首段）**：按住 **Alt** 拖；滚动修剪，与上一段对调时长，**本段出点时刻不变**；`trimVideoClipInMut`。
- 不按 Alt 时，左右缘与块身一样是 **改序**（边缘条看起来像可拖动手柄）。
- 轨道用**固定 px/秒**（溢出横向滚动），禁止按总时长百分比缩放——否则拖尾会像整段对称缩放。
- 检视器改时长 = 出点修剪；拖拽中不每帧写盘，松手一次 `writeFile`。
- 键盘：边缘聚焦时 ←/→ 以 0.1s 步进。

### V1 片段拖动改序

- 拖 **块身或左右缘**（不要按 Alt）：**指针手势**（不是 HTML5）。窗口捕获阶段跟踪指针；竖线表示当前插入下标；松手提交该 `lastIndex` 给 `reorderVideoClipMut` + pack，**不留空隙**。不要在松手时对吸附线再做 DOM 命中。
- 素材箱拖入 V1 仍走 HTML5（`application/x-kentucky-panel`）。
- 按住 **Alt** 再拖左右缘才是修剪时长。
- 各段时长与镜头关键帧跟着走；音频轨不动。
- 拖过约 8px 才算改序，避免和单击选中冲突；刀片模式不拖序。Escape 取消。
- 拖到时间线左右边缘时自动横滚。改序成功才写盘，播放头落到该段新入点。
- 改序/从素材箱插入后用 `repackVideoClipStartsMut` 按**数组顺序**重写 start；不要再 `packVideoClipsMut`（按旧 start 排序会还原 splice，表现为闪回）。

### A1–A4 音频

- 常量 `MAX_AUDIO_TRACKS = 4`；每轨 **一条** MP3；`AudioClip.track` 0-based（缺省 0）。
- 空轨点「添加音轨」（i18n `addBgm`）→ `firstEmptyAudioTrack`；文件名 `a{n}_{ts}.mp3` 进 sibling assets。四轨已满则不再提供空槽。
- **右缘**：改 `outSec`（上限 `mediaDurationSec`）。
- **左缘**：同步改 `inSec` 与时间线 `start`（出点时刻不变）。
- 导入时写入 `mediaDurationSec`；旧工程无该字段时用当前 `outSec` 作上限（不把长 BGM 当虚长重探测）。
- 播放：`audioElsRef: Map<clipId, HTMLAudioElement>`，RAF 按各 clip 的 start/in/out 同步；**勿**共用单个 `audioRef`。`audioRel` 变更才换 `src`；`canplay` 后再 `play()`。
- 导出：见 §4 MP4 管线（`anull` / `amix`）。
- `audioClip` 仅兼容旧读者：`parseKyboard` 若 `audioClips` 空则迁入；`serializeKyboard` 经 `structuredClone` + `syncLegacyAudioClip`，始终 `audioClip === audioClips[0]`。
- Delete：有选中音轨则 `removeAudioClipMut`，否则涟漪删视频。

### 持久化

`.kyboard` 打开时走 DocumentHub（与 `.md` 相同）。粗剪改动经 `persistDoc`：**立刻写盘**，同时把序列化 JSON 写入 `tab.content` / `storyboardDocFlush` 缓存。标签黄点直到 **保存**（工具栏按钮或 Ctrl+S / 文件菜单）。

`saveTab` 必须先 `flushStoryboardForSave` 再 `docPatch`/`docSave`。若只 `writeFile` 而不更新标签缓冲，Ctrl+S / 关标签保存 / 退出保存会用**打开时的空时间线**盖掉磁盘，切走再回来就像重置。

切到别的标签时编辑器卸载：若标签仍打开，把当前 `doc` 刷进缓冲和磁盘；关标签（含「不保存」）则不要在卸载时再写盘。重新挂载优先 `peekStoryboardJson`，其次**未保存**的 `tab.content`，最后读盘（不要用打开时的干净缓冲盖掉已经写盘的粗剪）。

拖边缘 / 拖监视器中 `persist: false`，松手再 `persistDoc`。

### 监视器 / 音频

- Canvas 半分辨率预览（`PANEL_W/2 × PANEL_H/2`）；相机插值与导出一致语义（`cameraAtClip`）。
- **节目时长** = `videoTimelineDurationSec`（V1 画面）；scrubber/播放钟走节目时长，不被音频 `outSec` 虚长拉长。
- 音频：导入时探测 MP3 `duration` → `outSec` + `mediaDurationSec`（不再写死 60）。
- 播放：RAF 绘监视器；缓存 `HTMLImageElement`；切镜加载中**保留上一帧**；预取相邻 panel。
- `findVideoClipAt`：越界 hold 末段，避免末端黑帧。
- **镜头手势**（粗稿 Ken Burns，Blender 自动关键帧；§114–§115）：
  - 滚轮缩放、拖拽平移 → **在播放头时刻** `upsertCameraKeyMut`（覆盖同 t，否则插入）。**不是**改最近的另一帧。
  - **I** / 运输条「打帧」：把当前插值姿态钉在播放头。
  - **Alt+I** / 「删帧」：删除播放头处**任意**已存手动帧（含头尾）。无帧则无操作。
  - 最多 `MAX_CAMERA_KEYS=6`；满了 Toast `camKeysFull`，upsert 返回 false。
  - V1 clip 上的菱形 = **仅** `storedCameraKeys`（无默认头尾菱形）；点击跳转。
  - 检视器**没有** from/to 六个数字，也没有「记录入点/出点」四按钮。
  - 旧文件里自动写入的静止 t=0/t=1 入出点由 `pruneIdentityBookends` 剥离。
  - 画布半分辨率（`PANEL_W/2`）；位移 `dCam = -dCanvas * 2 / scale`；监视器 `wheel` 须 `{ passive: false }`。
  - 一帧 = 整段 hold 该姿态；两帧以上才有运动。无手动帧 = 旧 from→to。
- **音频同步**：
  - `kentucky-file` 协议对 `.mp3` **和 `.mp4`** 走同一 `streamLocalMedia`（见下节）；勿整文件 `arrayBuffer`。
  - CSP 须含 `media-src … kentucky-file:`。
  - 等 `canplay` 后再 `play()`；`audioRel` 变更才换 `src`。
  - 播放钟 effect **不要**依赖整份 `doc`（用 `docRef`）；**不要**把 `playhead` 放进加载/play 的高频依赖。
  - 占位校正：**仅** `outSec === 60` 才探测改写；缺 `mediaDurationSec` 时用当前 `outSec` 填，**勿**对长 BGM 再开探测 Audio。
- 协议/CSP/`protocol.handle` 变更须 **完整重启 Electron**（热重载无效）。

### `kentucky-file` 协议（BGM + 工作区 MP4）

`main/index.ts` 注册 `protocol.handle('kentucky-file', …)`。URL 形如 `kentucky-file://local/?path=`（经 `toMediaUrl`）。按扩展分流：

| 扩展 | 处理 |
|------|------|
| `.mp3` | `streamLocalMedia(..., 'audio/mpeg')` |
| `.mp4` | `streamLocalMedia(..., 'video/mp4')` |
| 其它（含 `.png`） | `net.fetch(file URL)`（整文件；图预览够用） |

`streamLocalMedia`：

- 读 `Range: bytes=start-end` → **206** + `Content-Range` / `Content-Length`（chunk）/ `Accept-Ranges: bytes`
- 无 Range 仍 **200** + `Accept-Ranges: bytes`（声明可拖进度；`<video>` / `<audio>` 会再发 Range）
- 流式 `createReadStream`，**禁止**整文件进内存再喂媒体元素

CSP：`index.html` 的 `media-src`（及图片的 `img-src`）须含 `kentucky-file:`。改 handler 后必须**完整退出 Electron** 再开。

§121：handler **先**校验路径属于当前打开工作区或对话框 read allowlist，再读盘。不要把任意 `?path=` 当可信。

### 空白路径 / 文件名输入

- `blankDir` / `blankFileName` 为受控输入；用户编辑后设 `touched` ref，避免布局同步把 `blank_NxM.png` 写回导致「无法输入」。
- 输入 `onKeyDown`/`onKeyUp` `stopPropagation`；CSS `user-select: text; pointer-events: auto`。


### 工作区 PNG 预览（配套外绘）

外绘流程依赖在工作区打开大图 PNG，故与分镜头同发：

| 项 | 行为 |
|----|------|
| 可见性 | 主进程 `TEXT_EXTS` 含 `.png`（否则资源树看不见） |
| Kind | `image`；`openFile` **不**调用 `docOpen`（避免 UTF-8 读二进制） |
| 显示 | `toMediaUrl` → `kentucky-file://` |
| 交互 | 滚轮**定点缩放**（非 passive `wheel` + `preventDefault`）；左键拖拽平移；双击 / 「适应」fit；工具栏放大缩小 100% Reveal |
| 只读 | `saveTab` 直接成功；关标签不 `docUnsubscribe` |

### 工作区 MP4 预览（导出验收，changelog §119）

导出的片子必须能在 Kentucky 里点开看，不能只靠系统播放器。此前 `TEXT_EXTS` 只有 `.png` 媒体，`.mp4` 在树里消失；若硬打开会走 DocumentHub UTF-8 `docOpen`。

`TEXT_EXTS` 名字易误导：它是资源树**可见扩展白名单**，不是「按文本打开」。`.png` / `.mp4` / `.kyboard` 都在集合里，打开路径由 `detectKind` 决定。

| 项 | 行为 |
|----|------|
| 可见性 | 主进程 `TEXT_EXTS` 含 `.mp4`（否则资源树过滤掉） |
| Kind | `detectKind('.mp4')` → `EditorKind 'video'` |
| Hub | `isMediaPreviewKind` = `image \| video \| pdf`。调用点：`openFile` **跳过** `docOpen`；`saveTab` 直接成功；`closeTab` **不** `docUnsubscribe` |
| 组件 | `VideoPreviewEditor.tsx`；`EditorArea` / `FloatWorkbench` 路由 |
| 显示 | `toMediaUrl` → `kentucky-file://local/?path=`；`<video controls playsInline preload="metadata">`；舞台 contain |
| 协议 | `streamLocalMedia(..., 'video/mp4')`：Range → 206；须 `Accept-Ranges`。与 `.mp3` 同一函数 |
| 工具栏 | 文案「视频预览」+ 时长 `m:ss`；Reveal（`explorer.revealInFolder`） |
| 只读 | 无脏标记路径；不写盘 |
| 树 | 图标 **MP4**（`tree-icon-video`）；`explorerNames` `STRIP_EXTS` 含 `.mp4` |
| 样式 | `global.css` `.video-preview-*` |
| i18n | `video.preview` / `loading` / `loadFailed` |
| 重启 | 改 `protocol.handle` 后必须完整退出 Electron |

**禁止**：把 mp4 当文本；预览用 `file://`；整文件 `arrayBuffer` 喂 `<video>`；假设 jpg/webp/webm/mov 也能开；自定义播放器皮肤；恢复一键铺轨 / 稿本分类自动上轨。


---

## 6. UI / UX 硬约束（验收必过）

实现与评审视为验收条件，不是「有空再 polish」。

### 与现有 Kentucky 统一

- 嵌工作台：标签 / 侧栏 / 主题变量（深浅 + accent）；**禁止**另起 PR 皮肤孤岛。
- 少硬边框、统一色阶（product-decisions Cursor 取向）。
- 按钮、输入、Seg、Toast、滚动条与 Settings / SCM 同一套变量与节奏。
- 中英 i18n，语气与现有面板一致。

### Emil / product-decisions 动效

- 遵循 `emil-design-eng`：**不加 framer-motion**。
- toast/dialog/菜单短 ease-out；chrome 轻 hover/press。
- **不**动画键盘高频（时间码输入、轨道细拖可无过渡）。
- 尊重 `prefers-reduced-motion`（`.storyboard-clip` / progress 关闭 transition）。
- 工具面：一屏一个主任务；避免紫渐变 / 过量 glow / 胶囊堆砌。
- **不**套用落地页美学规则；以工作台工具 UI 为准。

---

## 7. 用户工作流（推荐）

1. Explorer → **新建分镜头稿本**（或右键目录）。  
2. **稿纸**：确认格数 / 推算 `3×2` →（可选改生成文件夹/文件名）→ **生成空白拼图 PNG** → 资源树打开 PNG **预览**（滚轮/拖拽）→ 外部绘图软件绘制。  
3. **导入并切片**：尺寸不符默认报错；确认后强制缩放；**只切片不上轨**。  
4. 到时间线：从右侧把需要的分镜 **拖到 V1**；刀片在左侧工具栏；监视器拖/滚轮在播放头打帧（**I** / **Alt+I**）；A1–A4 加 MP3。  
5. **导出**：填写文件夹与文件名（或「另存为…」）导出 PNG / MP4（需 ffmpeg；开发机先 `npm run ensure-ffmpeg`）。资源树点开导出的 `.mp4` 用应用内预览验收。

---

## 8. 验收清单

- [ ] 6 格 `3×2` → 带 gutter/标题条的空白大图 PNG（5856×2328）  
- [ ] 空白生成可改工作区内路径与文件名；越界拒绝；**路径/文件名可键入不被写回**  
- [ ] 稿纸页可滚动看全：稿本 → 排版 → 空白输出 → 分镜格（无中间块消失）  
- [ ] 可追加第二张画完的稿本；链接栏切换；新格出现在 V1 **末尾**（旧片段时长/镜头保留）；分镜格随当前稿本过滤  
- [ ] 工作区可看见并打开 `.png`；滚轮定点缩放、拖拽平移、适应  
- [ ] 工作区可看见并打开 `.mp4`；原生控件可播可拖进度；不经文本编辑器  
- [ ] 导入同布局成品可切 6×1080；尺寸不符默认报错；强制缩放需确认  
- [ ] **无**一键铺轨；导入不上 V1；右侧缩略图拖到 V1 才加入；V1 块指针手势改序后 `repackVideoClipStartsMut`（勿再 `packVideoClipsMut`）  
- [ ] 粗剪后切标签/Ctrl+S/重启仍保留时间线（`persistDoc` + `flushStoryboardForSave`）  
- [ ] V1 单边修剪；A1–A4 边缘可调播放长度；时间线无可见横向滑块、滚轮可横移  
- [ ] 多轨 MP3 可同时听（长文件不因「虚长校正」静音）；切镜监视器不闪黑  
- [ ] 时间线检视器稿本栏/属性完整可见可滚；监视器画面填充分栏  
- [ ] 可改时长；监视器拖/滚轮在播放头打帧；**I** / **Alt+I**；V1 **无默认头尾菱形**；中间打的帧播放不「乱跑」回原位  
- [ ] 可加/移除最多 4 条音轨并同时听；导出可播 MP4（24fps 1080，多轨 amix）  
- [ ] 缺 ffmpeg 时 Toast 为 i18n（`FFMPEG_NOT_FOUND`），非英文长句；`ensure-ffmpeg` 后完整重启可导出  
- [ ] 窗口底部资源树右键菜单完整可见（翻到光标上方或菜单内滚动）——工作台 chrome，见 changelog **§116**  
- [ ] 导出页可自定义路径/文件名；另存为回写表单  
- [ ] 主题切换 / accent 下编辑器不违和；无独立 PR 皮肤  
- [ ] `prefers-reduced-motion` 下无多余动画  
- [ ] 无 Agent 工具；写入路径不逃出工作区  
- [ ] Android 实现按 PORTING A3（未完成前本项保持未勾）

---

## 9. 源码索引（速查）

```
src/shared/kyboardSchema.ts
src/main/index.ts                         # kentucky-file 协议（mp3/mp4 流式 + Range）
src/main/storyboard/{pngUtil,storyboardService,registerStoryboardIpc,kyboardSchema}.ts
src/preload/index.ts                      # storyboard* + dialogs + toMediaUrl
src/renderer/index.html                   # CSP media-src kentucky-file:
src/renderer/src/platform/index.ts
src/renderer/src/editors/StoryboardEditor.tsx
src/renderer/src/editors/storyboardTimelineHelpers.ts
src/renderer/src/editors/ImagePreviewEditor.tsx
src/renderer/src/editors/VideoPreviewEditor.tsx
src/renderer/src/state/appStore.ts         # kind storyboard|image|video + createStoryboard
src/renderer/src/workbench/{EditorArea,FloatWorkbench,Sidebar,FileTree,explorerNames}
src/renderer/src/workbench/fitContextMenu.ts  # §116 右键贴边（工作台；非分镜专属）
src/renderer/src/styles/global.css         # .storyboard-* / .image-preview-* / .video-preview-* / scrub
src/renderer/src/styles/storyboard-nle.css # 时间线 NLE 壳
src/renderer/src/styles/storyboard-pages.css # 稿纸/导出/检视器抛光
src/renderer/src/main.tsx                  # 引入上述 CSS
src/renderer/src/i18n/locales/{en,zh-CN}.json  # storyboard.* / image.* / video.* / ffmpegNotFound
win/scripts/ensure-ffmpeg.js                   # 复制或 winget 安装 → resources/ffmpeg/ffmpeg.exe
resources/ffmpeg/README.txt                # 仓内占位；*.exe gitignore
win/package.json                              # 0.3.0 ; pngjs ; dist* 先 ensure-ffmpeg ; extraResources
```

别名：`@shared/*` → `src/shared/*`（`electron.vite.config.ts` + tsconfig）。

---

## 10. Android / 移植备注

- **要移植**（BOARD **A3 ❌**）。勿 `import win/`。契约以本文 + schema v1 为准。
- ffmpeg / 大图内存 / PNG 手势 / SAF 写 assets：安卓独立工程自行重写，勿抄 Electron 实现。
- 禁止 `ffmpeg-static`；禁止抄 `kentucky-file://`。

---

## 11. 已知限制（诚实记录）

| 项 | 现状 |
|----|------|
| ffmpeg 捆绑 | `npm run ensure-ffmpeg` → `resources/ffmpeg/ffmpeg.exe`（gitignore）；`dist*` extraResources；`resolveFfmpeg` `-version` 探活；勿依赖 GitHub 上的 `ffmpeg-static`；缺则 `FFMPEG_NOT_FOUND` |
| 帧渲染 | 主进程 CPU 逐像素 blit；长片导出慢属预期 |
| 强制缩放确认 | 使用 `window.confirm`（非 AnimatedDialog；可后续对齐） |
| DocumentHub | `.kyboard` 走 DocumentHub；粗剪须把 live JSON 同步进 `tab.content`，否则 Save 会用打开时缓冲盖掉 V1。`.png` / `.mp4` 不进 Hub |
| 图片/视频格式 | 工作区预览 **`.png`** + **`.mp4`**（jpg/webp/webm 未纳入树与 kind） |
| 监视器相机 | Blender 式：播放头 + 拖/I 打帧；最多 6 **手动**帧；无默认头尾菱形；无缓动；无 from/to 数值栏 |
| 空白/导出目录 | 空白生成与 MP4 中间写盘须工作区内；导出「另存为」可选区外（经 assets 中转） |
| Agent | 无工具、无 L5 注入 |

---

## 12. 后续 polish 年表（相对 0.3.0 首发）

| changelog | 要点 |
|-----------|------|
| §96 | 首发：schema / IPC / 三模式编辑器 / 发版 0.3.0 |
| §97 | 导出页自定义文件夹 + PNG/MP4 文件名 + 另存为 |
| §98 | 工作区 `.png` 可见 + `ImagePreviewEditor` 只读打开 |
| §99 | PNG 画布式滚轮/拖拽；稿纸页空白生成路径/文件名 |
| §100 | 时间线 `TransportScrubber` 替换原生 range（修 0%/100% 显示） |
| §102 | V1 边缘拖时长 + pack |
| §103 | 固定 px/秒；入点/出点单边修剪（修对称缩放感） |
| §104–§105 | 播放无声/闪烁/BGM 虚长黑屏 |
| §106 | 时间线 NLE 工作台（运输条/尺/播放头/刀片/涟漪/缩放） |
| §107 | 隐藏时间线滑块、A1 边缘修剪、BGM 再无声（协议流式/Range、校正范围收窄） |
| §108 | 去掉点格素材库；多稿本追加 + 链接栏；铺轨按稿本序 |
| §109 | 稿纸/时间线/导出三页 UI 抛光（`storyboard-pages.css`） |
| §110 | 空白路径/文件名「无法输入」：touched 防写回 |
| §111 | 稿纸「页面显示不全」：section `flex-shrink:0` + pane 滚动 |
| §112 | 时间线检视器「内容显示不全」：`max-height:100%` + 稿本链接换行 |
| §113 | A1–A4 多轨音频（`audioClips` + 兼容 `audioClip`）；监视器缩放/拖拽 + keys（初版交互随后被覆盖） |
| §114 | 镜头打帧改为 Blender 式：播放头 + I / 拖监视器自动打帧；去掉入出点四按钮与 from/to 六个数 |
| §115 | 轨道不画默认头尾关键帧；`storedCameraKeys` + hold；`pruneIdentityBookends`；中间打的帧不再被拉回原位 |
| §116 | 工作台右键菜单贴窗口边缘（`fitContextMenu.ts`；资源树/导图/活动栏/选区） |
| §117 | 追加稿本把新格接到 V1 末尾（`appendPanelClipsMut`）；一键铺轨仍为整轨重铺 |
| §118 | 捆绑 ffmpeg：`ensure-ffmpeg` + `resources/ffmpeg` + extraResources；错误 i18n |
| §119 | 工作区 `.mp4` 可见并可点开预览（`VideoPreviewEditor` + kentucky-file Range） |
| §120 | Win 本机安全审计（只记不改）→ [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) |
| §121 | 沙箱落地：kentucky-file 工作区约束、import allowlist、导出 15 分钟/PNG/layout 上限、Storyboard IPC 绑窗口 |
| §122 | 协议仅 toMediaUrl 登记 ∪ dialog read；另存 defaultPath 夹工作区 |
| §149 | 切片文件名 = 稿本文件名 + 格号；稿纸格显示缩略图 |
| §150–§154 | V1 拖块改序：指针手势 + `repackVideoClipStartsMut`（禁止改序后再 `packVideoClipsMut`） |
| §155 | `persistDoc` + `storyboardDocFlush`：写盘且更新 `tab.content`；Save 前 flush |
