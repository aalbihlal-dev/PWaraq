import * as pdfjsLib from './vendor/pdf.min.mjs';
import './core.js';
import {safeStem,outputName,brandDownload} from './naming.js';
import {icon,hydrateIcons} from './icons.js';
import {setupWorkspacePlus} from './workspace-plus.js';
import {releaseUnusedSources} from './source-pool.js';
import {setupUpdateBadge} from './update-badge.js';
import {setupQuickBar} from './quick-bar.js';
import {packLabel,onPacksChange} from './packs-ui.js';
import {normalizeArabic,findReversedLines,repairDirection} from './arabic-text.js';
// Tool modules load on first use; the first screen only needs the studio.
const runAdvanced=async(...a)=>(await import('./advanced.js')).runAdvanced(...a),runMore=async(...a)=>(await import('./more-tools.js')).runMore(...a),runOCR=async(...a)=>(await import('./ocr.js')).runOCR(...a),runTemplates=async(...a)=>(await import('./templates.js')).runTemplates(...a),runColor=async(...a)=>(await import('./color-tools.js')).runColor(...a),runBatch=async(...a)=>(await import('./batch.js')).runBatch(...a);
import {setupOffline} from './offline.js';
import {engineOperations,engineAvailable,refreshEngines,refreshEngineStatus,openEngines,runEngine,engineRendering,renderDocId,renderUrl,renderTileUrl,isHeavy} from './integrations.js';
pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let lang=localStorage.getItem('waraq-lang')||'en', pages=[],sources=[],history=[],selected=new Set(),filter='all',busy=false,dragIndex=null,renderVersion=0;
const t=(en,ar)=>lang==='ar'?ar:en;
// Large documents: engineering drawings and 2,000+ page files. Memory, not a fixed number, is the real limit.
const MAX_FILE=(window.waraqDesktop?2048:1024)*1024*1024,MAX_PAGES=5000;
const catalog=[
 ['resize','organize','resize','Resize pages','تغيير حجم الصفحات','Fit pages to A4, Letter and more.','اضبط الصفحات على A4 وLetter وغيرها.'],
 ['nup','organize','nup','Pages per sheet','صفحات في الورقة','Place 2, 4, 6 or 9 pages on one sheet.','ضع ٢ أو ٤ أو ٦ أو ٩ صفحات في ورقة واحدة.'],
 ['booklet','organize','booklet','Booklet','كتيب مطوي','Arrange pages for folded, two-sided printing.','رتّب الصفحات للطباعة على الوجهين والطي.'],
 ['compare','edit','compare','Compare pages','مقارنة الصفحات','See visible differences between two PDFs.','شاهد الفروق المرئية بين ملفي PDF.'],
 ['grayscale','convert','grayscale','Grayscale PDF','PDF رمادي','Create a grayscale image-only copy.','أنشئ نسخة رمادية من الصور فقط.'],
 [
  "merge",
  "organize",
  "merge",
  "Merge PDF",
  "دمج PDF",
  "Combine documents in your chosen order.",
  "اجمع المستندات بالترتيب الذي تختاره."
 ],
 [
  "split",
  "organize",
  "split",
  "Split PDF",
  "تقسيم PDF",
  "Save individual pages in a ZIP archive.",
  "احفظ الصفحات منفردة في أرشيف ZIP."
 ],
 [
  "organize",
  "organize",
  "organize",
  "Organize pages",
  "تنظيم الصفحات",
  "Reorder, rotate, duplicate and remove.",
  "رتّب الصفحات ودوّرها وكرّرها واحذفها."
 ],
 [
  "range",
  "organize",
  "range",
  "Page ranges",
  "نطاقات الصفحات",
  "Extract exactly the pages you need.",
  "استخرج الصفحات التي تحتاجها تحديداً."
 ],
 [
  "crop",
  "organize",
  "crop",
  "Crop pages",
  "اقتصاص الصفحات",
  "Adjust the visible page margins.",
  "اضبط الهوامش المرئية للصفحات."
 ],
 [
  "annotate",
  "edit",
  "annotate",
  "Annotate PDF",
  "التعليق على PDF",
  "Place text, highlights and rectangles.",
  "ضع النصوص والتظليل والمستطيلات."
 ],
 [
  "signature",
  "edit",
  "signature",
  "Visual signature",
  "توقيع مرئي",
  "Draw or upload a signature and place it.",
  "ارسم توقيعاً أو ارفعه وحدد موضعه."
 ],
 [
  "forms",
  "edit",
  "forms",
  "Fill forms",
  "تعبئة النماذج",
  "Complete original PDF form fields.",
  "عبّئ حقول نماذج PDF الأصلية."
 ],
 [
  "stamp",
  "edit",
  "stamp",
  "Add text stamp",
  "إضافة ختم نصي",
  "Arabic and English text overlays.",
  "أضف نصوصاً عربية وإنجليزية."
 ],
 [
  "watermark",
  "edit",
  "watermark",
  "Watermark",
  "علامة مائية",
  "Apply a subtle mark to your pages.",
  "أضف علامة شفافة على الصفحات."
 ],
 [
  "numbers",
  "edit",
  "numbers",
  "Page numbers",
  "ترقيم الصفحات",
  "Number your arranged document.",
  "رقّم صفحات المستند المرتّب."
 ],
 [
  "templates",
  "edit",
  "templates",
  "Create a document",
  "إنشاء مستند",
  "Compose a letter or invoice.",
  "أنشئ خطاباً أو فاتورة."
 ],
 [
  "images",
  "convert",
  "images",
  "Images to PDF",
  "صور إلى PDF",
  "Combine JPG and PNG images.",
  "اجمع صور JPG وPNG."
 ],
 [
  "png",
  "convert",
  "png",
  "PDF to images",
  "PDF إلى صور",
  "Export PNG pages in a ZIP archive.",
  "صدّر الصفحات بصيغة PNG في ZIP."
 ],
 [
  "compress",
  "convert",
  "compress",
  "Compress PDF",
  "ضغط PDF",
  "Create a smaller image-based copy.",
  "أنشئ نسخة من الصور بحجم أقل."
 ],
 [
  "scan",
  "convert",
  "scan",
  "Scan appearance",
  "مظهر المسح الضوئي",
  "Paper tone, grain and gentle rotation.",
  "لون الورق وحبيبات ودوران خفيف."
 ],
 [
  "text",
  "extract",
  "text",
  "Extract text",
  "استخراج النص",
  "Export the existing text layer.",
  "صدّر طبقة النص الموجودة."
 ],
 [
  "browserOCR",
  "extract",
  "browserOCR",
  "Arabic & English OCR",
  "OCR عربي وإنجليزي",
  "Read scanned pages on your device.",
  "اقرأ الصفحات الممسوحة على جهازك."
 ],
 [
  "metadata",
  "protect",
  "metadata",
  "Document metadata",
  "بيانات المستند",
  "Inspect, edit or remove document details.",
  "اعرض بيانات المستند وعدّلها أو احذفها."
 ],
 [
  "redact",
  "protect",
  "redact",
  "Raster redaction",
  "تنقيح بتحويل الصور",
  "Remove marked areas in an image-only PDF.",
  "أزل المناطق المحددة في PDF من الصور."
 ],
 [
  "ocr",
  "extract",
  "ocr",
  "Searchable PDF",
  "PDF قابل للبحث",
  "Add an OCR text layer with an engine.",
  "أضف طبقة OCR باستخدام محرك."
 ],
 [
  "ocrText",
  "extract",
  "ocrText",
  "AI extraction",
  "الاستخراج الذكي",
  "Parse document layout using an OCR model.",
  "حلّل تنسيق المستند باستخدام نموذج OCR."
 ],
 [
  "officeToPdf",
  "convert",
  "officeToPdf",
  "Office to PDF",
  "أوفيس إلى PDF",
  "Convert Word, Excel and PowerPoint.",
  "حوّل Word وExcel وPowerPoint."
 ],
 [
  "pdfToWord",
  "convert",
  "pdfToWord",
  "PDF to Word",
  "PDF إلى Word",
  "Create an editable Word document.",
  "أنشئ مستند Word قابلاً للتحرير."
 ],
 [
  "pdfToExcel",
  "convert",
  "pdfToExcel",
  "PDF to Excel",
  "PDF إلى Excel",
  "Convert with your connected engine.",
  "حوّل باستخدام المحرك المتصل."
 ],
 [
  "pdfToPowerPoint",
  "convert",
  "pdfToPowerPoint",
  "PDF to slides",
  "PDF إلى شرائح",
  "Create a presentation with an engine.",
  "أنشئ عرضاً باستخدام محرك."
 ],
 [
  "protect",
  "protect",
  "protect",
  "Encrypt PDF",
  "تشفير PDF",
  "Protect a document with a password.",
  "احمِ المستند بكلمة مرور."
 ],
 [
  "unlock",
  "protect",
  "unlock",
  "Unlock PDF",
  "فتح PDF",
  "Open a PDF using its current password.",
  "افتح PDF بكلمة مروره الحالية."
 ],
 [
  "repair",
  "protect",
  "repair",
  "Repair PDF",
  "إصلاح PDF",
  "Rebuild a damaged PDF structure.",
  "أعد بناء بنية PDF التالفة."
 ],
 [
  "pdfa",
  "convert",
  "pdfa",
  "Archive PDF/A",
  "أرشفة PDF/A",
  "Create an archival version with an engine.",
  "أنشئ نسخة أرشيفية باستخدام محرك."
 ],
 [
  "validateSignature",
  "protect",
  "validateSignature",
  "Check signatures",
  "فحص التوقيعات",
  "Inspect certificate signatures.",
  "افحص التوقيعات بالشهادات."
 ],
 [
  "flatten",
  "edit",
  "flatten",
  "Flatten forms",
  "تسطيح النماذج",
  "Make form appearances permanent.",
  "ثبّت المظهر المرئي للنماذج."
 ],
 [
  "redactText",
  "protect",
  "redactText",
  "Redact text matches",
  "تنقيح النص المطابق",
  "Remove matching text through an engine.",
  "أزل النص المطابق باستخدام محرك."
 ],
 ["colors","edit","colors","Colors & backgrounds","الألوان والخلفيات","Gradients, letterheads and dark reading copies.","تدرجات وورق رسمي ونسخ للقراءة الليلية."],
 ["batch","convert","merge","Batch process","معالجة دفعة ملفات","Run one tool on many files or a folder.","شغّل أداة واحدة على ملفات كثيرة أو مجلد."],
 ["optimize","convert","compress","Optimize PDF","تحسين PDF","Shrink without quality loss.","صغّر الحجم دون فقد في الجودة."],
 ["fixArabic","convert","ocr","Fix Arabic text","إصلاح النص العربي","Make broken Arabic copy and search correctly.","اجعل النص العربي المعطوب قابلاً للنسخ والبحث."],
 ["sign","protect","signature","Certificate signature","توقيع بالشهادة","Sign with your digital certificate or ID card.","وقّع بشهادتك الرقمية أو بطاقة الهوية."],
 ["pageEditor","edit","annotate","Edit page","تحرير الصفحة","Move or delete photos, edit text, add text and images.","انقل الصور أو احذفها، وعدّل النص، وأضف نصوصاً وصوراً."],
 ["cadToPdf","convert","office","CAD drawing to PDF","رسم CAD إلى PDF","Convert DWG and DXF drawings.","حوّل رسومات DWG وDXF."]
];
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';$$('[data-en]').forEach(e=>e.textContent=e.dataset[lang]);$('#language').innerHTML=icon('language')+'<span>'+t('العربية','English')+'</span>';$('#search').placeholder=t('Search tools…','ابحث عن أداة…');$('#search').ariaLabel=t('Search tools','البحث في الأدوات');hydrateIcons();renderTools();render();refreshStatus?.();refreshEngineStatus(context);plus?.translate();updateBadge?.translate();quickBar?.translate();if(lastMessage)msg(lastMessage.en,lastMessage.ar,lastMessage.error);}
let lastMessage=null;
function msg(en,ar,error=false){lastMessage={en,ar,error};$('#message').textContent=t(en,ar);$('#message').className=error?'error':'';}
async function task(fn){if(busy)return;busy=true;document.body.classList.add('busy');try{await fn();}catch(e){console.error(e);msg('Could not process this document. It may be encrypted, damaged, too large, or use an unsupported feature. Your originals are unchanged.','تعذرت معالجة المستند. قد يكون مشفراً أو تالفاً أو كبيراً جداً أو يستخدم ميزة غير مدعومة. لم تتغير ملفاتك الأصلية.',true);}finally{busy=false;document.body.classList.remove('busy');}}
function snapshot(){history.push(pages.map(p=>({...p})));if(history.length>20)history.shift();}
function active(){return selected.size?pages.filter(p=>selected.has(p.id)):pages;}
function needPages(){if(pages.length)return true;msg('Choose a PDF or try the sample first.','اختر ملف PDF أو جرّب المستند النموذجي أولاً.');$('#studio').scrollIntoView({behavior:'smooth'});return false;}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=brandDownload(name);a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function name(){return ($('#filename').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'waraq-document').replace(/\.pdf$/i,'');}
async function output(items=pages,opts={}){
 // Untouched single document: hand back its original bytes instead of rebuilding every page (fast for huge files).
 if(!Object.keys(opts).length&&items.length&&items.length===pages.length&&items.every((p,i)=>p===pages[i])){const s=pages[0].source,src=s===null?null:sources[s];if(src&&src.doc.getPageCount()===pages.length&&pages.every((p,i)=>p.source===s&&p.index===i&&!p.crop&&p.rotation===src.doc.getPage(i).getRotation().angle))return src.originalBytes.slice();}
 return WaraqCore.compose(items,sources,opts);}
async function loadFiles(files){await ensureLibs();await task(async()=>{
 const added=[],docs=[];let rejected=[];
 for(const file of files){
  if(file.size>MAX_FILE){rejected.push(file.name);continue;}
  try{let bytes=new Uint8Array(await file.arrayBuffer());let doc;
   if(/\.(png|jpe?g)$/i.test(file.name)||/^image\//.test(file.type)){doc=await PDFLib.PDFDocument.create();const img=/png/i.test(file.type+file.name)?await doc.embedPng(bytes):await doc.embedJpg(bytes);const ratio=Math.min(1,1200/Math.max(img.width,img.height));const p=doc.addPage([img.width*ratio,img.height*ratio]);p.drawImage(img,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});bytes=await doc.save();}
   else doc=await PDFLib.PDFDocument.load(bytes);
   if(pages.length+added.length+doc.getPageCount()>MAX_PAGES){rejected.push(file.name);continue;}
   const viewer=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
   const source=sources.length+docs.length;docs.push({doc,viewer,name:file.name,originalBytes:bytes.slice()});
   doc.getPages().forEach((p,index)=>added.push({id:crypto.randomUUID(),source,index,rotation:p.getRotation().angle,crop:0}));
  }catch(e){console.warn('Rejected document',e.name);rejected.push(file.name);}
 }
 if(added.length){const wasEmpty=!pages.length;if(!pages.length && docs.length)$("#filename").value=safeStem(outputName(docs[0].name));snapshot();sources.push(...docs);pages.push(...added);selected.clear();render();plus?.onDocumentLoaded(wasEmpty);}
 msg(rejected.length?'Some files could not be opened (unsupported, encrypted, damaged, or over the limits): '+rejected.join(', '):'Ready. Arrange your pages and download when you’re happy.',rejected.length?'تعذر فتح بعض الملفات (غير مدعومة أو مشفرة أو تالفة أو تتجاوز الحدود): '+rejected.join('، '):'جاهز. رتّب الصفحات ثم نزّل المستند.',!!rejected.length);
});$('#files').value='';}
// Drag pages to move them. When the dragged page is part of a selection, all selected pages move together,
// in their current order, to the place where they are dropped (before or after the page under the pointer).
let dragIds=null;
function startPageDrag(e,item,card){
 dragIds=new Set(selected.has(item.id)&&selected.size>1?pages.filter(p=>selected.has(p.id)).map(p=>p.id):[item.id]);
 e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','waraq-pages');}catch{}
 document.querySelectorAll('#pages .page').forEach((c,i)=>{if(dragIds.has(pages[i]?.id))c.classList.add('is-dragging');});
 if(dragIds.size>1){const tag=document.createElement('div');tag.className='drag-count';tag.textContent=t(`${dragIds.size} pages`,`${dragIds.size} صفحات`);document.body.append(tag);e.dataTransfer.setDragImage(tag,20,20);setTimeout(()=>tag.remove(),0);}
}
function endPageDrag(){dragIds=null;document.querySelectorAll('#pages .page').forEach(c=>c.classList.remove('is-dragging','drop-before','drop-after'));}
function dropSide(e,card){const r=card.getBoundingClientRect(),after=e.clientX>r.left+r.width/2;return document.documentElement.dir==='rtl'?!after:after;}
function pageDragOver(e,card){if(!dragIds)return;e.preventDefault();const after=dropSide(e,card);card.classList.toggle('drop-after',after);card.classList.toggle('drop-before',!after);}
function dropPages(e,item,card){
 if(!dragIds)return;e.preventDefault();e.stopPropagation();const ids=dragIds,after=dropSide(e,card);endPageDrag();
 if(ids.has(item.id))return; // dropped onto one of the moving pages: nothing to do
 snapshot();const block=pages.filter(p=>ids.has(p.id)),rest=pages.filter(p=>!ids.has(p.id));
 rest.splice(rest.indexOf(item)+(after?1:0),0,...block);pages=rest;render();
 msg(block.length>1?`Moved ${block.length} pages.`:'Page moved.',block.length>1?`نُقلت ${block.length} صفحات.`:'نُقلت الصفحة.');
}
async function render(){const version=++renderVersion;document.body.classList.toggle('has-doc',pages.length>0);releaseUnusedSources(sources,pages,history);try{plus?.onChange();quickBar?.refresh();}catch(e){console.error(e);}/* extras must never stop the editor from drawing */$('#drop').hidden=pages.length>0;$('#work').hidden=!pages.length;$('#pageCount').textContent=t(`${pages.length} pages`,`${pages.length} صفحة`);$('#selectionCount').textContent=t(`${selected.size} selected`,`${selected.size} محددة`);$('#undo').disabled=!history.length;$('#extract').disabled=!selected.size;$('#pages').replaceChildren();
 for(let i=0;i<pages.length;i++){const item=pages[i];const card=document.createElement('article');card.className='page'+(selected.has(item.id)?' selected':'');card.draggable=true;const preview=document.createElement('div');preview.className='page-preview';const image=document.createElement('img');image.alt=t('Page '+(i+1),'الصفحة '+(i+1));preview.append(image);const label=document.createElement('div');label.className='page-label';label.textContent=`${i+1} · ${item.source===null?t('Blank page','صفحة فارغة'):sources[item.source].name}`;const controls=document.createElement('div');controls.className='page-controls';const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(item.id);check.ariaLabel=t('Select page '+(i+1),'تحديد الصفحة '+(i+1));const toggle=()=>{selected.has(item.id)?selected.delete(item.id):selected.add(item.id);render();};check.onchange=toggle;preview.onclick=toggle;controls.append(check);for(const [delta,symbol]of[[-1,'←'],[1,'→']]){const b=document.createElement('button');b.innerHTML=icon(delta<0?'arrow-left':'arrow-right');b.ariaLabel=t(delta<0?'Move earlier':'Move later',delta<0?'نقل للأمام':'نقل للخلف');b.disabled=i+delta<0||i+delta>=pages.length;b.onclick=()=>{snapshot();[pages[i],pages[i+delta]]=[pages[i+delta],pages[i]];render();};controls.append(b);}card.append(preview,label,controls);card.ondragstart=e=>startPageDrag(e,item,card);card.ondragend=endPageDrag;card.ondragover=e=>pageDragOver(e,card);card.ondragleave=()=>card.classList.remove('drop-before','drop-after');card.ondrop=e=>dropPages(e,item,card);$('#pages').append(card);
  try{if(item.source===null){image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="168"><rect width="120" height="168" fill="white"/></svg>');continue;}const key=`${item.rotation}:${item.crop}`;image.style.clipPath=item.cropRect?`inset(${item.cropRect.t*100}% ${item.cropRect.r*100}% ${item.cropRect.b*100}% ${item.cropRect.l*100}%)`:'';if(item.thumbKey===key)image.src=item.thumb;else lazyThumb(item,key,image);if(item.crop||item.cropRect)label.textContent+=' · '+t('cropped','مقتصة');}catch{image.alt=t('Preview unavailable','المعاينة غير متاحة');}
 }
}
// BEGIN tool grouping: keep on-device tools visible and disclose native engine tools.
// Order from everyday tasks (open, merge, split, compress, edit, organize, crop, number, sign, convert, OCR);
// specialist tools follow.
const TOOL_ORDER=['merge','split','compress','pageEditor','organize','crop','numbers','watermark','signature','annotate','stamp','images','png','text','browserOCR','range','forms','redact','resize','metadata','colors','nup','compare','booklet','grayscale','scan','batch','templates',
 'officeToPdf','pdfToWord','ocr','optimize','pdfToExcel','pdfToPowerPoint','cadToPdf','sign','fixArabic','protect','unlock','repair','redactText','flatten','pdfa','validateSignature','ocrText'];
function renderTools(){
 const q=$('#search').value.trim().toLowerCase(),filtered=filter!=='all'||q.length>0;
 const matches=catalog.filter(c=>(filter==='all'||c[1]===filter)&&c.slice(3).join(' ').toLowerCase().includes(q));
 const rank=(c)=>{const i=TOOL_ORDER.indexOf(c[0]);return i<0?TOOL_ORDER.length:i;};
 const byUse=(a,b)=>rank(a)-rank(b);
 const local=matches.filter(c=>!engineOperations[c[0]]).sort(byUse),native=matches.filter(c=>engineOperations[c[0]]).sort(byUse);
 const localGrid=$('#tools'),nativeGrid=$('#nativeTools'),disclosure=$('#moreToolsDisclosure');
 localGrid.replaceChildren();nativeGrid.replaceChildren();
 function card(c,isNative){
  const ready=isNative&&engineAvailable(c[0]),b=document.createElement('button');b.className='tool'+(isNative?' tool-native':'');b.dataset.category=c[1];b.dataset.tool=c[0];b.title=t(c[5],c[6]);
  b.innerHTML=`<span class="tool-icon">${icon(c[0]==='browserOCR'?'ocr':c[0])}</span><span class="arrow">${icon('arrow-up-right')}</span><h3>${t(c[3],c[4])}</h3><p>${t(c[5],c[6])}</p><span class="tool-badge${isNative?' engine'+(ready?' is-ready':''):''}">${isNative?(ready?t('Engine ready','المحرك جاهز'):packLabel(c[0],t)||t('Connect engine','اربط محركاً')):t('On device','على الجهاز')}</span>`;
  b.onclick=()=>tool(c[0]);return b;
 }
 local.forEach(c=>localGrid.append(card(c,false)));native.forEach(c=>nativeGrid.append(card(c,true)));
 $('#toolCount').textContent=filtered?t(`${local.length} on-device matches`,`${local.length} أداة محلية مطابقة`):t(`${local.length} tools on your device`,`${local.length} أداة على جهازك`);
 $('#moreToolsCount').textContent=filtered?t(`${native.length} matching tools`,`${native.length} أداة مطابقة`):t(`${native.length} tools`,`${native.length} أداة`);
 $('#noResults').hidden=matches.length>0;$('#localToolsEmpty').hidden=local.length>0||native.length===0;$('#nativeNoResults').hidden=native.length>0;
 $('#integrationsNav').setAttribute('aria-expanded',String(disclosure.open));
 $$('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
}
function openMoreTools(){
 const disclosure=$('#moreToolsDisclosure');disclosure.open=true;
 $('#integrationsNav').setAttribute('aria-expanded','true');disclosure.scrollIntoView({behavior:'smooth',block:'start'});$('#moreToolsSummary').focus({preventScroll:true});
}
// END tool grouping.
function modal(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;$('#dialog').showModal();}
async function stampImage(text){const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=180;const ctx=canvas.getContext('2d');ctx.font='64px Tahoma, Arial';ctx.fillStyle='#24483c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction=/[\u0600-\u06ff]/.test(text)?'rtl':'ltr';ctx.fillText(text,800,90,1500);return new Uint8Array(await (await fetch(canvas.toDataURL('image/png'))).arrayBuffer());}
async function raster(items,scale=1.5){const bytes=await output(items);return pdfjsLib.getDocument({data:bytes,isEvalSupported:false}).promise;}
async function basicTool(id){if(id==='advanced'){modal(t('Advanced toolkit · next stage','الأدوات المتقدمة · المرحلة التالية'),`<p>${t('These features are not connected in this browser edition. The server roadmap is available in the open-source library.','هذه الميزات غير متصلة في إصدار المتصفح. تتوفر خطة الخادم في مكتبة المصادر المفتوحة.')}</p><ul><li>${t('Arabic + English searchable OCR — OCRmyPDF / Tesseract','التعرف الضوئي بالعربية والإنجليزية — OCRmyPDF / Tesseract')}</li><li>${t('Office conversion — LibreOffice','تحويل ملفات أوفيس — LibreOffice')}</li><li>${t('Password protection and repair — qpdf','الحماية بكلمة مرور والإصلاح — qpdf')}</li><li>${t('True content editing, secure redaction and digital signatures — dedicated PDF engine','تعديل المحتوى والتنقيح الآمن والتوقيع الرقمي — محرك PDF متخصص')}</li></ul><p>${t('Text stamps add content; they do not replace existing text. Cropping hides margins; it does not securely remove information.','تضيف الأختام النصية محتوى ولا تستبدل النص الحالي. يخفي الاقتصاص الهوامش ولا يزيل المعلومات بشكل آمن.')}</p>`);return;}
 if(['merge','images'].includes(id)){$('#files').click();return;}if(!needPages())return;
 if(id==='organize'){$('#studio').scrollIntoView({behavior:'smooth'});return;}
 if(id==='crop'){const m=await import('./crop-tool.js');return m.openCrop({t,modal,msg,pages:()=>pages,active,selectedCount:()=>selected.size,sources:()=>sources,snapshot,render});}
 if(id==='cropMargins'){modal(t('Crop margins','اقتصاص الهوامش'),`<p>${t('Applies to selected pages, or all pages if none are selected. This hides margins, not secure redaction.','يطبق على الصفحات المحددة، أو جميع الصفحات إذا لم تحدد شيئاً. يخفي الهوامش وليس تنقيحاً آمناً.')}</p><label>${t('Margin on each side (points)','الهامش من كل جانب (نقطة)')}<input id="margin" type="number" min="0" max="200" value="18"></label><button class="primary" id="applyCrop">${t('Apply crop','تطبيق الاقتصاص')}</button>`);$('#applyCrop').onclick=()=>{const m=Number($('#margin').value);if(!Number.isFinite(m)||m<0||m>200)return;const items=active();if(items.some(p=>{const b=p.source===null?{width:595,height:842}:sources[p.source].doc.getPage(p.index).getCropBox();return m*2>=Math.min(b.width,b.height);})){msg('Margin is too large for a selected page.','الهامش أكبر من حجم إحدى الصفحات المحددة.',true);$('#dialog').close();return;}snapshot();items.forEach(p=>p.crop=m);$('#dialog').close();render();};return;}
 if(id==='stamp'||id==='watermark'){modal(t(id==='stamp'?'Add text stamp':'Add watermark',id==='stamp'?'إضافة ختم نصي':'إضافة علامة مائية'),`<p>${t('Adds a visual text stamp to selected pages (all pages if none selected). Arabic shaping is handled by your browser. The stamp is an image, not searchable text.','يضيف ختماً مرئياً للصفحات المحددة (أو الكل). يعالج المتصفح تشكيل العربية. الختم صورة وليس نصاً قابلاً للبحث.')}</p><label>${t('Your text','النص')}<input id="stampText" maxlength="100" placeholder="${t('e.g. Approved','مثال: معتمد')}"></label><label>${t('Position','الموضع')}<select id="position"><option value="center">${t('Center','الوسط')}</option><option value="bottom">${t('Bottom','الأسفل')}</option></select></label><button class="primary" id="stampExport">${t('Download stamped PDF','تنزيل PDF مع الختم')}</button>`);$('#stampExport').onclick=()=>{const text=$('#stampText').value.trim();if(!text){$('#stampText').focus();return;}const position=$('#position').value;$('#dialog').close();task(async()=>{const bytes=await stampImage(text);await deliverActive(await output(active(),{stamp:{bytes,width:400,position,opacity:id==='watermark'?.25:1}}),name()+'.pdf','application/pdf');say('Stamped PDF downloaded.','تم تنزيل الملف مع الختم.');});};return;}
 if(id==='compress'){modal(t('Compress PDF','ضغط PDF'),`<p>${t('Creates an image-only PDF at reduced resolution. Text search, links, forms and signatures are lost. File size reduction depends on the original.','ينشئ ملفاً من الصور بدقة أقل. يفقد النص القابل للبحث والروابط والنماذج والتوقيعات. يعتمد تقليل الحجم على الملف الأصلي.')}</p><label>${t('Image quality','جودة الصورة')}<select id="quality"><option value="0.65">${t('Balanced','متوازنة')}</option><option value="0.4">${t('Smaller file','ملف أصغر')}</option><option value="0.85">${t('Higher quality','جودة أعلى')}</option></select></label><button class="primary" id="compressNow">${t('Create compressed copy','إنشاء نسخة مضغوطة')}</button>`);$('#compressNow').onclick=()=>{const quality=Number($('#quality').value);$('#dialog').close();task(async()=>{msg('Compressing pages…','جارٍ ضغط الصفحات…');const viewer=await raster(active());try{const doc=await PDFLib.PDFDocument.create();for(let n=1;n<=viewer.numPages;n++){const p=await viewer.getPage(n),v=p.getViewport({scale:1.2});const c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const img=await doc.embedJpg(c.toDataURL('image/jpeg',quality));const page=doc.addPage([v.width/1.2,v.height/1.2]);page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});}const bytes=await doc.save();await deliverActive(bytes,name()+'-compressed.pdf','application/pdf');say(`Created ${(bytes.length/1024/1024).toFixed(2)} MB image-only PDF.`,`تم إنشاء ملف PDF من الصور بحجم ${(bytes.length/1024/1024).toFixed(2)} ميجابايت.`);}finally{await viewer.destroy();}});};return;}
 await task(async()=>{msg('Processing…','جارٍ المعالجة…');
 if(id==='numbers'){await deliverActive(await output(active(),{numbers:true}),name()+'-numbered.pdf','application/pdf');}
 if(id==='split'){const zip=new JSZip();let n=0;for(const p of active())zip.file(outputName(p.source===null?name():sources[p.source].name,`page-${String(++n).padStart(3,'0')}`),await output([p]));download(await zip.generateAsync({type:'uint8array'}),name()+'-pages.zip','application/zip');}
 if(id==='text'){let text='';for(const p of active()){if(p.source===null)continue;const page=await sources[p.source].viewer.getPage(p.index+1);const content=await page.getTextContent();text+=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('')+'\n\n';}if(!text.trim()){msg('No text layer found. Use Arabic & English OCR for scanned pages.','لم يتم العثور على نص. استخدم OCR العربي والإنجليزي للصفحات الممسوحة.',true);return;}await exportExtractedText(text,name()+'.txt');}
 if(id==='png'){const items=active(),viewer=await raster(items);try{const zip=new JSZip();for(let n=1;n<=viewer.numPages;n++){const p=await viewer.getPage(n),v=p.getViewport({scale:1.5});const c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const item=items[n-1];zip.file(outputName(item.source===null?name():sources[item.source].name,`page-${String(n).padStart(3,'0')}`,'png'),await new Promise(resolve=>c.toBlob(resolve,'image/png')));}download(await zip.generateAsync({type:'uint8array'}),name()+'-images.zip','application/zip');}finally{await viewer.destroy();}}
 say('Your download is ready.','التنزيل جاهز.');});
}
const projects=[['PDF Arranger','GPL-3.0','Visual page organization','تنظيم الصفحات بصرياً','https://github.com/pdfarranger/pdfarranger'],['PDFsam Basic','AGPL-3.0','Split, merge, rotate, mix','تقسيم ودمج وتدوير ومزج','https://pdfsam.org/pdfsam-basic/'],['PDF4QT','MIT','Desktop editing and PDF engine','محرر مكتبي ومحرك PDF','https://github.com/JakubMelka/PDF4QT'],['LibreOffice','MPL-2.0','Office conversion and Draw editing','تحويل أوفيس وتعديل Draw','https://www.libreoffice.org/'],['ONLYOFFICE Docs','AGPL-3.0','Integrated document/PDF editor','محرر مستندات وPDF متكامل','https://github.com/ONLYOFFICE/DocumentServer'],['Xournal++','GPL-2.0','Handwriting and annotations','كتابة يدوية وتعليقات','https://github.com/xournalpp/xournalpp'],['Okular','GPL','Viewing and annotations','عرض وتعليقات','https://okular.kde.org/'],['Stirling PDF','Open-core','Broad server-side toolkit','مجموعة أدوات للخادم','https://github.com/Stirling-Tools/Stirling-PDF'],['PDF.js','Apache-2.0','Browser rendering — used here','عرض في المتصفح — مستخدم هنا','https://mozilla.github.io/pdf.js/'],['pdf-lib','MIT','Browser PDF writing — used here','إنشاء PDF — مستخدم هنا','https://pdf-lib.js.org/'],['qpdf','Apache-2.0','Structural repair and encryption','إصلاح البنية والتشفير','https://github.com/qpdf/qpdf'],['pikepdf','MPL-2.0','Python wrapper for qpdf','واجهة بايثون لمحرك qpdf','https://github.com/pikepdf/pikepdf'],['pypdf','BSD-3-Clause','Python PDF manipulation','معالجة PDF ببايثون','https://github.com/py-pdf/pypdf'],['pdfcpu','Apache-2.0','Go PDF processing','معالجة PDF بلغة Go','https://github.com/pdfcpu/pdfcpu'],['Apache PDFBox','Apache-2.0','Java PDF engine','محرك PDF بلغة Java','https://github.com/apache/pdfbox'],['MuPDF','AGPL / commercial','Rendering and content processing','عرض ومعالجة المحتوى','https://github.com/ArtifexSoftware/mupdf'],['Ghostscript','AGPL / commercial','Rendering and optimization','عرض وتحسين الملفات','https://github.com/ArtifexSoftware/ghostpdl'],['OCRmyPDF','MPL-2.0','Searchable scanned PDFs','PDF ممسوح قابل للبحث','https://github.com/ocrmypdf/OCRmyPDF'],['Tesseract','Apache-2.0','Arabic and English OCR','التعرف الضوئي بالعربية والإنجليزية','https://github.com/tesseract-ocr/tesseract'],['Tesseract.js','Apache-2.0','Browser image OCR','التعرف الضوئي على الصور بالمتصفح','https://github.com/naptha/tesseract.js']];
projects.unshift(['PDFCraftTool','AGPL-3.0','Browser-local PDF toolkit','مجموعة أدوات PDF محلية','https://github.com/PDFCraftTool/pdfcraft'],['pdfcn','MIT','React document templates','قوالب مستندات React','https://github.com/shadcn-labs/pdfcn'],['PDFx','MIT (verify full text)','React PDF components','مكونات PDF بلغة React','https://github.com/akii09/pdfx'],['zpdf · Lulzx','CC0 / alpha','Zig text extraction','استخراج النص بلغة Zig','https://github.com/Lulzx/zpdf'],['zpdf · Xero-Team','MIT','Rust parser / renderer / writer','محلل وعارض ومحرر بلغة Rust','https://github.com/Xero-Team/zpdf'],['GenOffice','Apache-2.0 + EE exception','Desktop Office / PDF suite','حزمة أوفيس وPDF مكتبية','https://github.com/genspark-ai/genoffice'],['ocrbase','MIT','OCR model API; models separate','واجهة OCR؛ النماذج منفصلة','https://github.com/majcheradam/ocrbase'],['make-look-scanned','AGPL-3.0','Scan effects; likely requested match','تأثير المسح؛ تطابق محتمل للاسم المطلوب','https://github.com/overflowy/make-look-scanned']);
function research(){modal(t('The open-source PDF landscape','عالم أدوات PDF مفتوحة المصدر'),`<p>${t('A broad survey of 28 relevant projects, reviewed October 8, 2026. Not an exhaustive census. Desktop apps are references, not embedded integrations. Licenses vary by component and edition.','مسح واسع لثمانية وعشرين مشروعاً بتاريخ ٨ أكتوبر ٢٠٢٦، وليس حصراً شاملاً. التطبيقات المكتبية مراجع وليست تكاملات مدمجة. تختلف التراخيص حسب المكون والإصدار.')}</p><table><thead><tr><th>${t('Project','المشروع')}</th><th>${t('License','الترخيص')}</th><th>${t('Best fit','الاستخدام')}</th></tr></thead><tbody>${projects.map(p=>`<tr><td><a href="${p[4]}" target="_blank" rel="noopener noreferrer">${p[0]} ${icon('arrow-up-right')}</a></td><td>${p[1]}</td><td>${t(p[2],p[3])}</td></tr>`).join('')}</tbody></table><p>${t('Browser tools are implemented locally. Optional server adapters connect OCRmyPDF, LibreOffice, qpdf, Stirling and ocrbase. The other projects are references, not bundled integrations.','أدوات المتصفح منفذة محلياً. تربط موصلات الخادم الاختيارية OCRmyPDF وLibreOffice وqpdf وStirling وocrbase. المشاريع الأخرى مراجع وليست تكاملات مدمجة.')}</p>`);}
$('#language').onclick=()=>{lang=lang==='en'?'ar':'en';localStorage.setItem('waraq-lang',lang);translate();};$('#choose').onclick=$('#add').onclick=()=>{replaceNext=false;$('#files').click();};$('#files').onchange=e=>{if(replaceNext&&e.target.files.length&&pages.length){snapshot();pages=[];selected.clear();}replaceNext=false;loadFiles(e.target.files);};$('#drop').ondragover=e=>{e.preventDefault();$('#drop').classList.add('over');};$('#drop').ondragleave=()=>$('#drop').classList.remove('over');$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('over');loadFiles(e.dataTransfer.files);};$('#search').oninput=renderTools;$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderTools();});$('#closeDialog').onclick=()=>$('#dialog').close();$('#researchNav').onclick=$('#researchLink').onclick=research;$('#studioNav').onclick=()=>$('#studio').scrollIntoView({behavior:'smooth'});$('#toolsNav').onclick=()=>$('#toolSection').scrollIntoView({behavior:'smooth'});
$('#export').onclick=()=>task(async()=>{download(await output(),name()+'.pdf','application/pdf');msg('PDF downloaded. Your source files are unchanged.','تم تنزيل PDF. لم تتغير ملفاتك الأصلية.');});$('#extract').onclick=()=>task(async()=>{download(await output(active()),name()+'-selected.pdf','application/pdf');});$('#undo').onclick=()=>{if(history.length){pages=history.pop();selected.clear();render();}};$('#clear').onclick=()=>{snapshot();pages=[];selected.clear();render();msg('Workspace cleared. Undo is available.','تم مسح مساحة العمل. يمكنك التراجع.');};$$('[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.action;if(action==='all'){selected=selected.size===pages.length?new Set():new Set(pages.map(p=>p.id));render();return;}if(action==='crop'){tool('crop');return;}if(action==='duplicate'&&pages.length+active().length>MAX_PAGES){msg(`The workspace limit is ${MAX_PAGES} pages.`,`الحد الأقصى لمساحة العمل ${MAX_PAGES} صفحة.`,true);return;}if(action==='blank'&&pages.length>=MAX_PAGES)return;snapshot();const ids=new Set(active().map(p=>p.id));if(action==='rotate')pages.forEach(p=>{if(ids.has(p.id))p.rotation=(p.rotation+90)%360;});if(action==='delete'){pages=pages.filter(p=>!ids.has(p.id));selected.clear();}if(action==='duplicate')pages=pages.flatMap(p=>ids.has(p.id)?[p,{...p,id:crypto.randomUUID()}]:[p]);if(action==='reverse')pages.reverse();if(action==='blank')pages.push({id:crypto.randomUUID(),source:null,index:0,rotation:0,crop:0});render();});
$('#demo').onclick=async()=>{if(busy)return;await ensureLibs();const doc=await PDFLib.PDFDocument.create();const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);for(let i=0;i<3;i++){const p=doc.addPage();p.drawRectangle({x:0,y:650,width:595,height:192,color:PDFLib.rgb(.9,.95,.9)});p.drawText(['A little order.','Room for ideas.','Ready for what is next.'][i],{x:48,y:730,size:27,font,color:PDFLib.rgb(.08,.4,.3)});p.drawText('WARAQ / SAMPLE DOCUMENT',{x:48,y:680,size:10,font});for(let y=570;y>200;y-=35)p.drawRectangle({x:48,y,width:y%3?480:350,height:6,color:PDFLib.rgb(.87,.9,.86)});p.drawText(String(i+1),{x:290,y:35,size:12,font});}await loadFiles([new File([await doc.save()],'Waraq-sample.pdf',{type:'application/pdf'})]);};
let refreshStatus=null;
// Libraries needed only once a document is open. Loaded on first use, or quietly after the first paint.
let libsReady=null;
function ensureLibs(){return libsReady||=Promise.all([['PDFLib','vendor/pdf-lib.min.js'],['JSZip','vendor/jszip.min.js']].map(([name,src])=>globalThis[name]?null:new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{libsReady=null;reject(new Error('Could not load '+src));};document.head.append(s);})));}
(window.requestIdleCallback||((fn)=>setTimeout(fn,1200)))(()=>ensureLibs().catch(()=>{}));
// Thumbnails render when their card scrolls into view, one at a time, so 2,000-page documents open quickly.
const thumbQueue=[];let thumbBusy=false;
const thumbObserver=new IntersectionObserver((entries)=>{for(const e of entries)if(e.isIntersecting){thumbObserver.unobserve(e.target);if(e.target.__thumb)thumbQueue.push(e.target.__thumb);}pumpThumbs();},{rootMargin:'600px'});
// Desktop: heavy source documents get their thumbnails from MuPDF instead of the browser's PDF engine.
// Files opened from Explorer arrive before the engine has answered; wait for that answer once (desktop only).
let capsReady=null;
function ensureCaps(){return window.waraqDesktop?.isDesktop?(capsReady||=refreshEngines(context).then(c=>{if(!c)capsReady=null;return c;})):Promise.resolve();} // a failed check is retried next time
async function engineThumb(item){
 await ensureCaps();const src=sources[item.source];if(!engineRendering()||item.crop)return null;
 if(src.heavy===undefined){const p=src.doc.getPage(0).getSize();src.heavy=isHeavy(src.originalBytes.length,src.doc.getPageCount(),p.width*p.height);}
 if(!src.heavy||item.rotation!==src.doc.getPage(item.index).getRotation().angle)return null;
 try{src.renderId||=await renderDocId(src.originalBytes);const r=await fetch(renderUrl(src.renderId,item.index+1,170));if(!r.ok)return null;return URL.createObjectURL(await r.blob());}catch{return null;}
}
async function pumpThumbs(){if(thumbBusy)return;thumbBusy=true;try{while(thumbQueue.length){const {item,key,image}=thumbQueue.shift();if(!image.isConnected)continue;try{const fromEngine=item.thumbKey!==key?await engineThumb(item):null;if(fromEngine){item.thumb=fromEngine;item.thumbKey=key;}if(item.thumbKey!==key){const page=await sources[item.source].viewer.getPage(item.index+1),v=page.getViewport({scale:1,rotation:item.rotation}),viewport=page.getViewport({scale:Math.min(.4,170/Math.max(v.width,v.height)),rotation:item.rotation}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;item.thumb=canvas.toDataURL('image/jpeg',.8);item.thumbKey=key;canvas.width=0;}if(image.isConnected)image.src=item.thumb;}catch{image.alt=t('Preview unavailable','المعاينة غير متاحة');}}}finally{thumbBusy=false;}}
const THUMB_PLACEHOLDER='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="168"><rect width="120" height="168" fill="#f4f6f2"/></svg>');
function lazyThumb(item,key,image){image.__thumb={item,key,image};if(!image.src)image.src=THUMB_PLACEHOLDER;thumbObserver.observe(image);}
let plus=null,updateBadge=null,quickBar=null,replaceNext=false;
// "Open" replaces the open document (Add in the editor still merges files); "Close" returns to the start page.
function openFresh(){if(busy)return;replaceNext=true;$('#files').click();}
function closeDocument(){if(busy||!pages.length)return;$('#dialog')?.open&&$('#dialog').close();snapshot();pages=[];selected.clear();render();window.scrollTo({top:0});msg('File closed.','أُغلق الملف.');undoToast(t('File closed.','أُغلق الملف.'));}
// A short message with an Undo button that is always reachable (the editor's own Undo is hidden on the start page).
function undoToast(text){
 document.querySelector('.undo-toast')?.remove();
 const box=document.createElement('div');box.className='undo-toast';box.setAttribute('role','status');
 box.innerHTML=`<span></span><button type="button">${t('Undo','تراجع')}</button><button type="button" class="undo-toast-x" aria-label="${t('Dismiss','إغلاق')}">${icon('close')}</button>`;
 box.querySelector('span').textContent=text;document.body.append(box);
 const done=()=>{clearTimeout(timer);box.remove();};const timer=setTimeout(done,12000);
 box.querySelector('button').onclick=()=>{done();undoLast();};box.querySelector('.undo-toast-x').onclick=done;
}
function undoLast(){if(history.length){pages=history.pop();selected.clear();render();msg('Restored.','تمت الاستعادة.');}}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&!pages.length&&history.length&&!e.target.closest?.('input,textarea,[contenteditable="true"],.pe-root')&&!$('#dialog')?.open){e.preventDefault();document.querySelector('.undo-toast')?.remove();undoLast();}});
// Messages from tools; "your file is ready" is suppressed when the result was applied to the open document.
function say(en,ar,error=false){if(!plus||plus.filterMessage(en,ar,error))msg(en,ar,error);}
document.documentElement.classList.toggle('is-desktop',!!window.waraqDesktop?.isDesktop);
const context={get PDFLib(){return globalThis.PDFLib;},engineRender:{enabled:()=>engineRendering(),ready:()=>ensureCaps(),upload:renderDocId,url:renderUrl,tile:renderTileUrl,isHeavy},notice:(en,ar,e)=>msg(en,ar,e),icon,editPage:(n)=>{plus?.setMode("edit");tool("pageEditor:"+n);},get lastDelivery(){return plus?.lastDelivery;},downloadOnly:()=>plus?.resetInput(),pdfjsLib,t,modal,task,download:(...a)=>plus?plus.deliver(...a):download(...a),filename:name,getBytes:()=>{plus?.markInput(active().map(p=>p.id),!selected.size);return output(active());},getSources:()=>sources.filter(source=>!source.released).map(source=>({name:source.name,getBytes:async()=>source.originalBytes.slice()})),msg:say,hasPages:()=>pages.length>0,onCapabilities:()=>renderTools()};
async function tool(id){if(busy)return;plus?.resetInput();try{await ensureLibs();if(id==='templates')return await runTemplates(context);if(engineOperations[id])return await runEngine(id,context);if(!['merge','images','batch'].includes(id)&&!needPages())return;if(id==='browserOCR')return await runOCR(context);if(['scan','signature','annotate','redact','metadata','forms','range'].includes(id))return await runAdvanced(id,context);if(id.startsWith('pageEditor'))return (await import('./page-editor.js')).runPageEditor(context,Number(id.split(':')[1])||1);if(id==='colors')return await runColor(context);if(id==='batch')return await runBatch(context);if(['resize','nup','booklet','compare','grayscale'].includes(id))return await runMore(id,context);return await basicTool(id);}catch(e){console.error(e);msg('The tool could not open this PDF. Try another document or review the file limits.','تعذر فتح ملف PDF بهذه الأداة. جرّب مستنداً آخر أو راجع حدود الملفات.',true);}}
// BEGIN tool grouping navigation.
$('#integrationsNav').onclick=openMoreTools;
$('#engineSettings').onclick=()=>openEngines(context);
$('#moreToolsDisclosure').addEventListener('toggle',()=>$('#integrationsNav').setAttribute('aria-expanded',String($('#moreToolsDisclosure').open)));
// END tool grouping navigation.
async function pagesFromBytes(bytes,fileName,doc){doc=doc||await PDFLib.PDFDocument.load(bytes);const viewer=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;const source=sources.length;sources.push({doc,viewer,name:fileName,originalBytes:bytes.slice()});return doc.getPages().map((p,index)=>({id:crypto.randomUUID(),source,index,rotation:p.getRotation().angle,crop:0}));}
// Extracted text: turning presentation-form glyphs into letters is always safe. Reversing a line changes content,
// so it is only done after the user sees a before/after preview and agrees.
async function exportExtractedText(text,fileName){
 const normalized=normalizeArabic(text),changes=findReversedLines(normalized),save=(value)=>download('\uFEFF'+value,fileName,'text/plain;charset=utf-8');
 if(!changes.length){save(normalized);return;}
 const esc=(s)=>String(s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sample=changes.slice(0,3).map(c=>`<li><div dir="rtl" class="pw-before">${esc(c.before)}</div><div dir="rtl" class="pw-after">${esc(c.after)}</div></li>`).join('');
 modal(t('Some Arabic lines look reversed','يبدو أن بعض الأسطر العربية معكوسة'),`<p>${t(`${changes.length} line(s) appear to be in reverse order, which happens with some PDFs. Preview (before, then after):`,`يبدو أن ${changes.length} سطراً بترتيب معكوس، وهذا يحدث في بعض ملفات PDF. المعاينة (قبل ثم بعد):`)}</p><ol class="pw-arabic-preview">${sample}</ol><div class="advanced-actions"><button class="primary" id="arFix">${t('Fix these lines','أصلح هذه الأسطر')}</button><button id="arKeep">${t('Keep the text as extracted','احتفظ بالنص كما استُخرج')}</button></div>`);
 $('#arFix').onclick=()=>{$('#dialog').close();save(repairDirection(normalized,changes));};
 $('#arKeep').onclick=()=>{$('#dialog').close();save(normalized);};
}
function deliverActive(bytes,fileName,type){plus?.markInput(active().map(p=>p.id),!selected.size);return context.download(bytes,fileName,type);}
plus=setupWorkspacePlus({openShortcuts:()=>quickBar?.openShortcuts(),openFile:()=>openFresh(),closeFile:()=>closeDocument(),t,icon,name,msg,modal,download,get PDFLib(){return globalThis.PDFLib;},pdfjsLib,output:()=>output(),getPages:()=>pages,setPages:v=>{pages=v;},clearSelection:()=>selected.clear(),snapshot,render,loadFiles,pagesFromBytes,openTool:id=>tool(id),engineRender:context.engineRender,editPage:n=>context.editPage(n),tools:()=>catalog.map(c=>({id:c[0],en:c[3],ar:c[4],engine:!!engineOperations[c[0]]}))});
updateBadge=setupUpdateBadge({t,icon});
onPacksChange(()=>refreshEngines(context).then(()=>renderTools())); // a pack installed or removed changes which tools are ready
quickBar=setupQuickBar({t,icon,catalog,openTool:id=>tool(id),hasPages:()=>pages.length>0,msg,modal});quickBar.refresh();
translate();
setupOffline(context).then(fn=>{refreshStatus=fn;});
refreshEngines(context);


