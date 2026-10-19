import {parsePageRanges} from './advanced.js';

// Every engine, worker and language asset is served by this installation.
const assets = new URL('./vendor/ocr/',import.meta.url);
const MAX_PAGES = 20;
const MAX_PIXELS = 6000000;
let enginePromise;

function loadEngine() {
  if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = new URL('tesseract.min.js',assets).href;
    script.async = true;
    const timeout = setTimeout(() => finish(new Error('OCR engine loading timed out')),60000);
    const finish = (error) => {
      clearTimeout(timeout); script.onload = null; script.onerror = null;
      if (error) { script.remove(); enginePromise = undefined; reject(error); }
      else resolve(globalThis.Tesseract);
    };
    script.onload = () => finish(globalThis.Tesseract?.createWorker ? null : new Error('OCR engine unavailable'));
    script.onerror = () => finish(new Error('Could not load the local OCR engine'));
    document.head.append(script);
  });
  return enginePromise;
}

export function ocrRenderScale(width,height,quality = 2.5) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) throw new Error('Invalid PDF page dimensions');
  return Math.min(quality,Math.sqrt(MAX_PIXELS/(width*height)),3600/Math.max(width,height));
}

function abortError() { return new DOMException('OCR cancelled','AbortError'); }

/** Lays Tesseract's invisible text-only pages over the original pages (any page rotation), keeping the originals. */
export async function searchablePdf(PDFLib,bytes,layers){
  const doc=await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});
  for(const {number,pdf} of layers){
    const page=doc.getPage(number-1),[layer]=await doc.embedPdf(pdf,[0]);
    const box=page.getCropBox(),rot=((page.getRotation().angle%360)+360)%360;
    // The OCR image was drawn as the page is shown (rotated); turn the layer back into the page's own coordinates.
    const shown=rot%180?{width:box.height,height:box.width}:{width:box.width,height:box.height};
    const at={0:[box.x,box.y],90:[box.x+box.width,box.y],180:[box.x+box.width,box.y+box.height],270:[box.x,box.y+box.height]}[rot]||[box.x,box.y];
    page.drawPage(layer,{x:at[0],y:at[1],width:shown.width,height:shown.height,rotate:PDFLib.degrees(rot)});
  }
  return doc.save();
}

/** Browser OCR. Makes the PDF searchable (invisible text layer) or exports editable UTF-8 TXT. */
export async function runOCR(ctx) {
  const bytes = new Uint8Array(await ctx.getBytes()).slice();
  const loadingTask = ctx.pdfjsLib.getDocument({data:bytes,isEvalSupported:false});
  const viewer = await loadingTask.promise;
  const firstRange = viewer.numPages > MAX_PAGES ? `1-${MAX_PAGES}` : `1-${viewer.numPages}`;
  const defaultLanguage = ctx.t('eng','ara');
  ctx.modal(ctx.t('Recognize text on your device','التعرف على النص على جهازك'),`<div class="advanced-editor"><p class="advanced-note">${ctx.t('Read scanned pages in Arabic, English, or both. Processing stays on this device. The OCR engine and language files load from this installation; prepare offline access before disconnecting.','اقرأ الصفحات الممسوحة بالعربية أو الإنجليزية أو كلتيهما. تتم المعالجة على جهازك. يُحمّل المحرك وملفات اللغة من هذا التثبيت؛ جهّز الوصول دون اتصال قبل قطع الإنترنت.')}</p><div class="advanced-grid"><label>${ctx.t('Document language','لغة المستند')}<select id="ocrLanguage"><option value="eng" ${defaultLanguage==='eng'?'selected':''}>English</option><option value="ara" ${defaultLanguage==='ara'?'selected':''}>العربية</option><option value="eng+ara">${ctx.t('Arabic and English','العربية والإنجليزية')}</option></select></label><label>${ctx.t('Pages from the current selection','صفحات من التحديد الحالي')}<input id="ocrRange" dir="ltr" value="${firstRange}" maxlength="300"></label><label>${ctx.t('Quality','الجودة')}<select id="ocrQuality"><option value="2.5">${ctx.t('Balanced','متوازنة')}</option><option value="3.5">${ctx.t('Detailed (slower)','دقيقة (أبطأ)')}</option><option value="1.5">${ctx.t('Quick draft','مسودة سريعة')}</option></select></label></div><p class="advanced-note">${ctx.t(`${viewer.numPages} pages available. Process up to ${MAX_PAGES} pages at a time; each page is rendered separately to limit memory use. OCR can misread text, so review the result.`,`${viewer.numPages} صفحة متاحة. عالج حتى ${MAX_PAGES} صفحة في المرة؛ تُعرض كل صفحة منفردة لتقليل استهلاك الذاكرة. قد يخطئ التعرف على النص، لذا راجع الناتج.`)}</p><div class="advanced-toolbar"><button id="ocrStart" class="primary">${ctx.t('Recognize text','التعرف على النص')}</button><button id="ocrCancel" disabled>${ctx.t('Cancel processing','إلغاء المعالجة')}</button></div><p id="ocrStatus" role="status" aria-live="polite"></p><progress id="ocrProgress" max="100" value="0" style="width:100%" aria-label="${ctx.t('OCR progress','تقدم التعرف على النص')}"></progress><p id="ocrError" class="advanced-error" role="alert"></p><label>${ctx.t('Review and edit the recognized text','راجع النص المستخرج وعدّله')}<textarea id="ocrText" rows="12" dir="auto" spellcheck="false" style="min-height:220px;unicode-bidi:plaintext" placeholder="${ctx.t('Recognized text appears here.','يظهر النص المستخرج هنا.')}"></textarea></label><div class="advanced-toolbar"><button id="ocrPdf" class="primary" disabled>${ctx.t('Make searchable PDF','إنشاء PDF قابل للبحث')}</button><button type="button" id="ocrDownload" disabled>${ctx.t('Download text (.txt)','تنزيل النص (.txt)')}</button><button id="ocrClear" disabled>${ctx.t('Clear result','مسح الناتج')}</button></div><p class="advanced-note">${ctx.t('This tool produces editable text. Use Searchable PDF through a connected processing server to preserve page images with an OCR text layer.','تُنتج هذه الأداة نصاً قابلاً للتحرير. استخدم PDF قابل للبحث عبر خادم المعالجة المتصل للاحتفاظ بصور الصفحات مع طبقة نص OCR.')}</p></div>`);

  const dialog=document.querySelector('#dialog');
  const ui=Object.fromEntries(['Language','Range','Quality','Start','Cancel','Status','Progress','Error','Text','Download','Clear','Pdf'].map((key)=>[key,document.querySelector(`#ocr${key}`)]));
  let closed=false,run=null,pendingInitialization=0,layers=[];
  const controls=()=>{
    if(closed)return;
    const busy=!!run;
    ui.Start.disabled=busy||pendingInitialization>0;
    ui.Cancel.disabled=!busy;
    ui.Language.disabled=ui.Range.disabled=ui.Quality.disabled=busy;
    ui.Text.readOnly=busy;
    ui.Download.disabled=busy||!ui.Text.value.trim();
    ui.Pdf.disabled=busy||!layers.some((l)=>l.pdf);
    ui.Clear.disabled=busy||!ui.Text.value;
  };
  const terminate=(job)=>{const worker=job.worker;job.worker=null;if(worker)return Promise.resolve(worker.terminate()).catch(()=>{});return Promise.resolve();};
  const stop=()=>{
    if(!run)return;
    run.cancelled=true;run.abort();
    run.renderTask?.cancel();
    void terminate(run);
  };
  dialog.addEventListener('close',()=>{
    closed=true;stop();
    // Destroying the PDF worker also cancels any in-flight page rendering.
    Promise.resolve(viewer.destroy()).catch(()=>{});
  },{once:true});
  ui.Cancel.onclick=stop;
  ui.Text.oninput=controls;
  ui.Clear.onclick=()=>{layers=[];ui.Text.value='';ui.Status.textContent='';ui.Error.textContent='';ui.Progress.value=0;controls();};
  ui.Download.onclick=()=>{
    if(!ui.Text.value.trim())return;
    ctx.download('\uFEFF'+ui.Text.value,`${ctx.filename()}-ocr.txt`,'text/plain;charset=utf-8');
    ctx.msg('OCR text downloaded. Review it for recognition errors.','تم تنزيل النص. راجعه للتحقق من أخطاء التعرف.');
  };

  // Searchable PDF: the original pages stay exactly as they are; each OCR'd page gets an invisible text layer.
  ui.Pdf.onclick=()=>{
    if(run||!layers.length)return;
    const work=async()=>{
      ui.Pdf.disabled=true;ui.Status.textContent=ctx.t('Adding the text layer to the PDF…','جارٍ إضافة طبقة النص إلى ملف PDF…');
      try{
        const bytes=await searchablePdf(ctx.PDFLib,new Uint8Array(await ctx.getBytes()),layers);
        await ctx.download(bytes,`${ctx.filename()}-searchable.pdf`,'application/pdf');
        ui.Status.textContent=ctx.t(`Done: ${layers.length} pages are now searchable (Ctrl+F finds their text).`,`تم: أصبحت ${layers.length} صفحة قابلة للبحث (Ctrl+F يجد نصها).`);
      }catch(error){console.error('Searchable PDF failed',error);ui.Error.textContent=ctx.t('The text layer could not be added to this PDF.','تعذر إضافة طبقة النص إلى هذا الملف.');}
      finally{controls();}
    };
    if(ctx.task)void ctx.task(work);else void work();
  };

  const process=async(indices,language,quality)=>{
    const job={cancelled:false,worker:null,renderTask:null,page:0,pageIndex:0,canvas:null};layers=[];
    run=job;controls();ui.Error.textContent='';ui.Text.value='';ui.Progress.removeAttribute('value');
    ui.Text.dir=language==='ara'?'rtl':language==='eng'?'ltr':'auto';
    const cancelled=new Promise((_,reject)=>{job.abort=()=>reject(abortError());});
    const failed=new Promise((_,reject)=>{job.fail=(error)=>reject(error instanceof Error?error:new Error(String(error)));});
    // Terminating Tesseract does not reject outstanding recognize promises.
    // Race every operation against these signals so Cancel always releases the UI.
    cancelled.catch(()=>{});failed.catch(()=>{});
    const wait=(promise)=>Promise.race([promise,cancelled,failed]);
    const progress=(message)=>{
      if(closed||job.cancelled||run!==job)return;
      const status=String(message.status||'');
      if(status==='recognizing text'){
        const ratio=Math.max(0,Math.min(1,Number(message.progress)||0));
        ui.Progress.value=(job.pageIndex+ratio)/indices.length*100;
        ui.Status.textContent=ctx.t(`Recognizing page ${job.page} (${job.pageIndex+1} / ${indices.length}) — ${Math.round(ratio*100)}%`,`جارٍ قراءة الصفحة ${job.page} (${job.pageIndex+1} / ${indices.length}) — ${Math.round(ratio*100)}٪`);
      }else{
        const labels={
          'loading tesseract core':['Loading the local OCR engine…','جارٍ تحميل محرك OCR المحلي…'],
          'initializing tesseract':['Preparing the OCR engine…','جارٍ تجهيز محرك OCR…'],
          'loading language traineddata':['Loading language data…','جارٍ تحميل بيانات اللغة…'],
          'initializing api':['Preparing language recognition…','جارٍ تجهيز التعرف على اللغة…']
        };
        if(labels[status])ui.Status.textContent=ctx.t(...labels[status]);
      }
    };
    try{
      ui.Status.textContent=ctx.t('Loading the local OCR engine…','جارٍ تحميل محرك OCR المحلي…');
      const engine=await wait(loadEngine());
      if(job.cancelled||closed)throw abortError();
      pendingInitialization++;
      // createWorker resolves only after initialization. If cancelled during this
      // stage, terminate its handle immediately when it becomes available.
      const workerPromise=engine.createWorker(language,1,{
        workerPath:new URL('worker.min.js',assets).href,
        corePath:assets.href.replace(/\/$/,''),
        langPath:assets.href.replace(/\/$/,''),
        cachePath:'waraq-ocr-v6',cacheMethod:'write',gzip:true,workerBlobURL:false,
        logger:progress,errorHandler:job.fail
      });
      workerPromise.then(async(worker)=>{
        if(job.cancelled||closed)await worker.terminate();else job.worker=worker;
      }).catch(()=>{}).finally(()=>{pendingInitialization--;controls();if(!closed&&job.cancelled&&!run)ui.Status.textContent=ctx.t('Processing cancelled. Any completed pages are kept below.','أُلغيت المعالجة. تبقى نتائج الصفحات المكتملة أدناه.');});
      job.worker=await wait(workerPromise);
      await wait(job.worker.setParameters({tessedit_pageseg_mode:3,preserve_interword_spaces:'1'}));
      const results=[];
      for(let index=0;index<indices.length;index++){
        if(job.cancelled||closed)throw abortError();
        const number=indices[index]+1;job.page=number;job.pageIndex=index;
        ui.Status.textContent=ctx.t(`Preparing page ${number} (${index+1} / ${indices.length})…`,`جارٍ تجهيز الصفحة ${number} (${index+1} / ${indices.length})…`);
        ui.Progress.value=index/indices.length*100;
        const page=await wait(viewer.getPage(number)),natural=page.getViewport({scale:1});
        const scale=ocrRenderScale(natural.width,natural.height,quality),viewport=page.getViewport({scale});
        const canvas=document.createElement('canvas');job.canvas=canvas;canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
        await wait(job.renderTask.promise);job.renderTask=null;
        await wait(job.worker.setParameters({user_defined_dpi:String(Math.max(70,Math.round(scale*72)))}));
        // Besides the text, Tesseract returns an invisible text-only PDF page that is laid over the original page.
        const result=await wait(job.worker.recognize(canvas,{pdfTitle:'Waraq OCR',pdfTextOnly:true},{text:true,pdf:true}));
        if(job.cancelled||closed)throw abortError();
        const text=String(result.data?.text||'').trim();
        results.push({number,text});if(result.data?.pdf&&text)layers.push({number,pdf:new Uint8Array(result.data.pdf)});
        ui.Text.value=results.map(({number,text})=>`${ctx.t('Page','الصفحة')} ${number}\n${text}`).join('\n\n');
        ui.Progress.value=(index+1)/indices.length*100;
        canvas.width=0;canvas.height=0;job.canvas=null;page.cleanup();
      }
      const nonempty=results.some(({text})=>text.trim());
      ui.Status.textContent=nonempty?ctx.t(`Finished ${results.length} pages. Make a searchable PDF (the text is hidden under each page, so you can search, select and copy it), or download the text.`,`اكتملت ${results.length} صفحة. أنشئ PDF قابلاً للبحث (يُخفى النص تحت كل صفحة لتتمكن من البحث فيه وتحديده ونسخه)، أو نزّل النص.`):ctx.t('No text was recognized. Try a higher quality setting or check the document language.','لم يُتعرف على نص. جرّب جودة أعلى أو تحقق من لغة المستند.');
      if(!nonempty)ui.Text.value='';
    }catch(error){
      if(!closed){
        if(job.cancelled||error?.name==='AbortError')ui.Status.textContent=pendingInitialization?ctx.t('Cancelled. Finishing engine preparation before another run…','أُلغيت المعالجة. يكتمل تجهيز المحرك قبل التشغيل التالي…'):ctx.t('Processing cancelled. Any completed pages are kept below.','أُلغيت المعالجة. تبقى نتائج الصفحات المكتملة أدناه.');
        else{
          console.error('Local OCR failed',error);
          ui.Error.textContent=ctx.t('OCR could not finish. The local engine or language files may be unavailable, or this device may be low on memory. Prepare offline access while connected and try fewer pages. Completed text is kept below.','تعذر إكمال OCR. قد تكون ملفات المحرك أو اللغة غير متاحة، أو ذاكرة الجهاز غير كافية. جهّز الوصول دون اتصال أثناء الاتصال وجرّب صفحات أقل. تبقى النتائج المكتملة أدناه.');
          ui.Status.textContent=ctx.t('OCR stopped.','توقف التعرف على النص.');
        }
      }
    }finally{
      job.renderTask?.cancel();
      if(job.canvas){job.canvas.width=0;job.canvas.height=0;}
      await terminate(job);
      if(run===job)run=null;
      controls();
    }
  };

  ui.Start.onclick=()=>{
    if(run||pendingInitialization||closed)return;
    let indices;
    try{indices=parsePageRanges(ui.Range.value,viewer.numPages);if(indices.length>MAX_PAGES)throw new Error('Too many pages');}
    catch{ui.Error.textContent=ctx.t(`Enter valid page numbers from 1 to ${viewer.numPages}, up to ${MAX_PAGES} pages per run.`,`أدخل أرقام صفحات صحيحة من ١ إلى ${viewer.numPages}، حتى ${MAX_PAGES} صفحة في المرة.`);return;}
    const language=ui.Language.value,quality=Number(ui.Quality.value);
    if(ctx.task)void ctx.task(()=>process(indices,language,quality));else void process(indices,language,quality);
  };
  controls();
}
