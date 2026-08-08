# 产品决策（Android）

| 项 | 决定 |
|----|------|
| 形态 | Capacitor + React；**独立软件根**，不 import `../win` |
| 设备 | 大屏安卓平板；**优先外接键盘**；不做手机窄屏布局 |
| 窗口 | **单窗**；不实现新建窗口 / DocumentHub 跨窗（桌面专属） |
| 工作区 | 浏览器：File System Access（类 SAF 授权）。原生：见 architecture（Documents / 后续 SAF 插件） |
| 开发优先级 | **冻结大改**：以 `../win` 正式版为准；Win 完成后再移植。本目录仅维护可运行雏形 |
| 菜单 | 始终应用内 `AppMenuBar` |
| 多窗口菜单 | 已从安卓菜单移除 |

## 明确不做

- 手机布局
- 多窗口 / 精简浮窗
- 在本目录附带 Electron
- 与 `win/` 共享 npm workspace
