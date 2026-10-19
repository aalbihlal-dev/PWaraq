'use strict';
// Desktop-only extras: PDFs opened from Windows Explorer, and automatic update checks with one-click install.
const {app,dialog,shell,net,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const MAX_FILE=50*1024*1024,pending=[];

// Explorer passes files as arguments: double-click / "Open with" (default interface),
// right-click "Edit with Waraq" (--edit) and "Open in Waraq" (--view).
function queueOpenFiles(argv){
  const mode=argv.includes('--edit')?'edit':argv.includes('--view')?'view':null;
  const files=argv.slice(1).filter((a)=>!a.startsWith('-')&&/\.pdf$/i.test(a)).map((a)=>path.resolve(a)).filter((a)=>{try{return fs.statSync(a).isFile();}catch{return false;}});
  for(const file of files.slice(0,20))pending.push({file,mode});
  return files.length;
}
function takeOpenFiles(){
  const out=[];
  while(pending.length){const {file,mode}=pending.shift();try{if(fs.statSync(file).size<=MAX_FILE)out.push({name:path.basename(file),data:fs.readFileSync(file),mode});}catch{}}
  return out;
}
/** Only the main window's own page may take the queued files; the renderer never names a path. */
function registerOpenFiles(getWindow,isTrusted){
  ipcMain.handle('waraq:take-open-files',(event)=>{const win=getWindow();if(!win||event.sender!==win.webContents||!isTrusted(event.senderFrame?.url))return [];return takeOpenFiles();});
}
function notifyOpenFiles(win){if(win&&!win.isDestroyed())win.webContents.send('waraq:open-files');}

// ---------- updates: checked automatically; one click downloads, verifies and installs the new version ----------
const crypto=require('node:crypto'),{spawn}=require('node:child_process');
const settingsFile=()=>path.join(app.getPath('userData'),'updates.json');
function readSettings(){try{return JSON.parse(fs.readFileSync(settingsFile(),'utf8'));}catch{return {};}}
function writeSettings(s){try{fs.writeFileSync(settingsFile(),JSON.stringify(s));}catch{}}
function manifestUrl(){
  const raw=process.env.PWARAQ_UPDATE_URL||require('../package.json').pwaraq?.updateManifest||'';
  // https only; a development copy may also use a server on this computer (for testing downloads).
  try{const u=new URL(raw);return u.protocol==='https:'||(!app.isPackaged&&u.protocol==='http:'&&u.hostname==='127.0.0.1')?u.href:'';}catch{return '';}
}
const {newer,latestRelease:latestFromManifest}=require('./release-manifest.cjs');
let progress=null; // {phase:'download'|'install'|'error',done,total,message}
function updateStatus(){const s=readSettings(),current=app.getVersion();return s.latest?{current,latest:s.latest,available:newer(s.latest,current),checkedAt:s.lastCheck||0,progress}:{current,available:false,progress};}
function sendUpdateStatus(win){if(win&&!win.isDestroyed())win.webContents.send('waraq:update-status',updateStatus());}
async function fetchManifest(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const r=await net.fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
  finally{clearTimeout(timer);}
}
/** Only the public version list is requested; no documents, names or IDs are sent. */
async function checkForUpdates(win,{manual=false}={}){
  const url=manifestUrl();
  if(!url){if(manual)dialog.showMessageBox(win,{type:'info',title:'Waraq',message:'Updates are not configured in this build. / التحديثات غير مهيأة في هذه النسخة.'});return;}
  try{
    const manifest=await fetchManifest(url),latest=latestFromManifest(manifest),current=app.getVersion();
    const s=readSettings();s.lastCheck=Date.now();s.latest=latest;writeSettings(s);sendUpdateStatus(win);
    if(!manual)return; // automatic checks only light up the "Update" button in the window
    if(latest&&newer(latest,current)){
      const {response}=await dialog.showMessageBox(win,{type:'info',buttons:['Update now / حدّث الآن','Later / لاحقاً'],defaultId:0,cancelId:1,title:'Waraq',
        message:`Waraq ${latest} is available. / يتوفر ورق ${latest}.`,detail:`You have ${current}. Waraq downloads the update, checks it, installs it and restarts. Your settings and files are kept.\n\nلديك ${current}. ينزّل ورق التحديث ويتحقق منه ثم يثبّته ويعيد التشغيل. تبقى إعداداتك وملفاتك كما هي.`});
      if(response===0)installUpdate(win);
    }else dialog.showMessageBox(win,{type:'info',title:'Waraq',message:`You have the latest version (${current}). / لديك أحدث نسخة (${current}).`});
  }catch{if(manual)dialog.showMessageBox(win,{type:'warning',title:'Waraq',message:'Could not check for updates. / تعذر التحقق من التحديثات.',detail:'Check your internet connection and try again.\n\nتحقق من اتصال الإنترنت ثم حاول مرة أخرى.'});}
}
// The installer of the new version (since 0.3.2 one core installer; heavy engines are add-on packs).
function pickArtifact(manifest,latest){
  const setups=(manifest.artifacts||[]).filter((a)=>/-Setup-/.test(a.filename)&&a.release===latest);
  return setups.find((a)=>!a.edition)||setups.find((a)=>a.edition==='Full')||setups[0]||null;
}
let installing=false;
async function installUpdate(win){
  if(installing)return;installing=true;
  const report=(p)=>{progress=p;sendUpdateStatus(win);};
  const url=manifestUrl(),file=path.join(app.getPath('temp'),'waraq-update-setup.exe');
  try{
    const manifest=await fetchManifest(url),latest=latestFromManifest(manifest);
    if(!latest||!newer(latest,app.getVersion()))throw Error('No newer version');
    const artifact=pickArtifact(manifest,latest);if(!artifact?.chunks?.length)throw Error('No installer for this edition');
    report({phase:'download',done:0,total:artifact.size});
    const digest=await require('./fetch-pieces.cjs').downloadPieces({chunks:artifact.chunks,file,urlOf:(c)=>new URL(c.path,url).href,onProgress:(done)=>report({phase:'download',done,total:artifact.size})});
    if(digest!==artifact.sha256)throw Error('The installer does not match its checksum');
    report({phase:'install',done:artifact.size,total:artifact.size});
    // Silent per-user install over this copy; the installer starts Waraq again when it is done.
    spawn(file,['/S','--force-run'],{detached:true,stdio:'ignore'}).unref();
    setTimeout(()=>app.quit(),800);
  }catch(e){
    installing=false;try{fs.rmSync(file,{force:true});}catch{}
    report({phase:'error',message:String(e.message||e)});
  }
}
function registerUpdateStatus(getWindow,isTrusted){
  const ok=(event)=>{const win=getWindow();return win&&event.sender===win.webContents&&isTrusted(event.senderFrame?.url)?win:null;};
  ipcMain.handle('waraq:get-update-status',(event)=>ok(event)?updateStatus():null);
  ipcMain.handle('waraq:install-update',(event)=>{const win=ok(event);if(win)installUpdate(win);return !!win;});
}
/** Checks shortly after start (at most every 6 hours) and every 12 hours while Waraq stays open. No question asked. */
async function scheduleUpdateCheck(win){
  if(!manifestUrl())return;
  const due=()=>Date.now()-(readSettings().lastCheck||0)>6*3600*1000;
  sendUpdateStatus(win);
  if(due())setTimeout(()=>checkForUpdates(win),10000);
  setInterval(()=>{if(!win.isDestroyed())checkForUpdates(win);},12*3600*1000).unref?.();
}
module.exports={updateStatus,sendUpdateStatus,registerUpdateStatus,queueOpenFiles,registerOpenFiles,notifyOpenFiles,checkForUpdates,scheduleUpdateCheck,manifestUrl};
