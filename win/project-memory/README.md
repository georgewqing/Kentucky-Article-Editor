# KENTUCKY — 项目记忆（给后续对话 / 新 Agent）

本目录记录产品决策、架构与改动历史，**上下文重置后请先读这里**，再改代码。

当前主线：

1. **写作** — `.md` TipTap WYSIWYG + Monaco 源码；软化非 md 文本编辑  
2. **思维导图** — `.kmind` v2 自由白板（React Flow；链接 / 插图 / 参考图 / 批注）  
3. **台词对话** — 节点图画布编辑 `.dialogue.csv`（11 列）+ `*.dialogue.choices.json`（播放图）+ `characters.csv`（含 `operable`）+ meta/layout；检视器可设唯一开场；Godot 协议 **v1.3** 见 extras；执行器 [ai_river_godot](https://github.com/CCFOX12/ai_river_godot)
4. **工作台** — 文件夹工作区、活动栏起始页/资源管理器切换、叠加主题色滚动条、多窗口（DocumentHub）、设置主题、灰白应用图标、中英 i18n；Toast/Dialog 短动效（Emil）+ `prefers-reduced-motion`
5. **AI 代理人（v0.2.0）** — OpenAI 兼容；右侧 Cursor 式侧栏；自动写入；黄/蓝脏新建标记；本体 `data/` 存会话与密钥  

| 文档 | 内容 |
|------|------|
| [architecture.md](./architecture.md) | 技术栈、目录、数据流、关键模块（含 ToastLayer / 开场解析） |
| [product-decisions.md](./product-decisions.md) | 需求 grill 结论（已定稿，勿擅自推翻） |
| [changelog.md](./changelog.md) | 按时间线的功能与修复记录（§49–52：v1.3 / operable / 联调 / 开场开关 / 动效） |
| [gotchas.md](./gotchas.md) | 踩坑与约束（Electron prompt、TipTap、MiniMap、台词 CSV、动效离开态等） |
| [how-to-run.md](./how-to-run.md) | 本地运行 / Cursor F5 调试 / **Godot 台词热编辑** |
| [SESSION-TOOL-FEEDBACK.md](./SESSION-TOOL-FEEDBACK.md) | 工具反馈**多轮会话交接**（短；重启验证清单） |
| [AGENT-TOOL-FEEDBACK.md](./AGENT-TOOL-FEEDBACK.md) | **Agent 工具反馈总清单**（缺陷表 / 契约 / Win 已修 / Android 待对齐） |
| [AGENT-TOOL-TEST-BASELINE.md](./AGENT-TOOL-TEST-BASELINE.md) | **干净测试结论基线**（9 项实证通过 + P1/P2 残留） |
| [extras/godot-kentucky-dialogue](../extras/godot-kentucky-dialogue/README.md) | **Godot 接入协议 v1.3**（choices、`operable`、显式开场→CSV 首行、§4.2 作者注意；本仓不含插件） |
| [ai_river_godot](https://github.com/CCFOX12/ai_river_godot) | Godot 执行器参考实现（AI River；独立仓库） |

根目录另有简版 [README.md](../README.md)。详细以本目录为准。

> 工作区容器：`Kentucky/win` 为本软件根；同级 `Kentucky/android` 为安卓软件根（互不共享源码）。
