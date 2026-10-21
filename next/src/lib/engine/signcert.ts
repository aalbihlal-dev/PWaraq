// Certificate signatures, the PDF side (MuPDF passed in, so the worker and tests/unit/certsign run the same code):
// the file prepared for one signature — the signature field (new, or the empty one the person clicked), its visible
// appearance (the signature set drawn with editPage on a blank copy of the page), the /Sig dictionary with room for the
// CMS — written as an incremental update, so every earlier byte and every earlier signature stays as it was; and the
// list of the signatures a file holds, with the raw bytes verifyCms needs (pades.ts).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { editPage, type Box, type Edit } from './editpage.ts';
import type { Fonts } from './textpage.ts';
import { signPdf } from './sign.ts';
import { unhex } from './der.ts';
import type { SigEntry } from './pades.ts';

export type SigPlan = {
  page: number; rect: Box; // the visible appearance, in seen coordinates (top-left origin)
  field?: string; // an existing empty signature field to sign into (its /T), else a new field is made
  edits: Edit[]; // what the appearance shows (the signature set)
  name: string; reason?: string; location?: string; contact?: string; time: string; // /M, a PDF date
  room: number; // bytes reserved for the CMS
  drawn?: { page: number; edits: Edit[] }[]; // other signature sets drawn into the pages first (covered by the signature)
};
export type Prepared = { bytes: Uint8Array; byteRange: number[]; contentsAt: number }; // contentsAt: first hex digit of /Contents

const RANGE = '/ByteRange[0 1000000000 1000000000 1000000000]';

/** `bytes` with the signature field, appearance and /Sig placeholder appended as an incremental update. */
export function prepareSignature(m: typeof MuPDF, bytes: Uint8Array, password: string, plan: SigPlan, photos: Uint8Array[], fonts: () => Fonts): Prepared {
  if (plan.drawn?.some((d) => d.edits.length)) bytes = signPdf(m, bytes, plan.drawn, photos, fonts);
  let doc = new m.PDFDocument(bytes);
  try {
    if (doc.needsPassword() && !doc.authenticatePassword(password)) throw new Error('WRONG_PASSWORD');
    // a file MuPDF had to repair cannot be appended to: it is written whole first (its own signatures were already broken)
    if (!doc.canBeSavedIncrementally()) { bytes = doc.saveToBuffer('garbage').asUint8Array().slice(); doc.destroy(); doc = new m.PDFDocument(bytes); if (doc.needsPassword()) doc.authenticatePassword(password); }
    const page = doc.loadPage(plan.page), pobj = page.getObject();
    // the appearance: the set drawn on an empty copy of the page, so the same transform applies; then a form XObject
    const blank = new m.PDFDocument();
    blank.graftPage(-1, doc, plan.page);
    const bp = blank.findPage(0); bp.delete('Contents'); bp.delete('Annots'); bp.delete('Resources');
    const drawnDoc = editPage(m, blank, 0, plan.edits, photos, fonts), from = drawnDoc.findPage(0), contents = from.get('Contents');
    const parts: Uint8Array[] = [];
    if (contents.isArray()) contents.forEach((c: MuPDF.PDFObject) => parts.push(c.readStream().asUint8Array())); else if (contents.isStream()) parts.push(contents.readStream().asUint8Array());
    const stream = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
    let at = 0; for (const p of parts) { stream.set(p, at); at += p.length; stream[at++] = 10; }
    const inv = m.Matrix.invert(page.getTransform()), r = plan.rect;
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
    const rect = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))].map((v) => +v.toFixed(3));
    const ap = doc.addStream(stream, { Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: doc.graftObject(from.get('Resources')) });
    drawnDoc.destroy(); blank.destroy();
    // the field: the empty one named, else a new widget on the page and in the form
    let widget = plan.field ? page.getWidgets().find((w) => w.getFieldType() === 'signature' && fieldName(w.getObject()) === plan.field)?.getObject() : undefined;
    const root = doc.getTrailer().get('Root');
    let form = root.get('AcroForm');
    if (!form.isDictionary()) { form = doc.newDictionary(); form.put('Fields', doc.newArray()); root.put('AcroForm', form); }
    if (!form.get('Fields').isArray()) form.put('Fields', doc.newArray());
    if (!widget) {
      widget = doc.addObject(doc.newDictionary());
      widget.put('Type', doc.newName('Annot')); widget.put('Subtype', doc.newName('Widget')); widget.put('FT', doc.newName('Sig'));
      widget.put('T', doc.newString(freeName(form.get('Fields')))); widget.put('F', doc.newInteger(4)); widget.put('P', pobj);
      let annots = pobj.get('Annots');
      if (!annots.isArray()) { annots = doc.newArray(); pobj.put('Annots', annots); }
      annots.push(widget); form.get('Fields').push(widget);
    }
    widget.put('Rect', rect);
    const apd = doc.newDictionary(); apd.put('N', ap); widget.put('AP', apd);
    form.put('SigFlags', doc.newInteger(3));
    const sig = doc.addObject(doc.newDictionary());
    sig.put('Type', doc.newName('Sig')); sig.put('Filter', doc.newName('Adobe.PPKLite')); sig.put('SubFilter', doc.newName('ETSI.CAdES.detached'));
    sig.put('Name', doc.newString(plan.name)); sig.put('M', doc.newString(plan.time));
    if (plan.reason) sig.put('Reason', doc.newString(plan.reason));
    if (plan.location) sig.put('Location', doc.newString(plan.location));
    if (plan.contact) sig.put('ContactInfo', doc.newString(plan.contact));
    const br = doc.newArray(); for (const n of [0, 1000000000, 1000000000, 1000000000]) br.push(doc.newInteger(n));
    sig.put('ByteRange', br); sig.put('Contents', doc.newByteString(new Uint8Array(plan.room)));
    widget.put('V', sig);
    page.destroy();
    const out = doc.saveToBuffer('incremental').asUint8Array().slice();
    // the placeholders, found in the appended part only, then ByteRange written over in place (same length, space padded)
    const tail = latin1(out.subarray(bytes.length)), hexAt = tail.indexOf('/Contents<' + '00'.repeat(plan.room) + '>');
    const rangeAt = tail.indexOf(RANGE);
    if (hexAt < 0 || rangeAt < 0) throw new Error('SIG_PLACEHOLDER');
    const a = bytes.length + hexAt + '/Contents'.length, b = a + 2 * plan.room + 2, c = out.length - b;
    const text = `/ByteRange[0 ${a} ${b} ${c}]`.padEnd(RANGE.length, ' ');
    out.set(new TextEncoder().encode(text), bytes.length + rangeAt);
    return { bytes: out, byteRange: [0, a, b, c], contentsAt: a + 1 };
  } finally { doc.destroy(); }
}
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const fieldName = (o: MuPDF.PDFObject): string => { const parts: string[] = []; for (let d = o; d.isDictionary(); d = d.get('Parent')) { const t = d.get('T'); if (t.isString()) parts.unshift(t.asString()); } return parts.join('.'); };
function freeName(fields: MuPDF.PDFObject) {
  const taken = new Set<string>(); fields.forEach((f: MuPDF.PDFObject) => taken.add(fieldName(f)));
  for (let i = 1; ; i++) if (!taken.has('Waraq Signature ' + i)) return 'Waraq Signature ' + i;
}
const str = (o: MuPDF.PDFObject) => (o.isString() ? o.asString() : '');

/** Every signed signature field in `bytes`: who, when, where, and the bytes its signature covers. */
export function listSignatures(m: typeof MuPDF, bytes: Uint8Array, password = ''): SigEntry[] {
  const doc = new m.PDFDocument(bytes), out: SigEntry[] = [];
  try {
    if (doc.needsPassword() && !doc.authenticatePassword(password)) throw new Error('WRONG_PASSWORD');
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      for (const w of page.getWidgets()) {
        if (w.getFieldType() !== 'signature') continue;
        let v = w.getObject().get('V');
        for (let d = w.getObject(); v.isNull() && d.isDictionary(); d = d.get('Parent')) v = d.get('V');
        const br = v.isDictionary() ? v.get('ByteRange') : v;
        if (!br.isArray() || br.length !== 4) continue;
        const range = [0, 1, 2, 3].map((k) => br.get(k).asNumber());
        if (range.some((n) => !Number.isInteger(n) || n < 0) || range[0] + range[1] > range[2] || range[2] + range[3] > bytes.length) continue;
        // the CMS as written in the file (never encrypted), read straight from the bytes between the two ranges
        const gap = latin1(bytes.subarray(range[0] + range[1], range[2])).trim();
        const contents = unhex(gap.replace(/^</, '').replace(/>$/, ''));
        const sf = v.get('SubFilter');
        out.push({ field: fieldName(w.getObject()), page: i, rect: [...w.getRect()], name: str(v.get('Name')), reason: str(v.get('Reason')), location: str(v.get('Location')), time: str(v.get('M')), byteRange: range, subFilter: sf.isName() ? sf.asName() : '', contents });
      }
      page.destroy();
    }
    return out;
  } finally { doc.destroy(); }
}
