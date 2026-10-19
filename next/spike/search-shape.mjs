import fs from 'node:fs';
import * as mupdf from '../engine/mupdf-wasm/dist/mupdf.js';
const doc = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
const hits = doc.loadPage(0).search('Report', '');
console.log(typeof hits, Array.isArray(hits), JSON.stringify(hits).slice(0, 300));
