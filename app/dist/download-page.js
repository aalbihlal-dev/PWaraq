import {hydrateIcons,icon} from './icons.js';
import {showDesktopDownloads,formatFileSize} from './downloads.js';

let language='en';try{language=localStorage.getItem('waraq-lang')==='ar'?'ar':'en';}catch{}
let downloadController=null,zipSize=0,zipState='loading';
const t=(en,ar)=>language==='ar'?ar:en;
const $=selector=>document.querySelector(selector);
function renderZip(){
  const link=$('#offlineZip'),status=$('#offlineZipStatus'),size=$('#offlineZipSize');link.hidden=zipState!=='ready';status.hidden=zipState==='ready';
  status.textContent=zipState==='error'?t('The website ZIP is unavailable right now. Refresh the page to try again.','حزمة الموقع ZIP غير متاحة حالياً. حدّث الصفحة للمحاولة مجدداً.'):t('Checking file availability…','جارٍ التحقق من توفر الملف…');
  size.textContent=zipSize?formatFileSize(zipSize,language):'';
}
function translate(){
  document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=t('Download Waraq | ورق','تنزيل ورق | Waraq');
  document.querySelectorAll('[data-en]').forEach(element=>{element.textContent=element.dataset[language];});
  $('#downloadLanguage').innerHTML='<span>'+t('العربية','English')+'</span>'+icon('language');
  hydrateIcons();downloadController?.refresh();renderZip();
}
$('#downloadLanguage').onclick=()=>{language=language==='ar'?'en':'ar';try{localStorage.setItem('waraq-lang',language);}catch{}translate();};
translate();
const desktop=window.waraqDesktop?.isDesktop===true;
if(desktop){document.querySelectorAll('[data-browser-only]').forEach(element=>element.hidden=true);$('#releaseNote').hidden=true;$('#windowsTitle').textContent=t('Your desktop workspace','مساحة سطح المكتب');}
downloadController=await showDesktopDownloads($('#windowsDownloads'),t,{onManifest:manifest=>{
  const versions=[...new Set(manifest.artifacts.map(artifact=>artifact.release))];$('#releaseVersion').textContent=versions.map(version=>'v'+version).join(' / ');
}});
$('#windowsDownloads').setAttribute('aria-busy','false');
if(!desktop){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(new URL('./offline/waraq-offline.zip',import.meta.url),{method:'HEAD',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Unavailable');const type=response.headers.get('content-type')||'';if(type.includes('text/html'))throw Error('Unexpected response');zipSize=Number(response.headers.get('content-length'))||0;zipState='ready';}
  catch{zipState='error';}finally{clearTimeout(timeout);renderZip();}
}
