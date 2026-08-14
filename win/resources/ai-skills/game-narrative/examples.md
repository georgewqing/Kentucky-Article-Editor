# 对白范例（Godot v1.3）

先确保 `characters.csv` 里有 speaker 的 **id**（不是显示名）。整段脚本用 `propose_dialogue_graph`。写完跑 `dialogue_cast_check`。

## 合格：短句、选项有代价、线性也写空 text

守卫拦门。玩家二选一：亮通行证（进）/ 硬闯（被拒）。

```json
{
  "path": "intro.dialogue.csv",
  "mode": "replace",
  "lines": [
    { "id": "gate", "speaker": "guard", "text": "城门关了。" },
    { "id": "in", "speaker": "guard", "text": "……进去。别惹事。" },
    { "id": "out", "speaker": "guard", "text": "滚。" }
  ],
  "choices": [
    {
      "after": "gate",
      "options": [
        { "text": "亮出通行证", "goto": "in" },
        { "text": "硬闯", "goto": "out" }
      ]
    },
    { "after": "in", "options": [{ "text": "", "end": true }] },
    { "after": "out", "options": [{ "text": "", "end": true }] }
  ]
}
```

要点：

- `speaker` = `guard`（角色 id），不是「守卫」
- 选项互斥、有后果；不要「好的 / 嗯」两个空选项
- 线性继续用 `text: ""`；同一 `after` 不要混空 text 和带字选项
- 一句对白短（能上屏幕）；小说旁白放到 `design/narrative/`，不进 CSV

## 不合格（不要这样）

- 只把对白写在 `design/narrative/intro.md`，不建 `.dialogue.csv`
- `speaker` 用中文显示名或随便编的新角色，不先 `propose_upsert_character`
- 一句塞 80 字心理描写
- 选项无代价（「继续 / 好的」假装分支）
- 台词里发明「伤害 12」——数字只属于 `design/balance/*.csv`
