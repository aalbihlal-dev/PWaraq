'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const MB=1024*1024;
// `native` lists local engines in preference order. `waraqocr` is the built-in mutool + tesseract + qpdf pipeline
// used when OCRmyPDF (Python + Ghostscript) is absent, which is the normal case for the all-in-one Windows build.
const OPERATIONS={
 ocr:{native:['ocrmypdf','waraqocr'],paths:['/api/v1/misc/ocr-pdf'],ext:'pdf'},
 optimize:{native:'qpdf',ext:'pdf'},
 repair:{native:'qpdf',paths:['/api/v1/misc/repair'],ext:'pdf'},
 protect:{native:'qpdf',paths:['/api/v1/security/add-password'],ext:'pdf'},
 unlock:{native:'qpdf',paths:['/api/v1/security/remove-password'],ext:'pdf'},
 flatten:{native:'qpdf',paths:['/api/v1/misc/flatten'],ext:'pdf'},
 officeToPdf:{native:'libreoffice',paths:['/api/v1/convert/file/pdf'],ext:'pdf'},
 pdfToWord:{native:'libreoffice',paths:['/api/v1/convert/pdf/word'],ext:'docx'},
 pdfToPowerPoint:{native:'libreoffice',paths:['/api/v1/convert/pdf/presentation'],ext:'pptx'},
 pdfToExcel:{paths:['/api/v1/convert/pdf/xlsx'],ext:'xlsx'},
 pdfa:{native:'ocrmypdf',paths:['/api/v1/convert/pdf/pdfa'],ext:'pdf'},
 validateSignature:{paths:['/api/v1/security/validate-signature'],ext:'json'},
 redactText:{native:'mutool',paths:['/api/v1/security/auto-redact'],ext:'pdf'},
 ocrText:{engine:'ocrbase',ext:'json'},
 fixArabic:{native:'waraqocr',ext:'pdf'},
 sign:{native:'wincms',ext:'pdf'},
 eraseAreas:{native:'mutool',ext:'pdf'},
 cadToPdf:{native:'cad',ext:'pdf'}
};
const OFFICE_EXT=new Set(['.doc','.docx','.odt','.xls','.xlsx','.ods','.ppt','.pptx','.odp']),CAD_EXT=new Set(['.dwg','.dxf']);
const MIME={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',json:'application/json; charset=utf-8'};
function fail(status,code,message){throw new ApiError(status,code,message);}
function strictString(value,label,max=256){if(typeof value!=='string'||value.length>max||/[\0\r\n]/.test(value))fail(400,'BAD_OPTION',label+' is invalid.');return value;}
function killTree(child){
 if(!child.pid)return;
 if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill('SIGKILL'));}
 else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
function run(command,args,{cwd,signal,timeout=180_000,input,accept=[0],env=process.env}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new ApiError(499,'CANCELLED','The request was cancelled.'));return;}
  let child,done=false,timer,out='',err='',failure;
  const finish=(e,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);e?reject(e):resolve(result);};
  const abort=()=>{failure=new ApiError(499,'CANCELLED','The request was cancelled.');killTree(child);};
  try{child=spawn(command,args,{cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});}catch(e){finish(e);return;}
  child.on('error',e=>finish(e));
  child.stdout.on('data',b=>{if(out.length<32768)out+=b.toString().slice(0,32768-out.length);});
  child.stderr.on('data',b=>{if(err.length<32768)err+=b.toString().slice(0,32768-err.length);});
  child.on('close',code=>{if(failure)finish(failure);else if(!accept.includes(code)){const e=new ApiError(422,'ENGINE_FAILED','The engine could not process this file. Check its password, format, installed dependencies and language packs.');e.stdout=out;e.stderr=err;finish(e);}else finish(null,{stdout:out,stderr:err,code});});
  child.stdin.on('error',()=>{});child.stdin.end(input||'');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  timer=setTimeout(()=>{failure=new ApiError(504,'TIMEOUT','Processing exceeded the time limit. Try a smaller document.');killTree(child);},timeout);
 });
}
async function findCommand(candidates,args=['--version'],{accept=[0],env=process.env,timeout=5000}={}){
 for(const command of candidates.filter(Boolean)){try{const r=await run(command,args,{timeout,accept,env});return{available:true,command,version:(r.stdout||r.stderr).split(/\r?\n/)[0].slice(0,160)};}catch{}}
 return{available:false,reason:'Not installed or not executable.'};
}
function resolveSchema(doc,schema,seen=new Set()){
 if(!schema||typeof schema!=='object')return{};
 if(schema.$ref){if(seen.has(schema.$ref)||!schema.$ref.startsWith('#/'))return{};seen.add(schema.$ref);let s=doc;for(const p of schema.$ref.slice(2).split('/'))s=s?.[p.replace(/~1/g,'/').replace(/~0/g,'~')];return resolveSchema(doc,s,seen);}
 const result={...schema,properties:{...(schema.properties||{})},required:[...(schema.required||[])]};
 for(const item of schema.allOf||[]){const r=resolveSchema(doc,item,new Set(seen));Object.assign(result.properties,r.properties);result.required.push(...(r.required||[]));}return result;
}
function requestSchema(doc,endpoint){const operation=doc.paths?.[endpoint]?.post;if(!operation)return null;const body=resolveSchema(doc,operation.requestBody),content=body.content||{},format=content['multipart/form-data']?'multipart/form-data':content['application/json']?'application/json':null;if(!format)return null;return{format,...resolveSchema(doc,content[format].schema)};}
function serviceConfig(env,name){
 const raw=env['WARAQ_'+name+'_URL'];if(!raw)return null;let url;try{url=new URL(raw);}catch{throw Error('Invalid WARAQ_'+name+'_URL');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid service URL for '+name);
 return{base:url.href.replace(/\/$/,''),key:env['WARAQ_'+name+'_API_KEY']||'',schemaPath:env['WARAQ_'+name+'_SCHEMA_PATH']||(name==='STIRLING'?'/v3/api-docs':'/openapi/json')};
}
async function readResponse(response,max){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();fail(413,'OUTPUT_TOO_LARGE','Engine output exceeds the configured limit.');}
 const chunks=[];let n=0;for await(const c of response.body||[]){n+=c.length;if(n>max)fail(413,'OUTPUT_TOO_LARGE','Engine output exceeds the configured limit.');chunks.push(c);}return Buffer.concat(chunks);
}
function remoteHeaders(config,type){return config.key?(type==='stirling'?{'X-API-KEY':config.key}:{Authorization:'Bearer '+config.key}):{};}
async function discover(config,type){
 if(!config)return{available:false,reason:'Not configured.'};
 try{
  if(!config.schemaPath.startsWith('/')||config.schemaPath.startsWith('//'))throw Error('Invalid schema path');
  const r=await fetch(config.base+config.schemaPath,{headers:remoteHeaders(config,type),redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!r.ok)throw Error('Schema unavailable');const doc=JSON.parse((await readResponse(r,5*MB)).toString('utf8'));if(!doc.paths)throw Error('Invalid schema');
  return{available:true,version:String(doc.info?.version||'unknown').slice(0,100),doc};
 }catch{return{available:false,reason:'Configured service did not return a compatible OpenAPI document.'};}
}
function stirlingFields(id,o={}){
 switch(id){
  case'ocr':return{languages:(o.language||'ara+eng').split('+'),ocrType:'skip-text',ocrRenderType:'sandwich',sidecar:false,deskew:false,rotatePages:false,clean:false,cleanFinal:false,removeImagesAfter:false};
  case'protect':return{password:o.password||'',ownerPassword:o.ownerPassword||crypto.randomBytes(24).toString('hex'),keyLength:256};
  case'unlock':return{password:o.password||''};
  case'pdfToWord':return{outputFormat:'docx'};
  case'pdfToPowerPoint':return{outputFormat:'pptx'};
  case'pdfToExcel':return{pageNumbers:'all'};
  case'pdfa':return{outputFormat:'pdfa-2b',strict:true};
  case'flatten':return{flattenOnlyForms:true};
  case'redactText':return{listOfText:[o.text||''],useRegex:false,wholeWordSearch:false,convertPDFToImage:true};
  default:return{};
 }
}
function compatibleStirling(doc,id){
 for(const endpoint of OPERATIONS[id].paths||[]){const schema=requestSchema(doc,endpoint);if(!schema||schema.format!=='multipart/form-data')continue;
  const p=schema.properties||{};if(!p.fileInput)continue;
  const provided=stirlingFields(id),missing=(schema.required||[]).filter(k=>k!=='fileInput'&&!Object.hasOwn(provided,k)&&resolveSchema(doc,p[k]).default===undefined);if(missing.length)continue;
  if(id==='redactText'&&!['listOfText','convertPDFToImage'].every(k=>p[k]))continue;
  return{endpoint,schema};
 }return null;
}
function compatibleOcrbase(doc){
 const endpoint='/v1/parse',schema=requestSchema(doc,endpoint);if(!schema||schema.format!=='multipart/form-data')return null;
 const fileField=Object.entries(schema.properties||{}).find(([,s])=>{s=resolveSchema(doc,s);return s.type==='string'&&s.format==='binary';})?.[0];if(!fileField)return null;
 if((schema.required||[]).some(k=>![fileField,'model'].includes(k)&&resolveSchema(doc,schema.properties[k]).default===undefined))return null;
 return{endpoint,schema,fileField};
}
// Page-content redaction, not a full-document metadata/attachment sanitizer. Reopen the saved output to ensure
// the searchable match is gone. Use the API shared by older/current mutool: no numeric search-options argument.
const REDACT_SCRIPT=`var input=scriptArgs[0],output=scriptArgs[1];
var needle=String(read(scriptArgs[2])).replace(/^\\uFEFF/,'').replace(/[\\r\\n]+$/,'');
var doc=Document.openDocument(input);
if(doc.needsPassword&&doc.needsPassword())throw new Error('WARAQ_PASSWORD');
var total=0,count=doc.countPages();if(count>200)throw new Error('WARAQ_TOO_MANY_PAGES');
for(var i=0;i<count;i++){
 var page=doc.loadPage(i),rounds=0;
 while(true){
  var hits=page.search(needle)||[];if(!hits.length)break;
  if(++rounds>100||total+hits.length>10000)throw new Error('WARAQ_REDACTION_LIMIT');
  for(var h=0;h<hits.length;h++){
   var quads=typeof hits[h][0]==='number'?[hits[h]]:hits[h];
   var annot=page.createAnnotation('Redact');annot.setQuadPoints(quads);annot.update();
  }
  page.applyRedactions(true,2,2,0);total+=hits.length;
 }
}
doc.save(output,'garbage=4,compress');
var verify=Document.openDocument(output);
for(var j=0;j<verify.countPages();j++)if((verify.loadPage(j).search(needle)||[]).length)throw new Error('WARAQ_REDACTION_VERIFY');
print('WARAQ_REDACTED '+total);
`;
// MuPDF script for the page editor: removes only TEXT inside the given areas (images and drawings stay), so
// replaced text is really gone instead of covered. Areas arrive in PDF user space and are mapped to MuPDF page space.
const ERASE_SCRIPT=`var input=scriptArgs[0],output=scriptArgs[1],areas=JSON.parse(String(read(scriptArgs[2])));
var doc=Document.openDocument(input);
if(doc.needsPassword&&doc.needsPassword())throw new Error('WARAQ_PASSWORD');
var byPage={};for(var i=0;i<areas.length;i++){var a=areas[i];(byPage[a.page]=byPage[a.page]||[]).push(a.rect);}
var total=0;
for(var key in byPage){
 var page=doc.loadPage(Number(key)-1),m=page.getTransform?page.getTransform():null;
 if(!m){var mb=page.getObject().get('MediaBox');m=[1,0,0,-1,-mb[0],mb[3]];}
 var rects=byPage[key];
 for(var r=0;r<rects.length;r++){
  var q=rects[r],xs=[],ys=[],pts=[[q[0],q[1]],[q[2],q[1]],[q[0],q[3]],[q[2],q[3]]];
  for(var k=0;k<4;k++){xs.push(m[0]*pts[k][0]+m[2]*pts[k][1]+m[4]);ys.push(m[1]*pts[k][0]+m[3]*pts[k][1]+m[5]);}
  var annot=page.createAnnotation('Redact');annot.setRect([Math.min.apply(null,xs),Math.min.apply(null,ys),Math.max.apply(null,xs),Math.max.apply(null,ys)]);annot.update();total++;
 }
 page.applyRedactions(false,0,0,0);
}
doc.save(output,'garbage,compress');
print('WARAQ_ERASED '+total);
`;
const MAX_OCR_PAGES=Number(process.env.WARAQ_MAX_OCR_PAGES)||200;
const MAX_JOB_MS=(Number(process.env.WARAQ_MAX_JOB_MINUTES)||30)*60000;
function pageList(numbers){return numbers.join(',');}
// Arabic text layers that copy and search badly: presentation-form glyphs (FB50-FDFF, FE70-FEFF), private-use
// codes, or reversed words. Correct Arabic never starts a word with ة or ى (they only end words), so several such
// words mean reversed text. Endings like "لا" prove nothing: فعلا، سهلا، أهلا are ordinary words.
function arabicTextBroken(text){
 const letters=(text.match(/[؀-ۿﭐ-﷿ﹰ-﻿]/g)||[]).length;if(letters<20)return false;
 if((text.match(/[ﭐ-﷿ﹰ-﻿]/g)||[]).length/letters>0.3)return true;
 if((text.match(/[-�]/g)||[]).length/letters>0.3)return true;
 const words=text.match(/[ء-ي]{2,}/g)||[];if(words.length<8)return false;
 const startsBad=words.filter(w=>/^[ةى]/.test(w)).length,endsGood=words.filter(w=>/[ةى]$/.test(w)).length;
 return startsBad>=3&&startsBad>endsGood;
}
const {signPdf,listCertificates}=require('./pdf-sign.cjs');

function createEngineService({env=process.env}={}){
 const maxInputBytes=(Number(env.WARAQ_MAX_INPUT_MB)||50)*MB,maxOutputBytes=Math.max(100*MB,maxInputBytes*2),stirling=serviceConfig(env,'STIRLING'),ocrbase=serviceConfig(env,'OCRBASE');let cached,pending,cachedAt=0;
 // Child processes need TESSDATA_PREFIX when Tesseract is the bundled copy rather than a system install.
 const childEnv={...process.env,...env};
 for(const key of Object.keys(childEnv))if(/^WARAQ_(?:STIRLING|OCRBASE)_/.test(key)||key==='WARAQ_API_TOKEN')delete childEnv[key];
 const commandCandidates=(key,defaults)=>env.WARAQ_BUNDLED_ONLY==='1'?[env[key]]:env.WARAQ_PREFER_SYSTEM_ENGINES==='1'?[...defaults,env[key]]:[env[key],...defaults];
 async function inventory(force=false){
  // Bundled engines do not change while the app runs: keep the result for 10 minutes or until a refresh is requested.
  if(cached&&!force&&Date.now()-cachedAt<600_000)return cached;if(pending)return pending;
  pending=(async()=>{
   const opt={env:childEnv};
   const r=await Promise.all([findCommand(commandCandidates('WARAQ_QPDF',['qpdf']),undefined,opt),findCommand(commandCandidates('WARAQ_OCRMYPDF',['ocrmypdf']),undefined,opt),findCommand(commandCandidates('WARAQ_TESSERACT',['tesseract']),undefined,opt),findCommand(commandCandidates('WARAQ_LIBREOFFICE',['soffice','libreoffice',process.platform==='win32'?'C:/Program Files/LibreOffice/program/soffice.exe':null]),['--headless','--version'],{...opt,timeout:20000}),discover(stirling,'stirling'),discover(ocrbase,'ocrbase'),findCommand(commandCandidates('WARAQ_MUTOOL',['mutool']),['-v'],{...opt,accept:[0,1]})]);
   const engines={qpdf:r[0],ocrmypdf:r[1],tesseract:r[2],libreoffice:r[3],stirling:r[4],ocrbase:r[5],mutool:r[6]};
   for(const[id,pattern]of Object.entries({qpdf:/qpdf/i,tesseract:/tesseract/i,libreoffice:/libreoffice/i}))if(engines[id].available&&!pattern.test(engines[id].version||''))engines[id]={available:false,reason:'The configured executable did not identify itself as '+id+'.'};
   if(engines.mutool.available&&!/mutool|mupdf/i.test(engines.mutool.version||''))engines.mutool={available:false,reason:'The configured mutool did not identify itself as MuPDF.'};
   engines.wincms=process.platform==='win32'?await findCommand([env.WARAQ_POWERSHELL||'powershell.exe'],['-NoProfile','-NonInteractive','-Command','"PowerShell "+$PSVersionTable.PSVersion'],opt):{available:false,reason:'Certificate signing uses Windows.'};
   engines.dwg2dxf=await findCommand(commandCandidates('WARAQ_DWG2DXF',['dwg2dxf']),['--version'],{...opt,accept:[0,1]});
   engines.cad=engines.libreoffice.available?{available:true,version:engines.dwg2dxf.available?'LibreDWG + LibreOffice':'LibreOffice (DXF only)'}:{available:false,reason:'Needs LibreOffice (and LibreDWG for DWG files).'};
   engines.waraqocr=engines.mutool.available&&engines.tesseract.available&&engines.qpdf.available?{available:true,version:'mutool + tesseract + qpdf'}:{available:false,reason:'Needs mutool, tesseract and qpdf.'};
   let languages=[];if(engines.tesseract.available){try{const l=await run(engines.tesseract.command,['--list-langs'],{timeout:5000,env:childEnv});languages=(l.stdout+'\n'+l.stderr).split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[a-z]{3}(?:_[A-Za-z]+)?$/.test(s));}catch{}}
   const operations={};
   for(const[id,def]of Object.entries(OPERATIONS)){
    const needsOcr=['ocr','pdfa','fixArabic'].includes(id),candidates=[].concat(def.native||[]);
    const native=candidates.find(name=>engines[name]?.available&&(!needsOcr||(engines.tesseract.available&&languages.length)));
    const remote=engines.stirling.available?compatibleStirling(engines.stirling.doc,id):null,ai=id==='ocrText'&&engines.ocrbase.available?compatibleOcrbase(engines.ocrbase.doc):null;
    operations[id]=native?{available:true,engine:native,location:'local',languages:needsOcr?languages:undefined}:remote?{available:true,engine:'stirling',location:'configured-server',remote}:ai?{available:true,engine:'ocrbase',location:'configured-server',remote:ai}:{available:false,engine:candidates[0]||def.engine||'stirling',reason:'Install the native engine or configure a compatible server API.'};
   }
   cached={engines,operations,languages};cachedAt=Date.now();return cached;
  })().finally(()=>pending=null);return pending;
 }
 /** Certificates with a private key in the Windows store, listed only on request (opening the signing form) and only
     to a loopback client, so startup never waits for PowerShell. */
 async function certificates(){
  const data=await inventory();if(!data.operations.sign?.available)return[];
  if(env.WARAQ_BIND&&!/^(127\.0\.0\.1|localhost|::1)$/.test(env.WARAQ_BIND))return[];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waraq-certs-'));
  try{return await listCertificates(run,data.engines.wincms.command,dir);}catch{return[];}
  finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
 }
 async function capabilities({refresh=false}={}){const data=await inventory(refresh);return{version:1,location:'local',rendering:!!data.engines.mutool?.available,limits:{inputBytes:maxInputBytes,outputBytes:maxOutputBytes,timeoutSeconds:MAX_JOB_MS/1000,concurrency:1,ocrPages:MAX_OCR_PAGES},engines:Object.fromEntries(Object.entries(data.engines).map(([id,v])=>[id,{available:v.available,version:v.version,reason:v.reason}])),operations:Object.fromEntries(Object.entries(data.operations).map(([id,v])=>{const {remote,...pub}=v;return[id,pub];}))};}
 function validateInput(id,body){
  if(!Object.hasOwn(OPERATIONS,id))fail(404,'UNKNOWN_OPERATION','Unknown operation.');
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'BAD_REQUEST','A JSON object is required.');
  const filename=typeof body.filename==='string'?body.filename:'document.pdf';if(filename.length>255||/[\0\r\n]/.test(filename))fail(400,'BAD_FILENAME','Invalid filename.');
  let bytes;
  if(Buffer.isBuffer(body.bytes)){bytes=body.bytes;if(!bytes.length||bytes.length>maxInputBytes)fail(413,'TOO_LARGE','A nonempty file within the size limit is required.');}
  else{
   if(typeof body.data!=='string'||!body.data.length||body.data.length>Math.ceil(maxInputBytes/3)*4)fail(413,'TOO_LARGE','A nonempty file within the size limit is required.');
   if(body.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))fail(400,'BAD_BASE64','File data must be canonical base64.');
   bytes=Buffer.from(body.data,'base64');if(bytes.length>maxInputBytes)fail(413,'TOO_LARGE','The document is larger than the size limit.');
  }
  const ext=path.extname(filename).toLowerCase();
  if(id==='officeToPdf'){if(!OFFICE_EXT.has(ext))fail(415,'FILE_TYPE','Choose a Word, Excel, PowerPoint, or OpenDocument file.');}
  else if(id==='cadToPdf'){if(!CAD_EXT.has(ext))fail(415,'FILE_TYPE','Choose a DWG or DXF drawing.');}
  else if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))fail(415,'FILE_TYPE','This operation requires a PDF file.');
  const options=body.options||{};if(typeof options!=='object'||Array.isArray(options))fail(400,'BAD_OPTION','Options must be an object.');
  if(['protect','unlock'].includes(id)){strictString(options.password,'Password');if(!options.password)fail(400,'PASSWORD_REQUIRED','Enter the document password.');if(options.ownerPassword!==undefined)strictString(options.ownerPassword,'Owner password');}
  if(id==='ocr'||id==='pdfa'){if(options.language!==undefined&&!['ara','eng','ara+eng','eng+ara'].includes(options.language))fail(400,'LANGUAGE','Choose Arabic, English, or both.');}
  if(id==='redactText'){strictString(options.text,'Redaction text',1000);if(!options.text.trim())fail(400,'TEXT_REQUIRED','Enter text to redact.');}
  if(id==='eraseAreas'){
   if(!Array.isArray(options.areas)||!options.areas.length||options.areas.length>500)fail(400,'BAD_OPTION','Areas are required.');
   options.areas=options.areas.map(a=>{const page=Number(a?.page),rect=Array.isArray(a?.rect)?a.rect.map(Number):[];if(!Number.isInteger(page)||page<1||page>10000||rect.length!==4||!rect.every(Number.isFinite)||rect[2]<=rect[0]||rect[3]<=rect[1])fail(400,'BAD_OPTION','Invalid area.');return{page,rect};});
  }
  if(id==='sign'){
   if(!['pfx','store'].includes(options.mode))fail(400,'BAD_OPTION','Choose a certificate file or a Windows certificate.');
   if(options.mode==='pfx'){if(typeof options.pfx!=='string'||!options.pfx||options.pfx.length>400000||!/^[A-Za-z0-9+/]*={0,2}$/.test(options.pfx))fail(400,'BAD_CERTIFICATE','Choose a .pfx or .p12 certificate file.');options.pfx=Buffer.from(options.pfx,'base64');}
   else if(!/^[0-9A-Fa-f]{40}$/.test(options.thumbprint||''))fail(400,'BAD_CERTIFICATE','Choose a certificate.');
   for(const k of ['password','reason','location','signerName'])if(options[k]!==undefined)strictString(options[k],k,k==='password'?256:200);
   options.visible=options.visible===true;
  }
  return{bytes,ext,options,basename:path.basename(filename,path.extname(filename)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'document'};
 }
 // Searchable OCR without Python: render only the pages that lack text, let Tesseract produce an invisible text layer
 // (textonly_pdf), then overlay that layer onto the original pages with qpdf so the visible page is never recompressed.
 async function waraqOcr(state,file,dir,input,output,signal){
  const language=file.options.language||'ara+eng';if(language.split('+').some(l=>!state.languages.includes(l)))fail(503,'LANGUAGE_UNAVAILABLE','Install the selected Tesseract language packs (ara and/or eng).');
  const mutool=state.engines.mutool.command,tesseract=state.engines.tesseract.command,qpdf=state.engines.qpdf.command,o={cwd:dir,signal,env:childEnv};
  const count=Number((await run(qpdf,['--show-npages','input.pdf'],{...o,timeout:30000,accept:[0,3]})).stdout.trim());
  if(!Number.isInteger(count)||count<1)fail(422,'NO_PAGES','The PDF page count could not be read.');
  if(count>MAX_OCR_PAGES)fail(413,'TOO_MANY_PAGES','Searchable OCR is limited to '+MAX_OCR_PAGES+' pages per run. Split the document first.');
  await fs.mkdir(path.join(dir,'text'));await fs.mkdir(path.join(dir,'pages'));
  await run(mutool,['draw','-F','txt','-o','text/page-%d.txt','input.pdf'],{...o,timeout:180_000}).catch(e=>{if(['CANCELLED','TIMEOUT'].includes(e.code))throw e;fail(422,'ENGINE_FAILED','MuPDF could not open this PDF. Unlock or repair it first.');});
  const texts=(await fs.readdir(path.join(dir,'text'))).map(n=>Number((n.match(/^page-(\d+)\.txt$/)||[])[1])).filter(Boolean).sort((a,b)=>a-b);
  if(!texts.length)fail(422,'NO_PAGES','No pages were found in this PDF.');if(texts.length>MAX_OCR_PAGES)fail(413,'TOO_MANY_PAGES','Searchable OCR is limited to '+MAX_OCR_PAGES+' pages per run. Split the document first.');
  const todo=[];for(const n of texts){const t=await fs.readFile(path.join(dir,'text','page-'+n+'.txt'),'utf8');if(t.replace(/\s+/g,'').length===0)todo.push(n);}
  if(!todo.length){await fs.copyFile(input,output);return;} // Already searchable; same result as OCRmyPDF --skip-text.
  // Keep only one raster on disk at a time. A 200-page input must not accumulate hundreds of large PNGs.
  const layers=[];
  for(const n of todo){
   const raster='pages/page-'+n+'.png',layer='pages/text-'+n;
   await run(mutool,['draw','-r','300','-m','536870912','-c','gray','-o',raster,'input.pdf',String(n)],{...o,timeout:120_000});
   await run(tesseract,[raster,layer,'-l',language,'--dpi','300','-c','textonly_pdf=1','pdf'],{...o,timeout:180_000});
   await fs.unlink(path.join(dir,raster));layers.push(layer+'.pdf','1');
  }
  await run(qpdf,['@-'],{...o,input:['--empty','--pages',...layers,'--','textonly.pdf'].join('\n')+'\n',accept:[0,3],timeout:180_000});
  await run(qpdf,['@-'],{...o,input:['input.pdf','--overlay','textonly.pdf','--to='+pageList(todo),'--','output.pdf'].join('\n')+'\n',accept:[0,3],timeout:180_000});
 }
 // Rebuilds only the pages whose Arabic text layer is broken: each is replaced by a 200 dpi image of itself with a
 // fresh Tesseract text layer, so search and copy give real Arabic. Other pages are copied untouched.
 async function fixArabic(state,file,dir,input,output,signal){
  if(!['ara','eng'].every(l=>state.languages.includes(l)))fail(503,'LANGUAGE_UNAVAILABLE','Install the Arabic and English Tesseract language packs.');
  const mutool=state.engines.mutool.command,tesseract=state.engines.tesseract.command,qpdf=state.engines.qpdf.command,o={cwd:dir,signal,env:childEnv};
  const count=Number((await run(qpdf,['--show-npages','input.pdf'],{...o,timeout:30000,accept:[0,3]})).stdout.trim());
  if(!Number.isInteger(count)||count<1)fail(422,'NO_PAGES','The PDF page count could not be read.');
  if(count>MAX_OCR_PAGES)fail(413,'TOO_MANY_PAGES','This tool is limited to '+MAX_OCR_PAGES+' pages per run. Split the document first.');
  await fs.mkdir(path.join(dir,'text'));await fs.mkdir(path.join(dir,'pages'));
  await run(mutool,['draw','-F','txt','-o','text/page-%d.txt','input.pdf'],{...o,timeout:180_000});
  const broken=new Set();for(let n=1;n<=count;n++){const t=await fs.readFile(path.join(dir,'text','page-'+n+'.txt'),'utf8').catch(()=>'');if(arabicTextBroken(t))broken.add(n);}
  if(!broken.size)fail(422,'NO_BROKEN_ARABIC','No broken Arabic text was found. Search and copy should already work. For scans without text, use Searchable PDF OCR.');
  const parts=[];let first=null;
  const flush=last=>{if(first!==null)parts.push('input.pdf',first===last?String(first):first+'-'+last);first=null;};
  for(let n=1;n<=count;n++){
   if(!broken.has(n)){if(first===null)first=n;continue;}
   flush(n-1);
   await run(mutool,['draw','-r','200','-m','536870912','-o','pages/page-'+n+'.png','input.pdf',String(n)],{...o,timeout:120_000});
   await run(tesseract,['pages/page-'+n+'.png','pages/fixed-'+n,'-l','ara+eng','--dpi','200','pdf'],{...o,timeout:180_000});
   await fs.unlink(path.join(dir,'pages','page-'+n+'.png'));parts.push('pages/fixed-'+n+'.pdf','1');
  }
  flush(count);
  await run(qpdf,['@-'],{...o,input:['input.pdf','--pages',...parts,'--','output.pdf'].join('\n')+'\n',accept:[0,3],timeout:180_000});
 }
 async function processFile(id,body,signal){
  const file=validateInput(id,body),state=await inventory(),op=state.operations[id];if(!op.available)fail(503,'ENGINE_UNAVAILABLE','This tool needs an installed or configured processing engine.');
  if(signal?.aborted)fail(499,'CANCELLED','The request was cancelled.');if(op.remote)return remoteProcess(id,file,op,signal);
  const callerSignal=signal,deadline=new AbortController();
  signal=AbortSignal.any([signal||new AbortController().signal,deadline.signal]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waraq-job-'));await fs.chmod(dir,0o700).catch(()=>{});
  const jobTimer=setTimeout(()=>deadline.abort(),MAX_JOB_MS);
  const input=path.join(dir,'input'+(['officeToPdf','cadToPdf'].includes(id)?file.ext:'.pdf')),output=path.join(dir,'output.'+OPERATIONS[id].ext);
  try{
   await fs.writeFile(input,file.bytes,{mode:0o600});const cmd=state.engines[op.engine].command;
   if(op.engine==='qpdf'){
    let args;if(id==='protect')args=['--encrypt',file.options.password,file.options.ownerPassword||crypto.randomBytes(24).toString('hex'),'256','--',input,output];else if(id==='unlock')args=['--password='+file.options.password,'--decrypt',input,output];else if(id==='flatten')args=['--flatten-annotations=all',input,output];else if(id==='optimize')args=['--object-streams=generate','--compression-level=9','--recompress-flate','--remove-unreferenced-resources=yes',input,output];else args=['--object-streams=generate',input,output];
    // The response file on stdin keeps passwords out of process argument lists.
    await run(cmd,['@-'],{cwd:dir,signal,input:args.join('\n')+'\n',accept:[0,3],env:childEnv});
   }else if(op.engine==='ocrmypdf'){
    const language=file.options.language||'ara+eng';if(language.split('+').some(l=>!state.languages.includes(l)))fail(503,'LANGUAGE_UNAVAILABLE','Install the selected Tesseract language packs (ara and/or eng).');
    await run(cmd,['--language',language,'--jobs','1','--skip-text','--output-type',id==='pdfa'?'pdfa':'pdf','--optimize','0',input,output],{cwd:dir,signal,env:childEnv});
   }else if(op.engine==='waraqocr'&&id==='fixArabic'){
    await fixArabic(state,file,dir,input,output,signal);
   }else if(op.engine==='waraqocr'){
    await waraqOcr(state,file,dir,input,output,signal);
   }else if(op.engine==='wincms'){
    try{const r=await signPdf({pdfBytes:file.bytes,dir,run,powershell:cmd,signal,options:file.options});await fs.writeFile(output,r.bytes);}
    catch(e){
     if(e.code==='ALREADY_SIGNED')fail(409,'ALREADY_SIGNED','This PDF is already signed. Signing it again here would break the existing signature.');
     const why=(e.stderr||'')+(e.message||'');
     if(/WARAQ_CERT_EXPIRED/.test(why))fail(422,'CERT_EXPIRED','This certificate has expired.');
     if(/WARAQ_CERT_NOT_FOUND/.test(why))fail(422,'CERT_NOT_FOUND','The certificate is no longer in Windows. Refresh and choose again.');
     if(/WARAQ_NO_PRIVATE_KEY/.test(why))fail(422,'NO_PRIVATE_KEY','This certificate has no private key, so it cannot sign.');
     if(/password/i.test(why))fail(422,'BAD_PASSWORD','The certificate password is not correct.');
     if(/cancel/i.test(why))fail(499,'CANCELLED','Signing was cancelled.');
     if(e instanceof ApiError&&e.code!=='ENGINE_FAILED')throw e;
     fail(422,'SIGN_FAILED','Windows could not sign with this certificate. If it is an older .pfx file, export it again with AES-256 encryption.');
    }
   }else if(op.engine==='mutool'&&id==='eraseAreas'){
    await fs.writeFile(path.join(dir,'erase.js'),ERASE_SCRIPT);await fs.writeFile(path.join(dir,'areas.json'),JSON.stringify(file.options.areas));
    await run(cmd,['run','erase.js','input.pdf','output.pdf','areas.json'],{cwd:dir,signal,env:childEnv,timeout:300_000});
   }else if(op.engine==='mutool'){
    await fs.writeFile(path.join(dir,'redact.js'),REDACT_SCRIPT);await fs.writeFile(path.join(dir,'needle.txt'),file.options.text.trim(),'utf8');
    const r=await run(cmd,['run','redact.js','input.pdf','output.pdf','needle.txt'],{cwd:dir,signal,env:childEnv,timeout:300_000});
    const count=Number((r.stdout.match(/WARAQ_REDACTED (\d+)/)||[])[1]||0);
    if(!count)fail(422,'NO_MATCH','No matching text was found. Scanned pages need searchable OCR before text redaction.');
   }else if(op.engine==='cad'){
    // DWG is first converted to DXF by LibreDWG, then LibreOffice Draw lays the drawing out as PDF.
    let drawing='input'+file.ext;
    if(file.ext==='.dwg'){
     if(!state.engines.dwg2dxf.available)fail(503,'ENGINE_UNAVAILABLE','DWG files need the LibreDWG engine. DXF files work with LibreOffice alone.');
     await run(state.engines.dwg2dxf.command,['-y','-o','drawing.dxf',drawing],{cwd:dir,signal,env:childEnv,timeout:MAX_JOB_MS,accept:[0,1]});
     await fs.stat(path.join(dir,'drawing.dxf')).catch(()=>fail(422,'CONVERSION_FAILED','This DWG version could not be read. Save it as DXF from your CAD program and try again.'));
     // Large drawings explode as DXF text (a 75 MB DWG became 630 MB); LibreOffice cannot lay those out in reasonable time.
     const dxfSize=(await fs.stat(path.join(dir,'drawing.dxf'))).size;
     if(dxfSize>250*MB)fail(413,'DRAWING_TOO_LARGE','This drawing is too large for the built-in CAD converter. Plot it to PDF from AutoCAD or the free Autodesk DWG TrueView, then open the PDF here.');
     drawing='drawing.dxf';
    }
    const profile=path.join(dir,'profile');await fs.mkdir(path.join(profile,'user'),{recursive:true});
    const converted=path.join(dir,'converted');await fs.mkdir(converted);
    await run(state.engines.libreoffice.command,['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--nologo','--nodefault','--norestore','--convert-to','pdf:draw_pdf_Export','--outdir',converted,drawing],{cwd:dir,signal,env:childEnv,timeout:MAX_JOB_MS});
    const made=(await fs.readdir(converted)).find(n=>n.endsWith('.pdf'));if(!made)fail(422,'CONVERSION_FAILED','LibreOffice could not lay out this drawing.');
    await fs.copyFile(path.join(converted,made),output);
   }else if(op.engine==='libreoffice'){
    const profile=path.join(dir,'profile');await fs.mkdir(path.join(profile,'user'),{recursive:true});
    await fs.writeFile(path.join(profile,'user','registrymodifications.xcu'),'<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
    const converted=path.join(dir,'converted');await fs.mkdir(converted);const args=['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--nologo','--nodefault','--norestore'];
    if(id==='pdfToWord')args.push('--infilter=writer_pdf_import');if(id==='pdfToPowerPoint')args.push('--infilter=impress_pdf_import');
    args.push('--convert-to',id==='officeToPdf'?'pdf':id==='pdfToWord'?'docx:Office Open XML Text':'pptx:Impress MS PowerPoint 2007 XML','--outdir',converted,input);await run(cmd,args,{cwd:dir,signal,env:childEnv});
    await fs.copyFile(path.join(converted,'input.'+OPERATIONS[id].ext),output).catch(()=>fail(422,'CONVERSION_FAILED','LibreOffice could not convert this document.'));
   }
   const stat=await fs.stat(output).catch(()=>fail(422,'NO_OUTPUT','The engine did not produce an output document.'));if(!stat.size||stat.size>maxOutputBytes)fail(413,'OUTPUT_TOO_LARGE','The output was empty or exceeded 100 MiB.');
   return{bytes:await fs.readFile(output),type:MIME[OPERATIONS[id].ext],filename:file.basename+'-'+id+'.'+OPERATIONS[id].ext,engine:op.engine};
  }catch(e){if(deadline.signal.aborted&&!callerSignal?.aborted)fail(504,'TIMEOUT','Processing exceeded the 30-minute job limit. Split the document and try again.');throw e;}
  finally{clearTimeout(jobTimer);await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});}
 }
 async function remoteProcess(id,file,op,signal){
  const config=op.engine==='ocrbase'?ocrbase:stirling,form=new FormData(),schema=op.remote.schema,fileField=op.remote.fileField||'fileInput';
  form.append(fileField,new Blob([file.bytes],{type:id==='officeToPdf'?'application/octet-stream':'application/pdf'}),'input'+(id==='officeToPdf'?file.ext:'.pdf'));
  const values=op.engine==='ocrbase'?{model:env.WARAQ_OCRBASE_MODEL||'paddleocr'}:stirlingFields(id,file.options);
  for(const[k,v]of Object.entries(values)){if(!schema.properties?.[k])continue;if(Array.isArray(v)){for(const item of v)form.append(k,String(item));}else form.append(k,String(v));}
  let response;try{response=await fetch(config.base+op.remote.endpoint,{method:'POST',body:form,headers:remoteHeaders(config,op.engine),redirect:'error',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(180_000)])});}
  catch{if(signal?.aborted)fail(499,'CANCELLED','The request was cancelled.');fail(502,'REMOTE_UNREACHABLE','The configured engine did not complete the request.');}
  if(!response.ok){await response.body?.cancel();fail(502,'REMOTE_FAILED','The configured engine rejected this document or operation (HTTP '+response.status+').');}
  const bytes=await readResponse(response,maxOutputBytes);if(!bytes.length)fail(422,'EMPTY_OUTPUT','No output was produced. The document may contain no matching content.');const ext=OPERATIONS[id].ext;
  if(ext==='pdf'&&!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))fail(502,'BAD_ENGINE_OUTPUT','The engine response was not a PDF.');
  if(['docx','pptx','xlsx'].includes(ext)&&bytes.subarray(0,2).toString()!=='PK')fail(502,'BAD_ENGINE_OUTPUT','The engine response was not an Office document.');
  if(ext==='json'){try{JSON.parse(bytes.toString('utf8'));}catch{fail(502,'BAD_ENGINE_OUTPUT','The engine response was not JSON.');}}
  return{bytes,type:MIME[ext],filename:file.basename+'-'+id+'.'+ext,engine:op.engine};
 }
 // Add-on packs installed while the app runs: new engine paths, and the next check finds them.
 function setEnginePaths(extra,replace=[]){for(const k of replace){delete env[k];delete childEnv[k];}Object.assign(env,extra);Object.assign(childEnv,extra);cached=null;cachedAt=0;}
 return{setEnginePaths,renderer:async()=>{const d=await inventory();return d.engines.mutool.available?d.engines.mutool.command:null;},capabilities,certificates,warmUp:()=>inventory().catch(()=>{}),process:processFile,maxInputBytes};
}
module.exports={arabicTextBroken,createEngineService,ApiError,resolveSchema,requestSchema,compatibleStirling,compatibleOcrbase,run};
