// Hybrid PDFs: a scan with a REAL OCR text layer, made the way the app makes it (tesseract.js + src/lib/ocr.ts + ocr-clean.ts +
// engine/ocr.ts addTextLayer, Tajawal text, invisible). -> tests/fixtures/arabic-create/hybrid/<scan>.pdf + <scan>.lines.json
// (the recognised lines with their boxes, pixels of the picture, and the picture scale and tilt, = what the layer was written from)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { m, ROOT, OUT, fonts } from '../lib.mjs';
import { linesOf } from '../../../src/lib/ocr.ts';
import { clean } from '../../../src/lib/ocr-clean.ts';
import { addTextLayer } from '../../../src/lib/engine/ocr.ts';
const S = path.join(OUT, 'scans'), H = path.join(OUT, 'hybrid'); fs.mkdirSync(H, { recursive: true });
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['letter-a4--flatbed300', 'letter-a4--flatbed150', 'letter-a4--faded', 'letter-a4--skew3', 'letter-a4--phone', 'invoice-a4--flatbed150', 'form-boxes-a4--flatbed300', 'book-footnotes-a5--flatbed150', 'receipt-80mm--flatbed300', 'newspaper-3col--flatbed300', 'contract-a4--flatbed300'];
const T = createRequire(import.meta.url)('tesseract.js'), dpi = 250, F = fonts();
const worker = await T.createWorker('ara+eng', 1, { langPath: path.join(ROOT, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: String(dpi) });
const toPng = (g) => { const out = new m.Pixmap(m.ColorSpace.DeviceGray, [0, 0, g.w, g.h], false); out.getPixels().set(g.px); return Buffer.from(out.asPNG()); };
for (const name of want) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(S, name + '.pdf'))), doc = m.Document.openDocument(bytes, 'application/pdf'), k = dpi / 72;
  const pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
  let g = { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()) };
  const w0 = g.w, h0 = g.h; let angle = 0;
  ({ gray: g, angle } = clean(g, 0.1));
  const lines = linesOf((await worker.recognize(toPng(g), {}, { blocks: true })).data);
  const tilt = { angle, w: w0, h: h0, quarter: 0 };
  const out = addTextLayer(m, bytes, [{ page: 0, scale: k, lines, tilt }], F);
  fs.writeFileSync(path.join(H, name + '.pdf'), out); fs.writeFileSync(path.join(H, name + '.lines.json'), JSON.stringify({ scale: k, tilt, lines }));
  console.log(name, lines.length, 'lines', lines.reduce((a, l) => a + l.words.length, 0), 'words tilt', angle.toFixed(2));
}
await worker.terminate();
