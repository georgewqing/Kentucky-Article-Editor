---
name: 决策烤问
description: >-
  Grill the user about a plan, decision, or idea. Stress-test assumptions with
  clickable ask_user cards. Use when the user says grill / 烤 / 追问, or mounts this skill.
---

# 决策烤问

WHEN：用户要烤一个计划、选型、范围或点子；或明确说 grill / 烤 / 追问。不要用来查盘上能读到的事实。

## 必须

- 用工具 **`ask_user`** 提问。禁止在 Markdown 里写编号选项干等。
- 每一轮只问当前 frontier（前提已定、现在就能答的互斥题），每调用最多 **3** 题。
- 等用户点确认后再问下一轮。事实用 `list_dir` / `read_file`，不要问用户。
- 推荐答案写在 `recommendedId`（对应某个 option id）。
- 会话结束：frontier 空了再动手；未确认前不要落盘大改。

## 禁止

- Ask 模式没有工具：若用户在 Ask 里挂了本 skill，告诉他们切到 Plan 或 Agent 再发，不要假装选项可点。
- 不要把能从工作区读到的内容当成选择题。
