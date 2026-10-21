// File size cost of each writer: a blank one-page file vs the same after ONE Arabic line, and which fonts are embedded how.
import { m, T, fonts, basePdf, save } from './lib.mjs';
import { editPage } from '../../src/lib/engine/editpage.ts';
import { signPdf, placeSet, setEdits } from '../../src/lib/engine/sign.ts';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { fillForm, listFields } from '../../src/lib/engine/forms.ts';
import fs from 'node:fs'; import path from 'node:path'; import { OUT } from './lib.mjs';
const F = fonts(), base = save(basePdf([{ w: 595, h: 842, grid: false }])), kb = (n) => (n / 1024).toFixed(1) + ' KB';
const fontsOf = (b) => { const d = m.Document.openDocument(b, 'application/pdf').asPDF(), out = []; for (let i = 1; i < d.countObjects(); i++) { const o = d.newIndirect(i, 0).resolve?.() ?? d.newIndirect(i, 0); try { if (o.isDictionary() && o.get('Type').toString() === '/FontDescriptor') out.push(o.get('FontName').toString() + (o.get('FontFile2').isNull() ? '' : ' [FontFile2 ' + (o.get('FontFile2').readStream().asUint8Array().length / 1024).toFixed(0) + ' KB]')); } catch {} } return out; };
const row = (label, b) => console.log(label.padEnd(34), kb(b.length).padStart(10), ' fonts:', fontsOf(b).join(' | ') || '-');
row('blank page', base);
const ed = editPage(m, new m.PDFDocument(base), 0, [{ kind: 'text', text: 'مرحبا', x: 50, y: 50, w: 400, h: 30, size: 16, color: [0, 0, 0], bold: false, align: 'right' }], [], () => F);
row('editor: 1 short line (1 edit)', ed.saveToBuffer('garbage=compact').asUint8Array().slice());
const ed10 = editPage(m, new m.PDFDocument(base), 0, [...Array(10)].map((_, i) => ({ kind: 'text', text: T.pure, x: 50, y: 50 + i * 30, w: 400, h: 30, size: 16, color: [0, 0, 0], bold: false, align: 'right' })), [], () => F);
row('editor: 10 lines same page', ed10.saveToBuffer('garbage=compact').asUint8Array().slice());
// ten edited pages (each edit = one-page doc grafted back by the app)
const ten = new m.PDFDocument(); for (let i = 0; i < 10; i++) ten.graftPage(-1, ed, 0);
row('editor: same edit on 10 pages', ten.saveToBuffer('garbage=compact').asUint8Array().slice());
const photo = new Uint8Array(fs.readFileSync(path.join(OUT, '../signature-photo.png')));
const set = { ratio: 2.2, name: 'عبدالله', date: '21/10/2026' }, spot = { x: 300, y: 300, w: 200, h: 16, rtl: true };
row('sign: 1 page, name+date+photo', signPdf(m, base, [{ page: 0, edits: setEdits(set, placeSet(set, spot)) }], [photo], () => F));
const wm = (src) => { const doc = m.Document.openDocument(src, 'application/pdf'); return assemble(m, () => ({ doc, bytes: src }), { items: [{ doc: 0, page: 0 }], watermark: { text: 'سري' } }, () => F); };
row('watermark (assemble, subsetFonts)', wm(base));
const ten2 = save(basePdf([...Array(10)].map(() => ({ w: 595, h: 842, grid: false }))));
const doc10 = m.Document.openDocument(ten2, 'application/pdf');
row('watermark 10 pages', assemble(m, () => ({ doc: doc10, bytes: ten2 }), { items: [...Array(10)].map((_, i) => ({ doc: 0, page: i })), watermark: { text: 'سري' } }, () => F));
const blank = new Uint8Array(fs.readFileSync(path.join(OUT, 'forms-blank.pdf'))), f = listFields(m, blank);
row('forms: 1 Arabic answer, fillable', fillForm(m, blank, { [f[0].id]: 'عبدالله' }, false, F));
