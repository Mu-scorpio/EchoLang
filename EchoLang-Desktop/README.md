# EchoLang Desktop

Electron 外壳把 EchoLang 的网页阅读器和 Node 后端封装成 Windows 桌面应用。

## 从源码启动

开发模式需要 Node.js 20+，并使用上级目录的网页源码：

```powershell
npm install
npm start
```

也可以在本目录双击 `start.bat`。开发模式下 Electron 会启动上级目录的 `server.mjs`；API Key 等配置仍由后端保存到上级项目的 `config.local.json`。

## 构建 Windows EXE

```powershell
npm install
npm run dist
```

构建结果：

```text
dist/EchoLang-0.3.0-setup.exe       # NSIS 安装版
dist/EchoLang-0.3.0-portable.exe    # 便携版
```

打包后的应用会把网页、后端和解析依赖放进 `resources/echolang-source`，并使用 Electron 自身的 Node 运行时启动后端，因此终端用户不需要额外安装 Node.js。桌面版配置默认写入 `%APPDATA%\EchoLang\config.local.json`。

## 目录版检查

```powershell
npm run dist:dir
```

这个命令生成 `dist/win-unpacked/EchoLang.exe`，适合在发布前直接启动检查。
