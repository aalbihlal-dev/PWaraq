// Spike: Waraq's own MuPDF WASM build with the minimum line width switched on (CAD hairlines stay visible).
import fs from 'node:fs';
import * as mupdf from '../engine/mupdf-wasm/dist/mupdf.js';

mupdf.setGraphicsMinLineWidth(1);
const doc = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
let a = performance.now();
const page = doc.loadPage(0), [x0, , x1] = page.getBounds(), list = page.toDisplayList();
console.log('read page', Math.round(performance.now() - a), 'ms');
a = performance.now();
const fit = 1263 / (x1 - x0);
fs.writeFileSync('spike-custom.png', list.toPixmap(mupdf.Matrix.scale(fit, fit), mupdf.ColorSpace.DeviceRGB, false).asPNG());
console.log('whole page at 1263 px with min line width 1:', Math.round(performance.now() - a), 'ms');
