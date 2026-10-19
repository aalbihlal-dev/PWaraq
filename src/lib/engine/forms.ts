// PDF form fields on top of MuPDF: list them (text, checkbox, radio, choice) and fill them in. Pure (MuPDF passed in) so the
// Node self-check (tests/unit/forms.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, type Fonts } from './textpage.ts';

export type Field = {
  id: string; page: number; name: string; label: string; readOnly: boolean;
  type: 'text' | 'checkbox' | 'radio' | 'choice';
  value: string; checked: boolean; on: string; // checkbox / radio: ticked, and the value it has when ticked
  options: string[]; multiline: boolean;
  rect: [number, number, number, number]; // x, y, width, height on the page, points from the top left
};
const TYPES: Record<string, Field['type']> = { text: 'text', checkbox: 'checkbox', radiobutton: 'radio', combobox: 'choice', listbox: 'choice' };

const onName = (w: MuPDF.PDFWidget) => {
  let on = 'Yes';
  const n = w.getObject().get('AP', 'N');
  if (n.isDictionary()) n.forEach((_, k) => { if (String(k) !== 'Off') on = String(k); });
  return on;
};

/** The fields a person can fill in (push buttons and signature fields are left out). id = page:position on the page. */
export function listFields(m: typeof MuPDF, bytes: Uint8Array): Field[] {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, out: Field[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as MuPDF.PDFPage;
    page.getWidgets().forEach((w, n) => {
      const type = TYPES[w.getFieldType()];
      if (!type) return;
      const value = w.getValue() ?? '', on = type === 'checkbox' || type === 'radio' ? onName(w) : '';
      out.push({ id: `${i}:${n}`, page: i, name: w.getName(), label: w.getLabel() || w.getName(), readOnly: w.isReadOnly(), type, value, on, checked: !!on && value === on, options: type === 'choice' ? w.getOptions() : [], multiline: type === 'text' && w.isMultiline(), rect: ((r) => [r[0], r[1], r[2] - r[0], r[3] - r[1]] as Field['rect'])(w.getRect()) });
    });
    page.destroy();
  }
  return out;
}

export type Answers = Record<string, string | boolean>; // text / choice: the text; checkbox / radio: ticked or not
const RTL = /[֐-ࣿ]/, LATIN_ONLY = /^[\u0000-ÿ]*$/;

/** The file with `answers` written into the fields (by id). The fields stay fillable unless `flatten`.
 *  Text Helvetica cannot draw (Arabic) gets its picture written in Tajawal; the value itself is always the real text. */
export function fillForm(m: typeof MuPDF, bytes: Uint8Array, answers: Answers, flatten: boolean, fonts?: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  const writer = fonts ? pageWriter(m, doc, fonts) : null;
  for (const [id, answer] of Object.entries(answers)) {
    const [pi, n] = id.split(':').map(Number), page = doc.loadPage(pi) as MuPDF.PDFPage, w = page.getWidgets()[n];
    if (!w || w.isReadOnly()) { page.destroy(); continue; }
    if (typeof answer === 'boolean') {
      if ((w.getValue() === onName(w)) !== answer) w.toggle();
    } else if (w.isChoice()) {
      w.setChoiceValue(answer);
    } else {
      w.setTextValue(answer);
      if (answer && !LATIN_ONLY.test(answer) && writer) { // shortcut: one line; a long Arabic answer is cut at the field's edge, not wrapped
        const [x0, y0, x1, y1] = w.getRect(), width = x1 - x0, height = y1 - y0, size = Math.min(14, height * 0.62);
        const ops = writer.draw({ w: width, h: height, lines: [RTL.test(answer) ? { text: answer, x: width - 3, y: height / 2 + size * 0.33, size, align: 'right', max: width - 6 } : { text: answer, x: 3, y: height / 2 + size * 0.33, size, max: width - 6 }] });
        const ap = doc.addStream(ops, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, width, height], Resources: { Font: writer.fonts } });
        w.getObject().put('AP', { N: ap });
      }
    }
    page.destroy();
  }
  writer?.finish();
  if (flatten) doc.bake(false, true);
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
