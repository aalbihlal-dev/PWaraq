// The searchable text layer for scanned pages. The words come from Tesseract (src/lib/ocr.ts); here they are written onto the
// page as invisible real text (Tajawal, Arabic joined, own ToUnicode), over the page's picture, which is not touched. Pure
// (MuPDF passed in) so the Node self-check (tests/unit/ocr.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, measure, type Fonts } from './textpage.ts';
import { pageBox, seenMatrix } from './tools.ts';
import { stamp } from './assemble.ts';

export type Word = { text: string; x0: number; y0: number; x1: number; y1: number }; // pixels of the picture, from its top left
export type Line = { words: Word[]; confidence?: number }; // one printed line, its words in reading order
export type Layer = { page: number; scale: number; lines: Line[]; tilt?: { angle: number; w: number; h: number } }; // scale: picture pixels per point of the
// page as seen; tilt: the picture was straightened by `angle` degrees about its centre (w x h pixels) before reading
const RTL = /[֐-ࣿ]/;
const num = (v: number) => +v.toFixed(3);

/** The file with every layer's words written, invisible, over its page. */
export function addTextLayer(m: typeof MuPDF, bytes: Uint8Array, layers: Layer[], fonts: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, writer = pageWriter(m, doc, fonts);
  for (const { page, scale, lines: read, tilt } of layers) {
    const p = doc.findPage(page), { box, rot, seenH } = pageBox(p);
    // words were read on the straightened picture: the whole layer is turned back about the same centre, so each word
    // lies along the printed (tilted) line
    let turn = '';
    if (tilt?.angle) {
      const c = Math.cos((tilt.angle * Math.PI) / 180), s = Math.sin((tilt.angle * Math.PI) / 180), cx = tilt.w / 2 / scale, cy = seenH - tilt.h / 2 / scale;
      turn = `${[c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy].map(num).join(' ')} cm `;
    }
    // a printed line is one piece of text (MuPDF reads a right-to-left line back in reading order only then, so copy gives
    // the words joined as read) whose words stand each in the middle of its own box, left to right as on the page, so a
    // search hit or a selection sits on the printed word
    const lines = read.flatMap((l) => {
      const words = l.words.filter((w) => w.text.trim()).sort((a, b) => a.x0 - b.x0);
      if (!words.length) return [];
      // MuPDF's box for a glyph is one em tall, 0.643 em above the baseline (Tajawal): the size is the line's height and the
      // baseline sits so that the box is exactly the line's box
      const y0 = Math.min(...words.map((w) => w.y0)) / scale, h = Math.max(...words.map((w) => w.y1)) / scale - y0, size = Math.max(4, h);
      // the line's horizontal scale makes Tajawal as wide as the printed font, so each word fills about its box
      const widths = words.map((w) => measure(fonts.regular, w.text.trim(), size)), boxes = words.map((w) => (w.x1 - w.x0) / scale);
      const tz = Math.min(2, Math.max(0.5, boxes.reduce((a, b) => a + b, 0) / (widths.reduce((a, b) => a + b, 0) || 1)));
      const parts = words.map((w, i) => ({ text: w.text.trim(), x: w.x0 / scale + Math.max(0, boxes[i] - widths[i] * tz) / 2 }));
      return [{ text: parts.map((p) => p.text).join(' '), parts, tz, size, y: y0 + 0.643 * size, x: parts[0].x }];
    });
    if (!lines.length) continue;
    stamp(doc, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm ${turn}3 Tr ${writer.draw({ w: 0, h: seenH, lines })} Q`, { Font: writer.fonts });
  }
  writer.finish();
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}

/** The words of a page's text (layer) with their boxes in points from the page's top left, as search and selection see them. */
export function layerWords(m: typeof MuPDF, bytes: Uint8Array, page: number): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  const end = () => { if (cur && cur.text) words.push(cur); cur = null; };
  m.Document.openDocument(bytes, 'application/pdf').loadPage(page).toStructuredText('').walk({
    endLine: end,
    onChar(c, _o, _f, _s, q) {
      if (c === ' ') return end();
      const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
      cur ??= { text: '', x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      cur.text += c; cur.x0 = Math.min(cur.x0, ...xs); cur.y0 = Math.min(cur.y0, ...ys); cur.x1 = Math.max(cur.x1, ...xs); cur.y1 = Math.max(cur.y1, ...ys);
    },
  });
  end();
  return words;
}
