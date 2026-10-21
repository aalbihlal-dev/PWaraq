// Checks of an OCR'd file shared by the unit and e2e tests: the invisible words must sit on the printed words.
import { layerWords } from '../src/lib/engine/ocr.ts';

/** The share of the page's text-layer words whose box has ink under it on the page picture (drawn at 100 dpi): a word
 *  placed on blank paper has none. `ink`: the share of dark pixels a box needs (printed text is 10–30 % ink). */
export function inkPlacement(m, bytes, page = 0, ink = 0.03) {
  const words = layerWords(m, bytes, page), k = 100 / 72;
  const pix = m.Document.openDocument(bytes, 'application/pdf').loadPage(page).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
  const px = pix.getPixels(), W = pix.getWidth(), H = pix.getHeight();
  let placed = 0;
  for (const w of words) {
    let dark = 0, n = 0;
    for (let y = Math.max(0, Math.floor(w.y0 * k)); y < Math.min(H, Math.ceil(w.y1 * k)); y++) for (let x = Math.max(0, Math.floor(w.x0 * k)); x < Math.min(W, Math.ceil(w.x1 * k)); x++) { n++; if (px[y * W + x] < 160) dark++; }
    if (n && dark / n >= ink) placed++;
  }
  return { placed: words.length ? placed / words.length : 1, words: words.length };
}
