'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const required=['dist/index.html','dist/app.js','dist/core.js','dist/icons.js','dist/style.css','dist/advanced.js','dist/templates.js','dist/vendor/pdf-lib.min.js','dist/vendor/pdf.min.mjs','dist/vendor/pdf.worker.min.mjs','dist/vendor/jszip.min.js','dist/vendor/ocr/tesseract.min.js','dist/vendor/ocr/worker.min.js','dist/vendor/ocr/eng.traineddata.gz','dist/vendor/ocr/ara.traineddata.gz','dist/vendor/ocr/tesseract-core.wasm.js','dist/vendor/ocr/tesseract-core-simd.wasm.js','dist/vendor/ocr/tesseract-core-lstm.wasm.js','dist/vendor/ocr/tesseract-core-simd-lstm.wasm.js','server.cjs'];
for(const file of required){const full=path.join(root,file);if(!fs.existsSync(full)||fs.statSync(full).size===0)throw Error('Missing offline asset: '+file);}
if(!fs.readFileSync(path.join(root,'server.cjs'),'utf8').includes('createWaraqServer'))throw Error('Local server does not export createWaraqServer.');
console.log(`Desktop asset check passed: ${required.length} offline assets present.`);
