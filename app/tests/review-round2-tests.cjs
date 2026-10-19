// Regression tests for REVIEW-ROUND2-2026-10-12.md (four findings).
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const load=(f)=>import(require('node:url').pathToFileURL(path.join(require('node:path').join(__dirname,'..'),'dist',f)));
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
(async()=>{
 // 1. Arabic repair must never change valid text.
 await check('finding 1: valid Arabic is never reordered (browser)',async()=>{
  const {normalizeArabic,findReversedLines,repairDirection}=await load('arabic-text.js');
  for(const valid of ['هذا فعلا','مرحبا سهلا','أهلا وسهلا بكم','قليلا مثلا أصلا كلا','هذا مستند تجريبي للتعرف على النص العربي','الفاتورة رقم 2026 للمدرسة','ذهب إلى المدرسة صباحا']){
   assert.deepEqual(findReversedLines(valid),[],valid);assert.equal(repairDirection(valid),valid,valid);
  }
  assert.equal(normalizeArabic('ﻣﺴﺘﻨﺪ'),'مستند');
  const line='ذهبت الطالبة إلى المدرسة رقم 12';
  const visual=[...line].reverse().join('').replace(/[0-9]+/g,(d)=>[...d].reverse().join(''));
  const changes=findReversedLines(visual);assert.equal(changes.length,1,'clearly reversed line is offered');assert.equal(changes[0].after,line);
 });
 await check('finding 1: valid Arabic pages are not flagged as broken (engine)',async()=>{
  const {arabicTextBroken}=require('../backend/engines.cjs');
  const page='هذا فعلا مرحبا سهلا أهلا وسهلا قليلا مثلا أصلا كلا طويلا جميلا سريعا شكرا جزيلا هذا مستند تجريبي';
  assert.equal(arabicTextBroken(page),false);
  const good='هذه رسالة من المدرسة إلى الطالبة حول الفاتورة والمكتبة والجامعة';
  assert.equal(arabicTextBroken(good),false);
  assert.equal(arabicTextBroken(good.split(' ').map(w=>[...w].reverse().join('')).join(' ')),true);
 });

 // 2. Disabling recovery must stop pending and in-flight saves.
 await check('finding 2: disabling recovery cancels a pending save',async()=>{
  const {createRecoveryScheduler}=await load('workspace-plus.js');
  const queue=[];const timers={set:(fn)=>{queue.push(fn);return queue.length;},clear:(id)=>{queue[id-1]=null;}};
  let enabled=true,saved=0,cleared=0;
  const store={save:async()=>{saved++;},clear:async()=>{cleared++;}};
  const s=createRecoveryScheduler({store,isEnabled:()=>enabled,getPageCount:()=>3,output:async()=>new Uint8Array(10),name:()=>'doc',timers});
  s.schedule();enabled=false;await s.cancel();
  for(const fn of queue)if(fn)await fn();
  assert.equal(saved,0,'no save after disabling');assert.ok(cleared>=1);
 });
 await check('finding 2b: default timers work when called the way a browser calls them',async()=>{
  const {createRecoveryScheduler}=await load('workspace-plus.js');
  const strict=globalThis.setTimeout;globalThis.setTimeout=function(fn,ms){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');return strict(fn,ms);};
  try{let saved=0;const s=createRecoveryScheduler({store:{save:async()=>{saved++;},clear:async()=>{}},isEnabled:()=>true,getPageCount:()=>1,output:async()=>new Uint8Array(1),name:()=>'d',delay:5});s.schedule();await new Promise(r=>strict(r,50));assert.equal(saved,1);}
  finally{globalThis.setTimeout=strict;}
 });
 await check('finding 2: disabling during serialization or during the write leaves nothing stored',async()=>{
  const {createRecoveryScheduler}=await load('workspace-plus.js');
  for(const phase of ['output','write']){
   const queue=[];const timers={set:(fn)=>{queue.push(fn);return queue.length;},clear:(id)=>{queue[id-1]=null;}};
   let enabled=true,stored=null,releaseOutput,releaseWrite;
   const store={save:(r)=>new Promise((res)=>{releaseWrite=()=>{stored=r;res();};if(phase!=='write')releaseWrite();}),clear:async()=>{stored=null;}};
   const output=()=>new Promise((res)=>{releaseOutput=()=>res(new Uint8Array(10));if(phase!=='output')releaseOutput();});
   const s=createRecoveryScheduler({store,isEnabled:()=>enabled,getPageCount:()=>2,output,name:()=>'doc',timers});
   s.schedule();const run=queue[0]();await new Promise(r=>setImmediate(r));
   enabled=false;await s.cancel();
   if(phase==='output')releaseOutput();else releaseWrite();
   await run;
   assert.equal(stored,null,'nothing stored when disabled during '+phase);
  }
 });

 // 3 and 4. One artifact rule for builder, packager, website validator and updater.
 const {releasesFromManifest,ARTIFACT}=require('../desktop/release-manifest.cjs');
 const {validateDownloadManifest}=await load('downloads.js');
 await check('finding 3: updater reads the real website manifest, and rejects unreadable ones',async()=>{
  const real=path.join(require('node:path').join(__dirname,'..'),'dist','downloads','manifest.json');
  if(fs.existsSync(real)){const versions=releasesFromManifest(JSON.parse(fs.readFileSync(real,'utf8')));assert.ok(versions.length>0&&versions.every(v=>/^\d+\.\d+\.\d+$/.test(v)),'versions from the live manifest');}
  assert.deepEqual(releasesFromManifest({version:1,artifacts:[{filename:'Waraq-Setup-0.2.0-x64.exe'},{filename:'Waraq-Full-Setup-0.3.0-x64.exe',release:'0.3.0'}]}),['0.2.0','0.3.0']);
  for(const bad of [null,{},{version:2,artifacts:[{filename:'Waraq-Setup-0.2.0-x64.exe'}]},{version:1,artifacts:[]},{version:1,artifacts:[{filename:'setup.exe'}]},{version:1,artifacts:[{filename:'Waraq-Setup-0.2.0-x64.exe',release:'9.9.9'}]}])
   assert.throws(()=>releasesFromManifest(bad));
 });
 await check('finding 4: Full/Lite installers flow through the packager into a manifest the website accepts',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pwaraq-pkg-'));
  try{
   fs.copyFileSync(path.join(require('node:path').join(__dirname,'..'),'package-desktop-downloads.cjs'),path.join(dir,'package-desktop-downloads.cjs'));
   fs.mkdirSync(path.join(dir,'release'));fs.mkdirSync(path.join(dir,'release-full'));
   const fake=(n)=>Buffer.alloc(3*1024*1024+n,n);
   fs.writeFileSync(path.join(dir,'release-full','Waraq-Full-Setup-0.3.0-x64.exe'),fake(1));
   fs.writeFileSync(path.join(dir,'release-full','Waraq-Lite-Setup-0.3.0-x64.exe'),fake(2));
   fs.writeFileSync(path.join(dir,'release','Waraq-Portable-0.3.0-x64.exe'),fake(3));
   fs.writeFileSync(path.join(dir,'release','something-else.exe'),fake(4));
   execFileSync(process.execPath,[path.join(dir,'package-desktop-downloads.cjs')],{cwd:dir,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'pipe'});
   const manifest=JSON.parse(fs.readFileSync(path.join(dir,'dist','downloads','manifest.json'),'utf8'));
   assert.deepEqual(manifest.artifacts.map(a=>a.filename).sort(),['Waraq-Full-Setup-0.3.0-x64.exe','Waraq-Lite-Setup-0.3.0-x64.exe','Waraq-Portable-0.3.0-x64.exe']);
   const site=validateDownloadManifest(manifest);
   assert.deepEqual(site.artifacts.map(a=>a.filename),['Waraq-Full-Setup-0.3.0-x64.exe','Waraq-Lite-Setup-0.3.0-x64.exe','Waraq-Portable-0.3.0-x64.exe'],'installers first, Full before Lite');
   assert.deepEqual(site.artifacts.map(a=>a.edition),['Full','Lite','']);
   assert.deepEqual(releasesFromManifest(manifest),['0.3.0','0.3.0','0.3.0']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  // The builder's names follow the same rule.
  const builder=fs.readFileSync(path.join(require('node:path').join(__dirname,'..'),'desktop','builder-full.cjs'),'utf8');
  // Since 0.3.2 there is one core installer (heavy engines are add-on packs); older Full/Lite names stay readable.
  for(const kind of ['Setup','Portable']){
   assert.ok(builder.includes(`'Waraq-${kind}-\${version}-\${arch}.\${ext}'`));
   assert.match(`Waraq-${kind}-0.3.2-x64.exe`,ARTIFACT);
  }
  for(const edition of ['Full','Lite'])assert.match(`Waraq-${edition}-Setup-0.3.1-x64.exe`,ARTIFACT);
 });
 console.log(passed+' review regression checks passed.');
})().catch((e)=>{console.error('FAIL',e);process.exit(1);});
