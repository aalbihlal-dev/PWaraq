import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, SHOTS, basePdf, save } from './lib.mjs';
import { pageNumbers, watermark } from '../../src/lib/engine/tools.ts';
const F = fonts(), out = path.join(SHOTS, 'wp6'); fs.mkdirSync(out, { recursive: true });
const dark = (w, h) => { const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, w, h], 0, {}, '0.08 0.33 0.18 rg 0 0 ' + w + ' ' + h + ' re f')); return d; };
const white = (w, h) => { const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, w, h], 0, {}, '')); return d; };
const png = (n, d, sc = 1.2) => fs.writeFileSync(path.join(out, n + '.png'), m.Document.openDocument(d.saveToBuffer('').asUint8Array().slice(), 'application/pdf').loadPage(0).toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false).asPNG());
for (const [name, mk, w, h] of [['a4', white, 595, 842], ['a3', white, 842, 1191], ['slide', dark, 960, 540]]) for (const digits of ['latn', 'arab']) { const d = mk(w, h); pageNumbers(m, d, [0], { position: 'bc', total: true, start: 3, digits }, F); const e = mk(w, h); pageNumbers(m, e, [0, 0], { position: 'tr', total: true, start: 1, digits }, F); png(`${name}-${digits}`, d); }
const t = white(595, 842); watermark(m, t, F, [0], { text: 'سري للغاية', tile: true, angle: 30, opacity: 0.25 }); png('tile', t, 0.8);
console.log('ok');
