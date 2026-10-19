'use strict';
// Real LibreOffice / LibreDWG checks: Word -> PDF, PDF -> Word, DXF -> PDF, and "Fix Arabic text" on a clean file.
// Needs the Full engine bundle (tools/fetch-engines.ps1). --allow-skip skips when LibreOffice is missing.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {bundledEngineEnv}=require('./engine-paths.cjs');const {createEngineService,run}=require('./engines.cjs');
const JSZip=require('../dist/vendor/jszip.min.js');
const env=bundledEngineEnv(process.env.WARAQ_ENGINES_DIR||path.join(__dirname,'..','engines','win-x64'));
if(!env.WARAQ_LIBREOFFICE){const skip=process.argv.includes('--allow-skip');console.error((skip?'SKIP':'FAIL')+': bundled LibreOffice missing (Full edition).');process.exit(skip?0:1);}
let passed=0;const check=async(name,fn)=>{const t=Date.now();await fn();passed++;console.log('PASS '+name+' ('+(Date.now()-t)+' ms)');};
const textOf=async(bytes)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-oc-'));try{fs.writeFileSync(path.join(dir,'a.pdf'),bytes);await run(env.WARAQ_MUTOOL,['draw','-F','txt','-o','a.txt','a.pdf'],{cwd:dir});return fs.readFileSync(path.join(dir,'a.txt'),'utf8');}finally{fs.rmSync(dir,{recursive:true,force:true});}};
async function docx(paragraphs){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs.map(([text,rtl])=>`<w:p>${rtl?'<w:pPr><w:bidi/></w:pPr>':''}<w:r>${rtl?'<w:rPr><w:rtl/></w:rPr>':''}<w:t>${text}</w:t></w:r></w:p>`).join('')+'</w:body></w:document>');
  return zip.generateAsync({type:'nodebuffer'});
}
(async()=>{
  const engines=createEngineService({env:{...env,WARAQ_BUNDLED_ONLY:'1'}});let pdfFromWord;
  await check('Word (.docx, Arabic + English) to PDF',async()=>{
    const r=await engines.process('officeToPdf',{filename:'letter.docx',bytes:await docx([['Quarterly report 2026',false],['هذا تقرير ربع سنوي',true]]),options:{}});
    pdfFromWord=r.bytes;const t=await textOf(r.bytes);assert.match(t,/Quarterly report 2026/);assert.match(t,/تقرير/);
  });
  await check('PDF to Word (.docx)',async()=>{
    const r=await engines.process('pdfToWord',{filename:'letter.pdf',bytes:pdfFromWord,options:{}});
    assert.equal(r.bytes.subarray(0,2).toString(),'PK');const zip=await JSZip.loadAsync(r.bytes);assert.ok(zip.file('word/document.xml'),'a real .docx');
  });
  await check('CAD drawing (DXF) to PDF: geometry is drawn',async()=>{
    const dxf=['0','SECTION','2','ENTITIES','0','LINE','8','0','10','0','20','0','30','0','11','100','21','50','31','0','0','CIRCLE','8','0','10','50','20','25','30','0','40','20','0','TEXT','8','0','10','10','20','60','30','0','40','5','1','WARAQ CAD TEST','0','ENDSEC','0','EOF'].join('\r\n');
    const r=await engines.process('cadToPdf',{filename:'plan.dxf',bytes:Buffer.from(dxf),options:{}});
    assert.ok(r.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')));
    // LibreOffice draws CAD geometry as vector strokes (text without a style table may be dropped), so count strokes.
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-cad-'));try{fs.writeFileSync(path.join(dir,'a.pdf'),r.bytes);const t=await run(env.WARAQ_MUTOOL,['trace','a.pdf','1'],{cwd:dir});assert.ok((t.stdout.match(/stroke_path/g)||[]).length>=2,'line and circle are drawn');}finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
  await check('Fix Arabic text reports a clean file as already fine',async()=>{
    await assert.rejects(engines.process('fixArabic',{filename:'letter.pdf',bytes:pdfFromWord,options:{}}),(e)=>e.code==='NO_BROKEN_ARABIC');
  });
  console.log(passed+' Office/CAD checks passed.');
})().catch((e)=>{console.error('FAIL',e.code||'',e.message,e.stderr||'');process.exit(1);});
