'use strict';
const {app,BrowserWindow,Menu,session,ipcMain,shell,dialog}=require('electron');
const path=require('node:path');
const {CSP,isLocalUrl,allowedRequest,safeExternalUrl}=require('./security.cjs');
const smokeMode=process.argv.includes('--waraq-smoke-test');
const extras=require('./desktop-extras.cjs');
const packs=require('./packs.cjs');
extras.queueOpenFiles(process.argv);
let mainWindow=null,localServer=null,origin='';

app.setName('Waraq PDF Studio');
if(!app.isPackaged&&process.env.WARAQ_USER_DATA)app.setPath('userData',process.env.WARAQ_USER_DATA); // development tests only
app.setAppUserModelId('app.waraq.pdfstudio');
app.enableSandbox();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-features','MediaRouter,OptimizationHints,AutofillServerCommunication');

if(!app.requestSingleInstanceLock()){app.quit();}
else {
  app.on('second-instance',(_event,argv)=>{if(extras.queueOpenFiles(argv))extras.notifyOpenFiles(mainWindow);if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(start).catch(error=>{
    console.error('Waraq startup failed:',error.message);
    if(!smokeMode)dialog.showErrorBox('Waraq could not start','The local workspace could not be started. Reinstall Waraq or contact the project maintainer.\n\n'+error.message);
    app.exit(1);
  });
}

async function start(){
  // The desktop app works on local files: allow large documents (2 GB), long OCR runs and long jobs.
  for(const [key,value] of Object.entries({WARAQ_MAX_INPUT_MB:'2048',WARAQ_MAX_OCR_PAGES:'5000',WARAQ_MAX_JOB_MINUTES:'240'}))if(!process.env[key])process.env[key]=value;
  const {createWaraqServer}=require('../server.cjs');
  if(typeof createWaraqServer!=='function')throw new Error('This package is missing the local server module.');
  const engineEnv={...process.env};for(const key of Object.keys(engineEnv))if(/^WARAQ_(STIRLING|OCRBASE)_/.test(key)||['WARAQ_ALLOWED_ORIGINS','WARAQ_PUBLIC_ORIGIN','WARAQ_BIND','WARAQ_API_TOKEN'].includes(key))delete engineEnv[key];
  // All-in-one builds ship qpdf, MuPDF, Tesseract and LibreOffice under resources/engines. Bundled copies win so
  // behaviour does not depend on what else is installed; WARAQ_PREFER_SYSTEM_ENGINES=1 reverses that.
  const {bundledEngineEnv}=require('../backend/engine-paths.cjs');
  const enginesDir=app.isPackaged?path.join(process.resourcesPath,'engines'):(process.env.WARAQ_DEV_ENGINES||path.join(__dirname,'..','engines','win-x64'));
  Object.assign(engineEnv,bundledEngineEnv(enginesDir,engineEnv,{preferBundled:process.env.WARAQ_PREFER_SYSTEM_ENGINES!=='1'}));
  Object.assign(engineEnv,packs.packEngineEnv()); // add-on packs the user downloaded (Office & CAD, OCR)
  if(require('node:fs').existsSync(path.join(enginesDir,'ENGINE-SOURCES.json'))&&process.env.WARAQ_PREFER_SYSTEM_ENGINES!=='1')engineEnv.WARAQ_BUNDLED_ONLY='1';
  localServer=createWaraqServer({host:'127.0.0.1',env:engineEnv});
  await new Promise((resolve,reject)=>{localServer.once('error',reject);localServer.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${localServer.address().port}`;
  localServer.engines?.warmUp?.(); // engines are checked in the background while the window opens
  const appSession=session.fromPartition('persist:waraq-desktop');
  appSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  appSession.setPermissionCheckHandler(()=>false);
  appSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowedRequest(details.url,origin)}));
  appSession.webRequest.onHeadersReceived((details,callback)=>{
    const headers={...details.responseHeaders};
    if(isLocalUrl(details.url,origin)){
      for(const key of Object.keys(headers))if(key.toLowerCase()==='content-security-policy')delete headers[key];
      headers['Content-Security-Policy']=[CSP];headers['X-Content-Type-Options']=['nosniff'];headers['Referrer-Policy']=['no-referrer'];
    }
    callback({responseHeaders:headers});
  });
  appSession.on('will-download',(_event,item)=>{
    const filename=path.basename(item.getFilename()).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_');
    item.setSaveDialogOptions({title:'Save document / حفظ المستند',defaultPath:path.join(app.getPath('downloads'),filename)});
  });
  ipcMain.on('waraq:external-link',(event,value)=>{
    if(!mainWindow || event.sender!==mainWindow.webContents || !isLocalUrl(event.senderFrame?.url,origin))return;
    const url=safeExternalUrl(value);if(url)shell.openExternal(url).catch(()=>{});
  });
  extras.registerOpenFiles(()=>mainWindow,url=>isLocalUrl(url,origin));
  extras.registerUpdateStatus(()=>mainWindow,url=>isLocalUrl(url,origin));
  packs.registerPacks({getWindow:()=>mainWindow,isTrusted:url=>isLocalUrl(url,origin),updateManifestUrl:()=>extras.manifestUrl(),applyEnv:(env,keys)=>localServer.engines?.setEnginePaths?.(env,keys)});
  mainWindow=new BrowserWindow({
    icon:path.join(__dirname,'resources/waraq.png'),width:1440,height:1000,minWidth:390,minHeight:640,show:false,backgroundColor:'#fafbf8',title:'Waraq PDF Studio',
    autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),session:appSession,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:false,devTools:!app.isPackaged}
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File / ملف',submenu:[{label:'Open… / فتح…',accelerator:'CmdOrCtrl+O',click:()=>mainWindow?.webContents.send('waraq:menu','open')},{label:'Close file / إغلاق الملف',accelerator:'CmdOrCtrl+W',click:()=>mainWindow?.webContents.send('waraq:menu','close')},{type:'separator'},{role:'quit',label:'Exit / خروج'}]},
    {label:'Edit / تحرير',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View / عرض',submenu:[{role:'resetZoom',label:'Interface size: reset / حجم الواجهة: افتراضي',accelerator:'CmdOrCtrl+Shift+0'},{role:'zoomIn',label:'Interface larger / تكبير الواجهة',accelerator:'CmdOrCtrl+Shift+='},{role:'zoomOut',label:'Interface smaller / تصغير الواجهة',accelerator:'CmdOrCtrl+Shift+-'},{type:'separator'},{role:'togglefullscreen'}]},
    {label:'Help / مساعدة',submenu:[{label:'Check for updates… / التحقق من التحديثات…',click:()=>extras.checkForUpdates(mainWindow,{manual:true})},{type:'separator'},{label:'About Waraq / حول ورق',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Waraq PDF Studio',message:'Waraq PDF Studio '+app.getVersion(),detail:'Arabic and English PDF tools, bundled for offline use.\n\nBrowser tools and Arabic/English OCR run locally. The Full edition includes its engines (qpdf, MuPDF, Tesseract, LibreOffice); they run locally on this computer.\n\nThis build is unsigned. Update checks are optional and only download the public version list.'})}]}
  ]));
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!isLocalUrl(url,origin))event.preventDefault();});
  mainWindow.webContents.on('will-redirect',(event,url)=>{if(!isLocalUrl(url,origin))event.preventDefault();});
  mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
  mainWindow.on('closed',()=>{mainWindow=null;});
  // Show at first paint instead of after every resource has loaded.
  mainWindow.once('ready-to-show',()=>{if(!smokeMode)mainWindow.show();});
  await mainWindow.loadURL(origin+'/');
  if(smokeMode){
    const result=await mainWindow.webContents.executeJavaScript(`new Promise(resolve=>{const started=Date.now();const check=()=>{const tools=document.querySelectorAll('.tool').length;if(tools||Date.now()-started>12000)resolve({title:document.title,tools,desktop:window.waraqDesktop?.isDesktop===true,offline:window.waraqDesktop?.offline===true,nodeIsolated:typeof window.require==='undefined',localAssets:[...document.scripts].every(s=>!s.src||s.src.startsWith(location.origin)),iconCount:document.querySelectorAll('svg.icon').length});else setTimeout(check,100);};check();})`);
    console.log('WARAQ_DESKTOP_SMOKE '+JSON.stringify(result));
    const engines=await mainWindow.webContents.executeJavaScript(`fetch('/api/capabilities').then(r=>r.json()).then(c=>Object.fromEntries(Object.entries(c.operations).map(([k,v])=>[k,v.available?v.engine:false]))).catch(()=>null)`);
    console.log('WARAQ_DESKTOP_ENGINES '+JSON.stringify(engines));
    app.exit(result.tools>0&&result.desktop&&result.offline&&result.nodeIsolated&&result.localAssets&&result.iconCount>5?0:1);
  } else {mainWindow.show();extras.scheduleUpdateCheck(mainWindow).catch(()=>{});}
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(localServer){localServer.closeAllConnections?.();localServer.close();localServer=null;}});
