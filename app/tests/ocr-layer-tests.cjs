'use strict';
// Searchable PDF from OCR: an invisible text-only page (as Tesseract makes it) is laid over each original page,
// for every page rotation, and the text becomes findable at the right place while the page content is kept.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
(async()=>{
  const {searchablePdf}=await import(pathToFileURL(path.join(__dirname,'..','dist','ocr.js')).href);
  const pdfjs=await import(pathToFileURL(path.join(__dirname,'..','dist','vendor','pdf.min.mjs')).href);
  const src=await PDFLib.PDFDocument.create(),font=await src.embedFont(PDFLib.StandardFonts.Helvetica);
  for(const rot of [0,90,180,270]){const p=src.addPage([400,600]);p.drawText('ORIGINAL'+rot,{x:20,y:560,size:12,font});p.setRotation(PDFLib.degrees(rot));}
  const original=await src.save();
  // A text-only layer the size of the page as shown, with a word near the top-left corner of what the reader sees.
  async function layer(width,height,word){const d=await PDFLib.PDFDocument.create(),f=await d.embedFont(PDFLib.StandardFonts.Helvetica),p=d.addPage([width,height]);p.drawText(word,{x:10,y:height-30,size:14,font:f,opacity:0});return d.save();}
  const layers=[];for(const [i,rot] of [0,90,180,270].entries())layers.push({number:i+1,pdf:await layer(rot%180?600:400,rot%180?400:600,'FOUND'+rot)});
  const out=await searchablePdf(PDFLib,original,layers);
  pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(__dirname,'..','dist','vendor','pdf.worker.min.mjs')).href;
  const doc=await pdfjs.getDocument({data:out,isEvalSupported:false}).promise;
  for(const [i,rot] of [0,90,180,270].entries()){
    const page=await doc.getPage(i+1),view=page.getViewport({scale:1}),{items}=await page.getTextContent();
    const text=items.map((t)=>t.str).join(' ');
    assert.match(text,new RegExp('ORIGINAL'+rot),'original content kept');
    const word=items.find((t)=>t.str==='FOUND'+rot);assert.ok(word,'OCR text is searchable on page with rotation '+rot);
    // where the word appears on screen: it must be near the top-left of the page as displayed
    const [x,y]=view.convertToViewportPoint(word.transform[4],word.transform[5]);
    assert.ok(x>0&&x<60&&y>0&&y<60,`rotation ${rot}: text at the right place (${Math.round(x)},${Math.round(y)})`);
  }
  console.log('4 OCR text-layer checks passed (rotations 0, 90, 180, 270).');
})().catch((e)=>{console.error('FAIL',e.message);process.exit(1);});
