// Scans of the base documents: flatbed 150 / 300 dpi, phone photo (keystone, shade, blur, JPEG), skew, faded, 1-bit, photocopy.
// Picture-only PDFs made with the OCR session's effect library (tests/fixtures/ocr/scan-fx.mjs, reused, not copied).
// -> tests/fixtures/arabic-create/scans/<doc>--<kind>.pdf + scans/index.json
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT } from '../lib.mjs';
import { scanPdf } from '../../../tests/fixtures/ocr/scan-fx.mjs';
const BASE = path.join(OUT, 'base'), S = path.join(OUT, 'scans'); fs.mkdirSync(S, { recursive: true });
const KINDS = {
  flatbed150: { dpi: 150, fx: [['noise', 6]] },
  flatbed300: { dpi: 300, fx: [['blur', 1], ['noise', 4]] },
  phone: { dpi: 200, fx: [['perspective', 0.06], ['shadow', 0.45], ['uneven', 0.3], ['blur', 1], ['noise', 5], ['jpeg', 10]] },
  skew3: { dpi: 200, fx: [['tilt', 3], ['noise', 4]] },
  faded: { dpi: 200, fx: [['fade', 140, 235], ['noise', 8]] },
  onebit: { dpi: 200, fx: [['blur', 1], ['onebit', 140]] },
  photocopy: { dpi: 200, fx: [['noise', 18], ['fade', 20, 230], ['bleed', 0.25], ['strokes', 10]] },
  curved: { dpi: 200, fx: [['curve', 0.03], ['noise', 5]] },
};
const PLAN = { 'letter-a4': Object.keys(KINDS), 'invoice-a4': ['flatbed150', 'phone', 'faded', 'onebit'], 'form-boxes-a4': ['flatbed300', 'phone', 'photocopy'], 'newspaper-3col': ['flatbed300', 'skew3', 'photocopy'],
  'book-footnotes-a5': ['flatbed150', 'curved', 'onebit'], 'receipt-80mm': ['flatbed300', 'faded'], 'contract-a4': ['flatbed300', 'skew3'], 'table-landscape': ['flatbed150'] };
const index = [];
for (const [id, kinds] of Object.entries(PLAN)) {
  const meta = JSON.parse(fs.readFileSync(path.join(BASE, id + '.json'), 'utf8')), doc = m.Document.openDocument(new Uint8Array(fs.readFileSync(path.join(BASE, id + '.pdf'))), 'application/pdf');
  for (const kind of kinds) {
    const { dpi, fx } = KINDS[kind], k = dpi / 72, pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
    const pdf = scanPdf(m, pix, fx, meta.w, meta.h);
    fs.writeFileSync(path.join(S, `${id}--${kind}.pdf`), pdf);
    index.push({ doc: id, kind, dpi, fx, file: `${id}--${kind}.pdf`, type: meta.type, arrangement: meta.arrangement, w: meta.w, h: meta.h, bytes: pdf.length });
  }
}
fs.writeFileSync(path.join(S, 'index.json'), JSON.stringify(index, null, 1)); console.log(index.length, 'scans', (index.reduce((a, b) => a + b.bytes, 0) / 1e6).toFixed(1), 'MB');
