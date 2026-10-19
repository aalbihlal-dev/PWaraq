'use strict';
// Release integration test. Missing engines/fixtures fail; --allow-skip is an explicit development-only opt-out.
// Run: node backend/test-native.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {bundledEngineEnv}=require('./engine-paths.cjs');
const {createEngineService,run}=require('./engines.cjs');
const root=path.resolve(process.env.WARAQ_PROJECT_ROOT||path.join(__dirname,'..')),engineDir=path.resolve(process.env.WARAQ_ENGINES_DIR||path.join(root,'engines','win-x64'));
const env={...bundledEngineEnv(engineDir),WARAQ_BUNDLED_ONLY:'1'};
const sample=path.resolve(process.env.WARAQ_OCR_FIXTURE||path.join(root,'qa','arabic-ocr.pdf'));
function unavailable(message){const skip=process.argv.includes('--allow-skip');console.error((skip?'SKIP':'FAIL')+' native engine tests: '+message);process.exit(skip?0:1);}
if(!env.WARAQ_QPDF||!env.WARAQ_MUTOOL||!env.WARAQ_TESSERACT)unavailable('Bundled qpdf, mutool and tesseract are required. Run tools/fetch-engines.ps1 first.');
if(!fs.existsSync(sample))unavailable('Arabic raster fixture missing: '+sample+'. Set WARAQ_OCR_FIXTURE to an image-only Arabic PDF.');
const engines=createEngineService({env});let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const body=(bytes,options={})=>({filename:'عينة.pdf',data:Buffer.from(bytes).toString('base64'),options});
async function textOf(bytes){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'waraq-test-'));
 try{fs.writeFileSync(path.join(dir,'in.pdf'),bytes);await run(env.WARAQ_MUTOOL,['draw','-F','txt','-o','out.txt','in.pdf'],{cwd:dir});return fs.readFileSync(path.join(dir,'out.txt'),'utf8');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
async function pageCount(bytes){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'waraq-count-'));
 try{fs.writeFileSync(path.join(dir,'in.pdf'),bytes);const r=await run(env.WARAQ_QPDF,['--show-npages','in.pdf'],{cwd:dir});return Number(r.stdout.trim());}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
(async()=>{
 const original=fs.readFileSync(sample);let searchable;
 await check('bundled engines are selected',async()=>{
  const caps=await engines.capabilities();
  assert.equal(caps.operations.optimize.engine,'qpdf');
  assert.equal(caps.operations.redactText.engine,'mutool');
  assert.equal(caps.operations.ocr.engine,'waraqocr','this suite must exercise the bundled OCR pipeline, not a system OCRmyPDF');
  assert.ok(caps.operations.ocr.languages.includes('ara')&&caps.operations.ocr.languages.includes('eng'));
 });
 await check('searchable OCR adds an Arabic text layer and keeps the page count',async()=>{
  const r=await engines.process('ocr',body(original,{language:'ara+eng'}));
  assert.ok(r.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')));
  searchable=r.bytes;const text=await textOf(searchable);
  assert.equal(await pageCount(searchable),await pageCount(original));
  assert.match(text,/[؀-ۿ]{3,}/,'expected Arabic text after OCR');
  assert.equal((await textOf(original)).replace(/\s+/g,'').length,0,'fixture must start without text');
 });
 await check('already-searchable PDFs are returned unchanged',async()=>{
  const again=await engines.process('ocr',body(searchable,{language:'ara+eng'}));
  assert.equal(Buffer.compare(again.bytes,searchable),0);
 });
 await check('lossless optimize returns a valid PDF',async()=>{
  const r=await engines.process('optimize',body(searchable));
  assert.ok(r.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')));
  assert.equal((await textOf(r.bytes)).replace(/\s+/g,''),(await textOf(searchable)).replace(/\s+/g,''));
 });
 await check('text redaction removes the matched word from the text layer',async()=>{
  const words=(await textOf(searchable)).split(/\s+/).filter(w=>w.length>=3);
  const word=words.find(w=>/[؀-ۿ]/.test(w))||words[0];assert.ok(word,'need a word to redact');
  const r=await engines.process('redactText',body(searchable,{text:word}));
  assert.ok(!(await textOf(r.bytes)).includes(word),'redacted word is still extractable');
 });
 await check('redaction with no match reports NO_MATCH',async()=>{
  await assert.rejects(engines.process('redactText',body(searchable,{text:'zzqxv-not-present'})),e=>e.code==='NO_MATCH');
 });
 console.log(passed+' native engine checks passed.');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
