import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(process.env.ECHOLANG_SOURCE_DIR || (app.isPackaged ? path.join(process.resourcesPath, 'echolang-source') : path.join(currentDir, '..')));
const nodeCommand = process.env.ECHOLANG_NODE_PATH || (app.isPackaged ? process.execPath : (process.platform === 'win32' ? 'node.exe' : 'node'));
const configDir = path.resolve(process.env.ECHOLANG_CONFIG_DIR || (app.isPackaged ? app.getPath('userData') : sourceDir));
const serverHost = '127.0.0.1';
let serverPort = null;
let backendProcess = null;
let mainWindow = null;

app.setName('EchoLang');
app.setAppUserModelId('com.echolang.desktop');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, serverHost, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error('无法分配本地端口'));
      });
    });
  });
}

function probeServer(port) {
  return new Promise((resolve) => {
    const request = httpRequest({ hostname: serverHost, port, path: '/api/health', method: 'GET' }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

function stopBackend() {
  if (!backendProcess) return;
  backendProcess.kill();
  backendProcess = null;
}

async function startBackend() {
  serverPort = await findFreePort();
  let launchError = null;
  const serverEntry = app.isPackaged ? path.join(sourceDir, 'server.mjs') : 'server.mjs';
  backendProcess = spawn(nodeCommand, [serverEntry], {
    cwd: sourceDir,
    env: {
      ...process.env,
      ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      ECHOLANG_CONFIG_DIR: configDir,
      ECHOLANG_SOURCE_DIR: sourceDir,
      PORT: String(serverPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  backendProcess.stdout.on('data', (chunk) => console.log(`[EchoLang backend] ${chunk.toString().trimEnd()}`));
  backendProcess.stderr.on('data', (chunk) => console.error(`[EchoLang backend] ${chunk.toString().trimEnd()}`));
  backendProcess.once('error', (error) => { launchError = error; });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (launchError) throw launchError;
    if (backendProcess.exitCode !== null) throw new Error(`后端进程提前退出（代码 ${backendProcess.exitCode}）`);
    if (await probeServer(serverPort)) return;
    await delay(100);
  }
  throw new Error(`后端服务在端口 ${serverPort} 上未能启动`);
}

async function createWindow() {
  const appUrl = `http://${serverHost}:${serverPort}`;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    title: 'EchoLang',
    icon: path.join(sourceDir, 'favicon.ico'),
    backgroundColor: '#f3f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(appUrl)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(appUrl);
}

async function bootstrap() {
  try {
    await startBackend();
    await createWindow();
  } catch (error) {
    stopBackend();
    const hint = app.isPackaged ? '请重新安装 EchoLang，或联系发布者检查安装包。' : '请确认已安装 Node.js 20+，且项目根目录依赖已安装。';
    dialog.showErrorBox('EchoLang 启动失败', `${error.message}\n\n${hint}\n${sourceDir}`);
    app.quit();
  }
}

app.on('before-quit', stopBackend);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', async () => {
  if (!mainWindow && backendProcess) await createWindow();
});
app.whenReady().then(bootstrap);
