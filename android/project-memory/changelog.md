# 改动时间线（Android）

## 1. 软件根建立

- Cursor 工作区容器下新增独立 `android/` 软件根
- 从 win 渲染层复制业务 UI；Platform 改为 `createAndroidPlatform`
- 去掉多窗口菜单；DocumentHub 本地化
- Vite + Capacitor 7 脚手架；原生路径 `native/`
- 工作区：Chrome File System Access + IndexedDB 持久句柄；真机 Documents/`kentucky-workspace`

## 2. 开发冻结（相对 Win）

- 产品约定：**Win 正式版完成前，安卓不并行大改**；功能以 Win 为准后再移植
