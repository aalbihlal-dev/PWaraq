// Round 3: page editor core, raw (large) uploads, configurable limits.
const assert=require('node:assert/strict'),path=require('node:path'),{once}=require('node:events');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
const load=(f)=>import(require('node:url').pathToFileURL(path.join(require('node:path').join(__dirname,'..'),'dist',f)));
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<0.01,`${msg}: ${a} vs ${b}`);
// page-editor.js imports integrations.js, which reads localStorage at load time.
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
(async()=>{
 const {scanContent,findPageImages,applyPageEdits,mul,inv,apply,rectToRect,latinOnly}=await load('page-editor.js');
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==','base64'));
 async function sample(rotation=0){const d=await PDFLib.PDFDocument.create(),p=d.addPage([600,800]),img=await d.embedPng(png);p.drawText('Hello (world) [x]',{x:50,y:700,size:12});p.drawImage(img,{x:100,y:200,width:200,height:100});p.drawImage(img,{x:350,y:500,width:50,height:50});if(rotation)p.setRotation(PDFLib.degrees(rotation));return PDFLib.PDFDocument.load(await d.save());}

 await check('content scanning skips strings, dicts, arrays and inline images',async()=>{
  const ops=scanContent('q 1 0 0 1 5 5 cm BT /F1 12 Tf (a Do q Q \\) Do) Tj [(x) 3 (y)] TJ ET << /A (Do) >> BDC EMC BI /W 1 /H 1 ID \x00\xff Do EI Q /Im0 Do');
  assert.deepEqual(ops.map(o=>o.op),['q','cm','BT','Tf','Tj','TJ','ET','BDC','EMC','Q','Do']);
  assert.equal(ops.at(-1).operands[0].v,'Im0');
 });
 await check('matrix helpers',async()=>{
  const m=[2,0,0,3,10,20];assert.deepEqual(mul(m,inv(m)).map(v=>Math.round(v*1e9)/1e9+0),[1,0,0,1,0,0]);
  assert.deepEqual(apply(rectToRect({x0:0,y0:0,x1:10,y1:10},{x0:5,y0:5,x1:25,y1:15}),[10,10]),[25,15]);
  assert.equal(latinOnly('Hello, café'),true);assert.equal(latinOnly('مرحبا'),false);
 });
 await check('existing photos are found with their exact placement',async()=>{
  const doc=await sample(),{images}=findPageImages(PDFLib,doc,0);
  assert.equal(images.length,2);
  near(images[0].rect.x0,100,'x0');near(images[0].rect.y0,200,'y0');near(images[0].rect.x1,300,'x1');near(images[0].rect.y1,300,'y1');
 });
 await check('a photo is moved and resized losslessly; another is deleted; text is kept',async()=>{
  const doc=await sample(),before=doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject')).keys().length;
  await applyPageEdits(PDFLib,doc,0,{moves:[{index:0,to:{x0:50,y0:50,x1:450,y1:250}}],deletes:[1]});
  const again=await PDFLib.PDFDocument.load(await doc.save()),{images,src}=findPageImages(PDFLib,again,0);
  assert.equal(images.length,1,'deleted photo is no longer drawn');
  near(images[0].rect.x0,50,'moved x0');near(images[0].rect.y0,50,'moved y0');near(images[0].rect.x1,450,'moved x1');near(images[0].rect.y1,250,'moved y1');
  assert.ok(src.includes('48656C6C6F2028776F726C6429'),'text drawing kept (Hello (world) in hex)');
  assert.equal(again.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject')).keys().length,before,'image data untouched (no re-encoding)');
 });
 await check('moves are correct on a rotated page too',async()=>{
  const doc=await sample(90);await applyPageEdits(PDFLib,doc,0,{moves:[{index:1,to:{x0:10,y0:10,x1:110,y1:110}}]});
  const {images}=findPageImages(PDFLib,doc,0);near(images[1].rect.x0,10,'x0');near(images[1].rect.y1,110,'y1');
 });
 await check('text, images and white-out boxes are added',async()=>{
  const doc=await sample();
  await applyPageEdits(PDFLib,doc,0,{covers:[{x0:40,y0:690,x1:200,y1:715,color:[1,1,1]}],texts:[{x:50,y:700,size:12,color:[0,0,0],bold:true,lines:['New title','Second line'],rotation:0}],images:[{bytes:png,type:'png',x:10,y:10,width:30,height:30,rotation:0}]});
  const again=await PDFLib.PDFDocument.load(await doc.save());assert.equal(findPageImages(PDFLib,again,0).images.length,3);
 });

 // Raw uploads: no base64 copy, options in a header, limit from the environment.
 const {createEngineService}=require('../backend/engines.cjs'),{createWaraqServer}=require('../server.cjs');
 await check('engines accept raw bytes and honour WARAQ_MAX_INPUT_MB',async()=>{
  const engines=createEngineService({env:{WARAQ_MAX_INPUT_MB:'1',WARAQ_BUNDLED_ONLY:'1'}});
  const pdf=Buffer.from('%PDF-1.7\n%%EOF');
  await assert.rejects(engines.process('optimize',{filename:'a.pdf',bytes:pdf}),e=>e.code==='ENGINE_UNAVAILABLE','valid raw input reaches the engine check');
  await assert.rejects(engines.process('optimize',{filename:'a.pdf',bytes:Buffer.concat([pdf,Buffer.alloc(1024*1024+1)])}),e=>e.code==='TOO_LARGE');
  assert.equal(createEngineService({env:{WARAQ_MAX_INPUT_MB:'2048'}}).maxInputBytes,2048*1024*1024);
 });
 await check('server takes application/octet-stream with filename and options headers',async()=>{
  let seen=null;const fake={maxInputBytes:64*1024*1024,capabilities:async()=>({version:1,operations:{}}),process:async(id,body)=>{seen={id,...body};return{bytes:Buffer.from('%PDF-1.7 ok'),type:'application/pdf',filename:'out.pdf',engine:'test'};}};
  const server=createWaraqServer({env:{},engineService:fake});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
   const big=Buffer.alloc(5*1024*1024,7),options={language:'ara+eng',text:'نص'};
   const r=await fetch(`http://127.0.0.1:${server.address().port}/api/process/ocr`,{method:'POST',headers:{'X-Waraq-Client':'1','Content-Type':'application/octet-stream','X-Waraq-Filename':encodeURIComponent('رسم.pdf'),'X-Waraq-Options':Buffer.from(JSON.stringify(options)).toString('base64')},body:big});
   assert.equal(r.status,200);assert.equal(seen.filename,'رسم.pdf');assert.deepEqual(seen.options,options);assert.equal(Buffer.compare(seen.bytes,big),0);
  }finally{server.closeAllConnections();server.close();}
 });
 console.log(passed+' round 3 checks passed.');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
