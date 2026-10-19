/* Batch: run one operation on many PDFs (or a whole folder) and get one ZIP back.
   Engine operations go through the connected engine one file at a time; Colors runs in the browser. */
import {engineOperations,engineAvailable,processWithEngine} from './integrations.js';
import {outputName} from './naming.js';
const $=(s)=>document.querySelector(s);
const SKIP=new Set(['sign','validateSignature','ocrText']); // need per-document decisions or return reports, not documents
const OFFICE=/\.(docx?|odt|xlsx?|ods|pptx?|odp)$/i;
// Results are kept in memory until the ZIP is made, so a batch has a total budget.
export const BATCH_BUDGET=(typeof window!=='undefined'&&window.waraqDesktop?1536:512)*1024*1024;
/** Unique ZIP entry names: a second "report.pdf" becomes "report (2).pdf" instead of replacing the first. */
export function uniqueEntry(taken,wanted){
  if(!taken.has(wanted.toLowerCase())){taken.add(wanted.toLowerCase());return wanted;}
  const slash=wanted.lastIndexOf('/'),dot=wanted.lastIndexOf('.'),stem=dot>slash+1?wanted.slice(0,dot):wanted,ext=dot>slash+1?wanted.slice(dot):'';
  for(let n=2;;n++){const candidate=`${stem} (${n})${ext}`;if(!taken.has(candidate.toLowerCase())){taken.add(candidate.toLowerCase());return candidate;}}
}

export async function runBatch(ctx){
  const {t}=ctx;
  const ops=Object.entries(engineOperations).filter(([id])=>!SKIP.has(id)&&engineAvailable(id));
  const options=[...ops.map(([id,l])=>`<option value="${id}">${t(...l)}</option>`),`<option value="colors">${t('Background tint (Waraq green)','تلوين الخلفية (أخضر ورق)')}</option>`].join('');
  ctx.modal(t('Batch process','معالجة دفعة ملفات'),`
    <p>${t('Run one tool on many files at once. Results come back in one ZIP. Your originals are not changed.','شغّل أداة واحدة على ملفات كثيرة دفعة واحدة. تصلك النتائج في ملف ZIP واحد، ولا تتغير ملفاتك الأصلية.')}</p>
    ${ops.length?'':`<p class="engine-warn">${t('Only browser tools are available. Connect an engine (or use the desktop app) for OCR, optimize, protect and more.','الأدوات المتاحة هي أدوات المتصفح فقط. اربط محركاً (أو استخدم تطبيق سطح المكتب) لـ OCR والتحسين والحماية وغيرها.')}</p>`}
    <div class="advanced-grid">
      <label>${t('Files','الملفات')}<input id="batchFiles" type="file" multiple accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp"></label>
      <label>${t('…or a whole folder','…أو مجلداً كاملاً')}<input id="batchFolder" type="file" webkitdirectory></label>
      <label>${t('Operation','العملية')}<select id="batchOp">${options}</select></label>
      <label id="batchExtra"></label>
    </div>
    <p id="batchSummary" class="pw-muted"></p>
    <ol id="batchLog" class="batch-log"></ol>
    <div class="advanced-actions"><button class="primary" id="batchRun">${t('Start','ابدأ')}</button><button id="batchStop" hidden>${t('Stop','إيقاف')}</button></div>`);
  let files=[];
  const pick=(list)=>{files=[...list].filter((f)=>/\.pdf$/i.test(f.name)||OFFICE.test(f.name)).slice(0,500);$('#batchSummary').textContent=t(`${files.length} files selected`,`تم اختيار ${files.length} ملف`);};
  $('#batchFiles').onchange=(e)=>pick(e.target.files);$('#batchFolder').onchange=(e)=>pick(e.target.files);
  const extra=()=>{const id=$('#batchOp').value,box=$('#batchExtra');
    box.innerHTML=id==='ocr'?`${t('OCR language','لغة OCR')}<select id="batchLang"><option value="ara+eng">العربية + English</option><option value="ara">العربية</option><option value="eng">English</option></select>`
      :id==='protect'?`${t('Password for all files','كلمة مرور لجميع الملفات')}<input id="batchPassword" type="password" autocomplete="new-password">`
      :id==='unlock'?`${t('Current password','كلمة المرور الحالية')}<input id="batchPassword" type="password" autocomplete="off">`
      :id==='redactText'?`${t('Text to remove from every file','النص المراد إزالته من كل ملف')}<input id="batchText" maxlength="1000">`:'';};
  $('#batchOp').onchange=extra;extra();
  let controller=null;
  $('#batchStop').onclick=()=>controller?.abort();
  $('#batchRun').onclick=async()=>{
    const id=$('#batchOp').value,opts={};
    if(!files.length){$('#batchSummary').textContent=t('Choose files or a folder first.','اختر ملفات أو مجلداً أولاً.');return;}
    if(id==='ocr')opts.language=$('#batchLang').value;
    if(id==='protect'||id==='unlock'){opts.password=$('#batchPassword').value;if(!opts.password){$('#batchPassword').focus();return;}}
    if(id==='redactText'){opts.text=$('#batchText').value.trim();if(!opts.text){$('#batchText').focus();return;}}
    const zip=new JSZip(),log=$('#batchLog'),failures=[],renamed=[],taken=new Set();let done=0,total=0,stopped=false;
    controller=new AbortController();$('#batchRun').disabled=true;$('#batchStop').hidden=false;log.replaceChildren();
    for(const file of files){
      if(controller.signal.aborted)break;
      const li=document.createElement('li');li.textContent=file.webkitRelativePath||file.name;log.append(li);li.scrollIntoView({block:'nearest'});
      try{
        if(id!=='officeToPdf'&&!/\.pdf$/i.test(file.name))throw Error(t('Not a PDF','ليس ملف PDF'));
        if(id==='officeToPdf'&&!OFFICE.test(file.name))throw Error(t('Not an Office file','ليس ملف أوفيس'));
        if(file.size>50*1024*1024)throw Error(t('Over 50 MB','أكبر من 50 ميجابايت'));
        const bytes=new Uint8Array(await file.arrayBuffer());let out,name;
        if(id==='colors'){const {applyColorEffect}=await import('./color-tools.js');out=await applyColorEffect(ctx.PDFLib,bytes,{colors:['#0f766e','#a7f3d0'],effect:'tint',opacity:.35});name=outputName(file.name,'colors');}
        else{const r=await processWithEngine(id,bytes,file.name,opts,controller.signal);out=r.bytes;name=r.filename;}
        if(total+out.length>BATCH_BUDGET){stopped=true;failures.push(t('Stopped: the results reached the batch size limit. Process the remaining files in another batch.','توقفت المعالجة: بلغت النتائج حد حجم الدفعة. عالج الملفات المتبقية في دفعة أخرى.'));li.className='fail';li.textContent+=' — '+t('not processed (size limit)','لم يُعالج (حد الحجم)');break;}
        const folder=(file.webkitRelativePath||'').split('/').slice(1,-1).join('/'),wanted=(folder?folder+'/':'')+name,entry=uniqueEntry(taken,wanted);
        if(entry!==wanted)renamed.push(wanted+' → '+entry);
        zip.file(entry,out);total+=out.length;done++;li.className='ok';li.textContent+=' ✓'+(entry!==wanted?' ('+entry.split('/').pop()+')':'');
      }catch(e){if(e.name==='AbortError')break;failures.push((file.webkitRelativePath||file.name)+': '+e.message);li.className='fail';li.textContent+=' — '+e.message;}
      $('#batchSummary').textContent=t(`${done} done, ${failures.length} failed, ${files.length} total`,`اكتمل ${done}، تعذّر ${failures.length}، المجموع ${files.length}`);
    }
    $('#batchRun').disabled=false;$('#batchStop').hidden=true;
    const report=[...failures,...(renamed.length?['',t('Renamed to avoid duplicate names:','أعيدت تسميتها لتجنب تكرار الأسماء:'),...renamed]:[])];
    if(report.length)zip.file(uniqueEntry(taken,'_report.txt'),'﻿'+report.join('\n'));
    if(stopped)$('#batchSummary').textContent+=' — '+t('stopped at the size limit','توقف عند حد الحجم');
    if(done)ctx.download(await zip.generateAsync({type:'uint8array'}),`${ctx.filename()||'pwaraq'}-batch-${id}.zip`,'application/zip');
  };
}
