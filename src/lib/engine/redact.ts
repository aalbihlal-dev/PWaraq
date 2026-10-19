// True redaction on top of MuPDF: text, photos and lines under a mark are removed from the file (not covered), and the
// mark is painted black. Pure (MuPDF passed in) so the Node self-check (tests/unit/redact.test.mjs) runs the same code.
// Boxes are in page space as MuPDF gives it: points, origin top-left, y down, after the page's own turn.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';

export type Mark = { page: number; x: number; y: number; w: number; h: number };
export type Find = 'phone' | 'email' | 'word';

const DIGITS = /[٠-٩۰-۹]/g; // Arabic-Indic and Persian digits read as 0–9, so one pattern finds numbers in either script
const ascii = (s: string) => s.replace(DIGITS, (d) => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Boxes of every phone number, e-mail address or word (any case) on one page. */
export function findMatches(page: MuPDF.Page, kind: Find, query = ''): Omit<Mark, 'page'>[] {
  const q = query.trim();
  if (kind === 'word' && !q) return [];
  const re = kind === 'phone' ? /\+?\(?\d[\d\s().\-]{5,}\d/g : kind === 'email' ? /[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g : new RegExp(escape(q), 'gi');
  const st = page.toStructuredText('preserve-whitespace'), out: Omit<Mark, 'page'>[] = [];
  let line: { c: string; box: number[] }[] = [];
  const flush = () => {
    const text = line.map((l) => l.c).join(''), at: number[] = [];
    line.forEach((l, i) => { for (let k = 0; k < l.c.length; k++) at.push(i); });
    const hay = kind === 'word' ? text : ascii(text);
    for (const mt of hay.matchAll(re)) {
      const raw = mt[0].trim();
      if (kind === 'phone' && raw.replace(/\D/g, '').length < 7) continue;
      const from = mt.index! + mt[0].indexOf(raw), boxes = [...new Set(at.slice(from, from + raw.length))].map((i) => line[i].box);
      if (!boxes.length) continue;
      const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1])), x1 = Math.max(...boxes.map((b) => b[2])), y1 = Math.max(...boxes.map((b) => b[3]));
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    line = [];
  };
  st.walk({
    onChar(c, _o, _f, _s, quad) { const xs = [quad[0], quad[2], quad[4], quad[6]], ys = [quad[1], quad[3], quad[5], quad[7]]; line.push({ c, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }); },
    endLine: flush,
  });
  st.destroy();
  return out;
}

export type RedactOptions = { metadata?: boolean };
/** The file with everything under `marks` removed. `metadata`: title, author, dates and the XMP packet are removed too. */
export function redact(m: typeof MuPDF, bytes: Uint8Array, marks: Mark[], opts: RedactOptions = {}): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  for (const i of new Set(marks.map((k) => k.page))) {
    const page = doc.loadPage(i) as MuPDF.PDFPage;
    for (const k of marks.filter((k) => k.page === i)) page.createAnnotation('Redact').setRect([k.x, k.y, k.x + k.w, k.y + k.h]);
    page.applyRedactions(true, 2, 1, 0); // black boxes; photo pixels blacked out; lines inside removed; text removed
    page.destroy();
  }
  if (opts.metadata) {
    doc.getTrailer().delete('Info');
    doc.getTrailer().get('Root').delete('Metadata');
  }
  return doc.saveToBuffer('garbage=4,compress').asUint8Array().slice();
}
