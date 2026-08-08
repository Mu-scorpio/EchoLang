import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { renderLatexFormula } from './math-renderer.mjs';

const parser = new DOMParser();
const terminalPunctuation = /[.!?。！？]["'’”》」』】)]*$/u;
const continuationStart = /^(?:and|or|but|because|which|that|where|whose|while|when|with|without|within|by|for|from|in|into|of|on|than|to|under|using|via|as|is|are|was|were|has|have|had|can|could|may|might|must|should|would|thus|therefore|however|respectively|i\.e\.|e\.g\.)\b/i;

function elements(node, localName) {
  return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1 && (!localName || child.localName === localName));
}

function descendants(node, localName) {
  return Array.from(node?.getElementsByTagName('*') || []).filter((child) => child.localName === localName);
}

function attribute(node, name, prefix = 'w') {
  if (!node) return '';
  return node.getAttribute(`${prefix}:${name}`) || node.getAttribute(name) || '';
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\uFB00/g, 'ff').replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi').replace(/\uFB04/g, 'ffl').replace(/\u00ad/g, '')
    .replace(/([A-Za-z]{2,})-\s+([a-z]{2,})\b/g, '$1$2')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s+([,.;:!?%\)])|([\(])\s+/g, '$1$2')
    .trim();
}

function textContentInOrder(node) {
  const pieces = [];
  const visit = (current) => {
    if (!current) return;
    if (current.nodeType === 1 && current.localName === 't') pieces.push(current.textContent || '');
    else if (current.nodeType === 1 && current.localName === 'tab') pieces.push('\t');
    else if (current.nodeType === 1 && current.localName === 'br') pieces.push(' ');
    else Array.from(current.childNodes || []).forEach(visit);
  };
  visit(node);
  return normalizeExtractedText(pieces.join(''));
}

function firstDescendant(node, localName) {
  return descendants(node, localName)[0] || null;
}

function paragraphMetadata(node) {
  const properties = firstDescendant(node, 'pPr');
  const style = attribute(firstDescendant(properties, 'pStyle'), 'val');
  const indent = firstDescendant(properties, 'ind');
  const spacing = firstDescendant(properties, 'spacing');
  const justification = attribute(firstDescendant(properties, 'jc'), 'val');
  const extent = firstDescendant(node, 'extent');
  const drawingWidth = Number(extent?.getAttribute('cx') || 0);
  const drawingHeight = Number(extent?.getAttribute('cy') || 0);
  const fontSizes = descendants(node, 'sz').map((size) => Number(attribute(size, 'val') || 0)).filter(Number.isFinite);
  return {
    style,
    left: Number(attribute(indent, 'left') || 0),
    firstLine: Number(attribute(indent, 'firstLine') || 0),
    hanging: Number(attribute(indent, 'hanging') || 0),
    spacingBefore: Number(attribute(spacing, 'before') || 0),
    lineHeight: Number(attribute(spacing, 'line') || 0),
    exactLine: attribute(spacing, 'lineRule') === 'exact',
    maxFontSize: Math.max(0, ...fontSizes),
    justification,
    list: descendants(properties, 'numPr').length > 0,
    drawing: descendants(node, 'drawing').length > 0 || descendants(node, 'pict').length > 0,
    drawingWidth,
    drawingHeight,
  };
}

function isPageFurniture(text) {
  return /^arXiv:.*\d{4}\.\d+/i.test(text)
    || /^\[[a-z-]+\.[a-z]+\]\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}$/i.test(text)
    || /^J\.\s*Risk\s+Financial\s+Manag\..*https?:\/\//i.test(text)
    || /^\d{1,3}$/u.test(text);
}

function looksLikeHeading(text, metadata) {
  if (/title|heading|subtitle/i.test(metadata.style)) return true;
  if (text.length > 140) return false;
  if (metadata.maxFontSize >= 26 && text.length < 120) return true;
  if (/^(?:[IVXLCDM]+\.|[A-Z]\.|\d+(?:\.\d+)*\.?)\s+\p{Lu}/u.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 5 && letters === letters.toUpperCase() && !terminalPunctuation.test(text)) return true;
  return metadata.justification === 'center' && text.length < 95 && !terminalPunctuation.test(text);
}

function looksLikeCaption(text) {
  return /^(?:fig(?:ure)?\.?|table)\s*\d+\s*[:.]/i.test(text);
}

function looksLikeEquation(text, metadata) {
  const imageLikeFormula = metadata.drawing && metadata.drawingWidth > 0 && metadata.drawingHeight > 0
    && metadata.drawingWidth / metadata.drawingHeight >= 2.4 && metadata.drawingHeight <= 1300000;
  if (!text) return imageLikeFormula;
  if (text.length > 240) return false;
  const hasOperator = /[=<>\u2264\u2265\u2248\u2211\u220f\u222b\u221a\u221e\u2208\u2202\u0398\u03b2\u03b5]/u.test(text);
  const equationNumber = /\(\d{1,3}\)\s*$/u.test(text);
  const wordCount = (text.match(/[A-Za-z]{3,}/g) || []).length;
  const operatorCount = (text.match(/[=<>+\-*/\u2264\u2265\u2248\u2211\u220f\u222b\u221a\u221e\u2208]/gu) || []).length;
  const fixedHeightFormula = metadata.exactLine && metadata.lineHeight >= 600
    && /[=<>_{}\u2264\u2265\u2211\u222b\u221a\u221e\u2208\u0398\u03b2\u03b5]/u.test(text);
  return imageLikeFormula || fixedHeightFormula || (hasOperator && (equationNumber || metadata.justification === 'center' || metadata.justification === 'right') && (wordCount <= 9 || operatorCount >= 2));
}

function parseVmlSize(node) {
  const shape = descendants(node, 'shape')[0];
  const style = shape?.getAttribute('style') || '';
  const read = (name) => {
    const match = style.match(new RegExp(`${name}\\s*:\\s*([0-9.]+)(pt|px|in|cm|mm)?`, 'i'));
    if (!match) return 0;
    const value = Number(match[1]);
    const unit = (match[2] || 'px').toLowerCase();
    return unit === 'pt' ? value * 96 / 72 : unit === 'in' ? value * 96 : unit === 'cm' ? value * 96 / 2.54 : unit === 'mm' ? value * 96 / 25.4 : value;
  };
  return { width: read('width'), height: read('height') };
}

function visualReferences(node, relationshipAssets) {
  const extent = firstDescendant(node, 'extent');
  const vmlSize = parseVmlSize(node);
  const width = Number(extent?.getAttribute('cx') || 0) / 9525 || vmlSize.width || 640;
  const height = Number(extent?.getAttribute('cy') || 0) / 9525 || vmlSize.height || 360;
  const docPr = firstDescendant(node, 'docPr');
  const alt = docPr?.getAttribute('descr') || docPr?.getAttribute('title') || docPr?.getAttribute('name') || '';
  const ids = [
    ...descendants(node, 'blip').map((item) => attribute(item, 'embed', 'r')),
    ...descendants(node, 'imagedata').map((item) => attribute(item, 'id', 'r')),
  ].filter(Boolean);
  return [...new Set(ids)].map((relationshipId) => ({
    assetId: relationshipAssets.get(relationshipId),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    alt,
  })).filter((visual) => visual.assetId);
}

function mathText(node) {
  return descendants(node, 't').map((item) => item.textContent || '').join('');
}

function ommlToLatex(node) {
  if (!node) return '';
  const child = (name) => elements(node).find((item) => item.localName === name);
  const convertChildren = (target = node) => elements(target).map(ommlToLatex).join('');
  if (node.localName === 't') return node.textContent || '';
  if (node.localName === 'f') return `\\frac{${ommlToLatex(child('num'))}}{${ommlToLatex(child('den'))}}`;
  if (node.localName === 'sSup') return `{${ommlToLatex(child('e'))}}^{${ommlToLatex(child('sup'))}}`;
  if (node.localName === 'sSub') return `{${ommlToLatex(child('e'))}}_{${ommlToLatex(child('sub'))}}`;
  if (node.localName === 'sSubSup') return `{${ommlToLatex(child('e'))}}_{${ommlToLatex(child('sub'))}}^{${ommlToLatex(child('sup'))}}`;
  if (node.localName === 'rad') return `\\sqrt{${ommlToLatex(child('e'))}}`;
  if (node.localName === 'd') return `\\left(${ommlToLatex(child('e'))}\\right)`;
  if (node.localName === 'nary') {
    const symbol = mathText(child('naryPr')) || '\u2211';
    const command = symbol.includes('\u222b') ? '\\int' : symbol.includes('\u220f') ? '\\prod' : '\\sum';
    return `${command}_{${ommlToLatex(child('sub'))}}^{${ommlToLatex(child('sup'))}} ${ommlToLatex(child('e'))}`;
  }
  if (node.localName === 'm') {
    const rows = elements(node, 'mr').map((row) => elements(row, 'e').map(ommlToLatex).join(' & '));
    return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
  }
  if (node.localName === 'acc') return `\\hat{${ommlToLatex(child('e'))}}`;
  if (node.localName === 'limLow') return `${ommlToLatex(child('e'))}_{${ommlToLatex(child('lim'))}}`;
  if (node.localName === 'limUpp') return `${ommlToLatex(child('e'))}^{${ommlToLatex(child('lim'))}}`;
  if (['num', 'den', 'e', 'sub', 'sup', 'lim', 'oMath', 'oMathPara', 'r'].includes(node.localName)) return convertChildren();
  return convertChildren() || mathText(node);
}

function normalizeParagraph(node, relationshipAssets) {
  const metadata = paragraphMetadata(node);
  const text = textContentInOrder(node);
  const mathNodes = descendants(node, 'oMathPara').length ? descendants(node, 'oMathPara') : descendants(node, 'oMath');
  const latex = [...new Set(mathNodes.map((math) => ommlToLatex(math).trim()).filter(Boolean))].join(' \\\\ ');
  const visuals = visualReferences(node, relationshipAssets);
  return {
    ...metadata,
    text,
    visuals,
    latex,
    heading: Boolean(text) && looksLikeHeading(text, metadata),
    caption: Boolean(text) && looksLikeCaption(text),
    equation: Boolean(latex) || looksLikeEquation(text, metadata),
    bullet: metadata.list || /^[\u2022\u25aa\u25e6\uf0b7]\s*/u.test(text),
  };
}

function shouldMerge(previous, current) {
  if (!previous || !current || previous.visuals?.length || current.visuals?.length || previous.heading || previous.caption || current.heading || current.caption || current.bullet) return false;
  if (previous.text.length + current.text.length > 4200) return false;
  if (current.firstLine >= 120 && !current.hanging) return false;
  if (current.spacingBefore >= 220 && !current.hanging) return false;
  if (continuationStart.test(current.text) || /^\p{Ll}/u.test(current.text)) return true;
  if (previous.bullet && terminalPunctuation.test(previous.text)) return false;
  return !terminalPunctuation.test(previous.text);
}

function joinText(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (/[\u3400-\u9fff]$/u.test(left) || /^[\u3400-\u9fff]/u.test(right)) return `${left}${right}`;
  return `${left} ${right}`;
}

function makeParagraphBlocks(rawParagraphs, counters) {
  const output = [];
  let pending = null;
  const flush = () => {
    if (!pending?.text) return;
    output.push({ type: 'paragraph', text: pending.text, kind: pending.heading ? 'heading' : pending.caption ? 'caption' : pending.bullet ? 'list-item' : 'paragraph' });
    pending = null;
  };
  for (const item of rawParagraphs) {
    const hasVisual = item.visuals?.length || item.latex;
    if (hasVisual) {
      flush();
      if (item.text && !item.equation && !isPageFurniture(item.text)) output.push({ type: 'paragraph', text: item.text, kind: item.caption ? 'caption' : 'paragraph' });
      item.visuals.forEach((visual) => output.push({ type: item.equation ? 'formula' : 'image', ...visual, latex: item.latex || '' }));
      if (!item.visuals.length && item.latex) output.push({ type: 'formula', assetId: '', latex: item.latex, width: 640, height: 96, alt: '公式' });
      if (item.equation) counters.formulas += 1;
      continue;
    }
    if (item.equation) {
      flush();
      counters.formulas += 1;
      if (item.text) output.push({ type: 'formula', assetId: '', latex: item.text, width: 640, height: 96, alt: '公式' });
      continue;
    }
    if (!item.text) continue;
    if (isPageFurniture(item.text)) { counters.furniture += 1; continue; }
    if (pending && pending.text === item.text) { counters.duplicates += 1; continue; }
    if (pending && shouldMerge(pending, item)) {
      pending.text = joinText(pending.text, item.text);
      counters.merged += 1;
      continue;
    }
    flush();
    pending = { ...item };
  }
  flush();
  return output;
}

function extractTable(node, tableNumber, counters, relationshipAssets) {
  const tableId = `table-${tableNumber}`;
  const rows = elements(node, 'tr').map((row, rowIndex) => {
    const cells = elements(row, 'tc').map((cell, columnIndex) => {
      const blocks = makeParagraphBlocks(descendants(cell, 'p').map((paragraph) => normalizeParagraph(paragraph, relationshipAssets)), counters);
      const text = blocks.filter((block) => block.type === 'paragraph').map((block) => block.text).join('\n');
      return { id: `${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`, text, blocks, row: rowIndex + 1, column: columnIndex + 1 };
    });
    return { header: rowIndex === 0, cells };
  }).filter((row) => row.cells.some((cell) => cell.text || cell.blocks.some((block) => ['image', 'formula'].includes(block.type))));
  return rows.length ? { type: 'table', id: tableId, page: null, columns: Math.max(...rows.map((row) => row.cells.length)), rows } : null;
}

function hasTranslatableLanguage(text) {
  return /[\u3400-\u9fff]/u.test(text) || /[A-Za-z]{4,}/u.test(text);
}

function splitLongText(text, limit = 2800) {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?\u3002\uff01\uff1f]+(?:[.!?\u3002\uff01\uff1f]+["'\u2019\u201d)\]]*|$)/gu) || [text];
  const chunks = [];
  let current = '';
  const push = (value) => { if (value.trim()) chunks.push(value.trim()); };
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (current && current.length + clean.length + 1 > limit) { push(current); current = ''; }
    if (clean.length <= limit) { current = joinText(current, clean); continue; }
    let remaining = clean;
    while (remaining.length > limit) {
      let splitAt = remaining.lastIndexOf(' ', limit);
      if (splitAt < Math.floor(limit * .65)) splitAt = limit;
      push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trim();
    }
    current = remaining;
  }
  push(current);
  return chunks;
}

function parsePageCount(xml) {
  const match = xml.match(/<(?:\w+:)?Pages\b[^>]*>(\d+)<\/(?:\w+:)?Pages>/i);
  return match ? Number(match[1]) : null;
}

function parseMaximumColumnCount(document) {
  const counts = descendants(document, 'cols').map((node) => Number(attribute(node, 'num') || 1)).filter(Number.isFinite);
  return Math.max(1, ...counts);
}

function imageMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.emf': 'image/emf', '.wmf': 'image/wmf' })[extension] || 'application/octet-stream';
}

async function extractAssets(zip) {
  const relationshipsXml = await zip.file('word/_rels/document.xml.rels')?.async('string') || '';
  const relationships = parser.parseFromString(relationshipsXml, 'application/xml');
  const relationshipAssets = new Map();
  const assetByPath = new Map();
  const assets = [];
  for (const relationship of descendants(relationships, 'Relationship')) {
    const id = relationship.getAttribute('Id') || '';
    const target = relationship.getAttribute('Target') || '';
    const mode = relationship.getAttribute('TargetMode') || '';
    if (!id || !target || mode === 'External') continue;
    const normalized = path.posix.normalize(path.posix.join('word', target.replace(/\\/g, '/')));
    const file = zip.file(normalized);
    if (!file || !normalized.startsWith('word/media/')) continue;
    if (assetByPath.has(normalized)) {
      relationshipAssets.set(id, assetByPath.get(normalized));
      continue;
    }
    const data = await file.async('base64');
    const asset = { id: `asset-${assets.length + 1}`, mimeType: imageMimeType(normalized), data, sourcePath: normalized };
    assets.push(asset);
    assetByPath.set(normalized, asset.id);
    relationshipAssets.set(id, asset.id);
  }
  return { assets, relationshipAssets };
}

export async function extractDocxDocument(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('DOCX 缺少 word/document.xml');
  const appXml = await zip.file('docProps/app.xml')?.async('string') || '';
  const document = parser.parseFromString(documentXml, 'application/xml');
  const parseError = descendants(document, 'parsererror')[0];
  if (parseError) throw new Error(`DOCX XML 无法解析：${parseError.textContent}`);
  const body = descendants(document, 'body')[0];
  if (!body) throw new Error('DOCX 中没有正文');

  const { assets, relationshipAssets } = await extractAssets(zip);
  const counters = { formulas: 0, furniture: 0, duplicates: 0, merged: 0 };
  const provisional = [];
  let paragraphBuffer = [];
  let tableNumber = 0;
  const flushParagraphs = () => {
    if (!paragraphBuffer.length) return;
    provisional.push(...makeParagraphBlocks(paragraphBuffer, counters));
    paragraphBuffer = [];
  };
  for (const child of elements(body)) {
    if (child.localName === 'p') { paragraphBuffer.push(normalizeParagraph(child, relationshipAssets)); continue; }
    if (child.localName === 'tbl') {
      flushParagraphs();
      tableNumber += 1;
      const table = extractTable(child, tableNumber, counters, relationshipAssets);
      if (table) provisional.push(table);
    }
  }
  flushParagraphs();

  for (const block of provisional) {
    const candidates = block.type === 'table' ? block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.blocks)) : [block];
    for (const candidate of candidates) {
      if (candidate.type !== 'formula' || candidate.assetId || !candidate.latex) continue;
      try {
        const rendered = await renderLatexFormula(candidate.latex);
        if (!rendered) continue;
        const asset = { id: `asset-${assets.length + 1}`, mimeType: rendered.mimeType, data: rendered.data, sourcePath: '', generated: true, latex: candidate.latex };
        assets.push(asset);
        candidate.assetId = asset.id;
        candidate.width = rendered.width;
        candidate.height = rendered.height;
      } catch {
        // Keep the LaTeX source as a visible fallback when a rare construct cannot be rasterized.
      }
    }
  }

  const blocks = [];
  const paragraphs = [];
  let paragraphNumber = 0;
  for (const block of provisional) {
    if (block.type === 'table') {
      blocks.push(block);
      for (const row of block.rows) for (const cell of row.cells) {
        if (cell.text && hasTranslatableLanguage(cell.text)) paragraphs.push({ id: cell.id, text: cell.text, page: null, kind: 'table-cell', tableId: block.id });
      }
      continue;
    }
    if (block.type !== 'paragraph') { blocks.push(block); continue; }
    for (const textPart of splitLongText(block.text)) {
      paragraphNumber += 1;
      const paragraph = { id: `p-${paragraphNumber}`, text: textPart, page: null, kind: block.kind };
      paragraphs.push(paragraph);
      blocks.push({ type: 'paragraph', id: paragraph.id, page: null, text: paragraph.text, kind: paragraph.kind });
    }
  }

  const text = blocks.map((block) => block.type === 'table'
    ? block.rows.map((row) => row.cells.map((cell) => cell.text).join('\t')).join('\n')
    : block.type === 'paragraph' ? block.text : '').filter(Boolean).join('\n\n');
  if (!text || !paragraphs.length) throw new Error('DOCX 中没有可提取的文本');
  return {
    text,
    paragraphs,
    blocks,
    assets,
    tables: blocks.filter((block) => block.type === 'table'),
    pageCount: parsePageCount(appXml),
    structured: true,
    columnCount: parseMaximumColumnCount(document),
    skippedFormulaCount: 0,
    extraction: { ...counters, images: blocks.filter((block) => block.type === 'image').length },
    warning: '',
  };
}
