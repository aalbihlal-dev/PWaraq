// debug: the line box the editor lifts vs the boxes of its glyphs.  node tools/arabic/dbg-edge.mjs file.pdf [needle]
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
import { pageObjects } from '../../src/lib/engine/editpage.ts';
const d = new m.PDFDocument(new Uint8Array(fs.readFileSync(process.argv[2]))), p = d.loadPage(0), needle = process.argv[3] ?? 'المستند';
const lines = pageObjects(p).lines, l = lines.find((x) => x.text.includes(needle)); console.log('line', JSON.stringify(l?.text.slice(0, 40)), l && [l.x, l.y, l.w, l.h].map((v) => +v.toFixed(2)));
const st = p.toStructuredText('preserve-whitespace'); const out = [];
st.walk({ onChar(c, o, f, s, q) { if (l && Math.abs(o[1] - l.base) < 3) out.push([c, +Math.min(q[0], q[2], q[4], q[6]).toFixed(2), +Math.max(q[0], q[2], q[4], q[6]).toFixed(2), +o[0].toFixed(2)]); } });
console.log('line right edge', l && +(l.x + l.w).toFixed(2), 'last chars (any text on this baseline):', JSON.stringify(out.sort((a, b) => b[2] - a[2]).slice(0, 6)));
