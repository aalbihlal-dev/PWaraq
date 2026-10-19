'use strict';
// Crop with the mouse: a box drawn on the page as displayed becomes the right crop box for every page rotation.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
globalThis.PDFLib=require('../dist/vendor/pdf-lib.min.js');require('../dist/core.js');
(async()=>{
  const PDFLib=globalThis.PDFLib,pdfjs=await import(pathToFileURL(path.join(__dirname,'..','dist','vendor','pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(__dirname,'..','dist','vendor','pdf.worker.min.mjs')).href;
  let checks=0;
  for(const rot of [0,90,180,270]){
    // a 400 x 600 page; a word placed so that it appears near the top-left corner once the page is shown rotated
    const src=await PDFLib.PDFDocument.create(),font=await src.embedFont(PDFLib.StandardFonts.Helvetica),p=src.addPage([400,600]);
    const spot={0:[20,570],90:[20,20],180:[350,20],270:[350,570]}[rot];
    p.drawText('KEEP',{x:spot[0],y:spot[1],size:10,font});p.drawText('GONE',{x:400-spot[0]-30,y:600-spot[1]-10,size:10,font});
    const doc=await PDFLib.PDFDocument.load(await src.save());
    const item={source:0,index:0,rotation:rot,crop:0,cropRect:{l:0,t:0,r:0.5,b:0.5}}; // keep the top-left quarter as displayed
    const out=await globalThis.WaraqCore.compose([item],[{doc}]);
    const page=await (await pdfjs.getDocument({data:out,isEvalSupported:false}).promise).getPage(1),v=page.getViewport({scale:1});
    const shown=rot%180?[600,400]:[400,600];
    assert.equal(Math.round(v.width),shown[0]/2,`rotation ${rot}: kept width`);assert.equal(Math.round(v.height),shown[1]/2,`rotation ${rot}: kept height`);
    const {items}=await page.getTextContent()
    const inView=(str)=>{const it=items.find((i)=>i.str===str);if(!it)return false; /* the PDF engine leaves out text outside the crop box */const [x,y]=v.convertToViewportPoint(it.transform[4],it.transform[5]);return x>=0&&y>=0&&x<=v.width&&y<=v.height;};
    assert.ok(inView('KEEP'),`rotation ${rot}: the top-left of the shown page is kept`);
    assert.ok(!inView('GONE'),`rotation ${rot}: the rest is cut away`);
    checks++;
  }
  console.log(checks+' crop checks passed (rotations 0, 90, 180, 270).');
})().catch((e)=>{console.error('FAIL',e.message);process.exit(1);});
