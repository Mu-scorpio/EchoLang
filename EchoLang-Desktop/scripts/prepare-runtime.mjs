import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const sourceDir = path.resolve(desktopDir, '..');
const runtimeDir = path.join(desktopDir, 'runtime');

const runtimeEntries = [
  'server.mjs',
  'index.html',
  'favicon.ico',
  'app',
  'assets',
  'node_modules',
  'package.json',
  'config.example.json',
  '.env.example',
];

await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

for (const entry of runtimeEntries) {
  await cp(path.join(sourceDir, entry), path.join(runtimeDir, entry), { recursive: true });
}

if (process.platform !== 'win32' || !process.execPath.toLowerCase().endsWith('node.exe')) {
  throw new Error('Tauri Windows 打包需要从 Windows Node.js 运行时执行 prepare-runtime.mjs');
}

await cp(process.execPath, path.join(runtimeDir, 'node.exe'));
console.log(`EchoLang runtime ready: ${runtimeDir}`);
