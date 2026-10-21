// Builds the Arabic editing corpus, tests/fixtures/arabic/ (the same paragraphs from many producers and fonts):
//   node tools/arabic/make-corpus.mjs [own|real|edge|all]     then  <venv>/Scripts/python tools/arabic/make-corpus.py
// Producers here: Edge print-to-PDF (Skia/PDFium, one file per installed or fetched font), Waraq's own writers
// (Tajawal presentation forms; HarfBuzz-shaped subset / full / CFF fonts; a copy without ToUnicode; a CAD-like file whose
// text maps to presentation forms), and single pages of the public PDFs tools/get-ocr-set.mjs downloads (real/, git-ignored).
// Fonts fetched under the OFL live in FONTS (not committed); Windows fonts are used by name.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';
import { pageWriter, visual, toUnicode } from '../../src/lib/engine/textpage.ts';
import { shapedWriter, shaper } from '../../src/lib/engine/ownfont.ts';
import { TEXTS } from '../../tests/fixtures/arabic/texts.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..'), OUT = path.join(ROOT, 'tests', 'fixtures', 'arabic');
export const FONTS = process.env.ARABIC_FONTS ?? path.join(process.env.LOCALAPPDATA, 'Temp', 'claude', 'C--Users-Abdullah-Documents-ChatGPT-PDF-Open-Source-waraq-next', 'd5d66cc1-abe4-4e52-abe7-f46d0d5ffe77', 'scratchpad', 'fonts');
const SCRATCH = path.join(FONTS, '..', 'corpus-src');
fs.mkdirSync(path.join(OUT, 'real'), { recursive: true }); fs.mkdirSync(SCRATCH, { recursive: true });
const pub = (f) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)));
const fetched = (f) => new Uint8Array(fs.readFileSync(path.join(FONTS, f)));
const save = (name, bytes) => { fs.writeFileSync(path.join(OUT, name), bytes); console.log(name, Math.round(bytes.length / 1024) + ' kB'); };
const fwd = (p) => p.replace(/\\/g, '/');

// ---- the document as HTML (Edge, and make-corpus.py reuses it for MuPDF Story) ----
export function html(family, face) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = TEXTS.map((t) => {
    if (t.cells) return null;
    const style = [t.bold && 'font-weight:700', t.italic && 'font-style:italic', t.color && `color:${t.color}`, t.size && `font-size:${t.size}pt`, t.kind === 'justified' && 'text-align:justify'].filter(Boolean).join(';');
    return `<p class="${t.kind}" style="${style}">${esc(t.text)}</p>`;
  }).filter(Boolean).join('\n');
  const rows = TEXTS.filter((t) => t.cells).map((t) => `<tr>${t.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${face ?? ''}<style>
@page { size: A4; margin: 18mm; } body { font-family: "${family}"; font-size: 13pt; line-height: 1.7; margin: 0; }
p { margin: 0 0 6pt; } table { border-collapse: collapse; margin: 6pt 0; } td { border: 1px solid #999; padding: 2pt 10pt; }
</style></head><body>${body}<table>${rows}</table></body></html>`;
}
const WIN = ['Arial', 'Tahoma', 'Segoe UI', 'Times New Roman', 'Traditional Arabic', 'Simplified Arabic', 'Sakkal Majalla', 'Courier New', 'Calibri', 'Arabic Typesetting', 'Dubai', 'Andalus', 'Aldhabi', 'Arial Unicode MS'];
const OPEN = [['Tajawal', path.join(ROOT, 'public/fonts/Tajawal-Regular.ttf'), path.join(ROOT, 'public/fonts/Tajawal-Bold.ttf')],
  ['Noto Naskh Arabic', path.join(ROOT, 'public/fonts/NotoNaskhArabic-Regular.ttf'), path.join(ROOT, 'public/fonts/NotoNaskhArabic-Bold.ttf')],
  ['Noto Sans Arabic', path.join(ROOT, 'public/fonts/NotoSansArabic-Regular.ttf'), path.join(ROOT, 'public/fonts/NotoSansArabic-Bold.ttf')],
  ['Amiri', path.join(FONTS, 'Amiri-Regular.ttf'), path.join(FONTS, 'Amiri-Bold.ttf')], ['Cairo', path.join(FONTS, 'Cairo-VF.ttf')],
  ['Scheherazade New', path.join(FONTS, 'ScheherazadeNew-Regular.ttf')], ['Lateef', path.join(FONTS, 'Lateef-Regular.ttf')],
  ['Noto Kufi Arabic', path.join(FONTS, 'NotoKufiArabic-VF.ttf')], ['Harmattan', path.join(FONTS, 'Harmattan-Regular.ttf')], ['Markazi Text', path.join(FONTS, 'MarkaziText-VF.ttf')],
  ['Noto Naskh Arabic OTF', path.join(FONTS, 'NotoNaskhArabic-Regular.otf')]];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const face = (name, reg, bold) => `<style>@font-face{font-family:"${name}";src:url("file:///${fwd(reg)}")}${bold ? `@font-face{font-family:"${name}";font-weight:700;src:url("file:///${fwd(bold)}")}` : ''}</style>`;

async function edge() {
  const browser = await chromium.launch({ channel: 'msedge' }), page = await browser.newPage();
  const docs = [...WIN.map((f) => [f, html(f)]), ...OPEN.filter((o) => fs.existsSync(o[1])).map(([f, reg, bold]) => [f, html(f, face(f, reg, bold))])];
  for (const [family, h] of docs) {
    const file = path.join(SCRATCH, slug(family) + '.html');
    fs.writeFileSync(file, h);
    await page.goto('file:///' + fwd(file));
    await page.evaluate(() => document.fonts.ready);
    save(`edge-${slug(family)}.pdf`, await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  }
  await browser.close();
}

// ---- Waraq's own writers ----
function subset(bytes, text) { // like Word: only the letters used (HarfBuzz subsetter keeps the shaping rules)
  const x = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm')))).exports;
  const ptr = x.malloc(bytes.length); new Uint8Array(x.memory.buffer).set(bytes, ptr);
  const blob = x.hb_blob_create(ptr, bytes.length, 2, 0, 0), f = x.hb_face_create(blob, 0), input = x.hb_subset_input_create_or_fail(), set = x.hb_subset_input_unicode_set(input);
  for (const c of text) x.hb_set_add(set, c.codePointAt(0));
  const out = x.hb_face_reference_blob(x.hb_subset_or_fail(f, input)), at = x.hb_blob_get_data(out, 0);
  return new Uint8Array(x.memory.buffer).slice(at, at + x.hb_blob_get_length(out));
}
const LINES = TEXTS.flatMap((t) => (t.cells ? [{ ...t, text: t.cells.join('    ') }] : [t]));
const rgb = (hex) => hex ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) : [0, 0, 0];
function own() {
  // 1. Tajawal via pageWriter (presentation forms, glyph ids, logical ToUnicode) — how Waraq's own pages and added text look
  {
    const doc = new m.PDFDocument(), fonts = { regular: new m.Font('Tajawal', pub('Tajawal-Regular.ttf')), bold: new m.Font('Tajawal-Bold', pub('Tajawal-Bold.ttf')) }, w = pageWriter(m, doc, fonts);
    let y = 90; const lines = LINES.map((t) => { const size = t.size ?? 13; const l = { text: t.text, x: 523, y, size, bold: !!t.bold, color: rgb(t.color), align: 'right' }; y += size * 1.9; return l; });
    doc.insertPage(-1, w.add({ w: 595, h: 842, lines })); w.finish();
    save('waraq-tajawal-pagewriter.pdf', doc.saveToBuffer('garbage=compact').asUint8Array());
  }
  // 2-5. HarfBuzz-shaped (shapedWriter): Noto Naskh subset (like Word), Amiri full, Noto Naskh CFF (OpenType), and the subset one with its ToUnicode removed
  const shapedDoc = (name, bytes, boldBytes) => {
    const doc = new m.PDFDocument(), w = shapedWriter(m, hb, doc), s = shaper(hb, name, bytes), b = boldBytes ? shaper(hb, name + '-Bold', boldBytes, true) : null;
    let y = 90, ops = '';
    for (const t of LINES) { const size = t.size ?? 13; ops += w.draw(t.bold && b ? b : s, { text: t.text, x: 523, y, size, color: rgb(t.color), align: 'right', fake: !!t.bold && !b }, 842); y += size * 1.9; }
    w.finish();
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: w.fonts }, ops));
    return doc;
  };
  const all = LINES.map((t) => t.text).join('');
  save('waraq-notonaskh-subset.pdf', shapedDoc('NotoNaskhArabic', subset(pub('NotoNaskhArabic-Regular.ttf'), all), subset(pub('NotoNaskhArabic-Bold.ttf'), all)).saveToBuffer('garbage=compact').asUint8Array());
  save('waraq-lateef-full.pdf', shapedDoc('Lateef', fetched('Lateef-Regular.ttf')).saveToBuffer('garbage=compact').asUint8Array());
  if (fs.existsSync(path.join(FONTS, 'NotoNaskhArabic-Regular.otf'))) save('waraq-notonaskh-cff.pdf', shapedDoc('NotoNaskhArabic', fetched('NotoNaskhArabic-Regular.otf')).saveToBuffer('garbage=compact').asUint8Array());
  {
    const doc = shapedDoc('NotoNaskhArabic', subset(pub('NotoNaskhArabic-Regular.ttf'), all));
    doc.findPage(0).get('Resources', 'Font').forEach((f) => f.delete('ToUnicode'));
    save('waraq-notonaskh-no-tounicode.pdf', doc.saveToBuffer('garbage=compact').asUint8Array());
  }
  // 6. CAD / old-exporter style: Tajawal glyphs placed one by one left to right, ToUnicode pointing at presentation forms
  {
    const doc = new m.PDFDocument(), font = new m.Font('Tajawal', pub('Tajawal-Regular.ttf')), ref = doc.addFont(font), used = new Map();
    let y = 90, ops = '';
    for (const t of LINES) {
      const size = t.size ?? 13, gs = visual(t.text), width = gs.reduce((w, g) => w + font.advanceGlyph(font.encodeCharacter(g.code)) * size, 0);
      let x = 523 - width;
      for (const g of gs) { const gid = font.encodeCharacter(g.code); used.set(gid, [g.code]); ops += `BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(842 - y).toFixed(2)} Tm <${gid.toString(16).padStart(4, '0')}> Tj ET\n`; x += font.advanceGlyph(gid) * size; }
      y += size * 1.9;
    }
    ref.put('ToUnicode', doc.addStream(toUnicode(used), {}));
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: ref } }, ops));
    save('cadlike-visual-presentation-forms.pdf', doc.saveToBuffer('garbage=compact').asUint8Array());
  }
}

// ---- single pages of the public PDFs (downloaded by tools/get-ocr-set.mjs; licence not stated, so git-ignored) ----
function real() {
  const dl = path.join(ROOT, 'tests/fixtures/ocr/real/dl');
  const pages = [['cma-circular10.pdf', 1, 'real-cma-circular-frutiger-type1.pdf'], ['cma-fund-tc.pdf', 3, 'real-cma-fund-pingar-type1.pdf'],
    ['gastat-annual-2024.pdf', 3, 'real-gastat-neosans-type0.pdf'], ['gastat-annual-2024.pdf', 13, 'real-gastat-definitions.pdf'],
    ['moj-monthly-66.pdf', 3, 'real-moj-dinnext-type0.pdf'], ['moj-monthly-66.pdf', 8, 'real-moj-regulations-list.pdf']];
  for (const [file, page, name] of pages) {
    const f = path.join(dl, file);
    if (!fs.existsSync(f)) { console.log('missing', file, '(run node tools/get-ocr-set.mjs)'); continue; }
    const src = new m.PDFDocument(new Uint8Array(fs.readFileSync(f))), out = new m.PDFDocument();
    out.graftPage(-1, src, page - 1);
    save(path.join('real', name), out.saveToBuffer('garbage=compact').asUint8Array());
  }
}

if (process.argv[1] === import.meta.filename) {
  const what = process.argv[2] ?? 'all';
  if (what === 'all' || what === 'own') own();
  if (what === 'all' || what === 'real') real();
  if (what === 'all' || what === 'edge') await edge();
}
