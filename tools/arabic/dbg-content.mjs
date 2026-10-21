// debug: the last content stream of page n of a PDF, and what MuPDF reads from it.  node tools/arabic/dbg-content.mjs file.pdf n [chars]
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
const d = new m.PDFDocument(new Uint8Array(fs.readFileSync(process.argv[2]))), p = d.loadPage(+process.argv[3]), c = p.getObject().get('Contents'), streams = c.isArray() ? Array.from({ length: c.length }, (_, i) => c.get(i)) : [c], s = streams.find((x) => /TJ/.test(x.readStream().asString())) ?? streams[streams.length - 1];
console.log('Rotate', p.getObject().get('Rotate')?.asNumber?.() ?? 0, '\n' + s.readStream().asString().slice(0, +(process.argv[4] ?? 1500)), '\n---\n' + p.toStructuredText('preserve-whitespace').asText().slice(0, 300));
