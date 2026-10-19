// Spike: keep CAD hairlines visible without MuPDF's min-line-width option (not exposed in the WASM build):
// draw at 2x, then shrink keeping the darkest pixel of each 2x2 block.
import fs from 'node:fs';
import * as mupdf from 'mupdf';

const doc = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
const page = doc.loadPage(0), [x0, , x1] = page.getBounds(), list = page.toDisplayList();
const fit = 1263 / (x1 - x0);
let a = performance.now();
const big = list.toPixmap(mupdf.Matrix.scale(fit * 2, fit * 2), mupdf.ColorSpace.DeviceRGB, false);
const W = big.getWidth(), H = big.getHeight(), src = big.getPixels(), w = W >> 1, h = H >> 1;
const drawn = performance.now() - a;
// darkest of each 2x2 block, per colour channel
const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false), dst = out.getPixels();
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
  const i = ((2 * y) * W + 2 * x) * 3 + c, j = i + W * 3;
  dst[(y * w + x) * 3 + c] = Math.min(src[i], src[i + 3], src[j], src[j + 3]);
}
console.log(`draw at 2x ${Math.round(drawn)} ms, darkest-of-4 shrink ${Math.round(performance.now() - a - drawn)} ms -> ${w} x ${h}`);
fs.writeFileSync('spike-darken.png', out.asPNG());
