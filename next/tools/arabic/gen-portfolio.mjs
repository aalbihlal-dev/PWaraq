// Writers 5+6: watermark, page numbers (assemble/tools) and the Portfolio pages (cover, dividers, contents, paper), bookmarks.
// -> tests/fixtures/arabic-create/{marks,portfolio,portfolio-ltr}.pdf (+ manifests)
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, fonts, basePdf, save, writeOut } from './lib.mjs';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { DESIGNS, COLOURS } from '../../src/lib/engine/designs.ts';

const F = fonts();
const run = (srcBytes, build) => {
  const doc = m.Document.openDocument(srcBytes, 'application/pdf');
  return assemble(m, () => ({ doc, bytes: srcBytes }), build, () => F);
};
const manifest = (name, items) => fs.writeFileSync(path.join(OUT, `manifest-${name}.json`), JSON.stringify(items.map((x, i) => ({ writer: name, file: name + '.pdf', page: i, ...x })), null, 1));

// ---------- A. numbers + watermark over source pages of different geometry
const geo = [
  { w: 595, h: 842 }, { w: 612, h: 792, rot: 90 }, { w: 612, h: 792, rot: 180 }, { w: 612, h: 792, rot: 270 },
  { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700] }, { w: 842, h: 1191 }, { w: 420, h: 595 },
];
const src = save(basePdf(geo));
const items = geo.map((_, i) => ({ doc: 0, page: i }));
const wms = [
  { text: 'سري للغاية', angle: 45 }, { text: 'مسودة — Draft 2026', angle: 0, size: 60 }, { text: 'بِسْمِ اللَّهِ', angle: 45 }, { text: 'نسخة ٢٠٢٦', angle: 30 },
  { text: 'سري للغاية', angle: 45, color: [0.85, 0.1, 0.1], opacity: 0.35 }, { text: 'هذه عبارة طويلة جدا للعلامة المائية يجب أن تصغر لتناسب الصفحة كلها دون أن تخرج', angle: 45 }, { text: 'ب', angle: 45 },
];
const wmBytes = [];
const wmFiles = wms.map((w, k) => { const b = run(src, { items, watermark: { ...w } }); writeOut(`marks-wm${k}.pdf`, b); return b; });
// the combination of the first watermark with page numbers in the 6 positions
const numPos = ['bl', 'bc', 'br', 'tl', 'tc', 'tr'];
numPos.forEach((p) => { const b = run(src, { items, numbers: true, numberStyle: { position: p, total: true, start: 1 } }); writeOut(`marks-num-${p}.pdf`, b); });
manifest('marks-wm0', geo.map(() => ({ label: 'wm0', expect: [wms[0].text] })));
for (let k = 1; k < wms.length; k++) manifest(`marks-wm${k}`, geo.map((g, i) => ({ label: 'wm' + k + '-' + i, expect: [wms[k].text] })));
for (const p of numPos) manifest(`marks-num-${p}`, geo.map((g, i) => ({ label: `num-${p}-${i}`, expect: [`${i + 1} / ${geo.length}`] })));

// ---------- B. portfolio pages
const arT = {
  title: 'التقرير السنوي لمشروع التحول الرقمي وأثره على الاستقلال المالي للمؤسسات الصغيرة والمتوسطة', subtitle: 'دراسة حالة: المملكة العربية السعودية ٢٠٢٦',
  names: ['عبدالله محمد الأحمد', 'سارة بنت خالد الدوسري', 'پژمان Al-Ahmad'], supervisor: 'د. فاطمة الزهراء بن عبدالله',
};
const cover = (design, extra = {}, rtl = true) => ({ blank: false, fit: { w: 595, h: 842 }, cover: { w: 595, h: 842, design, color: COLOURS[DESIGNS.indexOf(design) % COLOURS.length], rtl, supervisorLabel: 'إشراف:', ...arT, ...extra } });
const divider = (design, extra = {}) => ({ fit: { w: 595, h: 842 }, divider: { w: 595, h: 842, design, color: COLOURS[DESIGNS.indexOf(design) % COLOURS.length], rtl: true, label: 'القسم ٣', title: 'الفصل الثالث: النتائج والمناقشة', note: 'ملاحظة: يحتوي هذا القسم على ١٢ جدولا.', header: { title: arT.title, name: arT.names[0], size: 'big' }, ...extra } });
const toc = (entries, rtl = true) => ({ fit: { w: 595, h: 842 }, toc: { w: 595, h: 842, heading: rtl ? 'المحتويات' : 'Contents', rtl, entries } });
const long150 = 'عنوان عربي طويل جدا للاختبار يتضمن كلمات كثيرة '.repeat(5).slice(0, 150), long200 = 'A very long English title for the portfolio cover page '.repeat(4).slice(0, 200);
const pi = [];
const man = [];
const push = (it, label, expect) => { pi.push(it); man.push({ label, expect }); };
for (const d of DESIGNS) push(cover(d), 'cover-' + d, [arT.title, arT.subtitle, ...arT.names, 'إشراف: ' + arT.supervisor]);
for (const d of DESIGNS) push(divider(d), 'divider-' + d, ['القسم ٣', 'الفصل الثالث: النتائج والمناقشة']);
push(cover('classic', { title: long150, subtitle: undefined }), 'cover-long150ar', [long150]);
push(cover('classic', { title: long200, subtitle: undefined }), 'cover-long200latin', [long200]);
push(cover('minimal', { title: T.tashkeel, subtitle: T.indic, names: [T.lamalef, T.parens, T.persian] }), 'cover-tashkeel-indic', [T.tashkeel, T.indic, T.lamalef, T.parens]);
push(cover('classic', { title: 'ب', subtitle: '', names: [''], supervisor: '' }), 'cover-onechar', ['ب']);
push(cover('classic', { title: long150, subtitle: long150, names: ['اسم طويل جدا '.repeat(12)], supervisor: 'مشرف طويل '.repeat(15) }), 'cover-all-long', [long150]);
push(divider('classic', { title: long150, note: long150 }), 'divider-long150', [long150]);
push(divider('classic', { title: long200, label: 'Section 3', rtl: false }), 'divider-long200latin', [long200]);
const entries = [...Array(12)].map((_, i) => ({ title: i === 3 ? long150 : i === 5 ? long200 : i === 7 ? T.tashkeel : i === 8 ? T.mixed : 'القسم ' + (i + 1) + ': ' + T.pure.slice(0, 20), number: i + 1, to: 0 }));
push(toc(entries), 'toc-rtl', entries.map((e) => e.title));
push(toc(entries, false), 'toc-ltr-arabic-titles', entries.map((e) => e.title));
for (const paper of ['plain', 'lined', 'grid', 'dotted']) push({ blank: true, paper, fit: { w: 595, h: 842 } }, 'paper-' + paper, []);
// also: the same cover/divider on rotated/other page sizes
push({ ...cover('band'), fit: { w: 842, h: 1191 }, cover: { ...cover('band').cover, w: 842, h: 1191 } }, 'cover-band-A3', [arT.title]);
push({ ...cover('split'), fit: { w: 420, h: 595 }, cover: { ...cover('split').cover, w: 420, h: 595 } }, 'cover-split-A5', [arT.title]);
push({ ...cover('frame'), fit: { w: 842, h: 595 }, cover: { ...cover('frame').cover, w: 842, h: 595 } }, 'cover-frame-landscape', [arT.title]);
const bookmarks = [{ title: arT.title, at: 0 }, { title: T.tashkeel, at: 1 }, { title: 'Chapter 1 — ' + T.pure, at: 2 }, { title: long150, at: 3 }, { title: 'الفصل ٣ ' + T.persian, at: 4 }];
const doc0 = save(basePdf([{ w: 595, h: 842 }]));
const out = run(doc0, { items: pi, bookmarks, numbers: true, meta: { title: arT.title, author: arT.names.join('  ·  '), subject: arT.subtitle, lang: 'ar' } });
writeOut('portfolio.pdf', out);
manifest('portfolio', man);
fs.writeFileSync(path.join(OUT, 'portfolio-bookmarks.json'), JSON.stringify(bookmarks.map((b) => b.title)));
console.log('portfolio.pdf', out.length, 'bytes,', pi.length, 'pages; wm sizes', wmFiles.map((b) => b.length).join(','));
