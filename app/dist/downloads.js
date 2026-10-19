import {icon} from './icons.js';

const MAX_FILE=2000*1024*1024,MAX_PART=32*1024*1024;
const HASH=/^[a-f0-9]{64}$/i,PART=/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.bin$/;
const BASE=new URL('./downloads/',import.meta.url);
const controllers=new WeakMap();
export class DownloadError extends Error {constructor(code,message){super(message||code);this.name='DownloadError';this.code=code;}}

export function validateDownloadManifest(manifest){
  if(!manifest||manifest.version!==1||!Array.isArray(manifest.artifacts)||!manifest.artifacts.length||manifest.artifacts.length>6)throw new DownloadError('manifest-invalid');
  const names=new Set();
  const artifacts=manifest.artifacts.map(artifact=>{
    if(!artifact||!/^Waraq-(?:(?:Full|Lite)-)?(?:Setup|Portable)-[0-9]+\.[0-9]+\.[0-9]+-x64\.exe$/.test(artifact.filename)||names.has(artifact.filename)||!Number.isSafeInteger(artifact.size)||artifact.size<1||artifact.size>MAX_FILE||!HASH.test(artifact.sha256)||!Array.isArray(artifact.chunks)||!artifact.chunks.length||artifact.chunks.length>200)throw new DownloadError('manifest-invalid');
    names.add(artifact.filename);
    const chunks=artifact.chunks.map(part=>{
      if(!part||!PART.test(part.path)||part.path.includes('..')||!Number.isSafeInteger(part.size)||part.size<1||part.size>MAX_PART||!HASH.test(part.sha256))throw new DownloadError('manifest-invalid');
      return {path:part.path,size:part.size,sha256:part.sha256.toLowerCase()};
    });
    if(chunks.reduce((sum,part)=>sum+part.size,0)!==artifact.size)throw new DownloadError('manifest-invalid');
    return {filename:artifact.filename,size:artifact.size,sha256:artifact.sha256.toLowerCase(),chunks,kind:artifact.filename.includes('-Setup-')?'installer':'portable',edition:(artifact.filename.match(/-(Full|Lite)-/)||[])[1]||'',release:artifact.filename.match(/-(\d+\.\d+\.\d+)-x64/)[1]};
  });
  return {version:1,artifacts:artifacts.sort((a,b)=>Number(a.kind==='portable')-Number(b.kind==='portable')||Number(a.edition==='Lite')-Number(b.edition==='Lite'))};
}
export function formatFileSize(bytes,language='en'){
  return new Intl.NumberFormat(language==='ar'?'ar':'en',{maximumFractionDigits:1,minimumFractionDigits:1}).format(bytes/1048576)+' MiB';
}
export async function loadDownloadManifest({signal,fetchImpl=globalThis.fetch}={}){
  let response;
  try{response=await fetchImpl(new URL('manifest.json',BASE),{cache:'no-store',credentials:'same-origin',signal});}
  catch(error){if(signal?.aborted)throw error;throw new DownloadError('manifest-network');}
  if(!response.ok)throw new DownloadError('manifest-unavailable');
  const text=await response.text();if(text.length>150000)throw new DownloadError('manifest-invalid');
  try{return validateDownloadManifest(JSON.parse(text));}catch{throw new DownloadError('manifest-invalid');}
}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Download cancelled','AbortError');}
async function digest(bytes,subtle){return Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}

// Reuses only complete, verified parts on retry. Documents are never involved.
export async function downloadArtifact(artifact,{signal,onProgress=()=>{},resume={},fetchImpl=globalThis.fetch,subtle=globalThis.crypto?.subtle,timeoutMs=45000,parallel=4}={}){
  if(!subtle)throw new DownloadError('crypto-unavailable');
  const checked=validateDownloadManifest({version:1,artifacts:[artifact]}).artifacts[0];
  if(resume.sha256!==checked.sha256||!(resume.bytes instanceof Uint8Array)||resume.bytes.length!==checked.size){resume.sha256=checked.sha256;resume.bytes=new Uint8Array(checked.size);resume.done=new Set();}
  resume.done||=new Set();checkAbort(signal);
  // Several parts download at the same time (each into its own place in the file); finished, verified parts are
  // kept, so a retry after an error only fetches what is missing.
  const offsets=[];let at=0;for(const part of checked.chunks){offsets.push(at);at+=part.size;}
  const inFlight=new Map(),verified=()=>[...resume.done].reduce((n,i)=>n+checked.chunks[i].size,0);
  const report=(phase,part)=>{let received=verified();for(const v of inFlight.values())received+=v;onProgress({phase,received,total:checked.size,part,parts:checked.chunks.length});};
  async function fetchPart(index){
    const part=checked.chunks[index],offset=offsets[index],requestController=new AbortController();let timer,reader,received=0,timedOut=false;
    const resetTimer=()=>{clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;requestController.abort();},timeoutMs);};
    const cancel=()=>requestController.abort();signal?.addEventListener('abort',cancel,{once:true});
    try{
      checkAbort(signal);resetTimer();inFlight.set(index,0);report('downloading',index+1);
      const response=await fetchImpl(new URL(part.path,BASE),{cache:'no-store',credentials:'same-origin',signal:requestController.signal});
      if(!response.ok)throw new DownloadError('file-unavailable');
      const length=response.headers?.get('content-length');if(length&&Number(length)!==part.size)throw new DownloadError('size-mismatch');
      if(response.body?.getReader){
        reader=response.body.getReader();
        while(true){
          checkAbort(signal);const result=await reader.read();if(result.done)break;resetTimer();
          if(received+result.value.byteLength>part.size)throw new DownloadError('size-mismatch');
          resume.bytes.set(result.value,offset+received);received+=result.value.byteLength;inFlight.set(index,received);
          report('downloading',index+1);
        }
      }else{
        const bytes=new Uint8Array(await response.arrayBuffer());received=bytes.byteLength;if(received!==part.size)throw new DownloadError('size-mismatch');resume.bytes.set(bytes,offset);
      }
      clearTimeout(timer);checkAbort(signal);if(received!==part.size)throw new DownloadError('size-mismatch');
      if(await digest(resume.bytes.subarray(offset,offset+received),subtle)!==part.sha256)throw new DownloadError('integrity');
      checkAbort(signal);resume.done.add(index);
    }catch(error){
      try{await reader?.cancel();}catch{}
      if(signal?.aborted)throw new DOMException('Download cancelled','AbortError');
      if(timedOut)throw new DownloadError('timeout');
      if(error instanceof DownloadError)throw error;
      throw new DownloadError('network');
    }finally{clearTimeout(timer);inFlight.delete(index);signal?.removeEventListener('abort',cancel);reader?.releaseLock();}
  }
  const todo=checked.chunks.map((_,i)=>i).filter((i)=>!resume.done.has(i));let failure=null;
  const worker=async()=>{while(todo.length&&!failure){const i=todo.shift();try{await fetchPart(i);}catch(e){failure||=e;}}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(parallel,todo.length))},worker));
  if(failure)throw failure;
  checkAbort(signal);onProgress({phase:'verifying',received:checked.size,total:checked.size,part:checked.chunks.length,parts:checked.chunks.length});
  if(await digest(resume.bytes,subtle)!==checked.sha256){resume.done=new Set();throw new DownloadError('integrity');}
  checkAbort(signal);const blob=new Blob([resume.bytes],{type:'application/vnd.microsoft.portable-executable'});
  resume.bytes=null;resume.done=new Set();onProgress({phase:'complete',received:checked.size,total:checked.size});return blob;
}

function ensureStyles(){
  const href=new URL('./desktop-downloads.css',import.meta.url).href;
  if([...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
}
function el(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function iconLabel(element,name,label){element.replaceChildren();const span=el('span');span.innerHTML=icon(name);element.append(span,document.createTextNode(label));}
function errorText(error,t){
  const code=error?.code;
  if(code==='manifest-unavailable')return t('Windows downloads are not available at this address yet. Try again, or use the browser workspace.','تنزيلات ويندوز غير متاحة على هذا العنوان حالياً. حاول مجدداً أو استخدم مساحة المتصفح.');
  if(code==='manifest-invalid')return t('The download information is incomplete or invalid. No file was downloaded. Please try again later.','معلومات التنزيل غير مكتملة أو غير صالحة. لم يتم تنزيل ملف. حاول مجدداً لاحقاً.');
  if(code==='crypto-unavailable')return t('This browser cannot verify the file. Open this page using HTTPS in a current browser, then retry.','لا يستطيع هذا المتصفح التحقق من الملف. افتح الصفحة عبر HTTPS في متصفح حديث ثم حاول مجدداً.');
  if(code==='integrity'||code==='size-mismatch')return t('File verification failed. The incomplete file was not saved. Retry to download the affected part again.','فشل التحقق من الملف. لم يتم حفظ الملف غير المكتمل. أعد المحاولة لتنزيل الجزء المتأثر مجدداً.');
  if(code==='timeout')return t('The download stopped responding. Check your connection and retry; verified parts will be reused.','توقف التنزيل عن الاستجابة. تحقق من اتصالك وأعد المحاولة؛ ستُستخدم الأجزاء التي تم التحقق منها.');
  if(code==='file-unavailable')return t('A download file could not be found. Retry, or return later if the release is being updated.','تعذر العثور على أحد ملفات التنزيل. أعد المحاولة، أو عد لاحقاً إذا كان الإصدار قيد التحديث.');
  return t('The download could not connect. Check your connection and retry. Keep this page open to reuse verified parts.','تعذر الاتصال للتنزيل. تحقق من اتصالك وأعد المحاولة. أبقِ الصفحة مفتوحة لاستخدام الأجزاء التي تم التحقق منها.');
}

export async function showDesktopDownloads(container,t,options={}){
  if(!container)return null;
  controllers.get(container)?.dispose();ensureStyles();container.classList.add('desktop-downloads');
  let disposed=false,manifest=null,manifestError=null,loading=true,active=null,manifestAbort=null;const cards=[];
  const api={refresh:()=>renderLanguage(),reload:()=>load(),dispose:()=>{
    if(disposed)return;disposed=true;manifestAbort?.abort();cards.forEach(card=>{card.abort?.abort();if(card.url)URL.revokeObjectURL(card.url);card.resume.bytes=null;});observer.disconnect();window.removeEventListener('pagehide',api.dispose);controllers.delete(container);
  }};
  const observer=new MutationObserver(()=>{if(!container.isConnected)api.dispose();});observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',api.dispose,{once:true});controllers.set(container,api);
  function renderLanguage(){
    if(disposed)return;
    if(window.waraqDesktop?.isDesktop){container.replaceChildren();const panel=el('div','download-installed');panel.innerHTML=icon('check');panel.append(el('h3','',t('Waraq is already on this computer','ورق مثبت على هذا الجهاز')),el('p','',t('This desktop edition includes the app and Arabic/English OCR. Open your workspace to continue.','يتضمن إصدار سطح المكتب التطبيق وOCR بالعربية والإنجليزية. افتح مساحة العمل للمتابعة.')));const link=el('a','download-button',t('Open workspace','فتح مساحة العمل'));link.href='./';panel.append(link);container.append(panel);return;}
    if(!manifest){container.replaceChildren();const panel=el('div',manifestError?'download-error-panel':'download-loading');panel.setAttribute('role',manifestError?'alert':'status');panel.innerHTML=icon(manifestError?'warning':'download');panel.append(el('h3','',manifestError?t('Downloads could not be loaded','تعذر تحميل التنزيلات'):t('Finding your download…','جارٍ تجهيز التنزيل…')),el('p','',manifestError?errorText(manifestError,t):t('Checking the current Windows release and file sizes.','جارٍ التحقق من إصدار ويندوز الحالي وأحجام الملفات.')));if(manifestError){const retry=el('button','download-button');iconLabel(retry,'undo',t('Try again','المحاولة مجدداً'));retry.onclick=load;panel.append(retry);}container.append(panel);return;}
    cards.forEach(card=>refreshCard(card));
  }
  function refreshCard(card){
    const {artifact,dom}=card,installer=artifact.kind==='installer',language=document.documentElement.lang;
    dom.tag.textContent=installer?t('Recommended','موصى به'):t('No installation','دون تثبيت');dom.title.textContent=installer?t('Windows installer','مثبّت ويندوز'):t('Portable for Windows','نسخة ويندوز المحمولة');if(artifact.edition)dom.title.textContent+=artifact.edition==='Full'?t(' — Full',' — الكاملة'):t(' — Lite (no Office conversion)',' — المختصرة (دون تحويل أوفيس)');
    dom.description.textContent=installer?t('Your everyday workspace. Installs for your user account and adds Waraq to the Start menu.','مساحتك اليومية. يُثبّت في حساب المستخدم ويضيف ورق إلى قائمة ابدأ.'):t('Keep Waraq with you. Run the app directly without installing it on the computer.','ورق معك أينما ذهبت. شغّل التطبيق مباشرةً دون تثبيته على الكمبيوتر.');
    dom.version.textContent=t('Version ','الإصدار ')+artifact.release;dom.size.textContent=formatFileSize(artifact.size,language);dom.size.title=new Intl.NumberFormat(language==='ar'?'ar':'en').format(artifact.size)+t(' bytes',' بايت');dom.platform.textContent=t('Windows · 64-bit','ويندوز · ٦٤ بت');
    const labels=installer?[t('Installs without administrator access','يُثبّت دون صلاحيات مسؤول'),t('Start menu shortcut','اختصار في قائمة ابدأ')]:[t('One executable file','ملف تنفيذي واحد'),t('No installation required','لا يحتاج إلى تثبيت')];
    dom.features.replaceChildren(...labels.map(label=>{const li=el('li');li.innerHTML=icon('check');li.append(document.createTextNode(label));return li;}));
    dom.checksumTitle.textContent=t('File checksum (SHA-256)','بصمة الملف (SHA-256)');dom.unsigned.textContent=t('Unsigned preview build','إصدار تجريبي غير موقّع');
    // Always visible, also in the compact pop-up: the small installer gets Office and OCR later, on first use.
    dom.addons.hidden=!installer;dom.addons.textContent=t('Office and OCR add-ons download only when you first use them.','إضافات أوفيس وOCR تُنزَّل فقط عند أول استخدام لها.');
    // Unsigned installers trigger Windows SmartScreen once; explain the two clicks so nobody is scared off.
    const keepOpen=dom.smart.open;dom.smart.innerHTML=`<summary>${t('Windows shows a blue “Windows protected your PC” message?','هل ظهرت رسالة ويندوز الزرقاء «حمى Windows جهاز الكمبيوتر»؟')}</summary><ol><li>${t('Click <b>More info</b>.','اضغط <b>مزيد من المعلومات</b>.')}</li><li>${t('Click <b>Run anyway</b>.','اضغط <b>تشغيل على أي حال</b>.')}</li></ol><p>${t('This appears because Waraq is not signed with a paid certificate. You can check the file with its SHA-256 above. It only appears when installing.','تظهر لأن ورق غير موقّع بشهادة مدفوعة. يمكنك التحقق من الملف ببصمة SHA-256 أعلاه. تظهر عند التثبيت فقط.')}</p>`;dom.smart.open=keepOpen;
    iconLabel(dom.button,card.state==='error'||card.state==='cancelled'?'undo':'download',card.state==='error'||card.state==='cancelled'?t('Retry download','إعادة محاولة التنزيل'):installer?t('Download installer','تنزيل المثبّت'):t('Download portable app','تنزيل النسخة المحمولة'));
    dom.button.hidden=card.state==='ready';dom.button.disabled=card.state==='downloading'||!!active&&active!==card;
    iconLabel(dom.cancel,'close',t('Cancel','إلغاء'));dom.cancel.hidden=card.state!=='downloading';
    iconLabel(dom.save,'download',t('Save file','حفظ الملف'));dom.save.hidden=card.state!=='ready';
    dom.progressWrap.hidden=!['downloading','ready'].includes(card.state);dom.status.classList.toggle('is-error',card.state==='error');dom.root.dataset.state=card.state;
    if(card.state==='ready'){dom.status.textContent=t('Verified and ready. If the download did not start, select Save file. Keep this page open until you have saved it.','تم التحقق والملف جاهز. إذا لم يبدأ التنزيل، اختر «حفظ الملف». أبقِ الصفحة مفتوحة حتى يتم الحفظ.');dom.progress.value=100;dom.progressLabel.textContent=t('File verified','تم التحقق من الملف');}
    else if(card.state==='error')dom.status.textContent=errorText(card.error,t);
    else if(card.state==='cancelled')dom.status.textContent=t('Download cancelled. Retry to continue from the last verified part.','تم إلغاء التنزيل. أعد المحاولة للمتابعة من آخر جزء تم التحقق منه.');
    else if(card.state==='downloading')renderProgress(card);
    else dom.status.textContent=t('The file is verified before it is saved.','يُتحقق من سلامة الملف قبل حفظه.');
  }
  function renderProgress(card){
    const p=card.progress||{phase:'downloading',received:card.resume.verified||0,total:card.artifact.size},percent=Math.min(100,Math.floor(p.received/p.total*100));
    card.dom.progress.value=percent;card.dom.progressLabel.textContent=p.phase==='verifying'?t('Verifying complete file…','جارٍ التحقق من الملف الكامل…'):p.phase==='checking-part'?t(`Checking downloaded part · ${percent}%`,`جارٍ فحص الجزء المُنزّل · ${percent}٪`):t(`Downloading · ${percent}%`,`جارٍ التنزيل · ${percent}٪`);
    card.dom.status.textContent=formatFileSize(p.received,document.documentElement.lang)+' / '+formatFileSize(p.total,document.documentElement.lang)+t(' · Keep this page open.',' · أبقِ هذه الصفحة مفتوحة.');
  }
  function makeCard(artifact){
    const root=el('article','download-card'+(artifact.kind==='installer'?' is-recommended':'')),visual=el('div','download-card-visual');visual.innerHTML=icon(artifact.kind==='installer'?'install':'device');
    const tag=el('span','download-card-tag'),title=el('h3'),description=el('p','download-description'),meta=el('div','download-meta'),version=el('span'),size=el('span'),platform=el('span');meta.append(version,size,platform);
    const features=el('ul','download-features'),actions=el('div','download-actions'),button=el('button','download-button'+(artifact.kind==='installer'?' is-primary':'')),cancel=el('button','download-cancel'),save=el('a','download-button is-primary');save.download=artifact.filename;save.hidden=true;actions.append(button,cancel,save);
    const progressWrap=el('div','download-progress-wrap'),progressLabel=el('span','download-progress-label'),progress=el('progress','download-progress');progress.max=100;progress.value=0;progress.setAttribute('aria-label',t('Download progress','تقدم التنزيل'));progressWrap.append(progressLabel,progress);
    const status=el('p','download-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
    const details=el('details','download-checksum'),checksumTitle=el('summary'),code=el('code','',artifact.sha256);details.append(checksumTitle,code);code.dir='ltr';const unsigned=el('span','download-unsigned'),smart=el('details','download-smartscreen'),addons=el('p','download-addons');
    root.append(visual,tag,title,description,meta,addons,features,actions,progressWrap,status,details,unsigned,smart);
    const card={artifact,state:'idle',resume:{},url:null,abort:null,error:null,progress:null,dom:{root,tag,title,description,version,size,platform,features,button,cancel,save,progressWrap,progressLabel,progress,status,checksumTitle,unsigned,smart,addons}};
    button.onclick=()=>start(card);cancel.onclick=()=>card.abort?.abort();refreshCard(card);return card;
  }
  async function start(card){
    if(active||disposed)return;active=card;card.state='downloading';card.error=null;card.abort=new AbortController();cards.forEach(refreshCard);
    try{
      const blob=await downloadArtifact(card.artifact,{signal:card.abort.signal,resume:card.resume,onProgress:progress=>{if(disposed)return;card.progress=progress;renderProgress(card);}});
      if(disposed)return;if(card.url)URL.revokeObjectURL(card.url);card.url=URL.createObjectURL(blob);card.dom.save.href=card.url;card.state='ready';refreshCard(card);
      // Keep this visible, working link after the automatic download attempt.
      try{card.dom.save.click();}catch{}
    }catch(error){if(disposed)return;card.error=error;card.state=error.name==='AbortError'?'cancelled':'error';}
    finally{active=null;card.abort=null;if(!disposed)cards.forEach(refreshCard);}
  }
  async function load(){
    if(disposed||window.waraqDesktop?.isDesktop){renderLanguage();return;}
    manifestAbort?.abort();manifestAbort=new AbortController();manifestError=null;manifest=null;loading=true;renderLanguage();
    const timeout=setTimeout(()=>manifestAbort.abort(),15000);
    try{const loaded=await loadDownloadManifest({signal:manifestAbort.signal});if(disposed)return;manifest=loaded;container.replaceChildren();cards.splice(0);const grid=el('div','download-grid');manifest.artifacts.forEach(artifact=>{const card=makeCard(artifact);cards.push(card);grid.append(card.dom.root);});container.append(grid);options.onManifest?.(manifest);}
    catch(error){if(!disposed){manifestError=error.name==='AbortError'?new DownloadError('manifest-network'):error;renderLanguage();}}
    finally{clearTimeout(timeout);loading=false;}
  }
  await load();return api;
}
