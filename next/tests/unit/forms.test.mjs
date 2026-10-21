// Self-check of form filling with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { listFields, fillForm } from '../../src/lib/engine/forms.ts';

const form = fs.readFileSync(new URL('../fixtures/form.pdf', import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const by = (fields, name, on) => fields.find((f) => f.name === name && (!on || f.on === on));

test('list: text, read-only text, checkbox, a radio group (two options) and a combo box', () => {
  const f = listFields(m, form);
  assert.deepEqual(f.map((x) => [x.name, x.type]), [['name', 'text'], ['city', 'text'], ['agree', 'checkbox'], ['size', 'radio'], ['size', 'radio'], ['country', 'choice']]);
  assert.equal(by(f, 'city').readOnly, true);
  assert.equal(by(f, 'city').value, 'Cairo');
  assert.deepEqual(f.filter((x) => x.type === 'radio').map((x) => x.on), ['small', 'large']);
  assert.deepEqual(by(f, 'country').options, ['Egypt', 'Saudi Arabia', 'Oman']);
});

test('fill: values are saved, Arabic text is kept as real text, the form stays fillable; read-only fields are not changed', () => {
  const f = listFields(m, form), id = (n, on) => by(f, n, on).id;
  const out = fillForm(m, form, { [id('name')]: 'عبدالله', [id('city')]: 'Giza', [id('agree')]: true, [id('size', 'large')]: true, [id('country')]: 'Oman' }, false, fonts);
  const g = listFields(m, out);
  assert.equal(by(g, 'name').value, 'عبدالله');
  assert.equal(by(g, 'city').value, 'Cairo');
  assert.equal(by(g, 'agree').checked, true);
  assert.deepEqual(g.filter((x) => x.type === 'radio').map((x) => x.checked), [false, true]);
  assert.equal(by(g, 'country').value, 'Oman');
  // the Arabic answer is drawn (a picture of it exists), and the fields are still there to change
  const again = fillForm(m, out, { [id('agree')]: false }, false, fonts);
  assert.equal(by(listFields(m, again), 'agree').checked, false);
  assert.equal(by(listFields(m, again), 'name').value, 'عبدالله');
});

test('flatten: the answers become page content and the fields are gone', () => {
  const f = listFields(m, form);
  const out = fillForm(m, form, { [by(f, 'name').id]: 'Sami', [by(f, 'agree').id]: true }, true, fonts);
  assert.equal(listFields(m, out).length, 0);
  assert.match(m.Document.openDocument(out, 'application/pdf').loadPage(0).toStructuredText().asText(), /Sami/);
});

test('Arabic answers are drawn in the field (dark pixels appear where the field is)', () => {
  const f = listFields(m, form), dark = (b) => {
    const pix = m.Document.openDocument(b, 'application/pdf').loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), w = pix.getWidth();
    let n = 0; for (let y = 120; y < 142; y++) for (let x = 72; x < 300; x++) if (px[y * w + x] < 128) n++; return n;
  };
  assert.equal(dark(form), 0);
  assert.ok(dark(fillForm(m, form, { [by(f, 'name').id]: 'مرحبا بالعالم' }, false, fonts)) > 40);
});

test('a long Arabic answer in a multiline field wraps onto more lines instead of running off the edge', () => {
  // the "name" field made multiline and 80 pt tall (top at y 120 on the page as seen, 228 pt wide)
  const d = m.Document.openDocument(form, 'application/pdf').asPDF(), name = d.findPage(0).get('Annots').get(0);
  name.put('Ff', 4096); name.put('Rect', [72, 642, 300, 722]);
  const tall = d.saveToBuffer('').asUint8Array().slice(), id = by(listFields(m, tall), 'name').id;
  assert.equal(by(listFields(m, tall), 'name').multiline, true);
  const answer = 'هذه إجابة طويلة جدا عن السؤال تحتاج إلى أكثر من سطر واحد داخل الحقل';
  const out = fillForm(m, tall, { [id]: answer }, false, fonts);
  assert.equal(by(listFields(m, out), 'name').value, answer);
  const pix = m.Document.openDocument(out, 'application/pdf').loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), w = pix.getWidth();
  const dark = (top, bottom) => { let n = 0; for (let y = top; y < bottom; y++) for (let x = 72; x < 300; x++) if (px[y * w + x] < 128) n++; return n; };
  assert.ok(dark(122, 137) > 40, 'first line');
  assert.ok(dark(138, 153) > 40, 'second line');
});
