// Builds the real part of the OCR test set, tests/fixtures/ocr/real/ (git-ignored), from publicly published documents:
//   node tools/get-ocr-set.mjs            (downloads into real/dl/ once, then builds; details in tests/fixtures/ocr/README.md)
// r-NN-*: pages of public PDFs that have a text layer (the truth) turned into scans with the synthetic set's scanner
//         effects (tests/fixtures/ocr/scan-fx.mjs); s-NN-*: genuinely scanned pages with hand-checked text from public OCR
//         benchmarks on Hugging Face, as they are. Downloads are data: nothing in them is run.
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../engine/mupdf-wasm/dist/mupdf.js';
import { scanPdf, pictureAsPdf } from '../tests/fixtures/ocr/scan-fx.mjs';

const out = path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'ocr', 'real'), dl = path.join(out, 'dl');
fs.mkdirSync(dl, { recursive: true });
const get = async (file, url) => {
  const f = path.join(dl, file);
  if (!fs.existsSync(f)) { console.log('downloading', file); fs.writeFileSync(f, Buffer.from(await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).arrayBuffer())); }
  return fs.readFileSync(f);
};

// public PDFs with a text layer: page (1-based), scanner effects, and text patches for glyphs the PDF's own text layer lost
const pdfs = [
  { file: 'cma-circular10.pdf', url: 'https://cma.gov.sa/MediaCenter/Documents/circular10.pdf' },
  { file: 'moj-monthly-66.pdf', url: 'https://sjp.moj.gov.sa/RegisterationFIles/Documents/monthlyreports/MonReportForSysCirAndRegV66.pdf' },
  { file: 'gastat-annual-2024.pdf', url: 'https://stats.gov.sa/documents/20117/2435245/Annual_REPORT_2024_AR.pdf_fixed_14296554/427462e1-70d7-9539-6d88-7368ac8c9693?t=1778578565396' },
];
const rendered = [
  { name: 'r-01-cma-circular-letter-300', file: 'cma-circular10.pdf', page: 1, dpi: 300, fx: [['blur', 1]],
    patch: [['ا�شخاص', 'الأشخاص'], ['ا� وبركاته', 'الله وبركاته'], ['ا�جراءات', 'الإجراءات'], ['ا�وضاع', 'الأوضاع'], ['ا�تي', 'الآتي'], ['ا�فصاح', 'الإفصاح']] },
  { name: 'r-02-moj-regulations-list-200', file: 'moj-monthly-66.pdf', page: 8, dpi: 200, fx: [['noise', 10]] },
  { name: 'r-03-gastat-tracks-dense-spread-200', file: 'gastat-annual-2024.pdf', page: 9, dpi: 200, fx: [['blur', 1]] },
  { name: 'r-04-moj-report-intro-tilted-200', file: 'moj-monthly-66.pdf', page: 3, dpi: 200, fx: [['tilt', 1], ['blur', 1]] },
  { name: 'r-05-moj-gazette-list-faded-150', file: 'moj-monthly-66.pdf', page: 16, dpi: 150, fx: [['fade', 70, 190], ['noise', 12]] },
  { name: 'r-06-gastat-definitions-spread-200', file: 'gastat-annual-2024.pdf', page: 13, dpi: 200, fx: [['blur', 1], ['noise', 10]] },
  { name: 'r-07-gastat-price-index-photocopy-200', file: 'gastat-annual-2024.pdf', page: 38, dpi: 200, fx: [['tilt', -1], ['blur', 2], ['noise', 20], ['fade', 40, 230]] },
];
// genuinely scanned pages with reference text (Hugging Face datasets-server rows API; the row's image and text field)
const scanned = [];
const scans = (dataset, short, rows, text, dpi) => rows.forEach((row) => scanned.push({ name: `s-${String(scanned.length + 1).padStart(2, '0')}-${short}-${row}`, dataset, row, text, dpi }));
scans('Misraj/Misraj-DocOCR', 'misraj-dococr', [0, 1, 2, 3, 5], 'markdown', 150); // book and document scans, Markdown truth
scans('ahmedheakl/arocrbench_historicalbooks', 'kitab-historicalbooks', [0, 1], 'answer', 100); // old prints
scans('Misraj/Misraj-DocOCR', 'misraj-dococr', [19, 24, 27, 28, 33, 35, 37, 39, 43, 44], 'markdown', 150); // dense text, accounts, hadith with tashkeel, a table, a bilingual title, an index of numbers
scans('freococo/ocr_arabic_books', 'freococo-books', [0, 450, 900, 1350, 1800, 2250, 2700, 3500], ['page_header', 'body', 'footnotes'], 150); // scanned religious books, footnotes
scans('ahmedheakl/arocrbench_historicalbooks', 'kitab-historicalbooks', [2, 3], 'answer', 100);

for (const p of pdfs) await get(p.file, p.url);
for (const r of rendered) {
  const doc = m.Document.openDocument(fs.readFileSync(path.join(dl, r.file)), 'application/pdf'), page = doc.loadPage(r.page - 1), [x0, y0, x1, y1] = page.getBounds();
  let text = page.toStructuredText().asText();
  for (const [a, b] of r.patch ?? []) text = text.replaceAll(a, b);
  const k = r.dpi / 72;
  fs.writeFileSync(path.join(out, r.name + '.pdf'), scanPdf(m, page.toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false), r.fx, x1 - x0, y1 - y0));
  fs.writeFileSync(path.join(out, r.name + '.txt'), text.trim() + '\n');
  console.log(r.name, text.split(/\s+/).filter(Boolean).length, 'words');
}
for (const s of scanned) {
  const row = path.join(dl, s.name + '.json');
  if (!fs.existsSync(row)) fs.writeFileSync(row, JSON.stringify((await (await fetch(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(s.dataset)}&config=default&split=train&offset=${s.row}&length=1`)).json()).rows[0].row));
  const r = JSON.parse(fs.readFileSync(row, 'utf8')), img = await get(s.name + '.jpg', r.image.src);
  fs.writeFileSync(path.join(out, s.name + '.pdf'), pictureAsPdf(m, img, s.dpi));
  const text = [s.text].flat().map((k) => r[k] ?? '').join('\n').trim();
  fs.writeFileSync(path.join(out, s.name + '.txt'), text + '\n');
  console.log(s.name, r.image.width + 'x' + r.image.height, text.split(/\s+/).filter(Boolean).length, 'words');
}
