// Corpus, third axis: SOURCES / SCANS (owner, 21 Oct 2026). Pages of the document-type files are rendered and put
// through the scanner effects of tests/fixtures/ocr/scan-fx.mjs (shared with the OCR set; the new effects — shadow,
// uneven light, perspective, curve, 1-bit, bleed-through, pen strokes, JPEG, turned sheet — live there, this file only
// combines them), plus three kinds that file does not make: a colour scan on tinted paper, a mixed multi-page file
// (text page, scanned page, text page) and hybrid files with an OCR text layer (right, and deliberately wrong).
// Output: tests/fixtures/arabic/scans/<name>.pdf + <name>.txt (the page's real text, for the OCR audit), tags in tags.json.
//   node tools/arabic/make-scans.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { scanPdf } from '../../tests/fixtures/ocr/scan-fx.mjs';
import { addTextLayer } from '../../src/lib/engine/ocr.ts';

const ROOT = path.join(import.meta.dirname, '..', '..'), FIX = path.join(ROOT, 'tests', 'fixtures', 'arabic'), OUT = path.join(FIX, 'scans'), TAGS = path.join(FIX, 'tags.json');
fs.mkdirSync(OUT, { recursive: true });
const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};
const font = (f) => new m.Font(f, new Uint8Array(fs.readFileSync(path.join(ROOT, 'public', 'fonts', f + '.ttf'))));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };

const open = (f) => new m.PDFDocument(new Uint8Array(fs.readFileSync(path.join(FIX, f))));
const pageOf = (f) => { const d = open(f), p = d.loadPage(0), [x0, y0, x1, y1] = p.getBounds(); return { d, p, w: x1 - x0, h: y1 - y0, text: p.toStructuredText().asText() }; };
const grey = (p, dpi) => p.toPixmap(m.Matrix.scale(dpi / 72, dpi / 72), m.ColorSpace.DeviceGray, false);
const save = (name, bytes, src, text, tag) => {
  fs.writeFileSync(path.join(OUT, name + '.pdf'), bytes); fs.writeFileSync(path.join(OUT, name + '.txt'), text.trim() + '\n');
  tags['scans/' + name + '.pdf'] = { producer: 'scan', from: src, type: tags[src]?.type ?? 'other', arrangement: tags[src]?.arrangement ?? [], ...tag, lines: [] };
  console.log(name + '.pdf', Math.round(bytes.length / 1024) + ' kB');
};

// (1) one page per kind of scan, each on a different document type
const kinds = [
  ['flatbed-150', 'type-letter-circular.pdf', 150, [['blur', 1]], { source: 'flatbed', dpi: 150 }],
  ['flatbed-200', 'type-contract-clauses.pdf', 200, [['noise', 6]], { source: 'flatbed', dpi: 200 }],
  ['flatbed-300', 'type-invoice.pdf', 300, [], { source: 'flatbed', dpi: 300 }],
  ['phone-photo', 'type-form-boxes.pdf', 200, [['perspective', 0.07], ['shadow', 0.45], ['uneven', 0.3], ['noise', 10], ['blur', 1]], { source: 'phone-photo', dpi: 200 }],
  ['book-spine-curve', 'type-book-a5.pdf', 200, [['curve', 0.035], ['uneven', 0.25], ['blur', 1]], { source: 'book-curved', dpi: 200 }],
  ['skew-2deg', 'type-newspaper-3col.pdf', 200, [['tilt', 2], ['noise', 8]], { source: 'skewed', dpi: 200, skew: 2 }],
  ['skew-5deg', 'type-financial-landscape.pdf', 150, [['tilt', -5], ['blur', 1]], { source: 'skewed', dpi: 150, skew: -5 }],
  ['faded-low-contrast', 'type-letter-circular-usletter.pdf', 200, [['fade', 90, 200], ['noise', 10]], { source: 'faded', dpi: 200 }],
  ['photocopy-of-photocopy', 'type-contract-clauses.pdf', 200, [['blur', 1], ['fade', 40, 230], ['noise', 18], ['onebit', 140], ['blur', 1], ['noise', 14], ['tilt', 1]], { source: 'photocopy-x2', dpi: 200 }],
  ['onebit-bw', 'type-menu-prices.pdf', 300, [['onebit', 128]], { source: '1-bit', dpi: 300 }],
  ['stamps-handwriting', 'type-watermark-stamp.pdf', 200, [['strokes', 14], ['noise', 6]], { source: 'marked-up', dpi: 200 }],
  ['bleed-through', 'type-poetry-tashkeel.pdf', 200, [['bleed', 0.3], ['noise', 6]], { source: 'bleed-through', dpi: 200 }],
  ['jpeg-artefacts', 'type-timetable.pdf', 150, [['jpeg', 14], ['blur', 1]], { source: 'jpeg', dpi: 150 }],
  ['sideways-sheet', 'type-magazine-2col.pdf', 200, [['turn', 1], ['noise', 6]], { source: 'turned-90', dpi: 200 }],
];
for (const [name, src, dpi, fx, tag] of kinds) {
  if (!fs.existsSync(path.join(FIX, src))) { console.log('missing', src); continue; }
  const { p, w, h, text } = pageOf(src), pix = grey(p, dpi);
  save(name, scanPdf(m, pix, fx, w, h), src, text, tag);
}

// (2) a colour scan: coloured paper and slightly coloured ink, as a JPEG photo (no grey step)
{
  const src = 'type-certificate.pdf', { p, w, h, text } = pageOf(src), pix = p.toPixmap(m.Matrix.scale(150 / 72, 150 / 72), m.ColorSpace.DeviceRGB, false), px = pix.getPixels();
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < px.length; i += 3) { const k = 0.88 + 0.06 * rnd(); px[i] = Math.min(255, px[i] * k + 10); px[i + 1] = Math.min(255, px[i + 1] * k + 4); px[i + 2] = Math.min(255, px[i + 2] * (k - 0.1)); } // warm, yellowish paper
  const doc = new m.PDFDocument(), img = doc.addImage(new m.Image(pix));
  doc.insertPage(-1, doc.addPage([0, 0, w, h], 0, { XObject: { Im0: img } }, `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`));
  save('colour-scan-tinted-paper', doc.saveToBuffer('compress').asUint8Array(), src, text, { source: 'colour-scan', dpi: 150 });
}

// (3) a mixed file: text page, scanned page, text page (a letter with a scanned attachment)
{
  const a = 'type-letter-circular.pdf', b = 'type-invoice.pdf', c = 'type-contract-clauses.pdf';
  const out = new m.PDFDocument();
  out.graftPage(-1, open(a), 0);
  const { p, w, h } = pageOf(b), scanned = new m.PDFDocument(scanPdf(m, grey(p, 200), [['tilt', 1], ['noise', 8]], w, h));
  out.graftPage(-1, scanned, 0);
  out.graftPage(-1, open(c), 0);
  const text = [a, b, c].map((f) => pageOf(f).text).join('\n\f\n');
  save('mixed-text-scan-text', out.saveToBuffer('garbage=compact').asUint8Array(), a, text, { source: 'mixed-pages', dpi: 200, pages: ['text', 'scan', 'text'] });
}

// (4) hybrid: a scan with an OCR text layer — words at their boxes; one right, one with every 6th word wrong
function layerFrom(f, dpi, damage) {
  const { p } = pageOf(f), st = p.toStructuredText(), k = dpi / 72, lines = [];
  let cur = null, word = null, n = 0;
  const flush = () => { if (word && word.text.trim()) cur.words.push(word); word = null; };
  st.walk({
    beginLine() { cur = { words: [] }; },
    onChar(c, _o, _f, _s, q) {
      const x0 = Math.min(q[0], q[2], q[4], q[6]) * k, x1 = Math.max(q[0], q[2], q[4], q[6]) * k, y0 = Math.min(q[1], q[3], q[5], q[7]) * k, y1 = Math.max(q[1], q[3], q[5], q[7]) * k;
      if (c === ' ') { flush(); return; }
      if (!word) word = { text: '', x0, y0, x1, y1 };
      word.text += c; word.x0 = Math.min(word.x0, x0); word.x1 = Math.max(word.x1, x1); word.y0 = Math.min(word.y0, y0); word.y1 = Math.max(word.y1, y1);
    },
    endLine() { flush(); if (cur.words.length) { if (damage) for (const w of cur.words) if (++n % 6 === 0) w.text = w.text.replace(/[ا-ي]/, 'خ') + 'ـ'; lines.push(cur); } },
  });
  st.destroy();
  return lines;
}
for (const [name, src, damage] of [['hybrid-ocr-layer-right', 'type-letter-circular.pdf', false], ['hybrid-ocr-layer-wrong', 'type-academic-paper.pdf', true]]) {
  const { p, w, h, text } = pageOf(src), dpi = 200, scan = scanPdf(m, grey(p, dpi), [['noise', 6]], w, h);
  const bytes = addTextLayer(m, scan, [{ page: 0, scale: dpi / 72, lines: layerFrom(src, dpi, damage) }], fonts);
  save(name, bytes, src, text, { source: 'hybrid-ocr-layer', dpi, layer: damage ? 'wrong (every 6th word damaged)' : 'right' });
}
fs.writeFileSync(TAGS, JSON.stringify(tags, null, 1));
