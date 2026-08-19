# EchoLang Desktop

EchoLang Desktop 是基于 Tauri 2 的 Windows 桌面应用。Rust 启动器负责创建无边框窗口、启动随包携带的 Node.js 后端，并在后端健康检查通过后显示阅读器。

桌面版保留自定义标题栏、文档阅读、供应商设置和批量翻译能力；安装器使用 NSIS，带 EchoLang 品牌图标、欢迎页侧图和页眉图，默认按当前用户安装。

## 从源码启动

开发模式需要 Node.js 20+、Rust MSVC 工具链和 WebView2：

```powershell
npm install
npm run dev
```

Tauri 会启动上级目录的 `server.mjs`，并自动分配本地端口；开发配置仍默认保存在上级项目的 `config.local.json`。

## 构建 NSIS 安装程序

```powershell
npm install
npm run build:nsis
```

产物位于：

```text
src-tauri/target/release/bundle/nsis/EchoLang_0.3.0_x64-setup.exe
```

构建前会执行 `scripts/prepare-runtime.mjs`，将 `server.mjs`、网页资源、解析依赖和当前 Windows Node.js 运行时复制到未跟踪的 `runtime/` 目录，再由 Tauri 作为资源打进安装包。终端用户不需要另装 Node.js。

## 构建目录版

```powershell
npm run build:dir
```

该命令生成 `src-tauri/target/release/EchoLang.exe`，用于验证 Tauri release 构建；正式分发请使用 NSIS 产物，因为目录版不会携带安装资源。

## 资源与配置

- `src-tauri/src/main.rs`：后端生命周期、端口探测、窗口导航和退出回收。
- `src-tauri/tauri.conf.json`：Tauri 2 窗口、资源、WebView2 和 NSIS 配置。
- `src-tauri/capabilities/default.json`：主窗口的最小窗口控制权限，并仅允许访问 `127.0.0.1` 后端。
- `scripts/prepare-runtime.mjs`：准备随包 Node.js 运行时和应用资源。
- `scripts/create-installer-assets.mjs`：生成 NSIS 页眉图和欢迎页侧图。
- `%APPDATA%\EchoLang\config.local.json`：安装版默认的 API Key 和供应商配置位置。
