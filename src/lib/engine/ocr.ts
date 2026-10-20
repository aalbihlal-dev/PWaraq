// The searchable text layer for scanned pages. The words come from Tesseract (src/lib/ocr.ts); here they are written onto the
// page as invisible real text (Tajawal, Arabic joined, own ToUnicode), over the page's picture, which is not touched. Pure
// (MuPDF passed in) so the Node self-check (tests/unit/ocr.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, type Fonts } from './textpage.ts';
import { pageBox, seenMatrix } from './tools.ts';
import { stamp } from './assemble.ts';

export type Word = { text: string; x0: number; y0: number; x1: number; y1: number }; // pixels of the picture, from its top left
export type Line = { words: Word[]; confidence?: number }; // one printed line, its words in reading order
export type Layer = { page: number; scale: number; lines: Line[] }; // scale: picture pixels per point of the page as seen
const RTL = /[֐-ࣿ]/;
const num = (v: number) => +v.toFixed(3);

/** The file with every layer's words written, invisible, over its page. */
export function addTextLayer(m: typeof MuPDF, bytes: Uint8Array, layers: Layer[], fonts: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, writer = pageWriter(m, doc, fonts);
  for (const { page, scale, lines: read } of layers) {
    const p = doc.findPage(page), { box, rot, seenH } = pageBox(p);
    // every word is written stretched over its own box (so a search hit sits on the printed word), the words of a printed
    // line in the order they stand on the page, left to right: MuPDF then joins them into one line and puts a
    // right-to-left line back into reading order, so copy gives the words joined as read
    const lines = read.flatMap((l) => {
      const words = l.words.filter((w) => w.text.trim()).sort((a, b) => a.x0 - b.x0);
      const y1 = Math.max(...words.map((w) => w.y1)) / scale, h = y1 - Math.min(...words.map((w) => w.y0)) / scale, size = Math.max(4, h * 0.8);
      return words.map((w) => ({ text: w.text.trim(), size, y: y1 - h * 0.2, x: w.x0 / scale, max: (w.x1 - w.x0) / scale, fill: true }));
    });
    if (!lines.length) continue;
    stamp(doc, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm 3 Tr ${writer.draw({ w: 0, h: seenH, lines })} Q`, { Font: writer.fonts });
  }
  writer.finish();
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
