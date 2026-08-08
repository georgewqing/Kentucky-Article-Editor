# 如何运行（Android）

## 安装

```bash
cd "d:\Working Directory\Kentucky\android"
npm install
```

## 浏览器开发（推荐先这样验证）

```bash
npm run dev
```

用 **Chrome / Edge** 打开终端里的本地地址（默认 `http://localhost:5174`）。

- 「打开文件夹」走 **File System Access API**（用户授权的目录句柄，持久化到 IndexedDB）
- 外接键盘：Ctrl+S 保存、Ctrl+O 打开文件夹
- 需要较宽视口（平板横屏或桌面拉宽）

## Capacitor 真机 / 模拟器

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

- Web 产物：`dist/`
- 原生工程目录：`native/`（由 `capacitor.config.ts` 的 `android.path` 指定，避免 `android/android`）

Android Studio 需本机已装 JDK / SDK。

## 类型检查 / 构建

```bash
npm run typecheck
npm run build
```
