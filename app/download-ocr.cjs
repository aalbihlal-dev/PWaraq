// Reproducible, self-hosted OCR dependencies. Run only when updating bundled assets.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.join(__dirname,'dist/vendor/ocr');
const assets=[
 ['tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js'],
 ['worker.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js'],
 ['LICENSE-tesseract.txt','https://raw.githubusercontent.com/naptha/tesseract.js/v6.0.1/LICENSE.md'],
 ['LICENSE-core.txt','https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/LICENSE'],
 ...['tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'].flatMap(n=>['wasm.js','wasm'].map(ext=>[`${n}.${ext}`,`https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/${n}.${ext}`])),
 ...['eng','ara'].map(l=>[`${l}.traineddata.gz`,`https://cdn.jsdelivr.net/npm/@tesseract.js-data/${l}@1.0.0/4.0.0_best_int/${l}.traineddata.gz`]),
 ['LICENSE-data.txt','https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/LICENSE']
];
(async()=>{await fs.mkdir(root,{recursive:true});for(const [file,url]of assets){const target=path.join(root,file);try{if((await fs.stat(target)).size>0)continue;}catch{}const r=await fetch(url);if(!r.ok)throw Error(`${file}: ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());await fs.writeFile(target,bytes);console.log(`${file}: ${bytes.length}`);}})().catch(e=>{console.error(e.message);process.exitCode=1;});

