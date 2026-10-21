// Writer 9: OCR invisible text layer (ocr.addTextLayer): Arabic words with tashkeel / numbers; do the word boxes line up with the
// printed boxes? -> tests/fixtures/arabic-create/ocr.pdf (invisible, as shipped) and ocr-visible.pdf (same, Tr 0, boxes outlined)
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, fonts, basePdf, save, writeOut, outline } from './lib.mjs';
import { addTextLayer, layerWords } from '../../src/lib/engine/ocr.ts';

const F = fonts(), scale = 2; // 2 picture pixels per point
const lineOf = (text, y0, h = 28, x1 = 1100) => { // words laid right to left across the line, equal width + gap, as Tesseract reports them for RTL text
  const ws = text.split(' '), step = 120, out = [];
  ws.forEach((w, i) => { const x = x1 - (i + 1) * step; out.push({ text: w, x0: x, x1: x + step - 20, y0, y1: y0 + h }); });
  return { words: ws.length ? out : [] };
};
const texts = [T.pure, T.mixed, T.indic, T.tashkeel, T.lamalef, T.parens, T.persian, 'مرحبا'];
const lines = texts.map((t, i) => lineOf(t, 100 + i * 80));
const spec = [{ w: 595, h: 842 }, { w: 612, h: 792, rot: 90 }, { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700] }];
const base = basePdf(spec), bytes = save(base);
const layers = spec.map((_, i) => ({ page: i, scale, lines }));
const out = addTextLayer(m, bytes, layers, F);
writeOut('ocr.pdf', out);
// visible variant: Tr 3 -> Tr 0 in every content stream, plus the expected word boxes outlined
const d = new m.PDFDocument(out);
for (let i = 0; i < spec.length; i++) {
  const c = d.findPage(i).get('Contents');
  const fix = (s) => { const t = s.readStream().asString().replace(/3 Tr/g, '0 Tr'); s.writeStream(t); };
  if (c.isArray()) c.forEach((s) => { if (s.isStream()) fix(s); }); else if (c.isStream()) fix(c);
  for (const l of lines) for (const w of l.words) outline(d, i, { x: w.x0 / scale, y: w.y0 / scale, w: (w.x1 - w.x0) / scale, h: (w.y1 - w.y0) / scale });
}
writeOut('ocr-visible.pdf', d.saveToBuffer('').asUint8Array().slice());
fs.writeFileSync(path.join(OUT, 'manifest-ocr-visible.json'), JSON.stringify(spec.map((s, i) => ({ writer: 'ocr', file: 'ocr-visible.pdf', page: i, label: 'ocr-' + i, expect: texts })), null, 1));
fs.writeFileSync(path.join(OUT, 'manifest-ocr.json'), JSON.stringify(spec.map((s, i) => ({ writer: 'ocr', file: 'ocr.pdf', page: i, label: 'ocr-' + i, expect: texts })), null, 1));
// selection boxes: what MuPDF reports for each word versus the printed box
const rows = [];
for (let p = 0; p < spec.length; p++) {
  const got = layerWords(m, out, p), want = lines.flatMap((l) => l.words.map((w) => ({ text: w.text, x0: w.x0 / scale, x1: w.x1 / scale, y0: w.y0 / scale, y1: w.y1 / scale })));
  let ok = 0, off = [];
  for (const w of want) {
    const g = got.find((x) => x.text.normalize('NFKC') === w.text.normalize('NFKC') && Math.abs((x.x0 + x.x1) / 2 - (w.x0 + w.x1) / 2) < 30 && Math.abs((x.y0 + x.y1) / 2 - (w.y0 + w.y1) / 2) < 14);
    if (g) ok++; else off.push(w.text);
  }
  rows.push({ page: p, words: want.length, matched: ok, missing: off.slice(0, 12) });
}
fs.writeFileSync(path.join(OUT, 'ocr-boxes.json'), JSON.stringify(rows, null, 1));
console.log(JSON.stringify(rows));
console.log('ocr.pdf', out.length);
