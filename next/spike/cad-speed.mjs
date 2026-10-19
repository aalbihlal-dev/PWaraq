// Spike: can MuPDF (WebAssembly) handle the heavy CAD drawing fast enough for Waraq 1.0?
// Reads a page once into a display list, then draws the whole page and deep-zoom tiles from memory.
import fs from 'node:fs';
import * as mupdf from 'mupdf';

const file = process.argv[2];
const t = () => performance.now();
const ms = (a) => Math.round(t() - a) + ' ms';

let a = t();
const doc = mupdf.Document.openDocument(fs.readFileSync(file), 'application/pdf');
console.log('open', ms(a), '-', doc.countPages(), 'pages');

a = t();
const page = doc.loadPage(0);
const [x0, y0, x1, y1] = page.getBounds();
const list = page.toDisplayList();
console.log('read page 1 into memory', ms(a), `(${Math.round(x1 - x0)} x ${Math.round(y1 - y0)} pt)`);

// whole page at laptop screen size (fit width ~1263 px)
a = t();
const fit = 1263 / (x1 - x0);
const full = list.toPixmap(mupdf.Matrix.scale(fit, fit), mupdf.ColorSpace.DeviceRGB, false);
fs.writeFileSync('spike-full.png', full.asPNG());
console.log('draw whole page at 1263 px', ms(a));

// deep zoom: four 1024 x 1024 tiles at 800 %
a = t();
for (let i = 0; i < 4; i++) {
  const s = 8, tx = 6000 + i * 1024, ty = 5000;
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [tx, ty, tx + 1024, ty + 1024], false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(s, s), pix);
  list.run(dev, mupdf.Matrix.identity);
  dev.close();
  if (i === 0) fs.writeFileSync('spike-tile.png', pix.asPNG());
}
console.log('draw four 800 % tiles', ms(a), '(per tile ' + Math.round((t() - a) / 4) + ' ms)');

// text: search a word on the page
a = t();
const hits = page.search('MV');
console.log('search "MV"', ms(a), '-', hits.length, 'hits');
