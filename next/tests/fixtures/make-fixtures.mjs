// Makes the test files: three.pdf (pages "Page one/two/three", A4) and photo.png.  node tests/fixtures/make-fixtures.mjs
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';

const here = (f) => new URL(f, import.meta.url);
const font = (f) => new m.Font(f, fs.readFileSync(here('../../public/fonts/' + f + '.ttf')));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const page = (title) => ({ divider: { w: 595, h: 842, label: 'Waraq test', title } });
fs.writeFileSync(here('three.pdf'), assemble(m, null, { items: ['Page one', 'Page two', 'Page three'].map(page) }, () => fonts));
const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 400, 300], false);
pix.clear(180);
fs.writeFileSync(here('photo.png'), pix.asPNG());
