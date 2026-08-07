# KENTUCKY — 项目记忆（给后续对话 / 新 Agent）

本目录记录产品决策、架构与改动历史，**上下文重置后请先读这里**，再改代码。

当前主线：

1. **写作** — `.md` TipTap WYSIWYG + Monaco 源码；软化非 md 文本编辑  
2. **思维导图** — `.kmind` v2 自由白板（React Flow；链接 / 插图 / 参考图 / 批注）  
3. **台词对话** — `.dialogue.csv`（11 列，含可选演出声明）+ `characters.csv`（含 `model_node`）+ `*.dialogue.meta.json`；稳定 id；Godot 同目录热编辑协议 **v1.1** 见 extras  
4. **工作台** — 文件夹工作区、活动栏起始页/资源管理器切换、多窗口（DocumentHub）、设置主题、灰白应用图标、中英 i18n  

| 文档 | 内容 |
|------|------|
| [architecture.md](./architecture.md) | 技术栈、目录、数据流、关键模块 |
| [product-decisions.md](./product-decisions.md) | 需求 grill 结论（已定稿，勿擅自推翻） |
| [changelog.md](./changelog.md) | 按时间线的功能与修复记录（含台词编辑器文件清单） |
| [gotchas.md](./gotchas.md) | 踩坑与约束（Electron prompt、TipTap、MiniMap、台词 CSV 等） |
| [how-to-run.md](./how-to-run.md) | 本地运行 / Cursor F5 调试 / **Godot 台词热编辑** |
| [extras/godot-kentucky-dialogue](../extras/godot-kentucky-dialogue/README.md) | **Godot 接入协议 v1.1**（声明器/执行器、11 列/`model_node`/meta/监视建议；不含插件代码） |

根目录另有简版 [README.md](../README.md)。详细以本目录为准。
