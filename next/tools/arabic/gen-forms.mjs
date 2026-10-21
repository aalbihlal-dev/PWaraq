// Writer 3: Forms — a form with Arabic-named fields, filled with fillForm (fillable and flattened)
// -> tests/fixtures/arabic-create/forms.pdf (filled, still fillable), forms-flat.pdf (flattened), forms-blank.pdf
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, fonts, save, writeOut } from './lib.mjs';
import { fillForm, listFields } from '../../src/lib/engine/forms.ts';

const NA = process.env.NA === '1', S = NA ? '-na' : '';
const d = new m.PDFDocument();
const helv = d.addObject(d.newDictionary());
helv.put('Type', d.newName('Font')); helv.put('Subtype', d.newName('Type1')); helv.put('BaseFont', d.newName('Helvetica')); helv.put('Encoding', d.newName('WinAnsiEncoding'));
const pageObj = d.addPage([0, 0, 595, 842], 0, {}, '0.9 0.92 0.9 RG 0.4 w ' + [...Array(12)].map((_, i) => `0 ${i * 70} m 595 ${i * 70} l S`).join(' '));
d.insertPage(-1, pageObj);
const page = d.findPage(0);
const fields = d.newArray(), annots = d.newArray();
const widget = (o) => {
  const w = d.addObject(d.newDictionary());
  w.put('Type', d.newName('Annot')); w.put('Subtype', d.newName('Widget')); w.put('F', 4); w.put('P', page);
  w.put('Rect', o.rect); w.put('T', d.newString(o.name)); w.put('FT', d.newName(o.ft));
  if (o.ff) w.put('Ff', o.ff);
  w.put('DA', d.newString('/Helv 12 Tf 0 g'));
  if (o.opt) { const a = d.newArray(); o.opt.forEach((x) => a.push(d.newString(x))); w.put('Opt', a); }
  if (o.tu) w.put('TU', d.newString(o.tu));
  fields.push(w); annots.push(w); return w;
};
// text fields (single-line), the long one multiline
const rows = [['الاسم', 'text'], ['العنوان', 'text'], ['name_latin', 'text']];
widget({ name: 'الاسم', ft: 'Tx', rect: [60, 760, 535, 790], tu: 'الاسم الكامل' });
widget({ name: 'address', ft: 'Tx', rect: [60, 700, 535, 730] });
widget({ name: 'notes', ft: 'Tx', ff: 4096, rect: [60, 560, 535, 680] });
widget({ name: 'tiny', ft: 'Tx', rect: [60, 520, 200, 540] });
// combo and list with Arabic options
widget({ name: 'مدينة', ft: 'Ch', ff: 1 << 17, rect: [60, 470, 300, 495], opt: ['القاهرة', 'الرياض', 'مسقط', 'Dubai'] });
widget({ name: 'list', ft: 'Ch', rect: [320, 400, 535, 495], opt: ['الأول', 'الثاني', 'الثالث', 'Fourth'] });
const cb = widget({ name: 'agree', ft: 'Btn', rect: [60, 440, 80, 460] });
fields.forEach(() => {});
const af = d.newDictionary();
af.put('Fields', fields); if (NA) af.put('NeedAppearances', true);
const dr = d.newDictionary(), df = d.newDictionary(); df.put('Helv', helv); dr.put('Font', df); af.put('DR', dr); af.put('DA', d.newString('/Helv 12 Tf 0 g'));
d.getTrailer().get('Root').put('AcroForm', af);
page.put('Annots', annots);
const blank = save(d);
writeOut(`forms${S}-blank.pdf`, blank);

const F = fonts(), f = listFields(m, blank), id = (n) => f.find((x) => x.name === n).id;
console.log(f.map((x) => `${x.id} ${x.name} ${x.type} ${x.rect.map(Math.round)}`).join('\n'));
const answers = {
  [id('الاسم')]: 'عبدالله محمد الأحمد', [id('address')]: T.mixed, [id('notes')]: T.long + '\n' + T.tashkeel + '\n' + T.indic, [id('tiny')]: T.longword,
  [id('مدينة')]: 'مسقط', [id('list')]: 'الثاني',
};
const filled = fillForm(m, blank, answers, false, F);
writeOut(`forms${S}.pdf`, filled);
writeOut(`forms${S}-flat.pdf`, fillForm(m, blank, answers, true, F));
const back = listFields(m, filled);
fs.writeFileSync(path.join(OUT, `forms${S}-values.json`), JSON.stringify(back.map((x) => ({ name: x.name, value: x.value, options: x.options })), null, 1));
for (const x of back) console.log('value:', x.name, '=>', JSON.stringify(x.value));
const man = [{ writer: 'forms', file: `forms${S}.pdf`, page: 0, label: 'filled', expect: [answers[id('الاسم')], T.mixed, T.long, 'مسقط', 'الثاني'] }];
fs.writeFileSync(path.join(OUT, `manifest-forms${S}.json`), JSON.stringify(man, null, 1));
fs.writeFileSync(path.join(OUT, `manifest-forms${S}-flat.json`), JSON.stringify(man.map((x) => ({ ...x, file: `forms${S}-flat.pdf`, label: 'flattened' })), null, 1));
// field names as stored
const out = m.Document.openDocument(filled, 'application/pdf').asPDF(), an = out.findPage(0).get('Annots');
for (let i = 0; i < an.length; i++) console.log('T:', an.get(i).get('T').toString(), '| V:', an.get(i).get('V').toString().slice(0, 40), '| DA:', an.get(i).get('DA').toString());
