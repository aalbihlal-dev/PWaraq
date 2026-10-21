// Shared helpers for the Arabic "create" audit (tools/arabic/*). Drives the REAL engine writers (src/lib/engine) in Node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'tests/fixtures/arabic-create');
export const SHOTS = path.resolve(ROOT, '../Archive-2026-10-12/screenshots/arabic-audit');
export { m, hb };
export const font = (f) => new m.Font(f.replace(/\.ttf$/, ''), fs.readFileSync(path.join(ROOT, 'public/fonts', f.endsWith('.ttf') ? f : f + '.ttf')));
export const fonts = () => ({ regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') });
export const fontBytes = (f) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/fonts', f)));
export const own = { hb, file: fontBytes };

// The text scenarios every writer is tried with (logical order, as typed)
export const T = {
  pure: 'مرحبا بالعالم، هذا نص عربي للاختبار',
  mixed: 'الفاتورة رقم INV-2026 بتاريخ 21/10/2026 بمبلغ 1,250.50 ريال',
  indic: 'رقم الهاتف ٠١٢٣٤٥٦٧٨٩ والسنة ١٤٤٨ هـ',
  tashkeel: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  lamalef: 'لا إله إلا الله، لأن لإبراهيم لآلئ',
  parens: 'النص (بين قوسين) و[أقواس] «اقتباس» 50% - ما هذا؟',
  persian: 'پژوهش چگونه گفتگو گچ',
  long: 'هذا نص طويل جدا يجب أن ينتقل إلى عدة أسطر داخل الصندوق دون أن يتجاوز حدوده، ويحتوي على كلمات كثيرة ومتنوعة لاختبار الالتفاف في الأسطر: الاستقلال، والمسؤولية، والاستثمار، ومحمد عبد الله، ثم الكلمات الأخيرة.',
  longword: 'استقلالية'.repeat(9),
  one: 'ب',
  latin: 'Hello world 123',
};
export const SCEN = Object.keys(T);

export function writeOut(name, bytes) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), bytes); return path.join(OUT, name); }

/** a blank PDF with pages [{w,h,rot,media,crop,grid}] — grid paints a light 50pt grid in page space so rotation/offset show */
export function basePdf(pages) {
  const d = new m.PDFDocument();
  pages.forEach((p, i) => {
    let ops = '';
    const [x0, y0, x1, y1] = p.media ?? [0, 0, p.w, p.h];
    if (p.grid !== false) {
      ops += '0.9 0.92 0.9 RG 0.4 w ';
      for (let x = Math.ceil(x0 / 50) * 50; x < x1; x += 50) ops += `${x} ${y0} m ${x} ${y1} l S `;
      for (let y = Math.ceil(y0 / 50) * 50; y < y1; y += 50) ops += `${x0} ${y} m ${x1} ${y} l S `;
      // origin marker: small red square at MediaBox origin + page label
      ops += '0.8 0.1 0.1 rg ' + `${x0} ${y0} 10 10 re f `;
    }
    const pg = d.addPage([x0, y0, x1, y1], 0, {}, ops);
    d.insertPage(-1, pg);
    const o = d.findPage(i);
    if (p.rot) o.put('Rotate', p.rot);
    if (p.crop) o.put('CropBox', p.crop);
  });
  return d;
}
export const save = (d) => d.saveToBuffer('garbage=compact').asUint8Array().slice();

/** rectangle outline (expected text box) in SEEN coordinates (top-left origin) stamped on a page of doc d */
import { pageBox, seenMatrix } from '../../src/lib/engine/tools.ts';
import { stamp } from '../../src/lib/engine/assemble.ts';
export function outline(d, i, b, rgb = '0.2 0.4 0.9') {
  const p = d.findPage(i), { box, rot, seenH } = pageBox(p), M = seenMatrix(box, rot).map((v) => +v.toFixed(3)).join(' ');
  stamp(d, p, `q ${M} cm ${rgb} RG 0.5 w ${b.x} ${seenH - b.y - b.h} ${b.w} ${b.h} re S Q`, {});
}
export { pageBox, seenMatrix, stamp };
