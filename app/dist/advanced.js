/* Browser-only PDF tools. No document bytes leave the device. */
import {outputName} from './naming.js';
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const copyBytes = (bytes) => new Uint8Array(bytes).slice();

export function parsePageRanges(input, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('No pages');
  const normalized = String(input).trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776)).replace(/،/g, ',').replace(/[–—]/g, '-');
  if (!normalized || /^(all|الكل)$/i.test(normalized)) return Array.from({length:count}, (_, i) => i);
  const indices = [];
  for (const token of normalized.split(',')) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('Invalid page range');
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < 1 || first > count || last > count) throw new Error('Page outside document');
    const step = first <= last ? 1 : -1;
    for (let page = first; ; page += step) { indices.push(page - 1); if (page === last) break; }
    if (indices.length > 1000) throw new Error('Too many output pages');
  }
  return indices;
}

export async function exportPageRange(PDFLib, bytes, input) {
  const source = await PDFLib.PDFDocument.load(copyBytes(bytes), {updateMetadata:false});
  const output = await PDFLib.PDFDocument.create();
  for (const page of await output.copyPages(source, parsePageRanges(input, source.getPageCount()))) output.addPage(page);
  return output.save();
}

export async function editMetadata(PDFLib, bytes, values, remove = false) {
  const doc = await PDFLib.PDFDocument.load(copyBytes(bytes), {updateMetadata:false});
  const xmp = doc.catalog.get(PDFLib.PDFName.of('Metadata'));
  if (xmp instanceof PDFLib.PDFRef) doc.context.delete(xmp);
  if (remove) {
    const info = doc.context.trailerInfo.Info;
    if (info instanceof PDFLib.PDFRef) doc.context.delete(info);
    doc.context.trailerInfo.Info = undefined;
    doc.catalog.delete(PDFLib.PDFName.of('Metadata'));
  } else {
    doc.setTitle(values.title || ''); doc.setAuthor(values.author || '');
    doc.setSubject(values.subject || '');
    doc.setKeywords((values.keywords || '').split(/[,،]/).map((s) => s.trim()).filter(Boolean));
    // Remove stale XMP so readers do not display conflicting values.
    doc.catalog.delete(PDFLib.PDFName.of('Metadata'));
  }
  return doc.save();
}

export function mapToPdfBox(viewport, rect) {
  const [x, y] = viewport.convertToPdfPoint(rect.x * viewport.width, (rect.y + rect.h) * viewport.height);
  const [rightX, rightY] = viewport.convertToPdfPoint((rect.x + rect.w) * viewport.width, (rect.y + rect.h) * viewport.height);
  const [topX, topY] = viewport.convertToPdfPoint(rect.x * viewport.width, rect.y * viewport.height);
  return {x,y,width:Math.hypot(rightX-x,rightY-y),height:Math.hypot(topX-x,topY-y),angle:Math.atan2(rightY-y,rightX-x)*180/Math.PI};
}

export async function createImageOnlyPdf(PDFLib, pages) {
  const doc = await PDFLib.PDFDocument.create();
  for (const {bytes,width,height,type = 'png'} of pages) {
    if (!(width > 0 && height > 0)) throw new Error('Invalid page size');
    const image = type === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    const page = doc.addPage([width,height]);
    page.drawImage(image,{x:0,y:0,width,height});
  }
  if (!pages.length) throw new Error('No image pages');
  doc.setProducer('Waraq PDF Studio');
  return doc.save();
}

function canvasBytes(canvas, type = 'image/png', quality) {
  return new Promise((resolve,reject) => canvas.toBlob(async (blob) => {
    if (!blob) { reject(new Error('Image export failed')); return; }
    resolve(new Uint8Array(await blob.arrayBuffer()));
  },type,quality));
}

function textCanvas(text, width = 1000, height = 150, color = '#183f34', multiline = false) {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(width)); canvas.height = Math.max(1,Math.round(height));
  const ctx = canvas.getContext('2d');
  const rtl = /[\u0590-\u08ff]/.test(text); ctx.direction = rtl ? 'rtl':'ltr'; ctx.textAlign = rtl ? 'right':'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  const lines = multiline ? String(text).split('\n') : [String(text).replace(/\n/g,' ')];
  let size = Math.min(76, Math.max(10,(height-12)/(lines.length*1.25)));
  ctx.font = `${size}px Tahoma, Arial, sans-serif`;
  const longest = Math.max(1,...lines.map((line) => ctx.measureText(line).width));
  size = Math.min(size,size*(width-16)/longest); ctx.font = `${size}px Tahoma, Arial, sans-serif`;
  const lineHeight = size*1.25, top = (height-lines.length*lineHeight)/2;
  lines.forEach((line,index) => ctx.fillText(line,rtl ? width-8:8,top+(index+.5)*lineHeight));
  return canvas;
}

async function openViewer(ctx, bytes) { return ctx.pdfjsLib.getDocument({data:copyBytes(bytes),isEvalSupported:false}).promise; }

async function renderPage(viewer, number, preferredScale = 1.6) {
  const page = await viewer.getPage(number), natural = page.getViewport({scale:1});
  const scale = Math.min(preferredScale,Math.sqrt(20000000/(natural.width*natural.height)),4096/Math.max(natural.width,natural.height));
  const viewport = page.getViewport({scale}), canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
  return {canvas,viewport,natural};
}

async function saveMarkup(ctx, bytes, marks) {
  const doc = await ctx.PDFLib.PDFDocument.load(copyBytes(bytes),{updateMetadata:false});
  const viewer = await openViewer(ctx,bytes);
  try {
    for (const mark of marks) {
      const page = doc.getPage(mark.page-1), source = await viewer.getPage(mark.page), viewport = source.getViewport({scale:1});
      const box = mapToPdfBox(viewport,mark), rotate = ctx.PDFLib.degrees(box.angle);
      if (mark.kind === 'highlight' || mark.kind === 'box') {
        page.drawRectangle({...box,rotate,color:mark.kind === 'highlight' ? ctx.PDFLib.rgb(1,.82,.12):undefined,opacity:mark.kind === 'highlight' ? .3:1,borderColor:mark.kind === 'box' ? ctx.PDFLib.rgb(.09,.42,.31):undefined,borderWidth:mark.kind === 'box' ? 1.5:0});
      } else {
        const png = mark.kind === 'text' ? await canvasBytes(textCanvas(mark.text,Math.max(200,box.width*3),Math.max(60,box.height*3),mark.color,true)) : mark.image;
        const image = await doc.embedPng(png);
        page.drawImage(image,{x:box.x,y:box.y,width:box.width,height:box.height,rotate});
      }
    }
    return doc.save();
  } finally { await viewer.destroy(); }
}

function localError(ctx, en, ar) { const element = $('#advancedError'); if (element) element.textContent = ctx.t(en,ar); else ctx.msg(en,ar,true); }
function closeDialog() { $('#dialog').close(); }
function filename(ctx, suffix) { return `${ctx.filename()}-${suffix}.pdf`; }
function done(ctx, bytes, suffix, originalName) { ctx.download(bytes,originalName?outputName(originalName,suffix):filename(ctx,suffix),'application/pdf'); ctx.msg('Your PDF is ready. The source files are unchanged.','ملف PDF جاهز. لم تتغير الملفات الأصلية.'); }
function buttons(ctx, label = 'Download PDF', arabic = 'تنزيل PDF') { return `<p id="advancedError" class="advanced-error" role="alert"></p><button class="primary" id="advancedExport">${ctx.t(label,arabic)}</button>`; }

async function rangeTool(ctx) {
  const bytes = await ctx.getBytes(), doc = await ctx.PDFLib.PDFDocument.load(copyBytes(bytes),{updateMetadata:false});
  ctx.modal(ctx.t('Export page ranges','تصدير نطاقات الصفحات'),`<p>${ctx.t(`Choose pages from the current selection (${doc.getPageCount()} pages). Use commas and ranges. Reverse ranges and repeated pages are supported.`,`اختر صفحات من التحديد الحالي (${doc.getPageCount()} صفحة). استخدم الفواصل والنطاقات. يمكن عكس النطاق وتكرار الصفحات.`)}</p><label>${ctx.t('Pages, for example 1, 3-5, 2','الصفحات، مثل ١، ٣-٥، ٢')}<input id="advancedRange" dir="ltr" value="1-${doc.getPageCount()}" maxlength="1000"></label>${buttons(ctx)}`);
  $('#advancedExport').onclick = () => {
    const range = $('#advancedRange').value;
    try { parsePageRanges(range,doc.getPageCount()); } catch { localError(ctx,'Enter valid page numbers within this document.','أدخل أرقام صفحات صحيحة ضمن هذا المستند.'); return; }
    closeDialog(); ctx.task(async () => done(ctx,await exportPageRange(ctx.PDFLib,bytes,range),'pages'));
  };
}

async function metadataTool(ctx) {
  const bytes = await ctx.getBytes(), doc = await ctx.PDFLib.PDFDocument.load(copyBytes(bytes),{updateMetadata:false});
  const fields = [['Title','العنوان','title',doc.getTitle()],['Author','المؤلف','author',doc.getAuthor()],['Subject','الموضوع','subject',doc.getSubject()],['Keywords (comma separated)','الكلمات المفتاحية (بفواصل)','keywords',doc.getKeywords()]];
  ctx.modal(ctx.t('Document metadata','بيانات المستند'),`<p>${ctx.t('Edit the information in this exported document. Removing metadata clears its information dictionary and XMP. It does not remove names inside page content, comments or attachments.','عدّل معلومات المستند المُصدَّر. تمسح الإزالة قاموس المعلومات وبيانات XMP، ولا تزيل الأسماء داخل محتوى الصفحات أو التعليقات أو المرفقات.')}</p><div class="advanced-grid">${fields.map(([en,ar,id,value]) => `<label>${ctx.t(en,ar)}<input id="meta-${id}" maxlength="1000" value="${escapeHTML(value || '')}"></label>`).join('')}</div><label class="advanced-check"><input type="checkbox" id="advancedRemove"> ${ctx.t('Remove document metadata instead','إزالة بيانات المستند')}</label>${buttons(ctx)}`);
  $('#advancedExport').onclick = () => { const remove = $('#advancedRemove').checked, values = Object.fromEntries(fields.map(([, , id]) => [id,$(`#meta-${id}`).value])); closeDialog(); ctx.task(async () => done(ctx,await editMetadata(ctx.PDFLib,bytes,values,remove),'metadata')); };
}

function applyScanEffect(canvas, {warm,grain,tilt}) {
  const ctx = canvas.getContext('2d'), pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
  for (let i=0;i<pixels.data.length;i+=4) {
    const gray = pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114;
    const noise = (Math.random()-.5)*grain;
    pixels.data[i]=clamp(gray+noise,0,255); pixels.data[i+1]=clamp(gray+noise-(warm ? 3:0),0,255); pixels.data[i+2]=clamp(gray+noise-(warm ? 11:0),0,255);
  }
  ctx.putImageData(pixels,0,0);
  if (tilt) {
    const source = document.createElement('canvas'); source.width=canvas.width; source.height=canvas.height; source.getContext('2d').drawImage(canvas,0,0);
    ctx.fillStyle=warm?'#fffcef':'#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(tilt*Math.PI/180); ctx.scale(.975,.975); ctx.drawImage(source,-canvas.width/2,-canvas.height/2); ctx.restore();
  }
}

async function scanTool(ctx) {
  const bytes = await ctx.getBytes();
  ctx.modal(ctx.t('Make it look scanned','مظهر المستند الممسوح'),`<p>${ctx.t('Create a scan-style copy with paper tone, grain and gentle rotation. The result contains images only: text search, forms, links and digital signatures are removed.','أنشئ نسخة بمظهر المسح الضوئي مع لون الورق والتحبب والميل الخفيف. الناتج صور فقط ويفقد البحث النصي والنماذج والروابط والتوقيعات الرقمية.')}</p><div class="advanced-grid"><label>${ctx.t('Paper','الورق')}<select id="scanPaper"><option value="warm">${ctx.t('Warm paper','ورق دافئ')}</option><option value="white">${ctx.t('White / grayscale','أبيض / رمادي')}</option></select></label><label>${ctx.t('Grain','التحبب')}<select id="scanGrain"><option value="8">${ctx.t('Subtle','خفيف')}</option><option value="20">${ctx.t('Visible','واضح')}</option><option value="0">${ctx.t('None','بدون')}</option></select></label><label>${ctx.t('Page tilt','ميل الصفحة')}<select id="scanTilt"><option value="0.6">${ctx.t('Gentle','خفيف')}</option><option value="0">${ctx.t('Straight','مستقيم')}</option><option value="1.2">${ctx.t('Stronger','أكبر')}</option></select></label></div>${buttons(ctx, 'Create scanned copy','إنشاء نسخة بمظهر المسح')}`);
  $('#advancedExport').onclick = () => { const options = {warm:$('#scanPaper').value==='warm',grain:Number($('#scanGrain').value),tilt:Number($('#scanTilt').value)}; closeDialog(); ctx.task(async () => {
    const viewer = await openViewer(ctx,bytes), images=[];
    try {
      for (let n=1;n<=viewer.numPages;n++) { ctx.msg(`Preparing scan effect ${n} / ${viewer.numPages}…`,`جارٍ إعداد تأثير المسح ${n} / ${viewer.numPages}…`); const {canvas,natural}=await renderPage(viewer,n); applyScanEffect(canvas,{...options,tilt:options.tilt*(n%2?1:-1)}); images.push({bytes:await canvasBytes(canvas,'image/jpeg',.86),width:natural.width,height:natural.height,type:'jpg'}); canvas.width=0; canvas.height=0; }
      done(ctx,await createImageOnlyPdf(ctx.PDFLib,images),'scanned');
    } finally { await viewer.destroy(); }
  }); };
}

async function prepareSignature(ctx, continueWith) {
  ctx.modal(ctx.t('Add a visual signature','إضافة توقيع مرئي'),`<p>${ctx.t('Draw your signature or upload a PNG/JPG, then place it on a page. This is a visual signature, not a certificate-backed digital signature.','ارسم توقيعك أو ارفع صورة PNG/JPG، ثم ضعها على الصفحة. هذا توقيع مرئي وليس توقيعاً رقمياً بشهادة.')}</p><canvas id="signaturePad" class="signature-pad" width="700" height="210" aria-label="${ctx.t('Draw your signature here','ارسم توقيعك هنا')}" style="width:100%;height:auto;touch-action:none;background:white;border:1px dashed #b6c8be"></canvas><div class="advanced-toolbar"><button id="signatureClear">${ctx.t('Clear drawing','مسح الرسم')}</button><label>${ctx.t('Or choose an image','أو اختر صورة')}<input id="signatureFile" type="file" accept="image/png,image/jpeg"></label></div>${buttons(ctx,'Place on document','وضعه على المستند')}`);
  const pad=$('#signaturePad'), pen=pad.getContext('2d'); pen.lineWidth=2.6; pen.lineCap='round'; pen.lineJoin='round'; pen.strokeStyle='#122e25';
  let drawing=false,hasInk=false,uploaded=null;
  const point=(event)=>{const r=pad.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*pad.width,y:(event.clientY-r.top)/r.height*pad.height};};
  pad.onpointerdown=(event)=>{event.preventDefault();drawing=true;hasInk=true;uploaded=null;pad.setPointerCapture(event.pointerId);const p=point(event);pen.beginPath();pen.moveTo(p.x,p.y);pen.lineTo(p.x+.01,p.y+.01);pen.stroke();};
  pad.onpointermove=(event)=>{if(!drawing)return;const p=point(event);pen.lineTo(p.x,p.y);pen.stroke();};
  pad.onpointerup=pad.onpointercancel=()=>{drawing=false;};
  $('#signatureClear').onclick=()=>{pen.clearRect(0,0,pad.width,pad.height);hasInk=false;uploaded=null;$('#signatureFile').value='';};
  $('#signatureFile').onchange=async(event)=>{const file=event.target.files[0];if(!file)return;if(file.size>10*1024*1024){localError(ctx,'Choose an image smaller than 10 MB.','اختر صورة أصغر من ١٠ ميجابايت.');return;}try{const image=await createImageBitmap(file);pen.clearRect(0,0,pad.width,pad.height);const scale=Math.min(pad.width/image.width,pad.height/image.height);pen.drawImage(image,(pad.width-image.width*scale)/2,(pad.height-image.height*scale)/2,image.width*scale,image.height*scale);image.close();uploaded=await canvasBytes(pad);hasInk=true;}catch{localError(ctx,'Could not read that image. Choose a PNG or JPG.','تعذرت قراءة الصورة. اختر PNG أو JPG.');}};
  $('#advancedExport').onclick=async()=>{if(!hasInk){localError(ctx,'Draw a signature or choose an image first.','ارسم توقيعاً أو اختر صورة أولاً.');return;}const png=uploaded||await canvasBytes(pad);continueWith(png);};
}

async function visualTool(ctx, kind, signatureImage) {
  const bytes = await ctx.getBytes(), viewer = await openViewer(ctx,bytes);
  const isRedact=kind==='redact', isSignature=kind==='signature';
  const title=isRedact?ctx.t('Redact private content','حجب المحتوى الخاص'):isSignature?ctx.t('Place your signature','وضع التوقيع'):ctx.t('Annotate your document','التعليق على المستند');
  const note=isRedact?ctx.t('Drag rectangles over everything you want removed. Export rebuilds EVERY page from visible pixels and burns black boxes into the images. Original text, metadata, attachments, links, forms and signatures are not copied. The output is image-only. Review every page before sharing.','اسحب مستطيلات فوق ما تريد إزالته. يعيد التصدير إنشاء جميع الصفحات من البكسلات المرئية ويثبت المربعات السوداء داخل الصور. لا ينسخ النص الأصلي أو البيانات الوصفية أو المرفقات أو الروابط أو النماذج أو التوقيعات. الناتج صور فقط. راجع جميع الصفحات قبل المشاركة.'):isSignature?ctx.t('Drag a rectangle where your signature should appear. You can place it on several pages. It is a visual mark; it does not cryptographically sign the document.','اسحب مستطيلاً في مكان التوقيع. يمكنك وضعه على صفحات متعددة. هذه علامة مرئية ولا توقّع المستند تشفيرياً.'):ctx.t('Choose a tool, then drag a rectangle on the page. Added text supports Arabic and English and is stored as an image. Existing page content stays searchable.','اختر أداة ثم اسحب مستطيلاً على الصفحة. يدعم النص المضاف العربية والإنجليزية ويُحفظ كصورة. يظل المحتوى الأصلي قابلاً للبحث.');
  ctx.modal(title,`<div class="advanced-editor"><p class="advanced-note">${note}</p><div class="advanced-toolbar"><label>${ctx.t('Page','الصفحة')}<select id="advancedPage">${Array.from({length:viewer.numPages},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label>${!isRedact&&!isSignature?`<label>${ctx.t('Tool','الأداة')}<select id="advancedMode"><option value="highlight">${ctx.t('Highlight','تمييز')}</option><option value="text">${ctx.t('Text','نص')}</option><option value="box">${ctx.t('Outline rectangle','إطار مستطيل')}</option></select></label><label>${ctx.t('Text to place','النص المراد وضعه')}<input id="advancedText" maxlength="500" placeholder="${ctx.t('Type a note','اكتب ملاحظة')}"></label>`:''}<button id="advancedUndo">${ctx.t('Undo last mark','تراجع عن آخر علامة')}</button><button id="advancedClearPage">${ctx.t('Clear page marks','مسح علامات الصفحة')}</button></div><p class="advanced-status" id="advancedStatus" aria-live="polite"></p><div class="advanced-stage" style="max-height:52vh;overflow:auto;background:#e8ede8;text-align:center"><canvas id="advancedCanvas" class="advanced-canvas" style="display:block;max-width:100%;height:auto;margin:auto;touch-action:none;cursor:crosshair" aria-label="${ctx.t('Document preview. Drag to place a mark.','معاينة المستند. اسحب لوضع علامة.')}" tabindex="0"></canvas></div><details><summary>${ctx.t('Place precisely using coordinates','وضع دقيق باستخدام الإحداثيات')}</summary><p>${ctx.t('Percentages measured from the top-left corner of the visible page.','نسب مئوية من الزاوية العلوية اليسرى للصفحة المرئية.')}</p><div class="advanced-grid">${[['x','X / س',10],['y','Y / ص',10],['w',ctx.t('Width %','العرض ٪'),40],['h',ctx.t('Height %','الارتفاع ٪'),8]].map(([id,label,value])=>`<label>${label}<input id="advanced-${id}" type="number" min="0" max="100" step="0.1" value="${value}"></label>`).join('')}</div><button id="advancedPlace">${ctx.t('Add mark','إضافة علامة')}</button></details>${buttons(ctx,isRedact?'Download redacted copy':'Download PDF',isRedact?'تنزيل النسخة المحجوبة':'تنزيل PDF')}</div>`);
  const canvas=$('#advancedCanvas'), paint=canvas.getContext('2d'), marks=[]; let current=1,base=null,start=null,draft=null,renderId=0,closed=false,ready=false;
  const signatureBitmap=signatureImage?await createImageBitmap(new Blob([signatureImage],{type:'image/png'})):null;
  const release=()=>{closed=true;viewer.destroy();signatureBitmap?.close();};
  $('#dialog').addEventListener('close',release,{once:true});
  const styleMark=(mark)=>{const x=mark.x*canvas.width,y=mark.y*canvas.height,w=mark.w*canvas.width,h=mark.h*canvas.height;paint.save();if(isRedact){paint.fillStyle='#000';paint.fillRect(x,y,w,h);}else if(isSignature){paint.drawImage(signatureBitmap,x,y,w,h);}else if(mark.kind==='highlight'){paint.fillStyle='rgba(255,198,30,.3)';paint.fillRect(x,y,w,h);}else if(mark.kind==='box'){paint.strokeStyle='#176c50';paint.lineWidth=2;paint.strokeRect(x,y,w,h);}else{paint.drawImage(textCanvas(mark.text,Math.max(1,w*2),Math.max(1,h*2),'#183f34',true),x,y,w,h);}paint.restore();};
  const draw=()=>{if(!base)return;paint.clearRect(0,0,canvas.width,canvas.height);paint.drawImage(base,0,0);for(const mark of marks.filter((mark)=>mark.page===current))styleMark(mark);if(draft)styleMark(draft);$('#advancedStatus').textContent=ctx.t(`${marks.length} marks across this document. Drag to add another.`,`${marks.length} علامة في المستند. اسحب لإضافة علامة.`);};
  const load=async()=>{const id=++renderId;ready=false;$('#advancedStatus').textContent=ctx.t('Rendering page…','جارٍ عرض الصفحة…');const rendered=await renderPage(viewer,current,1.25);if(closed||id!==renderId)return;base=rendered.canvas;canvas.width=base.width;canvas.height=base.height;draft=null;ready=true;draw();};
  const point=(event)=>{const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};};
  const newMark=(rect)=>({page:current,kind:isRedact?'redact':isSignature?'signature':$('#advancedMode').value,text:$('#advancedText')?.value.trim()||'',image:signatureImage,...rect});
  const add=(mark)=>{if(mark.w<.002||mark.h<.002)return;if(mark.kind==='text'&&!mark.text){localError(ctx,'Type the text before placing it.','اكتب النص قبل وضعه.');return;}marks.push(mark);localError(ctx,'','');draw();};
  canvas.onpointerdown=(event)=>{if(!ready)return;event.preventDefault();start=point(event);canvas.setPointerCapture(event.pointerId);};
  canvas.onpointermove=(event)=>{if(!start)return;const p=point(event);draft=newMark({x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)});draw();};
  canvas.onpointerup=(event)=>{if(!start)return;const p=point(event),rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};start=null;draft=null;add(newMark(rect));draw();};
  canvas.onpointercancel=()=>{start=null;draft=null;draw();};
  $('#advancedPage').onchange=()=>{current=Number($('#advancedPage').value);load().catch(()=>localError(ctx,'Could not render this page.','تعذر عرض الصفحة.'));};
  $('#advancedUndo').onclick=()=>{marks.pop();draw();};
  $('#advancedClearPage').onclick=()=>{for(let i=marks.length-1;i>=0;i--)if(marks[i].page===current)marks.splice(i,1);draw();};
  $('#advancedPlace').onclick=()=>{const rect=Object.fromEntries(['x','y','w','h'].map((key)=>[key,Number($(`#advanced-${key}`).value)/100]));if(!Object.values(rect).every(Number.isFinite)||rect.x<0||rect.y<0||rect.w<=0||rect.h<=0||rect.x+rect.w>1||rect.y+rect.h>1){localError(ctx,'The rectangle must fit within the page.','يجب أن يكون المستطيل داخل الصفحة.');return;}add(newMark(rect));};
  $('#advancedExport').onclick=()=>{
    if(!marks.length){localError(ctx,'Add at least one mark before exporting.','أضف علامة واحدة على الأقل قبل التصدير.');return;}
    const saved=marks.map((mark)=>({...mark})); closeDialog(); ctx.task(async()=>{
      if(!isRedact){done(ctx,await saveMarkup(ctx,bytes,saved),isSignature?'signed':'annotated');return;}
      const exportViewer=await openViewer(ctx,bytes),images=[];
      try{
        for(let n=1;n<=exportViewer.numPages;n++){
          ctx.msg(`Redacting page ${n} / ${exportViewer.numPages}…`,`جارٍ حجب الصفحة ${n} / ${exportViewer.numPages}…`);
          const {canvas:pageCanvas,natural}=await renderPage(exportViewer,n,2),pen=pageCanvas.getContext('2d');pen.fillStyle='#000';
          for(const mark of saved.filter((mark)=>mark.page===n)){
            // Expand to integer pixels to cover antialiasing at box edges.
            const left=Math.floor(mark.x*pageCanvas.width),top=Math.floor(mark.y*pageCanvas.height),right=Math.ceil((mark.x+mark.w)*pageCanvas.width),bottom=Math.ceil((mark.y+mark.h)*pageCanvas.height);
            pen.fillRect(left,top,right-left,bottom-top);
          }
          images.push({bytes:await canvasBytes(pageCanvas),width:natural.width,height:natural.height});pageCanvas.width=0;pageCanvas.height=0;
        }
        done(ctx,await createImageOnlyPdf(ctx.PDFLib,images),'redacted');
      }finally{await exportViewer.destroy();}
    });
  };
  await load();
}

export function describeForm(PDFLib, doc) {
  return doc.getForm().getFields().map((field,index)=>{
    const common={name:field.getName(),index,readonly:field.isReadOnly()};
    if(field instanceof PDFLib.PDFTextField)return {...common,type:'text',value:field.getText()||'',multiline:field.isMultiline(),maxLength:field.getMaxLength()};
    if(field instanceof PDFLib.PDFCheckBox)return {...common,type:'checkbox',value:field.isChecked()};
    if(field instanceof PDFLib.PDFDropdown)return {...common,type:'dropdown',value:field.getSelected()[0]||'',options:field.getOptions()};
    if(field instanceof PDFLib.PDFRadioGroup)return {...common,type:'radio',value:field.getSelected()||'',options:field.getOptions()};
    return {...common,type:'unsupported'};
  });
}

export async function fillForm(PDFLib, bytes, values, makeTextImage) {
  const doc=await PDFLib.PDFDocument.load(copyBytes(bytes),{updateMetadata:false}),form=doc.getForm(),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),overlays=[];
  for(const field of form.getFields()) {
    if(field.isReadOnly()||!Object.hasOwn(values,field.getName()))continue;
    const value=values[field.getName()];
    if(field instanceof PDFLib.PDFCheckBox){value?field.check():field.uncheck();field.updateAppearances();}
    else if(field instanceof PDFLib.PDFRadioGroup){value?field.select(value):field.clear();field.updateAppearances();}
    else if(field instanceof PDFLib.PDFTextField||field instanceof PDFLib.PDFDropdown){
      const text=String(value||''),unicode=/[^\x20-\x7e\r\n\t]/.test(text);
      if(unicode&&makeTextImage){
        if(field instanceof PDFLib.PDFTextField)field.setText('');else field.clear();
        field.updateAppearances(font);
        for(const widget of field.acroField.getWidgets()){
          const page=doc.getPages().find((page)=>widget.P()?.toString()===page.ref.toString()||page.node.Annots()?.asArray().some((ref)=>doc.context.lookup(ref)===widget.dict));
          if(!page)throw new Error('Form field page unavailable');
          overlays.push({page,rect:widget.getRectangle(),text,multiline:field instanceof PDFLib.PDFTextField&&field.isMultiline()});
        }
      }else{
        if(field instanceof PDFLib.PDFTextField)field.setText(text);else{text?field.select(text):field.clear();}
        field.updateAppearances(font);
      }
    }
  }
  form.flatten({updateFieldAppearances:false});
  for(const {page,rect,text,multiline} of overlays){const image=await doc.embedPng(await makeTextImage(text,Math.max(1,rect.width-4),Math.max(1,rect.height-4),multiline));page.drawImage(image,{x:rect.x+2,y:rect.y+2,width:Math.max(1,rect.width-4),height:Math.max(1,rect.height-4)});}
  return doc.save();
}

async function formsTool(ctx) {
  const sources=ctx.getSources?.()||[];
  if(!sources.length){ctx.msg('Open an interactive PDF form first.','افتح نموذج PDF تفاعلياً أولاً.',true);return;}
  ctx.modal(ctx.t('Fill PDF form','تعبئة نموذج PDF'),`<p>${ctx.t('Choose an original PDF form. Form filling uses the complete original document, not the arranged page selection. The downloaded copy is flattened: its field values remain visible but are no longer editable. Arabic entries use visual text images.','اختر نموذج PDF أصلياً. تستخدم التعبئة المستند الأصلي كاملاً وليس ترتيب الصفحات المحدد. تُسطح النسخة المنزلة: تبقى قيم الحقول مرئية ولا تعود قابلة للتحرير. تُعرض المدخلات العربية كصور نصية.')}</p><label>${ctx.t('Source document','المستند الأصلي')}<select id="formSource">${sources.map((source,i)=>`<option value="${i}">${escapeHTML(source.name)}</option>`).join('')}</select></label><div id="formFields"></div>${buttons(ctx,'Download filled form','تنزيل النموذج المعبأ')}`);
  let bytes,descriptors=[],version=0,originalName='';
  const load=async()=>{const current=++version;$('#advancedExport').disabled=true;$('#formFields').textContent=ctx.t('Reading form fields…','جارٍ قراءة حقول النموذج…');const source=sources[Number($('#formSource').value)],sourceBytes=await source.getBytes();const doc=await ctx.PDFLib.PDFDocument.load(copyBytes(sourceBytes),{updateMetadata:false});if(current!==version)return;bytes=sourceBytes;originalName=source.name;descriptors=describeForm(ctx.PDFLib,doc);const editable=descriptors.filter((field)=>field.type!=='unsupported'&&!field.readonly);if(!editable.length){$('#formFields').textContent=ctx.t('No editable AcroForm fields found. For scanned or flat forms, use Annotate to place text and Signature to sign visually.','لم يُعثر على حقول AcroForm قابلة للتحرير. للنماذج الممسوحة أو المسطحة، استخدم التعليق لوضع النص والتوقيع لإضافة توقيع مرئي.');return;}
    $('#formFields').innerHTML=editable.map((field)=>`<label class="${field.type==='checkbox'?'advanced-check':''}">${escapeHTML(field.name)}${field.type==='checkbox'?`<input id="form-${field.index}" type="checkbox" ${field.value?'checked':''}>`:field.type==='dropdown'||field.type==='radio'?`<select id="form-${field.index}"><option value="">${ctx.t('No selection','بلا اختيار')}</option>${field.options.map((option)=>`<option value="${escapeHTML(option)}" ${option===field.value?'selected':''}>${escapeHTML(option)}</option>`).join('')}</select>`:field.multiline?`<textarea id="form-${field.index}" rows="3" ${field.maxLength?`maxlength="${field.maxLength}"`:''}>${escapeHTML(field.value)}</textarea>`:`<input id="form-${field.index}" value="${escapeHTML(field.value)}" ${field.maxLength?`maxlength="${field.maxLength}"`:''}>`}</label>`).join('')+`<p>${ctx.t('Buttons, signature fields, rich text and XFA forms are not editable here. Existing digital signatures will not be preserved after editing.','لا يمكن تعديل الأزرار وحقول التوقيع والنص المنسق ونماذج XFA هنا. لا تُحفظ التوقيعات الرقمية الموجودة بعد التحرير.')}</p>`;$('#advancedExport').disabled=false;
  };
  $('#formSource').onchange=()=>load().catch(()=>localError(ctx,'Could not read the form. XFA or unsupported fields may require a desktop editor.','تعذرت قراءة النموذج. قد تتطلب حقول XFA أو الحقول غير المدعومة محرراً مكتبياً.'));
  $('#advancedExport').onclick=()=>{const values=Object.fromEntries(descriptors.filter((field)=>field.type!=='unsupported'&&!field.readonly).map((field)=>[field.name,field.type==='checkbox'?$(`#form-${field.index}`).checked:$(`#form-${field.index}`).value]));closeDialog();ctx.task(async()=>done(ctx,await fillForm(ctx.PDFLib,bytes,values,(text,width,height,multiline)=>canvasBytes(textCanvas(text,width*3,height*3,'#182d26',multiline))),'filled',originalName));};
  await load();
}

/** Supported ids: range, metadata, scan, signature, annotate, redact, forms. */
export async function runAdvanced(id, ctx) {
  if(id==='range')return rangeTool(ctx);
  if(id==='metadata')return metadataTool(ctx);
  if(id==='scan')return scanTool(ctx);
  if(id==='forms')return formsTool(ctx);
  if(id==='signature')return prepareSignature(ctx,(image)=>visualTool(ctx,id,image).catch((error)=>{console.error(error);localError(ctx,'Could not open the signature editor.','تعذر فتح محرر التوقيع.');}));
  if(id==='annotate'||id==='redact')return visualTool(ctx,id);
  return false;
}
