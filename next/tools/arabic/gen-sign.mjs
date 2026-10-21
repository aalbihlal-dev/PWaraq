// Writer 4: Sign — signature set (photo + typed name + date) drawn by sign.signPdf; the date formats; visible digital-signature
// appearance (signcert.prepareSignature) -> tests/fixtures/arabic-create/sign.pdf, sign-cert.pdf
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, ROOT, fonts, basePdf, save, writeOut, outline } from './lib.mjs';
import { signPdf, placeSet, setEdits, formatDate } from '../../src/lib/engine/sign.ts';
import { prepareSignature } from '../../src/lib/engine/signcert.ts';

const F = fonts(), photo = new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests/fixtures/signature-photo.png')));
const day = new Date(Date.UTC(2026, 9, 21, 12));
const dates = [];
for (const cal of ['gregory', 'islamic-umalqura']) for (const style of ['numeric', 'long', 'iso']) for (const lang of ['ar', 'en']) dates.push({ cal, style, lang, text: formatDate(day, cal, style, lang) });
fs.writeFileSync(path.join(OUT, 'sign-dates.json'), JSON.stringify(dates, null, 1));
console.log(dates.map((d) => `${d.cal}/${d.style}/${d.lang}: ${d.text}`).join('\n'));

const specs = [];
const ratio = 2.2;
const names = ['عبدالله محمد الأحمد', T.tashkeel, 'محمد بن عبدالله Al-Ahmad 2026', 'عبدالله محمد الأحمد الحربي الشمري الدوسري القحطاني', 'پژمان', 'ب', 'Abdullah Al-Ahmad', 'الدكتور/ عبدالله (المشرف)', 'سارة ٢٠٢٦'];
// one set per page: the name under the signature and the date; spot = the blank on a typed line
names.forEach((n, i) => specs.push({ label: 'name-' + i, page: { w: 595, h: 842 }, name: n, date: dates[i % dates.length].text, rtl: true }));
dates.forEach((d, i) => specs.push({ label: `date-${d.cal}-${d.style}-${d.lang}`, page: { w: 595, h: 842 }, name: 'عبدالله محمد', date: d.text, rtl: d.lang === 'ar' }));
for (const rot of [90, 180, 270]) specs.push({ label: 'rot' + rot, page: { w: 612, h: 792, rot }, name: 'عبدالله محمد الأحمد', date: dates[1].text, rtl: true });
specs.push({ label: 'crop-origin', page: { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700] }, name: 'عبدالله محمد الأحمد', date: dates[1].text, rtl: true });
specs.push({ label: 'size-A5', page: { w: 420, h: 595 }, name: 'عبدالله محمد الأحمد', date: dates[0].text, rtl: true });

const base = basePdf(specs.map((s) => s.page));
const pages = specs.map((s, i) => {
  const spot = { x: 300, y: 300, w: 200, h: 16, rtl: s.rtl }, set = { ratio, name: s.name, date: s.date }, placed = placeSet(set, spot);
  return { page: i, edits: setEdits(set, placed, [0, 0, 0]), placed };
});
const bytes = signPdf(m, save(base), pages.map((p) => ({ page: p.page, edits: p.edits })), [photo], () => F);
// outline the boxes the name/date should stay in
const d2 = new m.PDFDocument(bytes);
pages.forEach((p, i) => { for (const b of [p.placed.name, p.placed.date]) if (b) outline(d2, i, b); });
const out = d2.saveToBuffer('garbage=compact').asUint8Array().slice();
writeOut('sign.pdf', out);
const man = specs.map((s, i) => ({ writer: 'sign', file: 'sign.pdf', page: i, label: s.label, expect: [s.name, s.date] }));
fs.writeFileSync(path.join(OUT, 'manifest-sign.json'), JSON.stringify(man, null, 1));
console.log('sign.pdf', out.length);

// Visible appearance of a certificate signature with an Arabic signer name / reason / location
const plan = {
  page: 0, rect: { x: 60, y: 600, w: 220, h: 80 }, // the whole set inside the field's rectangle (photo on top, name and date under it)
  edits: [{ kind: 'photo', photo: 0, x: 90, y: 604, w: 100, h: 40 },
    { kind: 'text', text: 'عبدالله محمد الأحمد', size: 10, color: [0, 0, 0], bold: false, align: 'center', x: 70, y: 648, w: 200, h: 13 },
    { kind: 'text', text: dates[6].text, size: 10, color: [0, 0, 0], bold: false, align: 'center', x: 70, y: 662, w: 200, h: 13 }],
  name: 'عبدالله محمد الأحمد', reason: 'أوافق على هذا المستند', location: 'الرياض، المملكة العربية السعودية', contact: 'عبدالله@example.com', time: "D:20261021120000Z", room: 4096,
};
const prep = prepareSignature(m, save(basePdf([{ w: 595, h: 842 }])), '', plan, [photo], () => F);
writeOut('sign-cert.pdf', prep.bytes);
fs.writeFileSync(path.join(OUT, 'manifest-sign-cert.json'), JSON.stringify([{ writer: 'sign-cert', file: 'sign-cert.pdf', page: 0, label: 'cert-appearance', expect: ['عبدالله محمد الأحمد'] }], null, 1));
const doc = m.Document.openDocument(prep.bytes, 'application/pdf').asPDF();
const w = doc.findPage(0).get('Annots').get(0), sv = w.get('V');
console.log('Sig /Name', sv.get('Name').toString(), '/Reason', sv.get('Reason').toString().slice(0, 40), '/Location', sv.get('Location').toString().slice(0, 30), '/T', w.get('T').toString());
