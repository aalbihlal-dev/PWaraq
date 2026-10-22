// debug: a region of page 1 of a PDF as PNG.  node tools/arabic/dbg-crop.mjs in.pdf out.png x y w h [scale]
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
const [, , f, out, x, y, w, h, sc = 3] = process.argv, p = new m.PDFDocument(new Uint8Array(fs.readFileSync(f))).loadPage(0), s = +sc;
const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [Math.floor(x * s), Math.floor(y * s), Math.ceil((+x + +w) * s), Math.ceil((+y + +h) * s)], false); pix.clear(255);
const dev = new m.DrawDevice(m.Matrix.scale(s, s), pix); p.run(dev, m.Matrix.identity); dev.close(); fs.writeFileSync(out, pix.asPNG());
