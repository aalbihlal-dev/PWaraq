// Signing mode, engine side: where a document needs signing (empty signature fields, and words like «التوقيع» /
// "Signature" / «التاريخ» / "Date" with the blank after them), where the signature set goes for such a spot, and the
// signed PDF. Pure like editpage.ts (the MuPDF module is passed in), so it runs in the worker and in tests/unit/sign.
// Coordinates: points on the page as seen, top-left origin.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { editPage, BASELINE, type Box, type Edit } from './editpage.ts';
import type { Fonts } from './textpage.ts';

/** A place to sign (`sign`) or to date (`date`): `label` = the word found, the box itself = the blank to write on. */
export type Spot = Box & { page: number; kind: 'sign' | 'date'; rtl: boolean; field?: boolean; name?: string; label?: Box }; // name: the field's /T

// longest first, so «الاسم والتوقيع» wins over «التوقيع» inside it
const WORDS: [RegExp, Spot['kind']][] = [
  [/الاسم\s*و\s*التوقيع|التوقيع|توقيع|\bsign here\b|\bsignature\b|\bsigned\b/gi, 'sign'],
  [/التاريخ|\bdate\b/gi, 'date'],
];
const BLANK = /[_.…‥]/;
const asciiDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 15));
const FILLED = /\d{1,4}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{1,4}|\d{1,2}\s+[^\s\d]{3,}\s+\d{4}/; // 21/10/2026, 2026-10-21, 21 October 2026

type Ch = { c: string; q: MuPDF.Quad };
/** Every spot on page `index`. */
export function findSpots(page: MuPDF.Page, index: number): Spot[] {
  const [, , W] = page.getBounds(), out: Spot[] = [], signed: Box[] = []; // signed: signature fields already filled (a label under one is done)
  // empty signature form fields
  for (const w of (page as MuPDF.PDFPage).getWidgets?.() ?? []) {
    if (w.getFieldType() !== 'signature') continue;
    const [x0, y0, x1, y1] = w.getRect();
    if (!w.getObject().get('V').isNull()) { signed.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); continue; }
    const parts: string[] = [];
    for (let d = w.getObject(); d.isDictionary(); d = d.get('Parent')) { const t = d.get('T'); if (t.isString()) parts.unshift(t.asString()); }
    out.push({ page: index, kind: 'sign', field: true, name: parts.join('.'), rtl: false, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  // labels in the text: each character normalised (Arabic presentation forms -> letters), with a map back to its box
  const st = page.toStructuredText('preserve-whitespace');
  let chars: Ch[] = [];
  const lines: Ch[][] = [];
  st.walk({ beginLine() { chars = []; }, onChar(c, _o, _f, _s, q) { chars.push({ c, q }); }, endLine() { lines.push(chars); } });
  st.destroy();
  for (const line of lines) {
    let text = '';
    const at: number[] = [];
    line.forEach((ch, i) => { for (const c of ch.c.normalize('NFKC').replace(/[ـً-ٰٟ]/g, '')) { text += c; at.push(i); } }); // tashkeel and tatweel go, the digits stay
    const taken: [number, number][] = [], here: Spot[] = [];
    for (const [re, kind] of WORDS) for (const hit of text.matchAll(re)) {
      const a = hit.index!, b = a + hit[0].length;
      if (taken.some(([s, e]) => a < e && b > s)) continue;
      // a label, not a word in a sentence: a colon or a blank next to it, or little else on the line. MuPDF gives a right-to-left
      // line in visual order, so the colon of «التوقيع:» can stand before the word or at the start of the line: look on both sides
      const near = text.slice(Math.max(0, a - 3), a) + text.slice(b, b + 3), rest = text.slice(0, a) + text.slice(b), edge = /^\s*[:：]|[:：]\s*$/.test(text);
      if (!/[:：_.…]/.test(near) && !edge && rest.replace(/[\s_.…:]/g, '').length > 3) continue;
      if (kind === 'date' && FILLED.test(asciiDigits(rest))) continue; // a date label that already has its date: nothing to write there
      const label = boxOf(line.slice(at[a], at[b - 1] + 1)), rtl = /[؀-ۿ]/.test(hit[0]);
      if (here.some((s) => s.kind === kind && Math.abs((s.label?.x ?? 0) - label.x) < 150)) continue; // «Signature / التوقيع:» is one label in two languages
      taken.push([a, b]);
      here.push({ page: index, kind, rtl, label, ...blank(line, label, rtl, W) });
    }
    out.push(...here);
  }
  // a signature field with a "Signature" label next to it is one spot
  return out.filter((s) => s.field || !(out.some((f) => f.field && overlap(f, s)) || signed.some((f) => overlap(f, s))));
}

const boxOf = (cs: Ch[]): Box => {
  const xs = cs.flatMap((c) => [c.q[0], c.q[2], c.q[4], c.q[6]]), ys = cs.flatMap((c) => [c.q[1], c.q[3], c.q[5], c.q[7]]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.w + 24 && b.x < a.x + a.w + 24 && a.y < b.y + b.h + 24 && b.y < a.y + a.h + 24;

// The blank to write on: the run of ____ / .... nearest the label on its reading side; else the space after the label
// (to the right in English, to the left in Arabic); when the page edge is too close, under the label.
// shortcut: drawn lines and boxes are not looked at, only typed blanks; read the page's vector lines if forms need it.
function blank(line: Ch[], label: Box, rtl: boolean, W: number): Box {
  const marks = line.filter((ch) => BLANK.test(ch.c)).map((ch) => boxOf([ch])).sort((a, b) => a.x - b.x);
  const runs: Box[] = [];
  for (const b of marks) {
    const last = runs.at(-1);
    if (last && b.x - (last.x + last.w) < b.h) { last.w = b.x + b.w - last.x; last.h = Math.max(last.h, b.h); } else runs.push({ ...b });
  }
  const side = runs.filter((r) => r.w > label.h && (rtl ? r.x + r.w <= label.x + 2 : r.x >= label.x + label.w - 2));
  const run = rtl ? side.at(-1) : side[0];
  if (run) return run;
  const room = rtl ? label.x - 6 - 24 : W - 24 - (label.x + label.w + 6), w = Math.min(180, room);
  if (w >= 60) return { x: rtl ? label.x - 6 - w : label.x + label.w + 6, y: label.y, w, h: label.h };
  return { x: rtl ? label.x + label.w - 180 : label.x, y: label.y + label.h + 4, w: 180, h: label.h };
}

/** The signature set as laid out once: signature shape (width / height), optional name, the date; text size and gap fixed. */
export type SignSet = { ratio: number; name?: string; date: string };
export type Placed = { page: number; sig: Box; name?: Box; date?: Box; onDate?: boolean; rtl: boolean }; // onDate: on a date spot
export const SET = { width: 150, height: 56, text: 10, gap: 4, lead: 1.3 };

/** Where the set goes for a spot: the signature on the blank (sitting on its line), name and date under it with fixed
 *  spacing — or the date on a date spot of the same page when there is one (`date`). A signature field holds the
 *  signature inside it. */
export function placeSet(set: SignSet, spot: Box & { rtl?: boolean; field?: boolean }, date?: Box & { label?: Box }): Placed {
  let w = Math.min(SET.width, spot.field ? spot.w : Math.max(spot.w, 90)), h = w / set.ratio;
  if (h > (spot.field ? spot.h : SET.height)) { h = spot.field ? spot.h : SET.height; w = h * set.ratio; }
  const sig = { x: spot.x + (spot.w - w) / 2, y: spot.field ? spot.y + (spot.h - h) / 2 : spot.y + spot.h - h * 0.85, w, h };
  const line = SET.text * SET.lead, under = { x: sig.x - 30, w: sig.w + 60 };
  let y = Math.max(sig.y + sig.h, spot.y + spot.h) + SET.gap;
  const out: Placed = { page: (spot as Spot).page ?? 0, sig, rtl: !!spot.rtl, onDate: !!date };
  if (set.name?.trim()) { out.name = { ...under, y, h: line }; y += line + SET.gap; }
  // on a date blank the date sits on the label's baseline, just above the line (typed blanks run through it)
  const base = date && (date.label ?? date);
  out.date = date && base ? { x: date.x, y: base.y + base.h * 0.78 - 2 - SET.text * BASELINE, w: Math.max(date.w, 80), h: line } : { ...under, y, h: line };
  return out;
}

/** The page edits for a placed set: the signature (photos[0], a PNG with transparency) and the name and date as text. */
export function setEdits(set: SignSet, p: Placed, colour = [0, 0, 0]): Edit[] {
  const text = (t: string, b: Box, centre: boolean): Edit => ({ kind: 'text', text: t, size: SET.text, color: colour, bold: false, fit: true, align: centre ? 'center' : p.rtl ? 'right' : 'left', ...b }); // fit: one line, shrunk to its box, never a second line over the date
  const out: Edit[] = [{ kind: 'photo', photo: 0, ...p.sig }];
  if (p.name && set.name?.trim()) out.push(text(set.name.trim(), p.name, true));
  if (p.date) out.push(text(set.date, p.date, !p.onDate));
  return out;
}

/** `bytes` signed in place: each page's placed sets drawn onto it. The page keeps its links, form fields and bookmarks
 *  (only its contents and resources change), so the rest of the file is as it was. */
export function signPdf(m: typeof MuPDF, bytes: Uint8Array, pages: { page: number; edits: Edit[] }[], photos: Uint8Array[], fonts: () => Fonts, password = ''): Uint8Array {
  const doc = new m.PDFDocument(bytes);
  try {
    if (doc.needsPassword() && !doc.authenticatePassword(password)) throw new Error('WRONG_PASSWORD');
    for (const { page, edits } of pages) {
      if (!edits.length) continue;
      const one = editPage(m, doc, page, edits, photos, fonts), from = one.findPage(0), to = doc.findPage(page);
      to.put('Contents', doc.graftObject(from.get('Contents')));
      to.put('Resources', doc.graftObject(from.get('Resources')));
      one.destroy();
    }
    return doc.saveToBuffer('garbage=compact').asUint8Array().slice();
  } finally { doc.destroy(); }
}

/** The date of the session as written: Gregorian or Hijri (Umm al-Qura), numeric / long / ISO, Western digits (0-9) or Arabic-Indic (٠-٩). */
export function formatDate(d: Date, calendar: 'gregory' | 'islamic-umalqura', style: 'numeric' | 'long' | 'iso', lang: 'en' | 'ar', digits: 'latn' | 'arab' = 'latn') {
  const loc = `${lang === 'ar' ? 'ar' : 'en-GB'}-u-ca-${calendar}-nu-${digits}`;
  const parts = (o: Intl.DateTimeFormatOptions) => Object.fromEntries(new Intl.DateTimeFormat(loc, o).formatToParts(d).map((p) => [p.type, p.value]));
  const hijri = calendar === 'gregory' ? '' : lang === 'ar' ? ' هـ' : ' AH';
  if (style === 'long') { const p = parts({ day: 'numeric', month: 'long', year: 'numeric' }); return `${p.day} ${p.month} ${p.year}${hijri}`; }
  const p = parts({ day: '2-digit', month: '2-digit', year: 'numeric' });
  return (style === 'iso' ? `${p.year}-${p.month}-${p.day}` : `${p.day}/${p.month}/${p.year}`) + hijri;
}
