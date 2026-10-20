// The searchable text layer for scanned pages. The words come from Tesseract (src/lib/ocr.ts); here they are written onto the
// page as invisible real text (Tajawal, Arabic joined, own ToUnicode), over the page's picture, which is not touched. Pure
// (MuPDF passed in) so the Node self-check (tests/unit/ocr.test.mjs) runs the same code as the engine worker.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, measure, type Fonts } from './textpage.ts';
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
    // a printed line is written as one piece of text (so copy gives the words joined, in reading order), stretched or
    // shrunk to the line's width so each word sits about where the picture shows it
    const lines = read.map((l) => ({ text: l.words.map((w) => w.text.trim()).filter(Boolean).join(' '), words: l.words })).filter((l) => l.text).map(({ text, words }) => {
      const x0 = Math.min(...words.map((w) => w.x0)) / scale, x1 = Math.max(...words.map((w) => w.x1)) / scale;
      const y0 = Math.min(...words.map((w) => w.y0)) / scale, y1 = Math.max(...words.map((w) => w.y1)) / scale, h = y1 - y0, rtl = RTL.test(text);
      let size = Math.max(4, h * 0.8);
      const width = measure(fonts.regular, text, size);
      if (width < x1 - x0) size = Math.min(size * (x1 - x0) / width, h * 1.1); // the max below shrinks it when wider
      return { text, size, y: y1 - h * 0.2, x: rtl ? x1 : x0, align: rtl ? 'right' as const : 'left' as const, max: x1 - x0 };
    });
    if (!lines.length) continue;
    stamp(doc, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm 3 Tr ${writer.draw({ w: 0, h: seenH, lines })} Q`, { Font: writer.fonts });
  }
  writer.finish();
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
