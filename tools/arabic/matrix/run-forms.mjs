// Matrix 4: Forms — fillable fields placed over the printed boxes of the form documents (variants, scans, hybrids), filled with Arabic.
// Judged by rendering: the answer lands inside its box, upright, right aligned (RTL); several answers at once.
// Fields are written the way Acrobat writes them (/MK /R = the page's turn on a turned page).
// usage: node tools/arabic/matrix/run-forms.mjs [filter]   -> tests/audit-arabic/results/matrix-forms.json
import { m, fonts } from '../lib.mjs';
import { pageBox, seenMatrix } from '../../../src/lib/engine/tools.ts';
import { fillForm, listFields } from '../../../src/lib/engine/forms.ts';
import { subjects, render, diff, expand, inside, truth, Rows, r1 } from './mx.mjs';

const F = fonts(), rows = new Rows('forms'), only = process.argv[2] ?? 'form-boxes';
function withFields(bytes, boxes) {
  const d = new m.PDFDocument(bytes), page = d.findPage(0), { box, rot, seenH } = pageBox(page), mat = seenMatrix(box, rot);
  const ap = (x, y) => [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]];
  const fields = d.newArray(), annots = page.get('Annots').isArray() ? page.get('Annots') : d.newArray();
  boxes.forEach((b, i) => {
    const p = [ap(b.x, seenH - b.y - b.h), ap(b.x + b.w, seenH - b.y)], w = d.addObject(d.newDictionary());
    w.put('Type', d.newName('Annot')); w.put('Subtype', d.newName('Widget')); w.put('F', 4); w.put('P', page); w.put('FT', d.newName('Tx'));
    w.put('Rect', [Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1]), Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])].map((v) => +v.toFixed(2)));
    w.put('T', d.newString(b.name)); w.put('DA', d.newString('/Helv 12 Tf 0 g')); if (b.multi) w.put('Ff', 4096);
    if (rot) { const mk = d.newDictionary(); mk.put('R', rot); w.put('MK', mk); }
    fields.push(w); annots.push(w);
  });
  page.put('Annots', annots);
  const af = d.newDictionary(), dr = d.newDictionary(), df = d.newDictionary(), helv = d.addObject(d.newDictionary());
  helv.put('Type', d.newName('Font')); helv.put('Subtype', d.newName('Type1')); helv.put('BaseFont', d.newName('Helvetica')); helv.put('Encoding', d.newName('WinAnsiEncoding'));
  df.put('Helv', helv); dr.put('Font', df); af.put('Fields', fields); af.put('DR', dr); af.put('DA', d.newString('/Helv 12 Tf 0 g'));
  d.getTrailer().get('Root').put('AcroForm', af);
  return d.saveToBuffer('').asUint8Array().slice();
}
for (const s of subjects((s) => s.id.includes(only))) {
  const boxes = truth(s, 'field'); if (!boxes?.length) { continue; }
  let formBytes; try { formBytes = withFields(s.bytes(), boxes); } catch (e) { rows.add('forms', 'build fields', s, false, 'error', String(e.message).slice(0, 80)); continue; }
  const base = render(formBytes, 1.5), fields = listFields(m, formBytes);
  if (fields.length !== boxes.length) { rows.add('forms', 'fields listed', s, false, `${fields.length}/${boxes.length}`, 'field count'); continue; }
  const idOf = (name) => fields.find((f) => f.name === name).id, boxOf = (name) => boxes.find((b) => b.name === name);
  // one single-line answer
  try {
    const b = boxOf('f0'), out = fillForm(m, formBytes, { [idOf('f0')]: 'عبدالله محمد الأحمد' }, false, F), df = diff(base, render(out, 1.5), 25, expand(b, 40));
    const vertical = b.h > b.w, ok = df.n && inside(df.box, expand(b, 3)) && (vertical ? df.box.h > df.box.w * 2 : df.box.w > df.box.h * 2), right = vertical || (df.n && Math.abs(df.box.x + df.box.w - (b.x + b.w)) < 12);
    rows.add('forms', 'Arabic answer lands in its box, upright, right aligned', s, !df.n ? false : ok && right ? true : false, df.n ? `inside ${inside(df.box, expand(b, 3))}, w/h ${r1(df.box.w / df.box.h)}, right edge off ${r1(Math.abs(df.box.x + df.box.w - (b.x + b.w)))} pt` : 'nothing visible', !df.n ? 'invisible' : !inside(df.box, expand(b, 3)) ? 'outside its box' : (vertical ? df.box.h <= df.box.w * 2 : df.box.w <= df.box.h * 2) ? 'turned the wrong way' : !right ? 'not right aligned' : '');
  } catch (e) { rows.add('forms', 'Arabic answer lands in its box, upright, right aligned', s, false, 'error', String(e.message).slice(0, 80)); }
  // the multiline box
  try {
    const b = boxOf('notes'), out = fillForm(m, formBytes, { [idOf('notes')]: 'ملاحظات أولى في السطر الأول\nملاحظات ثانية في السطر الثاني' }, false, F), df = diff(base, render(out, 1.5), 25, expand(b, 40));
    const vert2 = b.h > b.w; rows.add('forms', 'multiline answer inside its box, top aligned', s, df.n ? inside(df.box, expand(b, 3)) && (vert2 || (df.box.y < b.y + b.h * 0.4 && df.box.w > df.box.h)) : false, df.n ? `inside ${inside(df.box, expand(b, 3))}, top at ${r1((df.box.y - b.y) / b.h * 100)}% of the box` : 'nothing visible', !df.n ? 'invisible' : '');
  } catch (e) { rows.add('forms', 'multiline answer inside its box, top aligned', s, false, 'error', String(e.message).slice(0, 80)); }
  // all text answers at once: how many survive
  try {
    const ans = {}; ['f0', 'f1', 'f2', 'f3', 'f4'].forEach((n, i) => { ans[idOf(n)] = ['عبدالله محمد الأحمد', 'الرياض حي النخيل', 'الهوية ١٢٣٤٥٦٧٨٩٠', 'موبايل ٠٥٥٥١٢٣٤٥٦', 'ahmad@example.org'][i]; });
    const out = fillForm(m, formBytes, ans, false, F), after = render(out, 1.5);
    const shown = ['f0', 'f1', 'f2', 'f3', 'f4'].filter((n) => diff(base, after, 25, expand(boxOf(n), 3)).n > 0).length;
    rows.add('forms', 'five answers at once: all visible', s, shown === 5, `${shown} of 5 answers visible`, shown < 5 ? 'answers lost' : '');
  } catch (e) { rows.add('forms', 'five answers at once: all visible', s, false, 'error', String(e.message).slice(0, 80)); }
}
rows.save();
