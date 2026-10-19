'use strict';
// Add-on packs on the desktop: downloaded from the Waraq website the first time a tool needs them, checked against
// the SHA-256 built into this app (desktop/packs.json), unpacked with Windows' own tar into the user's app-data
// folder, and handed to the local engine service without a restart.
const {app,ipcMain,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{spawn}=require('node:child_process');
const {downloadPieces}=require('./fetch-pieces.cjs');
const {PACKS}=require('./pack-defs.cjs');
const {bundledEngineEnv}=require('../backend/engine-paths.cjs');
let PINNED={};try{PINNED=require('./packs.json');}catch{}
const TAR=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
const root=()=>path.join(app.getPath('userData'),'engines');
const dirOf=(name)=>path.join(root(),name);
const MARK='.waraq-pack.json';
// Engine settings that come from packs; cleared and re-applied whenever packs change.
const PACK_KEYS=['WARAQ_LIBREOFFICE','WARAQ_DWG2DXF','WARAQ_TESSERACT','TESSDATA_PREFIX'];

function installedSha(name){try{return JSON.parse(fs.readFileSync(path.join(dirOf(name),MARK),'utf8')).sha256;}catch{return null;}}
/** Engine paths from every installed pack (only packs whose files match this app's pinned version). */
function packEngineEnv(){
  const env={};
  for(const name of Object.keys(PACKS))if(PINNED[name]&&installedSha(name)===PINNED[name].sha256)Object.assign(env,bundledEngineEnv(dirOf(name)));
  return env;
}
let jobs={}; // name -> {phase,done,total,message}
function status(){
  return Object.entries(PACKS).map(([name,def])=>{
    const pin=PINNED[name]||{},have=installedSha(name);
    return {name,label:def.label,detail:def.detail,ops:def.ops,size:pin.size||0,unpacked:pin.unpacked||0,
      installed:!!pin.sha256&&have===pin.sha256,outdated:!!have&&have!==pin.sha256,available:!!pin.sha256,job:jobs[name]||null};
  });
}
function siteUrl(rel,manifestUrl){return new URL(rel,manifestUrl).href;}
async function fetchJson(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await net.fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}
// Packs are .tar.zst: Waraq decompresses (zstd is built into the app) and Windows' tar only reads plain tar,
// which every Windows 10 / 11 version can do.
function unpack(file,dest){
  return new Promise((ok,fail)=>{
    const tar=spawn(TAR,['-x','-f','-','-C',dest],{windowsHide:true,stdio:['pipe','ignore','pipe']});let err='';
    tar.stderr.on('data',(d)=>{err+=d;});tar.on('error',fail);tar.on('close',(code)=>code===0?ok():fail(Error('Unpacking failed: '+err.slice(0,300))));
    const src=fs.createReadStream(file),z=zlib.createZstdDecompress();
    src.on('error',fail);z.on('error',fail);src.pipe(z).pipe(tar.stdin);
  });
}

async function install(name,{updateManifestUrl,onChange,applyEnv}){
  const pin=PINNED[name];if(!PACKS[name]||!pin)throw Error('Unknown pack');
  if(jobs[name]&&jobs[name].phase!=='error')return;
  const report=(j)=>{jobs[name]=j;onChange();};
  const tmp=path.join(app.getPath('temp'),`waraq-pack-${name}-${process.pid}.tar.zst`),staging=dirOf(name)+'.partial';
  try{
    if(!updateManifestUrl)throw Error('Downloads are not configured in this build');
    report({phase:'download',done:0,total:pin.size});
    const manifest=await fetchJson(siteUrl('../packs/manifest.json',updateManifestUrl));
    const entry=(manifest.packs||[]).find((p)=>p.name===name);
    // Only the exact pack this app was built with is accepted.
    if(!entry||entry.sha256!==pin.sha256||!Array.isArray(entry.chunks))throw Error('The website does not offer the pack this version expects. Update Waraq first.');
    const digest=await downloadPieces({chunks:entry.chunks,file:tmp,urlOf:(c)=>siteUrl('../packs/'+c.path,updateManifestUrl),onProgress:(done)=>report({phase:'download',done,total:pin.size})});
    if(digest!==pin.sha256)throw Error('The pack does not match its checksum');
    report({phase:'unpack',done:pin.size,total:pin.size});
    fs.rmSync(staging,{recursive:true,force:true});fs.mkdirSync(staging,{recursive:true});
    await unpack(tmp,staging);
    fs.writeFileSync(path.join(staging,MARK),JSON.stringify({name,sha256:pin.sha256,installed:new Date().toISOString()}));
    fs.rmSync(dirOf(name),{recursive:true,force:true});fs.renameSync(staging,dirOf(name));
    applyEnv(packEngineEnv(),PACK_KEYS);delete jobs[name];onChange();
  }catch(e){
    fs.rmSync(staging,{recursive:true,force:true});
    report({phase:'error',message:String(e.message||e)});
  }finally{fs.rmSync(tmp,{force:true});}
}
function remove(name,{onChange,applyEnv}){
  if(!PACKS[name]||jobs[name]?.phase==='download'||jobs[name]?.phase==='unpack')return;
  fs.rmSync(dirOf(name),{recursive:true,force:true});delete jobs[name];
  applyEnv(packEngineEnv(),PACK_KEYS);onChange();
}
/** IPC for the main window's own page only. */
function registerPacks({getWindow,isTrusted,updateManifestUrl,applyEnv}){
  const ok=(event)=>{const win=getWindow();return win&&event.sender===win.webContents&&isTrusted(event.senderFrame?.url)?win:null;};
  const onChange=()=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('waraq:packs',status());};
  ipcMain.handle('waraq:packs-status',(event)=>ok(event)?status():null);
  ipcMain.handle('waraq:pack-install',(event,name)=>{if(ok(event)&&typeof name==='string')install(name,{updateManifestUrl:updateManifestUrl(),onChange,applyEnv});return true;});
  ipcMain.handle('waraq:pack-remove',(event,name)=>{if(ok(event)&&typeof name==='string')remove(name,{onChange,applyEnv});return true;});
}
module.exports={packEngineEnv,registerPacks,status,PACK_KEYS};
