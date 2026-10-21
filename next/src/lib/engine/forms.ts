// PDF form fields on top of MuPDF: list them (text, checkbox, radio, choice) and fill them in. Pure (MuPDF passed in) so the
// Node self-check (tests/unit/forms.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, widthOf, wrap, type Fonts } from './textpage.ts';

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

/** The picture of an Arabic answer as the field's appearance: written upright in the field as the page shows it, then turned back
 *  by the field's own /MK /R (Acrobat writes the page's turn there, so a form on a turned page keeps upright text). `rows`: one line (text field), the lines of a multiline
 *  field, or all options of a list with the chosen one marked. Coordinates top-down in the seen field `sw` x `sh`. */
function picture(doc: MuPDF.PDFDocument, writer: ReturnType<typeof pageWriter>, sw: number, sh: number, rot: number, rows: string[], o: { multi: boolean; list: boolean; chosen: string }) {
  const rtl = RTL.test(rows.join('')), size = o.multi || o.list ? Math.min(12, sh * 0.62) : Math.min(14, sh * 0.62), step = size * 1.25;
  const lines = rows.map((text, i) => ({ text, size, max: sw - 6, x: rtl ? sw - 3 : 3, align: rtl ? 'right' as const : 'left' as const,
    y: o.multi || o.list ? 3 + size * 0.9 + i * step : sh / 2 + size * 0.33 }));
  const rules = o.list ? rows.flatMap((t, i) => (t === o.chosen ? [[1, 3 + i * step, sw - 2, step, 0.6, 0.76, 0.9]] : [])) : [];
  const turn = ({ 90: [0, 1, -1, 0, 0, 0], 180: [-1, 0, 0, -1, 0, 0], 270: [0, -1, 1, 0, 0, 0] } as Record<number, number[]>)[rot];
  return doc.addStream(writer.draw({ w: sw, h: sh, lines, rules }), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, sw, sh], ...(turn ? { Matrix: turn } : {}), Resources: { Font: writer.fonts } });
}

/** The file with `answers` written into the fields (by id). The fields stay fillable unless `flatten`.
 *  Text Helvetica cannot draw (Arabic) gets its picture written in Tajawal; the value itself is always the real text.
 *  Every value is set first and MuPDF's own appearances are built (`page.update`) before the pictures are put: MuPDF rebuilds the
 *  appearance of every changed field with Helvetica, which would otherwise wipe all but the last picture (and a flatten). */
export function fillForm(m: typeof MuPDF, bytes: Uint8Array, answers: Answers, flatten: boolean, fonts?: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  const writer = fonts ? pageWriter(m, doc, fonts) : null, byPage = new Map<number, [number, string | boolean][]>();
  for (const [id, answer] of Object.entries(answers)) { const [pi, n] = id.split(':').map(Number); byPage.set(pi, [...(byPage.get(pi) ?? []), [n, answer]]); }
  let drew = false;
  for (const [pi, list] of byPage) {
    const page = doc.loadPage(pi) as MuPDF.PDFPage, ws = page.getWidgets();
    const turnOf = (w: MuPDF.PDFWidget) => { const r = w.getObject().get('MK', 'R'); return r.isNumber() ? ((r.asNumber() % 360) + 360) % 360 : 0; };
    // the fields' own rectangles (user space), read before anything changes
    const rect = ws.map((w) => { const r = [0, 1, 2, 3].map((k) => w.getObject().get('Rect').get(k).asNumber()); return { w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]) }; });
    const pictures: { w: MuPDF.PDFWidget; n: number; rot: number; rows: string[]; chosen: string; list: boolean; multi: boolean }[] = [];
    for (const [n, answer] of list) {
      const w = ws[n];
      if (!w || w.isReadOnly()) continue;
      if (typeof answer === 'boolean') { if ((w.getValue() === onName(w)) !== answer) w.toggle(); continue; }
      const choice = w.isChoice(), multi = !choice && w.isMultiline();
      if (choice) w.setChoiceValue(answer); else w.setTextValue(answer);
      if (!answer || !writer) continue;
      const list = choice && !w.isComboBox(), rows = list ? w.getOptions() : null;
      if (LATIN_ONLY.test(answer) && !(rows && rows.some((t) => !LATIN_ONLY.test(t)))) continue;
      const rot = turnOf(w), sw = rot % 180 ? rect[n].h : rect[n].w;
      pictures.push({ w, n, rot, list: !!list, multi, chosen: answer, rows: rows ?? (multi ? answer.split('\n').flatMap((para) => wrap((t) => widthOf(fonts!)(t, Math.min(12, (rot % 180 ? rect[n].w : rect[n].h) * 0.62)), para, sw - 6)) : [answer]) });
    }
    page.update(); // MuPDF builds the appearances of the changed fields now; Waraq's pictures go over them
    for (const x of pictures) {
      const sw = x.rot % 180 ? rect[x.n].h : rect[x.n].w, sh = x.rot % 180 ? rect[x.n].w : rect[x.n].h;
      x.w.getObject().put('AP', { N: picture(doc, writer!, sw, sh, x.rot, x.rows, x) }); drew = true;
    }
    page.destroy();
  }
  writer?.finish();
  // a form that asks readers to rebuild every appearance would redraw our pictures in their own font: asked no more, when every field has one
  const form = doc.getTrailer().get('Root', 'AcroForm');
  if (drew && form.isDictionary() && form.get('NeedAppearances').asBoolean() && allDrawn(doc)) form.delete('NeedAppearances');
  if (flatten) doc.bake(false, true);
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}

/** Does every field that has a value also have an appearance (so a reader need not rebuild any)? */
function allDrawn(doc: MuPDF.PDFDocument) {
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as MuPDF.PDFPage, bad = page.getWidgets().some((w) => !!w.getValue() && w.getFieldType() !== 'signature' && w.getObject().get('AP', 'N').isNull());
    page.destroy(); if (bad) return false;
  }
  return true;
}
