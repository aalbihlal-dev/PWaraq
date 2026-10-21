// Writer 1: page editor "add text" (editPage, kind:'text' without `from`) -> tests/fixtures/arabic-create/editor.pdf
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, fonts, basePdf, save, writeOut, outline } from './lib.mjs';
import { editPage, LEADING } from '../../src/lib/engine/editpage.ts';
import { wrap, measure } from '../../src/lib/engine/textpage.ts';

const F = fonts();
const man = [];
/** one test PDF page = base page + text edits (+ expected boxes outlined), returns the one-page doc */
function make(label, pageSpec, texts, expect = texts.map((t) => t.text)) {
  const base = basePdf([pageSpec]);
  const edits = texts.map((t) => ({ kind: 'text', bold: false, color: [0, 0, 0], align: 'right', size: 16, ...t }));
  // box height from the wrap so the outline shows where the text should stay
  for (const e of edits) {
    const rows = e.text.trim() ? wrap((s) => measure(e.bold ? F.bold : F.regular, s, e.size), e.text, e.w).length : 1;
    e.h = Math.max(e.size * LEADING, rows * e.size * LEADING);
  }
  const d = editPage(m, base, 0, edits, [], () => F);
  for (const e of edits) outline(d, 0, e);
  return { d, label, expect, edits };
}
const pages = [];
const A4 = { w: 595, h: 842 };
// 1  all scenarios, RTL right-aligned 16 pt, stacked
{
  const ks = ['pure', 'mixed', 'indic', 'tashkeel', 'lamalef', 'parens', 'persian', 'latin', 'one', 'empty'];
  let y = 40;
  const texts = ks.map((k) => { const t = { text: k === 'empty' ? '' : T[k], x: 60, y, w: 475, scen: k }; y += 50; return t; });
  pages.push(make('stack-short', A4, texts, texts.filter((t) => t.text).map((t) => t.text)));
}
pages.push(make('stack-long', A4, [{ text: T.long, x: 60, y: 40, w: 475 }, { text: T.longword, x: 60, y: 300, w: 475 }, { text: T.long, x: 60, y: 420, w: 200, size: 12 }]));
// 2  four sizes
{
  let y = 30; const texts = [];
  for (const s of [10, 16, 28, 60]) { texts.push({ text: T.mixed, x: 30, y, w: 535, size: s }); y += s * LEADING * 2.2 + 20; }
  pages.push(make('sizes', A4, texts));
}
// 3  alignment, bold, colour
pages.push(make('align-bold-colour', A4, [
  { text: T.pure, x: 60, y: 40, w: 475, align: 'left' }, { text: T.pure, x: 60, y: 90, w: 475, align: 'center' }, { text: T.pure, x: 60, y: 140, w: 475, align: 'right' },
  { text: T.mixed, x: 60, y: 200, w: 475, align: 'right', bold: true }, { text: T.mixed, x: 60, y: 250, w: 475, align: 'left', bold: true },
  { text: T.pure, x: 60, y: 310, w: 475, color: [0.85, 0.1, 0.1] }, { text: T.pure, x: 60, y: 360, w: 475, color: [0.1, 0.2, 0.8], bold: true },
  { text: T.tashkeel, x: 60, y: 420, w: 475, size: 28 },
]));
// 4  rotated pages (Letter) 90 / 180 / 270 — the text must stay upright as the page is seen
for (const rot of [90, 180, 270]) {
  const seen = rot === 180 ? { w: 612, h: 792 } : { w: 792, h: 612 };
  pages.push(make('rot' + rot, { w: 612, h: 792, rot }, [
    { text: T.mixed, x: 40, y: 40, w: seen.w - 80, size: 20 }, { text: T.tashkeel, x: 40, y: 110, w: seen.w - 80, size: 24 }, { text: T.pure, x: 40, y: 180, w: 200, size: 16 },
  ]));
}
// 5  MediaBox with a non-zero origin, CropBox inside it; and the same turned 90
for (const rot of [0, 90]) {
  const seen = rot ? { w: 450, h: 450 } : { w: 450, h: 450 };
  pages.push(make('crop-origin-rot' + rot, { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700], rot, grid: true }, [
    { text: T.mixed, x: 20, y: 30, w: seen.w - 40, size: 18 }, { text: T.pure, x: 20, y: 120, w: seen.w - 40 }, { text: T.long, x: 20, y: 200, w: seen.w - 40, size: 14 },
  ]));
}
// 6  other page sizes
for (const [n, w, h] of [['A3', 842, 1191], ['A5', 420, 595], ['square300', 300, 300]]) {
  pages.push(make('size-' + n, { w, h }, [{ text: T.mixed, x: 20, y: 20, w: w - 40, size: 16 }, { text: T.long, x: 20, y: 90, w: w - 40, size: 14 }]));
}
// 7  a 200-char Latin and 150-char Arabic long title (one text box)
pages.push(make('long-title', A4, [{ text: 'A very long Latin title '.repeat(9).slice(0, 200), x: 60, y: 40, w: 475, size: 20 }, { text: ('عنوان عربي طويل جدا للاختبار ').repeat(6).slice(0, 150), x: 60, y: 200, w: 475, size: 20 }]));

// assemble the PDF
const out = new m.PDFDocument();
pages.forEach((p, i) => out.graftPage(-1, p.d, 0));
const file = 'editor.pdf', bytes = out.saveToBuffer('garbage=compact').asUint8Array().slice();
writeOut(file, bytes);
pages.forEach((p, i) => man.push({ writer: 'editor', file, page: i, label: p.label, expect: p.expect.filter(Boolean), size: bytes.length }));
fs.writeFileSync(path.join(OUT, 'manifest-editor.json'), JSON.stringify(man, null, 1));
console.log('editor.pdf', bytes.length, 'bytes', pages.length, 'pages');
