import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(process.env.ECHOLANG_CONFIG_DIR || rootDir);
const configSearchDirs = [...new Set([configDir, rootDir])];
const port = Number(process.env.PORT || 4173);
const config = loadEnvFiles();
const localConfig = loadLocalJsonConfig();
const providerConfig = localConfig.opencode || localConfig.openCode || localConfig;
const baseUrl = (process.env.OPENCODE_BASE_URL || config.OPENCODE_BASE_URL || providerConfig.baseUrl || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
const defaultModel = process.env.OPENCODE_MODEL || config.OPENCODE_MODEL || providerConfig.model || 'deepseek-v4-flash-free';
const serverApiKey = process.env.OPENCODE_API_KEY || config.OPENCODE_API_KEY || providerConfig.apiKey || '';
const defaultSystemPrompt = '你是一名专业翻译。';
const maxUploadBytes = 40 * 1024 * 1024;
const builtinProviderDefaults = {
  opencode: { name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', model: defaultModel, requestStyle: 'openai' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', requestStyle: 'openai' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', requestStyle: 'anthropic' },
  googlegemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', requestStyle: 'openai' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', requestStyle: 'openai' },
  mistralai: { name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', requestStyle: 'openai' },
  perplexity: { name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', model: 'sonar', requestStyle: 'openai' },
  huggingface: { name: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', model: 'deepseek-ai/DeepSeek-V4-Pro:fastest', requestStyle: 'openai' },
  alibabacloud: { name: 'Alibaba Cloud', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-flash', requestStyle: 'openai' },
  qwen: { name: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-flash', requestStyle: 'openai' },
  moonshotai: { name: 'Moonshot AI', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5', requestStyle: 'openai' },
  baidu: { name: 'Baidu ERNIE', baseUrl: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-turbo-128k', requestStyle: 'openai' },
  minimax: { name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.7', requestStyle: 'openai' },
  xiaomi: { name: 'Xiaomi MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', requestStyle: 'openai' },
  meta: { name: 'Meta Llama API', baseUrl: 'https://api.llama.com/compat/v1', model: 'Llama-4-Maverick-17B-128E-Instruct-FP8', requestStyle: 'openai' },
  x: { name: 'xAI', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.5', requestStyle: 'openai' },
  replicate: { name: 'Replicate', baseUrl: 'https://api.replicate.com/v1', model: '', requestStyle: 'unsupported' },
  databricks: { name: 'Databricks', baseUrl: '', model: '', requestStyle: 'unsupported' },
  cursor: { name: 'Cursor', baseUrl: '', model: '', requestStyle: 'unsupported' },
  windsurf: { name: 'Windsurf', baseUrl: '', model: '', requestStyle: 'unsupported' },
};

function loadEnvFiles() {
  const values = {};
  for (const directory of configSearchDirs) {
    for (const fileName of ['.env.local', '.env']) {
      try {
        const contents = requireFileSync(path.join(directory, fileName));
        for (const line of contents.split(/\r?\n/)) {
          const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
          if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
      } catch {
        // Optional .env files are intentionally ignored.
      }
    }
  }
  return values;
}

function loadLocalJsonConfig() {
  for (const directory of configSearchDirs) {
    for (const fileName of ['config.local.json', 'config.json']) {
      try {
        return JSON.parse(readFileSync(path.join(directory, fileName), 'utf8'));
      } catch {
        // Optional local JSON configuration is ignored when it is missing or invalid.
      }
    }
  }
  return {};
}

function requireFileSync(filePath) {
  // Keep startup dependency-free; configuration files contain only plain text.
  return readFileSync(filePath, 'utf8');
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, status, message, detail) {
  sendJson(res, status, { ok: false, error: message, detail: detail || undefined });
}

async function readBody(req, limit = maxUploadBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error(`请求超过 ${Math.round(limit / 1024 / 1024)} MB 限制`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req, 8 * 1024 * 1024);
  return JSON.parse(raw.toString('utf8') || '{}');
}

function getProviderRecord(providerId = 'opencode') {
  const current = loadLocalJsonConfig();
  const configuredDefault = current.opencode || current.openCode || current;
  const customProviders = Array.isArray(current.providers) ? current.providers : [];
  const custom = customProviders.find((provider) => String(provider.id || '') === String(providerId));
  if (custom) {
    return {
      id: String(custom.id),
      name: String(custom.name || custom.id),
      baseUrl: String(custom.baseUrl || '').replace(/\/$/, ''),
      model: String(custom.model || defaultModel),
      apiKey: String(custom.apiKey || ''),
      custom: true,
      requestStyle: 'openai',
    };
  }
  const builtin = builtinProviderDefaults[providerId] || builtinProviderDefaults.opencode;
  const providerKeys = current.providerKeys && typeof current.providerKeys === 'object' ? current.providerKeys : {};
  const providerModels = current.providerModels && typeof current.providerModels === 'object' ? current.providerModels : {};
  return {
    id: builtin === builtinProviderDefaults.opencode ? 'opencode' : String(providerId),
    name: builtin.name,
    baseUrl: (builtin === builtinProviderDefaults.opencode ? (process.env.OPENCODE_BASE_URL || config.OPENCODE_BASE_URL || configuredDefault.baseUrl || builtin.baseUrl) : builtin.baseUrl).replace(/\/$/, ''),
    model: providerModels[providerId] || (builtin === builtinProviderDefaults.opencode ? (process.env.OPENCODE_MODEL || config.OPENCODE_MODEL || configuredDefault.model || builtin.model) : builtin.model),
    apiKey: builtin === builtinProviderDefaults.opencode ? (process.env.OPENCODE_API_KEY || config.OPENCODE_API_KEY || configuredDefault.apiKey || serverApiKey) : String(providerKeys[providerId] || ''),
    custom: false,
    requestStyle: builtin.requestStyle,
  };
}

function getRequestProvider(req) {
  const providerId = String(req.headers['x-provider-id'] || 'opencode').trim() || 'opencode';
  return getProviderRecord(providerId);
}

function getApiKey(req) {
  return getRequestProvider(req).apiKey;
}

function providerAuthHeaders(provider, apiKey) {
  if (provider?.requestStyle === 'anthropic') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  return { authorization: `Bearer ${apiKey}` };
}

function getProviderBaseUrl(req) {
  const provider = getRequestProvider(req);
  const requested = req.headers['x-provider-base-url'];
  if (!requested) return provider.baseUrl || baseUrl;
  try {
    const parsed = new URL(requested);
    if (!['https:', 'http:'].includes(parsed.protocol)) return provider.baseUrl || baseUrl;
    return requested.replace(/\/$/, '');
  } catch {
    return provider.baseUrl || baseUrl;
  }
}

function getProviderList() {
  const current = loadLocalJsonConfig();
  const customProviders = Array.isArray(current.providers) ? current.providers : [];
  return [
    ...Object.keys(builtinProviderDefaults).map((id) => {
      const provider = getProviderRecord(id);
      return { id, name: provider.name, baseUrl: provider.baseUrl, model: provider.model, configured: Boolean(provider.apiKey), custom: false, requestStyle: provider.requestStyle };
    }),
    ...customProviders.map((provider) => ({
      id: String(provider.id || ''),
      name: String(provider.name || provider.id || '自定义供应商'),
      baseUrl: String(provider.baseUrl || '').replace(/\/$/, ''),
      model: String(provider.model || ''),
      configured: Boolean(provider.apiKey),
      custom: true,
      requestStyle: 'openai',
    })).filter((provider) => provider.id && provider.baseUrl),
  ];
}

function writeLocalJsonConfig(nextConfig) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'config.local.json'), `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

function saveProviderApiKey(providerId, apiKey) {
  const normalizedId = String(providerId || '').trim();
  const normalizedKey = String(apiKey || '').trim();
  if (!normalizedId || !normalizedKey) throw new Error('供应商和 API 密钥不能为空');
  if (!builtinProviderDefaults[normalizedId] && normalizedId !== 'opencode') {
    const current = loadLocalJsonConfig();
    const custom = Array.isArray(current.providers) ? current.providers.find((provider) => String(provider.id || '') === normalizedId) : null;
    if (!custom) throw new Error('供应商不存在');
    const providers = current.providers.map((provider) => String(provider.id || '') === normalizedId ? { ...provider, apiKey: normalizedKey } : provider);
    writeLocalJsonConfig({ ...current, providers });
    return;
  }
  const current = loadLocalJsonConfig();
  if (normalizedId === 'opencode') {
    if (current.opencode && typeof current.opencode === 'object') writeLocalJsonConfig({ ...current, opencode: { ...current.opencode, apiKey: normalizedKey } });
    else if (current.openCode && typeof current.openCode === 'object') writeLocalJsonConfig({ ...current, openCode: { ...current.openCode, apiKey: normalizedKey } });
    else writeLocalJsonConfig({ ...current, apiKey: normalizedKey });
    return;
  }
  const providerKeys = current.providerKeys && typeof current.providerKeys === 'object' ? { ...current.providerKeys } : {};
  providerKeys[normalizedId] = normalizedKey;
  writeLocalJsonConfig({ ...current, providerKeys });
}

function normalizeCustomProvider(input) {
  const name = String(input.name || '').trim().slice(0, 40);
  const model = String(input.model || '').trim().slice(0, 160);
  const apiKey = String(input.apiKey || '').trim();
  const rawBaseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
  if (!name || !model || !apiKey) throw new Error('供应商名称、API 地址、模型和 API 密钥都不能为空');
  let parsed;
  try { parsed = new URL(rawBaseUrl); } catch { throw new Error('API 地址格式无效'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('API 地址必须使用 http 或 https');
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name, baseUrl: rawBaseUrl, model, apiKey };
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return normalizeText(decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n')));
}

function joinPdfTokens(tokens) {
  let output = '';
  for (const rawToken of tokens) {
    const token = String(rawToken || '').replace(/\s+/g, ' ').trim();
    if (!token) continue;
    if (!output) {
      output = token;
      continue;
    }
    const noSpaceBefore = /^[,.;:!?%。，！？、；：％）》」』”’]/u.test(token) || /^[)\]}]/u.test(token);
    const noSpaceAfter = /[(\[{【《「『“‘]$/u.test(output);
    const cjkBoundary = /[\u3400-\u9fff]$/u.test(output) || /^[\u3400-\u9fff]/u.test(token);
    output += noSpaceBefore || noSpaceAfter || cjkBoundary ? token : ` ${token}`;
  }
  return output.trim();
}

function joinPdfLines(lines) {
  let output = '';
  for (const line of lines) {
    const text = String(line.text || '').trim();
    if (!text) continue;
    if (!output) output = text;
    else {
      const noSpace = /[\u3400-\u9fff]$/u.test(output) || /^[\u3400-\u9fff]/u.test(text) || /[-/]$/u.test(output);
      output += noSpace ? text : ` ${text}`;
    }
  }
  return output.trim();
}

function normalizePdfItem(item) {
  const text = String(item?.str || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\uFB00/g, 'ff').replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl').replace(/\uFB03/g, 'ffi').replace(/\uFB04/g, 'ffl').replace(/\uFB05/g, 'ft').replace(/\uFB06/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const fontSize = Math.max(1, Math.abs(Number(transform[3]) || Number(item.height) || 10));
  const x = Number(transform[4]) || 0;
  const y = Number(transform[5]) || 0;
  const width = Math.max(0, Number(item.width) || 0);
  return { text, x, y, width, right: x + width, fontSize };
}

function splitPdfLineSegments(items) {
  const usable = items.filter(Boolean).sort((a, b) => a.x - b.x);
  if (!usable.length) return [];
  const averageFontSize = usable.reduce((sum, item) => sum + item.fontSize, 0) / usable.length;
  const gapThreshold = Math.max(7, averageFontSize * 1.1);
  const segments = [];
  let current = [];
  let previous = null;
  for (const item of usable) {
    const gap = previous ? item.x - previous.right : 0;
    if (current.length && gap > gapThreshold) {
      segments.push({ x: current[0].x, items: current, text: joinPdfTokens(current.map((part) => part.text)) });
      current = [];
    }
    current.push(item);
    previous = item;
  }
  if (current.length) segments.push({ x: current[0].x, items: current, text: joinPdfTokens(current.map((part) => part.text)) });
  return segments.filter((segment) => segment.text);
}

function splitPdfTableSegments(items) {
  return items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((item) => ({ x: item.x, items: [item], text: item.text }))
    .filter((segment) => segment.text);
}

function groupPdfTextItems(items) {
  const normalized = items.map(normalizePdfItem).filter(Boolean);
  const lines = [];
  for (const item of normalized) {
    const tolerance = Math.max(2, item.fontSize * 0.42);
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!line) {
      line = { y: item.y, fontSize: item.fontSize, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.fontSize = Math.max(line.fontSize, item.fontSize);
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line, index) => {
      line.items.sort((a, b) => a.x - b.x);
      line.segments = splitPdfLineSegments(line.items);
      line.tableSegments = splitPdfTableSegments(line.items);
      line.text = joinPdfTokens(line.items.map((item) => item.text));
      line.index = index;
      return line;
    })
    .filter((line) => line.text);
}

function clusterPdfAnchors(rows) {
  const clusters = [];
  for (const row of rows) {
    for (const segment of row.tableSegments || row.segments) {
      let cluster = clusters.find((candidate) => Math.abs(candidate.x - segment.x) <= 9);
      if (!cluster) {
        cluster = { x: segment.x, count: 0, rows: new Set() };
        clusters.push(cluster);
      }
      cluster.x = (cluster.x * cluster.count + segment.x) / (cluster.count + 1);
      cluster.count += 1;
      cluster.rows.add(row.index);
    }
  }
  return clusters.sort((a, b) => a.x - b.x);
}

function buildPdfTableRows(rows, anchors) {
  const logicalRows = [];
  rows.forEach((row) => {
    const cells = Array.from({ length: anchors.length }, () => []);
    const segments = row.tableSegments || row.segments;
    for (const segment of segments) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      anchors.forEach((anchor, index) => {
        const distance = Math.abs(anchor.x - segment.x);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      cells[bestIndex].push(segment.text);
    }
    const values = cells.map((cell) => joinPdfTokens(cell));
    const previous = logicalRows[logicalRows.length - 1];
    const nonEmptyCount = values.filter(Boolean).length;
    const continuation = previous && segments.length === 1 && nonEmptyCount === 1 && previous.filter(Boolean).length >= 2;
    if (continuation) {
      values.forEach((value, index) => {
        if (value) previous[index] = joinPdfTokens([previous[index], value]);
      });
    } else if (values.some(Boolean)) {
      logicalRows.push(values);
    }
  });
  return logicalRows;
}

function isPdfTableCaption(text) {
  return /^\s*(?:table|tab\.)\s*\d+\b/i.test(String(text || ''));
}

function isPdfScalarCell(text) {
  return /\d/.test(String(text || '')) && /^[\s\d.,%+\-−():/A-Za-z]+$/u.test(String(text || ''));
}

function detectPdfWeightingTable(lines) {
  const captionIndex = lines.findIndex((line) => /^\s*Table\s+1\s*:\s*Weighting schemes/i.test(line.text));
  if (captionIndex < 1) return [];
  const headerIndex = lines.slice(0, captionIndex).findLastIndex((line) => /market cap weighting/i.test(line.text) && /liquidity weighting/i.test(line.text));
  if (headerIndex < 0 || headerIndex >= captionIndex - 1) return [];
  const header = ['', ...lines[headerIndex].items.slice(0, 2).map((item) => item.text)];
  const values = [[], [], []];
  lines.slice(headerIndex + 1, captionIndex).forEach((line) => {
    line.items.forEach((item) => {
      const column = item.x < 210 ? 0 : item.x < 335 ? 1 : 2;
      values[column].push(item.text);
    });
  });
  const row = values.map((cell) => joinPdfTokens(cell));
  if (!row.some(Boolean)) return [];
  return [{ startIndex: headerIndex, endIndex: captionIndex - 1, rows: [header, row], columnCount: 3 }];
}

function detectPdfTables(lines) {
  const candidateIndexes = lines
    .filter((line) => line.tableSegments.length >= 2)
    .filter((line) => !isPdfTableCaption(line.text))
    .map((line) => line.index);
  const sequences = [];
  let sequence = [];
  let previousCandidate = null;
  for (const index of candidateIndexes) {
    if (!sequence.length) sequence = [index];
    else {
      const gapLines = lines.slice(previousCandidate + 1, index);
      const baseRows = sequence.filter((rowIndex) => lines[rowIndex].tableSegments.length >= 2).map((rowIndex) => lines[rowIndex]);
      const anchors = baseRows.length >= 2 ? clusterPdfAnchors(baseRows) : [];
      const continuation = gapLines.length > 0 && gapLines.length <= 3 && baseRows.length >= 3 && anchors.length >= 2 && gapLines.every((line) => line.tableSegments.length === 1 && anchors.some((anchor) => Math.abs(anchor.x - line.tableSegments[0].x) <= 14));
      if (index === previousCandidate + 1 || continuation) sequence.push(...gapLines.map((line) => line.index), index);
      else { sequences.push(sequence); sequence = [index]; }
    }
    previousCandidate = index;
  }
  if (sequence.length) sequences.push(sequence);

  const detected = sequences.flatMap((indexes) => {
    const baseIndexes = indexes.filter((index) => lines[index].tableSegments.length >= 2);
    if (baseIndexes.length < 2) return [];
    const rows = indexes.map((index) => lines[index]);
    const baseRows = baseIndexes.map((index) => lines[index]);
    const clusters = clusterPdfAnchors(baseRows);
    const minimumCount = Math.max(2, Math.ceil(baseIndexes.length * 0.45));
    const anchors = clusters.filter((cluster) => cluster.count >= minimumCount).map((cluster) => ({ x: cluster.x }));
    if (anchors.length < 2 || anchors.length > 24) return [];
    const coverage = baseRows.reduce((sum, row) => {
      const matched = anchors.filter((anchor) => (row.tableSegments || row.segments).some((segment) => Math.abs(segment.x - anchor.x) <= 11)).length;
      return sum + (matched >= Math.min(2, anchors.length) ? 1 : 0);
    }, 0) / baseRows.length;
    if (coverage < 0.75) return [];
    const rowGaps = baseRows.slice(1).map((row, index) => baseRows[index].y - row.y).filter((gap) => gap > 0);
    const denseRows = rowGaps.length > 0 && rowGaps.filter((gap) => gap <= 20).length / rowGaps.length >= 0.65;
    const numericGrid = baseRows.reduce((sum, row) => sum + (row.tableSegments || row.segments).filter((segment) => isPdfScalarCell(segment.text)).length, 0) / baseRows.length >= Math.max(1, anchors.length * 0.3);
    const nearbyText = lines.slice(Math.max(0, indexes[0] - 3), Math.min(lines.length, indexes[indexes.length - 1] + 4)).map((line) => line.text).join(' ');
    const hasCaption = /\b(?:table|tab\.)\s*\d+/i.test(nearbyText) || /表\s*\d+/u.test(nearbyText);
    if (baseIndexes.length < 3 || (!numericGrid && baseIndexes.length < 4)) return [];
    if (!hasCaption && !(denseRows && anchors.length >= 3 && baseIndexes.length >= 4 && numericGrid)) return [];
    return [{ startIndex: indexes[0], endIndex: indexes[indexes.length - 1], rows: buildPdfTableRows(rows, anchors), columnCount: anchors.length }];
  });
  return [...detectPdfWeightingTable(lines), ...detected];
}

function groupPdfParagraphLines(lines) {
  const groups = [];
  let current = [];
  for (const line of lines) {
    const previous = current[current.length - 1];
    const gap = previous ? previous.y - line.y : 0;
    const lineLimit = Math.max(16, Math.max(previous?.fontSize || 10, line.fontSize) * 2.1);
    if (current.length && gap > lineLimit) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  return groups.map((group) => joinPdfLines(group)).filter(Boolean);
}

async function extractPdfDocument(buffer) {
  try {
    const pdf = await getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true, isEvalSupported: false }).promise;
    const blocks = [];
    const paragraphs = [];
    const pagesText = [];
    let paragraphNumber = 0;
    let tableNumber = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const lines = groupPdfTextItems(content.items || []).filter((line) => !(line.y < 45 && /^\d{1,3}$/.test(line.text.trim())));
      const tables = detectPdfTables(lines);
      const tableStarts = new Map(tables.map((table) => [table.startIndex, table]));
      const tableLineIndexes = new Set(tables.flatMap((table) => Array.from({ length: table.endIndex - table.startIndex + 1 }, (_, offset) => table.startIndex + offset)));
      const pageBlocks = [];
      let lineIndex = 0;
      while (lineIndex < lines.length) {
        const table = tableStarts.get(lineIndex);
        if (table) {
          tableNumber += 1;
          const tableId = `table-${tableNumber}`;
          const tableRows = table.rows.map((cells, rowIndex) => ({
            header: rowIndex === 0,
            cells: cells.map((text, columnIndex) => ({ id: `${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`, text, row: rowIndex + 1, column: columnIndex + 1 })),
          }));
          const tableBlock = { type: 'table', id: tableId, page: pageNumber, columns: table.columnCount, rows: tableRows };
          pageBlocks.push(tableBlock);
          for (const row of tableRows) {
            for (const cell of row.cells) {
              if (cell.text) paragraphs.push({ id: cell.id, text: cell.text, page: pageNumber, kind: 'table-cell', tableId });
            }
          }
          lineIndex = table.endIndex + 1;
          continue;
        }
        if (tableLineIndexes.has(lineIndex)) { lineIndex += 1; continue; }
        const normalLines = [lines[lineIndex]];
        let nextIndex = lineIndex + 1;
        while (nextIndex < lines.length && !tableStarts.has(nextIndex) && !tableLineIndexes.has(nextIndex)) {
          const previous = lines[nextIndex - 1];
          const next = lines[nextIndex];
          const gap = previous.y - next.y;
          if (gap > Math.max(16, Math.max(previous.fontSize, next.fontSize) * 2.1)) break;
          normalLines.push(next);
          nextIndex += 1;
        }
        for (const text of groupPdfParagraphLines(normalLines)) {
          paragraphNumber += 1;
          const paragraph = { id: `p-${paragraphNumber}`, text, page: pageNumber, kind: 'paragraph' };
          paragraphs.push(paragraph);
          pageBlocks.push({ type: 'paragraph', id: paragraph.id, page: pageNumber, text });
        }
        lineIndex = nextIndex;
      }
      blocks.push(...pageBlocks);
      pagesText.push(pageBlocks.map((block) => block.type === 'table' ? block.rows.map((row) => row.cells.map((cell) => cell.text).join('\t')).join('\n') : block.text).join('\n\n'));
    }
    const text = normalizeText(pagesText.join('\n\n'));
    if (!text && !paragraphs.length) throw new Error('PDF 中没有可提取的文本');
    return { text, paragraphs, blocks, tables: blocks.filter((block) => block.type === 'table'), pageCount: pdf.numPages, structured: true };
  } catch (error) {
    const fallback = await pdfParse(buffer);
    const text = normalizeText(fallback.text);
    const paragraphs = splitParagraphs(text).map((value, index) => ({ id: `p-${index + 1}`, text: value, page: null, kind: 'paragraph' }));
    return { text, paragraphs, blocks: paragraphs.map((paragraph) => ({ type: 'paragraph', id: paragraph.id, page: paragraph.page, text: paragraph.text })), tables: [], pageCount: null, structured: false, warning: `PDF 结构化解析失败，已退回纯文本：${error.message}` };
  }
}

function splitParagraphs(value) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n|(?<=[。！？.!?])\s{2,}/)
    .map((text) => text.replace(/\n+/g, ' ').trim())
    .filter((text) => text.length > 0);
}

async function extractPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));
  const slides = [];
  for (const name of names) {
    const xml = await zip.files[name].async('string');
    const slideText = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)]
      .map((match) => decodeEntities(match[1]))
      .join(' ')
      .trim();
    if (slideText) slides.push(slideText);
  }
  return slides.join('\n\n');
}

async function extractXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = zip.files['xl/sharedStrings.xml'] ? await zip.files['xl/sharedStrings.xml'].async('string') : '';
  const sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/gi)].map((match) => [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => decodeEntities(part[1])).join(''));
  const sheetNames = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/sheet(\d+)/i)?.[1]) - Number(b.match(/sheet(\d+)/i)?.[1]));
  const sheets = [];
  for (const [sheetIndex, name] of sheetNames.entries()) {
    const xml = await zip.files[name].async('string');
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attributes = cellMatch[1];
        const content = cellMatch[2];
        const type = attributes.match(/\bt="([^"]+)"/)?.[1];
        const raw = content.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] || content.match(/<t[^>]*>([\s\S]*?)<\/t>/i)?.[1] || '';
        const value = type === 's' ? sharedStrings[Number(raw)] || '' : decodeEntities(raw);
        cells.push(value);
      }
      if (cells.some(Boolean)) rows.push(cells.join('\t'));
    }
    if (rows.length) sheets.push(`【Sheet ${sheetIndex + 1}】\n${rows.join('\n')}`);
  }
  return sheets.join('\n\n');
}

async function extractText(buffer, fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (['.txt', '.md', '.csv', '.tsv', '.json'].includes(extension)) return normalizeText(buffer.toString('utf8'));
  if (['.html', '.htm'].includes(extension)) return stripHtml(buffer.toString('utf8'));
  if (extension === '.docx') return normalizeText((await mammoth.extractRawText({ buffer })).value);
  if (extension === '.pdf') return normalizeText((await pdfParse(buffer)).text);
  if (extension === '.xlsx') return normalizeText(await extractXlsx(buffer));
  if (extension === '.xls') throw new Error('旧版 XLS 暂不支持，请另存为 XLSX 后再导入');
  if (extension === '.pptx') return normalizeText(await extractPptx(buffer));
  throw new Error(`暂不支持解析 ${extension || '该文件类型'}，请先转换为 DOCX、PDF、TXT 或 Markdown`);
}

function makeRequestUnits(paragraphs) {
  return paragraphs
    .map((paragraph) => ({ id: String(paragraph.id), text: normalizeText(paragraph.text) }))
    .filter((unit) => unit.text);
}

function parseModelContent(payload) {
  if (Array.isArray(payload?.content)) return payload.content.map((item) => item?.text || item?.content || '').join('');
  const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? '';
  if (Array.isArray(content)) return content.map((item) => item.text || item.content || '').join('');
  return String(content);
}

function parseTranslationItems(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed.map((item) => ({ id: String(item.id ?? ''), translation: String(item.translation ?? item.translated ?? item.text ?? '') }));
    } catch {
      // Fall through to line-based parsing.
    }
  }
  return cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^([^\t:：]+)[\t:：]\s*(.*)$/);
    return { id: match?.[1]?.trim() || '', translation: match?.[2]?.trim() || line };
  });
}

function makeTranslationPrompt(systemPrompt, sourceLanguage, targetLanguage, units) {
  const items = units.map(({ id, text }) => ({ id, text }));
  const prefix = systemPrompt || defaultSystemPrompt;
  return `${prefix ? `${prefix}\n\n` : ''}请将下面的 ${sourceLanguage || '原文'} 翻译为 ${targetLanguage || '中文'}。\n只返回 JSON 数组，不要 Markdown 代码块，不要解释。数组每一项必须包含 id 和 translation，id 必须原样保留。保留段落语气、专有名词、数字和标点。\n\n${JSON.stringify(items)}`;
}

async function callModel({ apiKey, provider, providerBaseUrl, model, systemPrompt, sourceLanguage, targetLanguage, units, signal }) {
  if (provider?.requestStyle === 'unsupported') throw new Error('该供应商没有可直接调用的通用文本接口，请配置自定义 OpenAI 兼容地址');
  const isAnthropic = provider?.requestStyle === 'anthropic';
  const prompt = makeTranslationPrompt(isAnthropic ? '' : systemPrompt, sourceLanguage, targetLanguage, units);
  const response = await fetch(`${providerBaseUrl}${isAnthropic ? '/messages' : '/chat/completions'}`, {
    method: 'POST',
    signal,
    headers: isAnthropic
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
      : { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(isAnthropic ? {
      model: model || 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: systemPrompt || defaultSystemPrompt,
      messages: [{ role: 'user', content: prompt }],
    } : {
      model: model || defaultModel,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch { /* plain text */ }
    throw new Error(`模型请求失败 (${response.status})：${detail.slice(0, 500)}`);
  }
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('模型返回了无法解析的响应'); }
  const content = parseModelContent(payload);
  const items = parseTranslationItems(content);
  if (!items.length) throw new Error('模型没有返回可识别的译文');
  return items;
}

async function waitForRpm(windowStarts, rpm) {
  const now = Date.now();
  while (windowStarts.length && windowStarts[0] <= now - 60_000) windowStarts.shift();
  if (windowStarts.length >= rpm) {
    const delay = Math.max(0, windowStarts[0] + 60_000 - Date.now() + 30);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return waitForRpm(windowStarts, rpm);
  }
  windowStarts.push(Date.now());
}

function writeEvent(res, event, payload) {
  if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function handleTranslation(req, res) {
  const apiKey = getApiKey(req);
  if (!apiKey) return sendError(res, 401, '未配置 API 密钥', '请在 config.local.json 中填写 apiKey，或设置 OPENCODE_API_KEY 环境变量');
  const input = await readJson(req);
  const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs : [];
  if (!paragraphs.length) return sendError(res, 400, '没有可翻译的段落');
  const maxRpm = Math.min(600, Math.max(1, Number(input.maxRpm) || 10));
  const maxConcurrency = Math.min(20, Math.max(1, Number(input.maxConcurrency) || 1));
  const retries = Math.min(5, Math.max(0, Number(input.retries) || 3));
  const units = makeRequestUnits(paragraphs);
  const controller = new AbortController();
  const provider = getRequestProvider(req);
  const providerBaseUrl = getProviderBaseUrl(req);
  let closed = false;
  req.on('close', () => { closed = true; controller.abort(); });

  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  writeEvent(res, 'meta', { units: units.length, maxRpm, maxConcurrency, model: input.model || provider.model || defaultModel, provider: provider.name });
  const starts = [];
  try {
    let nextUnitIndex = 0;
    let completedUnits = 0;
    let inFlight = 0;
    const emitUnit = async (unitIndex) => {
      if (closed) return;
      await waitForRpm(starts, maxRpm);
      if (closed) return;
      const requestedUnit = units[unitIndex];
      inFlight += 1;
      writeEvent(res, 'unit-start', { id: requestedUnit.id, unit: unitIndex + 1, units: units.length, inFlight });
      try {
        let result;
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            result = await callModel({ apiKey, provider, providerBaseUrl, model: input.model || provider.model, systemPrompt: input.systemPrompt, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, units: [requestedUnit], signal: controller.signal });
            break;
          } catch (error) {
            lastError = error;
            if (controller.signal.aborted) throw error;
            if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * 2 ** attempt, 8000)));
          }
        }
        if (!result) throw lastError || new Error('模型请求失败');
        const item = result.find((candidate) => String(candidate.id) === requestedUnit.id) || (result.length === 1 ? result[0] : null);
        if (!item?.translation) throw new Error(`模型未返回段落 ${requestedUnit.id} 的译文`);
        writeEvent(res, 'paragraph', { id: requestedUnit.id, translation: item.translation });
        completedUnits += 1;
        writeEvent(res, 'progress', { unit: completedUnits, sourceUnit: unitIndex + 1, units: units.length, percent: Math.round((completedUnits / units.length) * 100), rpmUsed: starts.length });
      } finally {
        inFlight -= 1;
      }
    };
    const workers = Array.from({ length: Math.min(maxConcurrency, units.length) }, () => (async () => {
      while (!closed) {
        const unitIndex = nextUnitIndex;
        nextUnitIndex += 1;
        if (unitIndex >= units.length) return;
        await emitUnit(unitIndex);
      }
    })());
    await Promise.all(workers);
    if (!closed) {
      writeEvent(res, 'done', { units: units.length, paragraphs: paragraphs.length });
      res.end();
    }
  } catch (error) {
    controller.abort();
    if (!closed) { writeEvent(res, 'error', { message: error.name === 'AbortError' ? '请求已取消' : error.message }); res.end(); }
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/providers' && req.method === 'GET') return sendJson(res, 200, { ok: true, providers: getProviderList() });
  if (url.pathname === '/api/provider-key' && req.method === 'POST') {
    try {
      const input = await readJson(req);
      saveProviderApiKey(input.providerId, input.apiKey);
      return sendJson(res, 200, { ok: true, providerId: String(input.providerId || '') });
    } catch (error) {
      return sendError(res, 400, 'API 密钥保存失败', error.message);
    }
  }
  if (url.pathname === '/api/providers' && req.method === 'POST') {
    try {
      const input = await readJson(req);
      const provider = normalizeCustomProvider(input);
      const current = loadLocalJsonConfig();
      const providers = Array.isArray(current.providers) ? current.providers.filter((item) => String(item.id || '') !== provider.id) : [];
      writeLocalJsonConfig({ ...current, providers: [...providers, provider] });
      return sendJson(res, 201, { ok: true, provider: { ...provider, apiKey: undefined, configured: true, custom: true } });
    } catch (error) {
      return sendError(res, 400, '自定义供应商保存失败', error.message);
    }
  }
  if (url.pathname.startsWith('/api/providers/') && req.method === 'DELETE') {
    const providerId = decodeURIComponent(url.pathname.slice('/api/providers/'.length)).trim();
    if (!providerId || builtinProviderDefaults[providerId]) return sendError(res, 400, '预置供应商不可删除');
    try {
      const current = loadLocalJsonConfig();
      const providers = Array.isArray(current.providers) ? current.providers : [];
      if (!providers.some((provider) => String(provider.id || '') === providerId)) return sendError(res, 404, '供应商不存在');
      writeLocalJsonConfig({ ...current, providers: providers.filter((provider) => String(provider.id || '') !== providerId) });
      return sendJson(res, 200, { ok: true, providerId });
    } catch (error) {
      return sendError(res, 400, '供应商删除失败', error.message);
    }
  }
  if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, provider: 'OpenCode Zen', baseUrl, model: defaultModel, configured: Boolean(getApiKey(req)) });
  if (url.pathname === '/api/prompt-preview' && req.method === 'POST') {
    try {
      const input = await readJson(req);
      const provider = getRequestProvider(req);
      const suppliedUnits = makeRequestUnits(Array.isArray(input.paragraphs) ? input.paragraphs : []).slice(0, 1);
      const units = suppliedUnits.length ? suppliedUnits : [{ id: 'p-1', text: '{{此处替换为待翻译段落}}' }];
      const systemPrompt = String(input.systemPrompt || defaultSystemPrompt);
      const userPrompt = makeTranslationPrompt(provider.requestStyle === 'anthropic' ? '' : systemPrompt, input.sourceLanguage, input.targetLanguage, units);
      return sendJson(res, 200, { ok: true, provider: provider.name, providerStyle: provider.requestStyle, systemPrompt: provider.requestStyle === 'anthropic' ? systemPrompt : '', userPrompt });
    } catch (error) {
      return sendError(res, 400, '提示词预览失败', error.message);
    }
  }
  if (url.pathname === '/api/models' && req.method === 'GET') {
    const provider = getRequestProvider(req);
    const apiKey = provider.apiKey;
    if (!apiKey) return sendError(res, 401, '未配置 API 密钥');
    const response = await fetch(`${getProviderBaseUrl(req)}/models`, { headers: providerAuthHeaders(provider, apiKey) });
    const text = await response.text();
    if (!response.ok) return sendError(res, response.status, '模型列表请求失败', text.slice(0, 500));
    return sendJson(res, 200, JSON.parse(text));
  }
  if (url.pathname === '/api/validate' && req.method === 'POST') {
    const provider = getRequestProvider(req);
    const apiKey = provider.apiKey;
    if (!apiKey) return sendError(res, 401, '未配置 API 密钥');
    const response = await fetch(`${getProviderBaseUrl(req)}/models`, { headers: providerAuthHeaders(provider, apiKey) });
    const text = await response.text();
    if (!response.ok) return sendError(res, response.status, '密钥检测失败', text.slice(0, 500));
    return sendJson(res, 200, { ok: true, models: JSON.parse(text).data || [] });
  }
  if (url.pathname === '/api/extract' && req.method === 'POST') {
    const fileName = decodeURIComponent(req.headers['x-file-name'] || 'document.txt');
    try {
      const buffer = await readBody(req);
      if (path.extname(fileName).toLowerCase() === '.pdf') {
        const document = await extractPdfDocument(buffer);
        return sendJson(res, 200, { ok: true, name: fileName, format: 'pdf', ...document });
      }
      const text = await extractText(buffer, fileName);
      const paragraphs = splitParagraphs(text).map((value, index) => ({ id: `p-${index + 1}`, text: value, page: null, kind: 'paragraph' }));
      return sendJson(res, 200, { ok: true, name: fileName, text, paragraphs, blocks: paragraphs.map((paragraph) => ({ type: 'paragraph', id: paragraph.id, page: paragraph.page, text: paragraph.text })), tables: [], structured: false });
    } catch (error) {
      return sendError(res, 422, '文件解析失败', error.message);
    }
  }
  if (url.pathname === '/api/translate' && req.method === 'POST') {
    try { return await handleTranslation(req, res); } catch (error) { return sendError(res, 400, '翻译请求无效', error.message); }
  }
  return serveStatic(url.pathname, res);
}

async function serveStatic(pathname, res) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const normalizedRelative = relative.replace(/\\/g, '/').toLowerCase();
  const blockedStaticFiles = new Set(['config.local.json', 'config.json', '.env', '.env.local']);
  if (blockedStaticFiles.has(normalizedRelative) || normalizedRelative.split('/').some((segment) => segment.startsWith('.'))) return sendError(res, 403, '禁止访问');
  const filePath = path.resolve(rootDir, relative);
  if (!filePath.startsWith(rootDir) || filePath.includes('..')) return sendError(res, 403, '禁止访问');
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not a file');
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'content-type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch {
    sendError(res, 404, '页面不存在');
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (!res.headersSent) sendError(res, 500, '服务器错误', error.message);
    else res.end();
  });
});

server.listen(port, '127.0.0.1', () => console.log(`EchoLang 翻译工具已启动：http://localhost:${port}`));
