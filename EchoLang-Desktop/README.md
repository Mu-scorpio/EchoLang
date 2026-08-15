# EchoLang Desktop

EchoLang Desktop 是网页翻译工作台的 Electron 外壳。发布包内置 Electron、Node.js 运行时、后端服务和文档处理依赖，最终用户无需单独安装 Node.js。

## 开发启动

先在项目根目录安装网页后端依赖，再启动桌面外壳：

```powershell
cd ..
npm install
cd EchoLang-Desktop
npm install
npm start
```

也可以双击本目录的 `start.bat`（Windows）。开发模式读取上级目录源码与 `config.local.json`；打包版把用户配置保存到系统用户数据目录（macOS：`~/Library/Application Support/EchoLang`，Windows：`%APPDATA%\EchoLang`）。

## 构建

```bash
npm ci
npm run check
npm run dist
```

产物位于 `dist/`：

```text
EchoLang-0.4.1-setup.msi          # Windows Installer 安装包
EchoLang-0.4.1-portable.exe      # Windows 免安装便携版
EchoLang-0.4.1-mac-arm64.dmg     # macOS 磁盘映像（构建机架构）
```

也可以单独构建：

```bash
npm run dist:msi
npm run dist:portable
npm run dist:dir
npm run dist:mac
npm run dist:mac:zip
npm run dist:mac:dir
```

`dist:dir` 会生成 `dist/win-unpacked/EchoLang.exe`；`dist:mac:dir` 会生成 `dist/mac-arm64/EchoLang.app`（目录名会随构建架构变化），适合发布前启动检查。

macOS 构建默认使用当前构建机架构。由于后端依赖包含原生模块（例如 `sharp`），如果要发布 Intel 版，应在 Intel macOS 或 x64 Node 环境中重新安装根目录依赖后再构建；不要直接把 Apple Silicon 的依赖目录当作 Intel 版发布。

## 运行结构

- Electron 主进程通过 `ELECTRON_RUN_AS_NODE=1` 启动内置 `server.mjs`。
- 后端默认监听 `127.0.0.1:4173`，并在窗口加载前完成健康检查。
- 应用使用单实例锁，重复启动时会聚焦已有窗口。
- 渲染进程启用 `contextIsolation`、关闭 `nodeIntegration`，窗口控制只通过 `preload.cjs` 暴露的白名单 IPC。
- 外部 HTTP(S) 链接交给系统默认浏览器，应用窗口不会导航到非本地地址。

## 发布说明

安装包当前没有商业代码签名证书。发布前应至少完成：

```bash
node --check main.mjs
npm audit --omit=dev --audit-level=high
npm run dist:dir
```

然后启动对应的 `win-unpacked/EchoLang.exe` 或 `mac-*/EchoLang.app`，确认窗口、后端健康接口、导入、模型设置和单段翻译均正常。当前 macOS 包未使用 Apple Developer ID 签名和公证，首次打开时可能需要在“系统设置 → 隐私与安全性”中允许。
