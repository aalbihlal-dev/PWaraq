import fs from 'node:fs';
import * as mupdf from '../engine/mupdf-wasm/dist/mupdf.js';
const doc = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
const st = doc.loadPage(0).toStructuredText('preserve-whitespace');
const j = JSON.parse(st.asJSON());
console.log(JSON.stringify(j.blocks.find(b => b.type === 'text'), null, 1).slice(0, 900));
