// Matrix 6: does the OCR text layer still sit on the printed words after the other writers have been at the page?
// For every hybrid (scan + real tesseract layer): numbers, watermark, signature set, highlight, page-editor text, compress, turn 90°,
// crop, redaction of a region, rebuild through assemble. The layer's words (as MuPDF reads them: search / selection) are compared
// with where they were, moved by the turn / crop that was asked for.
// usage: node tools/arabic/matrix/run-ocr-after.mjs   -> tests/audit-arabic/results/matrix-ocr-after.json
import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, ROOT } from '../lib.mjs';
import { pageNumbers, watermark, crop, compress } from '../../../src/lib/engine/tools.ts';
import { editPage } from '../../../src/lib/engine/editpage.ts';
import { signPdf, placeSet, setEdits } from '../../../src/lib/engine/sign.ts';
import { applyAnnots } from '../../../src/lib/engine/annots.ts';
import { redact } from '../../../src/lib/engine/redact.ts';
import { assemble } from '../../../src/lib/engine/assemble.ts';
import { layerWords } from '../../../src/lib/engine/ocr.ts';
import { subjects, words, Rows, r1 } from './mx.mjs';

const F = fonts(), photo = new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests/fixtures/signature-photo.png'))), rows = new Rows('ocr-after');
const lw = (b) => layerWords(m, b, 0).map((w) => ({ text: w.text, x: w.x0, y: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 }));
const norm = (t) => t.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '');
for (const s of subjects((s) => s.source === 'hybrid')) {
  const bytes = s.bytes(), W = s.W, H = s.H, w0 = lw(bytes).filter((w) => norm(w.text).length >= 2);
  if (w0.length < 5) { rows.add('ocr layer', 'layer words found', s, false, `${w0.length}`, 'layer unreadable'); continue; }
  const ops = {
    'page numbers': { run: () => { const d = new m.PDFDocument(bytes); pageNumbers(m, d, [0], { position: 'bc', total: true }); return d.saveToBuffer('').asUint8Array().slice(); } },
    'watermark': { run: () => { const d = new m.PDFDocument(bytes); watermark(m, d, F, [0], { text: 'سري', angle: 45, size: 80 }); return d.saveToBuffer('').asUint8Array().slice(); } },
    'signature set': { run: () => { const set = { ratio: 2.2, name: 'عبدالله', date: '21/10/2026' }; return signPdf(m, bytes, [{ page: 0, edits: setEdits(set, placeSet(set, { x: W * 0.3, y: H * 0.8, w: 170, h: 20, rtl: true })) }], [photo], () => F); } },
    'highlight comment': { run: () => applyAnnots(m, bytes, [], [{ id: 'n1', page: 0, kind: 'highlight', color: '#f5c518', note: '', rect: [60, 100, 300, 120], quads: [[60, 100, 300, 100, 60, 120, 300, 120]] }]) },
    'page-editor text': { run: () => { const d = editPage(m, new m.PDFDocument(bytes), 0, [{ kind: 'text', text: 'ملاحظة 123', size: 16, color: [0.8, 0.1, 0.1], bold: false, align: 'right', x: W * 0.5, y: H * 0.9, w: W * 0.4, h: 22 }], [], () => F); return d.saveToBuffer('').asUint8Array().slice(); } },
    'compress': { run: () => compress(m, bytes, 'recommended') },
    'rebuilt by assemble (Organize)': { run: () => { const doc = m.Document.openDocument(bytes, 'application/pdf'); return assemble(m, () => ({ doc, bytes }), { items: [{ doc: 0, page: 0 }] }); } },
    'turned 90° (Organize)': { run: () => { const doc = m.Document.openDocument(bytes, 'application/pdf'); return assemble(m, () => ({ doc, bytes }), { items: [{ doc: 0, page: 0, rotate: 90 }] }); }, map: (x, y) => [H - y, x] },
    'cropped 5 % each side': { run: () => { const d = new m.PDFDocument(bytes); crop(d.findPage(0), [0.05, 0.05, 0.95, 0.95]); return d.saveToBuffer('').asUint8Array().slice(); }, map: (x, y) => [x - 0.05 * W, y - 0.05 * H] },
    'redaction of a block': { run: () => redact(m, bytes, [{ page: 0, x: W * 0.1, y: H * 0.45, w: W * 0.8, h: 40 }]), hole: { x: W * 0.1, y: H * 0.45, w: W * 0.8, h: 40 } },
  };
  for (const [name, op] of Object.entries(ops)) {
    try {
      const out = op.run(), w1 = lw(out), map = op.map ?? ((x, y) => [x, y]);
      const inHole = (w) => op.hole && w.x < op.hole.x + op.hole.w && w.x + w.w > op.hole.x && w.y < op.hole.y + op.hole.h && w.y + w.h > op.hole.y;
      let ok = 0, n = 0, dist = [];
      for (const w of w0) {
        if (inHole(w)) continue; n++;
        const [cx, cy] = (() => { const a = map(w.x, w.y), b = map(w.x + w.w, w.y + w.h); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; })();
        const best = w1.filter((x) => norm(x.text).includes(norm(w.text)) || norm(w.text).includes(norm(x.text))).map((x) => Math.hypot(x.x + x.w / 2 - cx, x.y + x.h / 2 - cy)).sort((a, b) => a - b)[0];
        if (best !== undefined && best <= 3) ok++; if (best !== undefined) dist.push(best);
      }
      const share = ok / n, med = dist.sort((a, b) => a - b)[Math.floor(dist.length / 2)] ?? 99;
      const gone = op.hole ? w0.filter(inHole).filter((w) => w1.some((x) => norm(x.text) === norm(w.text) && Math.hypot(x.x - w.x, x.y - w.y) < 3)).length : 0;
      rows.add('ocr layer', name, s, share >= 0.97 && !gone ? true : share >= 0.85 ? 'warn' : false, `${r1(share * 100)}% of ${n} words within 3 pt, median ${r1(med)} pt${op.hole ? `, ${gone} words left under the block` : ''}`, share >= 0.97 && !gone ? '' : share < 0.85 ? 'layer moved or lost' : 'some words moved or lost');
    } catch (e) { rows.add('ocr layer', name, s, false, 'error', String(e.message).slice(0, 90)); }
  }
}
rows.save();
