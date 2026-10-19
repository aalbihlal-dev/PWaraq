// The searchable text layer for scanned pages. The words come from Tesseract (src/lib/ocr.ts); here they are written onto the
// page as invisible real text (Tajawal, Arabic joined, own ToUnicode), over the page's picture, which is not touched. Pure
// (MuPDF passed in) so the Node self-check (tests/unit/ocr.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, type Fonts } from './textpage.ts';
import { pageBox, seenMatrix } from './tools.ts';
import { stamp } from './assemble.ts';

export type Word = { text: string; x0: number; y0: number; x1: number; y1: number }; // pixels of the picture, from its top left
export type Layer = { page: number; scale: number; words: Word[] }; // scale: picture pixels per point of the page as seen
const RTL = /[֐-ࣿ]/;
const num = (v: number) => +v.toFixed(3);

/** The file with every layer's words written, invisible, over its page. */
export function addTextLayer(m: typeof MuPDF, bytes: Uint8Array, layers: Layer[], fonts: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, writer = pageWriter(m, doc, fonts);
  for (const { page, scale, words } of layers) {
    const p = doc.findPage(page), { box, rot, seenH } = pageBox(p);
    const lines = words.filter((w) => w.text.trim()).map((w) => {
      const h = (w.y1 - w.y0) / scale, size = Math.max(4, h * 0.8), rtl = RTL.test(w.text);
      return { text: w.text.trim(), size, y: w.y1 / scale - h * 0.2, x: (rtl ? w.x1 : w.x0) / scale, align: rtl ? 'right' as const : 'left' as const, max: (w.x1 - w.x0) / scale };
    });
    if (!lines.length) continue;
    stamp(doc, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm 3 Tr ${writer.draw({ w: 0, h: seenH, lines })} Q`, { Font: writer.fonts });
  }
  writer.finish();
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
