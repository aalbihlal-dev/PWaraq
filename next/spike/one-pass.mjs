// Spike: first view drawn straight from the file (one pass), versus read-into-memory then draw; and memory used.
import fs from 'node:fs';
import * as mupdf from '../engine/mupdf-wasm/dist/mupdf.js';
mupdf.setGraphicsMinLineWidth(1);
const doc = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
const page = doc.loadPage(0), [x0, , x1] = page.getBounds(), fit = 1263 / (x1 - x0), m = mupdf.Matrix.scale(fit, fit);
let a = performance.now();
page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false).destroy();
console.log('one pass (straight from the file):', Math.round(performance.now() - a), 'ms');
const before = process.memoryUsage().rss;
a = performance.now();
const list = page.toDisplayList();
console.log('read into memory:', Math.round(performance.now() - a), 'ms, memory +' + Math.round((process.memoryUsage().rss - before) / 1048576) + ' MB');
