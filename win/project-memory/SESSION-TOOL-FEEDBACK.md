# Win 工具反馈对接 · SESSION 交接

> 更新：2026-08-11 Round G（`propose_text_patch` 破坏 MD 表格/引用）  
> **基线**：[`AGENT-TOOL-TEST-BASELINE.md`](./AGENT-TOOL-TEST-BASELINE.md)  
> **总清单**：[`AGENT-TOOL-FEEDBACK.md`](./AGENT-TOOL-FEEDBACK.md)

## 部署指纹

`toolApi: "2026-08-11-g"`（完整重启）

## Round G 要点

- **根因**：TipTap WYSIWYG 无 Table 扩展，AI 写入后 `getMarkdown` 丢掉 `|`、弄乱 `>`/`**`
- **修**：Table 扩展 + `setContent(..., { emitUpdate: false })` + 落盘 `docApplyExternalWrite`
- **复验**：最小 MD 样例 write→read→patch→read

```
重启后确认 toolApi:"2026-08-11-g"；跑 P3 最小样例
```
