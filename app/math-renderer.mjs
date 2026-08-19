import sharp from 'sharp';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' });
const mathDocument = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });

function extractSvg(markup) {
  const start = markup.indexOf('<svg');
  const end = markup.lastIndexOf('</svg>');
  if (start < 0 || end < start) throw new Error('公式渲染器没有生成 SVG');
  return markup.slice(start, end + 6).replace(/currentColor/g, '#172033');
}

export async function renderLatexFormula(latex) {
  const source = String(latex || '').trim()
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .trim();
  if (!source) return null;
  const node = mathDocument.convert(source, { display: true, em: 18, ex: 9, containerWidth: 1024 });
  const svg = extractSvg(adaptor.outerHTML(node));
  const raster = sharp(Buffer.from(svg), { density: 180 }).flatten({ background: '#ffffff' }).png({ compressionLevel: 9 });
  const metadata = await raster.metadata();
  const png = await raster.toBuffer();
  return {
    mimeType: 'image/png',
    data: png.toString('base64'),
    width: Math.max(1, Number(metadata.width) || 640),
    height: Math.max(1, Number(metadata.height) || 96),
    latex: source,
  };
}
