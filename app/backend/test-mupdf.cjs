'use strict';
// Real-MuPDF tests: redaction, page-editor text erase (normal and rotated pages), heavy-page render service.
// Needs the bundled mutool (tools/fetch-engines.ps1). --allow-skip skips when it is missing (development only).
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events');
const {bundledEngineEnv}=require('./engine-paths.cjs');const {createEngineService,run}=require('./engines.cjs');
const {createWaraqServer}=require('../server.cjs');const PDFLib=require('../dist/vendor/pdf-lib.min.js');
const env=bundledEngineEnv(process.env.WARAQ_ENGINES_DIR||path.join(__dirname,'..','engines','win-x64'));
if(!env.WARAQ_MUTOOL){const skip=process.argv.includes('--allow-skip');console.error((skip?'SKIP':'FAIL')+': bundled mutool missing. Run tools/fetch-engines.ps1.');process.exit(skip?0:1);}
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const textOf=async(bytes)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-mu-'));try{fs.writeFileSync(path.join(dir,'a.pdf'),bytes);await run(env.WARAQ_MUTOOL,['draw','-F','txt','-o','a.txt','a.pdf'],{cwd:dir});return fs.readFileSync(path.join(dir,'a.txt'),'utf8');}finally{fs.rmSync(dir,{recursive:true,force:true});}};
(async()=>{
 const engines=createEngineService({env:{...env,WARAQ_BUNDLED_ONLY:'1'}});
 const d=await PDFLib.PDFDocument.create(),f=await d.embedFont(PDFLib.StandardFonts.Helvetica),p=d.addPage([400,300]);
 p.drawText('Invoice number SECRET-123 for client',{x:30,y:200,size:14,font:f});p.drawText('Keep this line',{x:30,y:150,size:14,font:f});
 const pdf=Buffer.from(await d.save());
 await check('MuPDF is detected and enables redaction, erase and rendering',async()=>{const c=await engines.capabilities();assert.equal(c.rendering,true);assert.equal(c.operations.redactText.engine,'mutool');assert.equal(c.operations.eraseAreas.available,true);});
 await check('text redaction removes only the match',async()=>{const r=await engines.process('redactText',{filename:'a.pdf',bytes:pdf,options:{text:'SECRET-123'}});const t=await textOf(r.bytes);assert.ok(!t.includes('SECRET-123'));assert.ok(t.includes('Keep this line'));});
 for(const rotation of [0,90]){
  await check(`page-editor erase removes only the chosen text (rotation ${rotation})`,async()=>{
   const doc=await PDFLib.PDFDocument.load(pdf);doc.getPage(0).setRotation(PDFLib.degrees(rotation));
   const r=await engines.process('eraseAreas',{filename:'a.pdf',bytes:Buffer.from(await doc.save()),options:{areas:[{page:1,rect:[25,190,370,220]}]}});
   const t=await textOf(r.bytes);assert.ok(!t.includes('Invoice'));assert.ok(t.includes('Keep this line'));
  });
 }
 await check('render service: upload once, draw pages, reuse cached sizes, refuse bad requests',async()=>{
  const server=createWaraqServer({env:{...env}});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  try{
   const up=await fetch(base+'/api/render/doc',{method:'POST',headers:{'X-Waraq-Client':'1','Content-Type':'application/octet-stream'},body:pdf});assert.equal(up.status,200);const {id}=await up.json();
   const a=await fetch(`${base}/api/render/${id}/1?w=900`);assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),'image/png');const png=Buffer.from(await a.arrayBuffer());assert.equal(png.subarray(1,4).toString(),'PNG');
   const t=Date.now(),b=await fetch(`${base}/api/render/${id}/1?w=1000`);await b.arrayBuffer();assert.ok(Date.now()-t<500,'same size bucket comes from the cache');
   assert.equal((await fetch(`${base}/api/render/${'0'.repeat(32)}/1`)).status,404);
   // deep-zoom tile: only a region, at a scale far beyond a whole-page image
   const tile=await fetch(`${base}/api/render/${id}/1/tile?s=12&x=600&y=800&w=640&h=480`);assert.equal(tile.status,200);
   const tp=Buffer.from(await tile.arrayBuffer());assert.equal(tp.subarray(1,4).toString(),'PNG');assert.equal(tp.readUInt32BE(16),640);assert.equal(tp.readUInt32BE(20),480);
   assert.equal((await fetch(`${base}/api/render/${id}/1/tile?s=12&x=0&y=0&w=9000&h=10`)).status,400);
   assert.equal((await fetch(base+'/api/render/doc',{method:'POST',body:pdf})).status,403);
  }finally{server.closeAllConnections();server.close();}
 });
 console.log(passed+' MuPDF checks passed.');
})().catch(e=>{console.error('FAIL',e.code||'',e.message,e.stderr||'');process.exit(1);});
