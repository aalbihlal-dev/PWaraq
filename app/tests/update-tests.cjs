// Update indicator: version source, shared artifact rule, decisions. Run: node update-tests.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=(f)=>import(require('node:url').pathToFileURL(path.join(require('node:path').join(__dirname,'..'),'dist',f)));
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
(async()=>{
 const {APP_VERSION,newer,latestFromManifest,decideWebUpdate}=await load('update-badge.js');
 const shared=require('../desktop/release-manifest.cjs');
 await check('the website version matches package.json',async()=>{assert.equal(APP_VERSION,require('../package.json').version);});
 await check('the website and desktop use the same artifact rule',async()=>{
  const web=fs.readFileSync(path.join(require('node:path').join(__dirname,'..'),'dist','update-badge.js'),'utf8').match(/const ARTIFACT=(\/.*\/);/)[1];
  assert.equal(web,String(shared.ARTIFACT));
 });
 await check('a newer release shows the badge; same or older does not',async()=>{
  const m=(...v)=>({version:1,artifacts:v.map((x,i)=>({filename:`Waraq-${i%2?'Lite':'Full'}-Setup-${x}-x64.exe`}))});
  assert.deepEqual(decideWebUpdate('0.2.0',m('0.2.0','0.3.1','0.3.0')),{available:true,latest:'0.3.1',current:'0.2.0'});
  assert.equal(decideWebUpdate('0.2.0',m('0.2.0')).available,false);
  assert.equal(decideWebUpdate('0.4.0',m('0.3.0')).available,false);
  assert.equal(newer('0.10.0','0.9.9'),true);
 });
 await check('an unreadable manifest never shows a false update',async()=>{
  for(const bad of [null,{},{version:2,artifacts:[]},{version:1,artifacts:[]},{version:1,artifacts:[{filename:'setup.exe'}]}]){assert.equal(latestFromManifest(bad),null);assert.equal(decideWebUpdate('0.2.0',bad).available,false);}
 });
 await check('the live-site manifest in dist parses (if present)',async()=>{
  const p=path.join(require('node:path').join(__dirname,'..'),'dist','downloads','manifest.json');if(!fs.existsSync(p))return;
  const m=JSON.parse(fs.readFileSync(p,'utf8'));assert.equal(latestFromManifest(m),shared.latestRelease(m));
 });
 await check('desktop: the badge status is wired through preload and main',async()=>{
  const preload=fs.readFileSync(path.join(require('node:path').join(__dirname,'..'),'desktop','preload.cjs'),'utf8'),main=fs.readFileSync(path.join(require('node:path').join(__dirname,'..'),'desktop','main.cjs'),'utf8'),extras=fs.readFileSync(path.join(require('node:path').join(__dirname,'..'),'desktop','desktop-extras.cjs'),'utf8');
  assert.match(preload,/getUpdateStatus:\(\)=>ipcRenderer\.invoke\('waraq:get-update-status'\)/);
  assert.match(preload,/onUpdateStatus:/);assert.match(main,/extras\.registerUpdateStatus\(/);
  assert.match(extras,/s\.latest=latest;.*sendUpdateStatus\(win\)/,'every allowed check stores and sends the result');
 });
 console.log(passed+' update indicator checks passed.');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
