'use strict';
// Reports which operations the bundled engines in engines/win-x64 enable. `--require` fails the build when the
// all-in-one engines are incomplete. Office tools are not required for a Lite bundle (fetched with -SkipOffice).
const path=require('node:path');
const {bundledEngineEnv}=require('../backend/engine-paths.cjs');
const {createEngineService}=require('../backend/engines.cjs');
const root=path.resolve(process.env.WARAQ_PROJECT_ROOT||path.join(__dirname,'..')),enginesDir=path.resolve(process.env.WARAQ_ENGINES_DIR||path.join(root,'engines','win-x64'));
const found=bundledEngineEnv(enginesDir);
let lock={};try{lock=JSON.parse(require('node:fs').readFileSync(path.join(enginesDir,'ENGINE-SOURCES.json'),'utf8').replace(/^﻿/,''));}catch{}
const noOffice=process.argv.includes('--allow-no-office')||lock.bundle?.office===false; // Lite bundle (-SkipOffice)
// Only bundled engines are visible here, so system installs cannot make a broken bundle look complete.
if(process.platform==='win32')process.env.PATH=path.join(process.env.SystemRoot||'C:\\Windows','System32');
for(const key of ['WARAQ_OCRMYPDF','TESSDATA_PREFIX'])delete process.env[key];
const env={...found,WARAQ_BUNDLED_ONLY:'1'};
for(const key of ['WARAQ_QPDF','WARAQ_MUTOOL','WARAQ_TESSERACT','WARAQ_LIBREOFFICE','WARAQ_OCRMYPDF'])env[key]=env[key]||path.join(enginesDir,'missing-'+key);
(async()=>{
 const caps=await createEngineService({env}).capabilities();
 console.log('Bundled engines in '+enginesDir);
 for(const[id,e]of Object.entries(caps.engines))if(!['stirling','ocrbase'].includes(id))console.log('  '+(e.available?'OK     ':'MISSING')+' '+id.padEnd(12)+(e.version||e.reason||''));
 console.log('Operations:');
 for(const[id,o]of Object.entries(caps.operations))console.log('  '+(o.available?'ready  ':'-      ')+' '+id.padEnd(18)+(o.available?o.engine+(o.languages?' ['+o.languages.join(',')+']':''):''));
 if(process.argv.includes('--require')){
  const need=['ocr','optimize','repair','protect','unlock','flatten','redactText',...(noOffice?[]:['officeToPdf','pdfToWord','pdfToPowerPoint'])];
  const missing=need.filter(id=>!caps.operations[id]?.available);
  for(const key of ['WARAQ_QPDF','WARAQ_MUTOOL','WARAQ_TESSERACT',...(noOffice?[]:['WARAQ_LIBREOFFICE'])])if(!found[key])missing.push(key+' (not in bundle)');
  const langs=caps.operations.ocr?.languages||[];if(!langs.includes('ara')||!langs.includes('eng'))missing.push('tessdata ara+eng');
  if(missing.length){console.error('Bundle incomplete: '+missing.join(', ')+'. Run tools/fetch-engines.ps1 first.');process.exit(1);}
  console.log('All-in-one engine bundle is complete.');
 }
})().catch(e=>{console.error(e.message);process.exit(1);});
