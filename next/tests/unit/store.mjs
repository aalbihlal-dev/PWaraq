// The font service's store for tests: HarfBuzz, the bundled fonts, the subsetter (what the worker builds in the app).
import fs from 'node:fs';
import * as hb from 'harfbuzzjs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { makeSubsetter } from '../../src/lib/engine/fontstore.ts';

const read = (f) => new Uint8Array(fs.readFileSync(new URL('../../public/fonts/' + f, import.meta.url)));
export const store = { hb, file: read, subset: makeSubsetter(fs.readFileSync(new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url))) };
const font = (f) => new m.Font(f, read(f + '.ttf'));
/** Tajawal fonts with the font service (the app's) and without it (the old writer). */
export const withStore = () => ({ regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold'), store });
export const withoutStore = () => ({ regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') });
