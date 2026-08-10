# How to run（Android）

## 浏览器预览（推荐开发）

```bash
cd android
npm install
npm run dev          # http://localhost:5174 — 需 Chrome/Edge
npm run typecheck
npm run build
```

「打开文件夹」使用 File System Access；宽窗口模拟平板。

## Capacitor 真机 / 模拟器

```bash
cd android
npm run cap:sync     # build + cap sync android
npm run cap:open     # Android Studio
```

真机「打开文件夹」走 SAF（系统目录选择器），URI 持久化。

原生工程：`android/native/`。JDK 建议 **17 或 21**（过新的 JDK 可能导致 Gradle 无法编译）。

改过 `MainActivity.java`、`styles.xml`、`activity_main.xml` 或 Manifest 后，必须在
Android Studio **Run 重装**；只执行 `cap sync` 不会重新安装原生代码。

平板回归至少检查：顶部 tabs 完全位于黑色系统状态栏下方且关闭按钮可用、Settings
触控板上下滚动、软键盘不遮输入、系统返回键、90%/130% 界面缩放、窄宽 AI 覆盖
抽屉，以及 MD ↔ AI 触控板交替滚动。

## AI

设置 → AI：填写 OpenAI 兼容 Base URL / Key / Model → `Ctrl+L` 打开面板。会话与配置写在应用私有 `kentucky-data/`，不在项目目录。
