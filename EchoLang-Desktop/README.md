# EchoLang Desktop

EchoLang Desktop 是网页翻译工作台的 Windows Electron 外壳。发布包内置 Electron、Node.js 运行时、后端服务和文档处理依赖，最终用户无需单独安装 Node.js。

## 开发启动

先在项目根目录安装网页后端依赖，再启动桌面外壳：

```powershell
cd ..
npm install
cd EchoLang-Desktop
npm install
npm start
```

也可以双击本目录的 `start.bat`。开发模式读取上级目录源码与 `config.local.json`；打包版把用户配置保存到 `%APPDATA%\EchoLang\config.local.json`。

## 构建

```powershell
npm ci
npm run check
npm run dist
```

产物位于 `dist/`：

```text
EchoLang-0.4.0-setup.msi       # Windows Installer 安装包
EchoLang-0.4.0-portable.exe    # 免安装便携版
```

也可以单独构建：

```powershell
npm run dist:msi
npm run dist:portable
npm run dist:dir
```

`dist:dir` 会生成 `dist/win-unpacked/EchoLang.exe`，适合发布前启动检查。

## 运行结构

- Electron 主进程通过 `ELECTRON_RUN_AS_NODE=1` 启动内置 `server.mjs`。
- 后端默认监听 `127.0.0.1:4173`，并在窗口加载前完成健康检查。
- 应用使用单实例锁，重复启动时会聚焦已有窗口。
- 渲染进程启用 `contextIsolation`、关闭 `nodeIntegration`，窗口控制只通过 `preload.cjs` 暴露的白名单 IPC。
- 外部 HTTP(S) 链接交给系统默认浏览器，应用窗口不会导航到非本地地址。

## 发布说明

安装包当前没有商业代码签名证书。发布前应至少完成：

```powershell
node --check main.mjs
npm audit --omit=dev --audit-level=high
npm run dist:dir
```

然后启动 `win-unpacked/EchoLang.exe`，确认窗口、后端健康接口、导入、模型设置和单段翻译均正常。
