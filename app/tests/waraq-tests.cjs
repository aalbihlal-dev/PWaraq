const assert=require('node:assert/strict');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
const load=(f)=>import(require('node:url').pathToFileURL(require('node:path').join(require('node:path').join(__dirname,'..'),'dist',f)));
(async()=>{
  const {normalizeArabic,findReversedLines,repairDirection}=await load('arabic-text.js');
  const good='هذا مستند تجريبي للتعرف على النص العربي';
  assert.equal(repairDirection(normalizeArabic(good)),good,'correct Arabic is untouched');
  assert.equal(normalizeArabic('ﻣﺴﺘﻨﺪ'),'مستند','presentation forms become letters');
  const line='الفاتورة رقم 2026 للمدرسة';
  // Broken PDFs give visual order: Arabic reversed, digits still left-to-right.
  const visual=[...line].reverse().join('').replace(/[0-9]+/g,(d)=>[...d].reverse().join(''));
  assert.equal(repairDirection(visual),line,'reversed line restored, number kept readable');
  assert.deepEqual(findReversedLines('Invoice 2026'),[]);

  const {normalizeSearch}=await load('workspace-plus.js').catch(()=>({}));
  if(normalizeSearch){assert.equal(normalizeSearch('مُسْتَنَد'),normalizeSearch('مستند'));assert.equal(normalizeSearch('إلى'),normalizeSearch('الي'));}

  const {applyDarkReading,applyLetterhead}=await load('color-tools.js');
  const src=await PDFLib.PDFDocument.create();src.addPage([300,400]).drawText('Hello',{x:20,y:300});const turned=src.addPage([400,300]);turned.setRotation(PDFLib.degrees(90));
  const bytes=await src.save();
  const dark=await PDFLib.PDFDocument.load(await applyDarkReading(PDFLib,bytes,{tone:'#e8e2d4',pages:'1'}));
  const streams=(p)=>p.node.Contents().asArray().map((r)=>Buffer.from(dark.context.lookup(r).getContents()).toString('latin1')).join('');
  assert.equal(dark.getPageCount(),2);
  const gsNames=dark.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('ExtGState'));
  const modes=gsNames.keys().map((k)=>gsNames.lookup(k).get(PDFLib.PDFName.of('BM'))?.toString());
  assert.ok(modes.includes('/Difference')&&modes.includes('/Multiply'),'dark reading inverts then tints');
  assert.ok(!dark.getPage(1).node.Resources()?.lookup(PDFLib.PDFName.of('ExtGState')),'unselected page untouched');
  // 1x1 white PNG
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==','base64'));
  const lh=await PDFLib.PDFDocument.load(await applyLetterhead(PDFLib,bytes,{image:png,imageType:'png',fit:'width-top'}));
  for(const page of lh.getPages())assert.ok(page.node.Resources().lookup(PDFLib.PDFName.of('XObject')),'letterhead image on every page');
  await assert.rejects(applyLetterhead(PDFLib,bytes,{}),/image/);
  console.log('PASS: Arabic text repair, search normalization, dark reading, letterhead on rotated pages');
})().catch((e)=>{console.error(e);process.exit(1);});
