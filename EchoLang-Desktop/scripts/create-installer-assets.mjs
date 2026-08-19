import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const iconDir = path.resolve(scriptDir, '..', 'src-tauri', 'installer');

const glyphs = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
};

function blend(base, color, alpha) {
  return base.map((channel, index) => Math.round(channel * (1 - alpha) + color[index] * alpha));
}

function createBitmap(width, height, painter) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write('BM', 0, 2, 'ascii');
  buffer.writeUInt32LE(54 + pixelBytes, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);

  const pixels = Array.from({ length: height }, () => Array.from({ length: width }, () => [255, 255, 255]));
  const setPixel = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pixels[y][x] = alpha >= 1 ? color : blend(pixels[y][x], color, alpha);
  };
  const fill = (color) => {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels[y][x] = color;
  };
  const rect = (x, y, rectWidth, rectHeight, color, alpha = 1) => {
    for (let yy = y; yy < y + rectHeight; yy += 1) for (let xx = x; xx < x + rectWidth; xx += 1) setPixel(xx, yy, color, alpha);
  };
  const circle = (cx, cy, radius, color, alpha = 1) => {
    const radiusSquared = radius * radius;
    for (let y = cy - radius; y <= cy + radius; y += 1) for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) setPixel(x, y, color, alpha);
    }
  };
  const text = (value, x, y, scale, color, gap = scale) => {
    let cursor = x;
    for (const character of value) {
      const glyph = glyphs[character];
      if (!glyph) { cursor += 6 * scale; continue; }
      glyph.forEach((row, rowIndex) => row.split('').forEach((bit, columnIndex) => {
        if (bit === '1') rect(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
      }));
      cursor += 5 * scale + gap;
    }
  };

  painter({ fill, rect, circle, text, setPixel });
  for (let y = 0; y < height; y += 1) {
    const targetY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixels[y][x];
      const offset = 54 + targetY * rowSize + x * 3;
      buffer[offset] = blue;
      buffer[offset + 1] = green;
      buffer[offset + 2] = red;
    }
  }
  return buffer;
}

const header = createBitmap(150, 57, ({ fill, rect, circle, text }) => {
  for (let y = 0; y < 57; y += 1) {
    const tone = Math.round(248 - y * 0.35);
    rect(0, y, 150, 1, [tone, Math.min(252, tone + 3), 255]);
  }
  circle(126, 7, 32, [229, 238, 255], 0.8);
  rect(17, 15, 28, 28, [42, 109, 246]);
  rect(22, 20, 18, 9, [255, 255, 255]);
  circle(31, 35, 7, [255, 255, 255]);
  text('ECHOLANG', 54, 20, 2, [23, 32, 51], 1);
});

const sidebar = createBitmap(164, 314, ({ fill, rect, circle, text }) => {
  for (let y = 0; y < 314; y += 1) {
    const progress = y / 313;
    rect(0, y, 164, 1, [20 + Math.round(progress * 15), 54 + Math.round(progress * 36), 105 + Math.round(progress * 62)]);
  }
  circle(26, 33, 40, [103, 184, 255], 0.14);
  circle(150, 273, 56, [112, 239, 207], 0.1);
  for (let x = 16; x < 164; x += 22) circle(x, 266 + (x % 3) * 5, 1, [222, 240, 255], 0.65);
  circle(82, 102, 43, [255, 255, 255], 0.96);
  circle(96, 119, 27, [220, 235, 255], 1);
  rect(49, 91, 54, 21, [42, 109, 246]);
  text('E', 70, 94, 3, [255, 255, 255], 0);
  text('ECHOLANG', 26, 172, 2, [255, 255, 255], 1);
  text('TRANSLATION', 26, 203, 1, [192, 223, 255], 1);
  text('DESK', 26, 216, 1, [192, 223, 255], 1);
  rect(26, 251, 42, 2, [104, 220, 255]);
  rect(72, 251, 18, 2, [93, 204, 215]);
});

await mkdir(iconDir, { recursive: true });
await writeFile(path.join(iconDir, 'header.bmp'), header);
await writeFile(path.join(iconDir, 'sidebar.bmp'), sidebar);
console.log(`EchoLang installer artwork ready: ${iconDir}`);
