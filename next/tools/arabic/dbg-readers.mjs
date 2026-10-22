// debug: one PDF page read three MuPDF ways (asText, asJSON line text, walk onChar).  node tools/arabic/dbg-readers.mjs file.pdf
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
const d = m.Document.openDocument(new Uint8Array(fs.readFileSync(process.argv[2])), 'application/pdf'), p = d.loadPage(0);
const st = p.toStructuredText('preserve-whitespace');
console.log('asText:', JSON.stringify(st.asText().split('\n').filter((l) => /لا|ال/.test(l)).slice(-3)));
const j = JSON.parse(st.asJSON()); console.log('json  :', JSON.stringify(j.blocks.filter((b) => b.type === 'text').flatMap((b) => b.lines.map((l) => l.text)).slice(-3)));
