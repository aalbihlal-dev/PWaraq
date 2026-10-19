/* Two interfaces for one open document:
   - View: a reader with continuous pages, selectable text, find, zoom, thumbnails, read and night modes, print.
   - Edit: the existing studio. Tool results are applied back to the open document (with undo) so tools chain.
   The default interface for newly opened PDFs is a preference. Ideas taken (lightly) from PDFCraft: a distraction-free
   read mode, find-as-you-type with step-through matches, and a Ctrl+K command search over all tools. */
const $=(s)=>document.querySelector(s);
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v;}catch{return d;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Search ignores Arabic diacritics/tatweel and presentation forms so "مستند" also finds "مُستنَد".
export const normalizeSearch=(s)=>String(s).normalize('NFKC').replace(/[ً-ٰٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();

/** Debounced recovery saves. Every schedule or cancel bumps a generation number; a save writes only if its
    generation is still current and recovery is still enabled, checked again after the slow serialization and after
    the write (a write that finishes after recovery was turned off is removed). Timers and storage are injectable. */
export function createRecoveryScheduler({store,isEnabled,getPageCount,output,name,delay=2500,maxBytes=60*1024*1024,maxPages=1000,onStatus=()=>{},timers={set:(fn,ms)=>setTimeout(fn,ms),clear:(id)=>clearTimeout(id)},now=Date.now}){
  let timer=null,generation=0,hadDocument=false;
  const stop=()=>{if(timer!==null)timers.clear(timer);timer=null;};
  return{
    cancel(){stop();generation++;return store.clear();},
    schedule(){
      stop();const mine=++generation;
      if(!isEnabled())return;
      if(!getPageCount()){if(hadDocument)store.clear();return;}
      hadDocument=true;
      // Past the limits an older copy must not stay behind to be restored by mistake: clear it and say so.
      if(getPageCount()>maxPages){store.clear();onStatus('too-large');return;}
      const current=()=>mine===generation&&isEnabled()&&getPageCount()>0;
      timer=timers.set(async()=>{
        timer=null;if(!current())return;
        try{
          const bytes=await output();
          if(!current())return;
          if(bytes.length>maxBytes){await store.clear();onStatus('too-large');return;}
          await store.save({name:name(),bytes,savedAt:now(),pages:getPageCount()});
          if(!isEnabled()){await store.clear();return;}
          if(current())onStatus('saved');
        }catch{if(current())onStatus('failed');}
      },delay);
    }
  };
}

export function setupWorkspacePlus(api){
  const {t}=api;
  const settings={
    get mode(){return store.get('pwaraq-default-mode','view')==='edit'?'edit':'view';},set mode(v){store.set('pwaraq-default-mode',v);},
    get apply(){return store.get('pwaraq-apply-results','1')==='1';},set apply(v){store.set('pwaraq-apply-results',v?'1':'0');},
    get recovery(){return store.get('pwaraq-recovery','1')==='1';},set recovery(v){store.set('pwaraq-recovery',v?'1':'0');if(!v)cancelRecovery();}
  };
  let mode='edit',lastInput=null,appliedAt=0,lastDelivery='',viewer=null,viewerDirty=true;

  // ---------- chrome: mode switch + preferences ----------
  const bar=document.createElement('div');bar.className='pw-mode';bar.hidden=true;
  bar.innerHTML=`<div class="pw-seg" role="group"><button type="button" data-mode="view"></button><button type="button" data-mode="edit"></button></div><button type="button" class="pw-icon" id="pwPrefs"></button>`;
  $('.header-actions')?.prepend(bar);
  const fileBar=document.createElement('div');fileBar.className='pw-file';fileBar.hidden=true;
  fileBar.innerHTML='<button type="button" class="pw-file-btn" data-f="open"></button><button type="button" class="pw-file-btn" data-f="close"></button>';
  bar.before(fileBar);
  fileBar.querySelector('[data-f="open"]').onclick=()=>api.openFile();
  fileBar.querySelector('[data-f="close"]').onclick=()=>api.closeFile();
  document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='o'){e.preventDefault();api.openFile();}
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='s'&&api.getPages().length){e.preventDefault();$('#export')?.click();}});
  window.waraqDesktop?.onMenu?.((action)=>action==='open'?api.openFile():api.closeFile());
  bar.querySelectorAll('[data-mode]').forEach((b)=>b.onclick=()=>setMode(b.dataset.mode));
  $('#pwPrefs').onclick=openPreferences;

  // ---------- side panel: full, or a slim rail of icons (button or Ctrl+B; remembered) ----------
  const side=$('.sidebar'),sideBtn=document.createElement('button');sideBtn.type='button';sideBtn.className='side-toggle';
  side?.prepend(sideBtn);
  function labelSide(){
    const rail=document.body.classList.contains('side-rail');
    sideBtn.innerHTML=api.icon((rail!==(document.dir==='rtl'))?'arrow-right':'arrow-left');
    sideBtn.title=sideBtn.ariaLabel=rail?t('Expand the side panel (Ctrl+B)','توسيع اللوحة الجانبية (Ctrl+B)'):t('Collapse the side panel (Ctrl+B)','طي اللوحة الجانبية (Ctrl+B)');
    sideBtn.setAttribute('aria-expanded',String(!rail));
    side?.querySelectorAll('.nav,.offline-button').forEach((b)=>{if(rail)b.title=b.textContent.trim();else b.removeAttribute('title');});
  }
  const sideKey=()=>'pwaraq-side-'+(document.body.classList.contains('pw-view')?'view':'edit');
  function applySide(){document.body.classList.toggle('side-rail',store.get(sideKey(),document.body.classList.contains('pw-view')?'rail':'full')==='rail');labelSide();}
  function toggleSide(){store.set(sideKey(),document.body.classList.contains('side-rail')?'full':'rail');applySide();}
  sideBtn.onclick=toggleSide;applySide();
  $('#language')?.addEventListener('click',()=>setTimeout(labelSide));
  document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='b'&&!e.target.closest?.('input,textarea,[contenteditable="true"]')){e.preventDefault();toggleSide();}});

  const section=document.createElement('section');section.id='viewer';section.hidden=true;
  $('main')?.prepend(section);

  // Apply-in-place toggle lives in the editor toolbar so its effect is visible where tools are used.
  const applyRow=document.createElement('label');applyRow.className='pw-apply';
  applyRow.innerHTML=`<input type="checkbox" id="pwApply"><span></span>`;
  const recoveryLine=document.createElement('p');recoveryLine.className='pw-recovery-status';recoveryLine.setAttribute('role','status');recoveryLine.hidden=true;
  queueMicrotask(()=>applyRow.after(recoveryLine)); // applyRow is placed in the toolbar just below
  function showRecoveryStatus(state){
    const time=new Date().toLocaleTimeString(document.documentElement.lang==='ar'?'ar':'en',{hour:'2-digit',minute:'2-digit'});
    recoveryLine.hidden=false;recoveryLine.dataset.state=state;
    recoveryLine.textContent=state==='saved'?t(`Recovery copy saved on this device at ${time}.`,`حُفظت نسخة الاسترداد على هذا الجهاز الساعة ${time}.`)
      :state==='too-large'?t('This document is too large for a recovery copy. Download it to keep your changes.','هذا المستند أكبر من أن تُحفظ له نسخة استرداد. نزّله للاحتفاظ بتغييراتك.')
      :t('The recovery copy could not be saved (storage may be full). Download the document to keep your changes.','تعذر حفظ نسخة الاسترداد (قد تكون المساحة ممتلئة). نزّل المستند للاحتفاظ بتغييراتك.');
  }
  $('#work .work-toolbar')?.after(applyRow);
  $('#pwApply').checked=settings.apply;$('#pwApply').onchange=(e)=>{settings.apply=e.target.checked;translate();};

  function translate(){
    bar.querySelector('[data-mode="view"]').innerHTML=api.icon('search')+'<span>'+t('View','عرض')+'</span>';
    bar.querySelector('[data-mode="edit"]').innerHTML=api.icon('annotate')+'<span>'+t('Edit','تحرير')+'</span>';
    // Labels are hidden on phones, so the buttons need their own accessible names.
    bar.querySelector('[data-mode="view"]').setAttribute('aria-label',t('View the document','عرض المستند'));
    bar.querySelector('[data-mode="edit"]').setAttribute('aria-label',t('Edit the document','تحرير المستند'));
    $('#pwPrefs').innerHTML=api.icon('settings');$('#pwPrefs').title=$('#pwPrefs').ariaLabel=t('Preferences','التفضيلات');
    bar.querySelector('.pw-seg').ariaLabel=t('Interface','الواجهة');
    const fo=fileBar.querySelector('[data-f="open"]'),fc=fileBar.querySelector('[data-f="close"]');
    fo.innerHTML=api.icon('upload')+'<span>'+t('Open','فتح')+'</span>';fo.title=t('Open another file (Ctrl+O)','فتح ملف آخر (Ctrl+O)');
    fc.innerHTML=api.icon('close')+'<span>'+t('Close','إغلاق')+'</span>';fc.title=t('Close this file and go to the start page'+(window.waraqDesktop?' (Ctrl+W)':''),'إغلاق هذا الملف والعودة إلى صفحة البداية'+(window.waraqDesktop?' (Ctrl+W)':''));
    applyRow.querySelector('span').textContent=settings.apply?t('Tools change this document (undo available). Download when you are done.','الأدوات تعدّل هذا المستند (يمكن التراجع). نزّله عند الانتهاء.'):t('Tools download a new file each time.','كل أداة تنزّل ملفاً جديداً.');
    if(viewer)viewer.translate();
  }
  function openPreferences(){
    api.modal(t('Preferences','التفضيلات'),`
      <fieldset class="pw-choice"><legend>${t('When I open a PDF, show','عند فتح ملف PDF، اعرض')}</legend>
        <label><input type="radio" name="pwDefault" value="view"> <b>${t('Preview','المعاينة')}</b> — ${t('read, search and print','قراءة وبحث وطباعة')}</label>
        <label><input type="radio" name="pwDefault" value="edit"> <b>${t('Editor','المحرر')}</b> — ${t('pages and tools','الصفحات والأدوات')}</label>
      </fieldset>
      <label class="pw-check"><input type="checkbox" id="pwRecoveryPref"> ${t('Keep a recovery copy of the open document on this device, in case the window closes unexpectedly','احتفظ بنسخة استرداد من المستند المفتوح على هذا الجهاز، تحسباً لإغلاق النافذة فجأة')}</label>
      <label class="pw-check"><input type="checkbox" id="pwApplyPref"> ${t('Apply tool results to the open document so tools can be chained (recommended)','طبّق نتائج الأدوات على المستند المفتوح لتتمكن من تتابعها (موصى به)')}</label>
      <p class="pw-muted">${t('You can switch between View and Edit at any time from the top bar. Shortcut: Ctrl+K searches all tools.','يمكنك التبديل بين العرض والتحرير في أي وقت من الشريط العلوي. اختصار: Ctrl+K للبحث في كل الأدوات.')}</p>
      ${window.waraqDesktop?.packs?`<p><button type="button" class="qb-btn" id="pwPacks">${api.icon('download')}<span>${t('Add-on packs (Office & CAD, OCR)','الحزم الإضافية (أوفيس و CAD، OCR)')}</span></button></p>`:''}
      <p><button type="button" class="qb-btn" id="pwShortcuts">${api.icon('settings')}<span>${t('My shortcuts — assign keys to any tool','اختصاراتي — عيّن مفاتيح لأي أداة')}</span></button></p>
      <button class="primary" id="pwSavePrefs">${t('Save','حفظ')}</button>`);
    document.querySelector(`[name="pwDefault"][value="${settings.mode}"]`).checked=true;$('#pwApplyPref').checked=settings.apply;$('#pwRecoveryPref').checked=settings.recovery;
    $('#pwShortcuts').onclick=()=>api.openShortcuts?.();
    if($('#pwPacks'))$('#pwPacks').onclick=()=>import('./packs-ui.js').then((m)=>m.openPacks({t,modal:api.modal}));
    $('#pwSavePrefs').onclick=()=>{settings.mode=document.querySelector('[name="pwDefault"]:checked').value;settings.apply=$('#pwApplyPref').checked;settings.recovery=$('#pwRecoveryPref').checked;$('#pwApply').checked=settings.apply;$('#dialog').close();translate();api.msg('Preferences saved.','تم حفظ التفضيلات.');};
  }
  function setMode(next){
    if(!api.getPages().length)next='edit';
    mode=next;document.body.classList.toggle('pw-view',mode==='view');section.hidden=mode!=='view';applySide();fileBar.hidden=!api.getPages().length;
    bar.querySelectorAll('[data-mode]').forEach((b)=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
    if(mode==='view'){if(!viewer)viewer=createViewer();viewer.show(viewerDirty);viewerDirty=false;window.scrollTo({top:0});}
    else{viewer?.exitRead();}
  }

  // ---------- apply results to the open document ----------
  async function deliver(bytes,fileName,type){
    const input=lastInput;lastInput=null;
    if(type!=='application/pdf'||!settings.apply||!input||!api.getPages().length){lastDelivery='downloaded';return api.download(bytes,fileName,type);}
    // Decided synchronously: tools print "your file is ready" right after handing over the bytes.
    lastDelivery='applying';appliedAt=Date.now();
    const fallback=(en,ar)=>{lastDelivery='downloaded';api.download(bytes,fileName,type);api.msg(en,ar);};
    let doc;try{doc=await api.PDFLib.PDFDocument.load(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),{updateMetadata:false});}catch{return fallback('The result was downloaded as a new file.','نُزّلت النتيجة كملف جديد.');}
    const pages=api.getPages(),count=doc.getPageCount();
    const whole=input.all&&input.ids.length===pages.length;
    if(!whole&&count!==input.ids.length)return fallback('The result has a different number of pages than your selection, so it was downloaded as a new file.','عدد صفحات النتيجة يختلف عن الصفحات المحددة، لذا نُزّلت كملف جديد.');
    const fresh=await api.pagesFromBytes(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),fileName,doc);
    let next;if(whole)next=fresh;else{const map=new Map(input.ids.map((id,i)=>[id,fresh[i]]));next=pages.map((p)=>map.get(p.id)||p);}
    api.snapshot();api.setPages(next);api.clearSelection();viewerDirty=true;api.render();
    appliedAt=Date.now();lastDelivery='applied';
    api.msg('Applied to your document. Undo is available; download when you are ready.','طُبّق على مستندك. يمكنك التراجع، ونزّل الملف عندما تكون جاهزاً.');
  }
  // Tools announce "your file is ready/downloaded" after delivering; that text is wrong once the result was applied.
  function filterMessage(en,ar,error){return error||!((lastDelivery==='applying'||lastDelivery==='applied')&&Date.now()-appliedAt<6000);}

  // ---------- autosave and recovery (IndexedDB, this device only) ----------
  const recovery={
    db:null,
    open(){return this.db||(this.db=new Promise((resolve,reject)=>{const r=indexedDB.open('pwaraq',1);r.onupgradeneeded=()=>r.result.createObjectStore('recovery');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));},
    async run(mode,fn){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('recovery',mode),req=fn(tx.objectStore('recovery'));tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error);});},
    save(record){return this.run('readwrite',(s)=>s.put(record,'last'));}, // failures (e.g. storage full) reach the scheduler
    load(){return this.run('readonly',(s)=>s.get('last')).catch(()=>null);},
    clear(){return this.run('readwrite',(s)=>s.delete('last')).catch(()=>{});}
  };
  const scheduler=createRecoveryScheduler({store:recovery,onStatus:showRecoveryStatus,isEnabled:()=>settings.recovery,getPageCount:()=>api.getPages().length,output:()=>api.output(),name:()=>api.name()});
  const scheduleRecovery=()=>scheduler.schedule(),cancelRecovery=()=>scheduler.cancel();
  async function offerRecovery(){
    if(!settings.recovery||api.getPages().length)return;
    const r=await recovery.load();if(!r?.bytes||api.getPages().length)return;
    const when=new Date(r.savedAt).toLocaleString(document.documentElement.lang==='ar'?'ar':'en');
    const banner=document.createElement('div');banner.className='pw-recover';banner.setAttribute('role','status');
    banner.innerHTML=`<span>${api.icon('undo')}</span><p>${t('Continue where you left off?','هل تريد المتابعة من حيث توقفت؟')} <b>${esc(r.name)}</b> · ${t(r.pages+' pages','صفحات: '+r.pages)} · ${esc(when)}</p><button class="primary" type="button">${t('Restore','استرداد')}</button><button type="button">${t('Dismiss','تجاهل')}</button>`;
    const [restore,dismiss]=banner.querySelectorAll('button');
    restore.onclick=async()=>{banner.remove();await api.loadFiles([new File([r.bytes],r.name.replace(/\.pdf$/i,'')+'.pdf',{type:'application/pdf'})]);};
    dismiss.onclick=()=>{banner.remove();recovery.clear();};
    $('#studio')?.prepend(banner);
  }

  // ---------- Ctrl+K command search (all tools, both languages) ----------
  function openCommands(){
    const tools=api.tools();
    api.modal(t('Find a tool','ابحث عن أداة'),`<input id="pwCmd" class="pw-cmd" autocomplete="off" placeholder="${t('Type a tool name…','اكتب اسم أداة…')}"><ul id="pwCmdList" class="pw-cmd-list" role="listbox"></ul>`);
    const input=$('#pwCmd'),list=$('#pwCmdList');let items=[],index=0;
    const draw=()=>{const q=normalizeSearch(input.value.trim());items=tools.filter((x)=>!q||normalizeSearch(x.en+' '+x.ar+' '+x.id).includes(q)).slice(0,12);index=Math.min(index,Math.max(items.length-1,0));
      list.innerHTML=items.map((x,i)=>`<li role="option" data-i="${i}" aria-selected="${i===index}">${api.icon(x.id)}<span>${esc(t(x.en,x.ar))}</span>${x.engine?`<small>${t('engine','محرك')}</small>`:''}</li>`).join('')||`<li class="pw-muted">${t('No tools match.','لا توجد أدوات مطابقة.')}</li>`;
      list.querySelectorAll('[data-i]').forEach((li)=>li.onclick=()=>run(items[Number(li.dataset.i)]));};
    const run=(x)=>{if(!x)return;$('#dialog').close();setMode('edit');api.openTool(x.id);};
    input.oninput=()=>{index=0;draw();};
    input.onkeydown=(e)=>{if(e.key==='ArrowDown'){index=Math.min(index+1,items.length-1);draw();e.preventDefault();}else if(e.key==='ArrowUp'){index=Math.max(index-1,0);draw();e.preventDefault();}else if(e.key==='Enter'){run(items[index]);e.preventDefault();}};
    draw();input.focus();
  }
  document.addEventListener('keydown',(e)=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommands();}
    else if(mode==='view'&&viewer)viewer.key(e);
  });

  // ---------- desktop: files opened from Windows Explorer ("Open with", double-click, right-click) ----------
  async function takeDesktopFiles(){
    const bridge=window.waraqDesktop;if(!bridge?.takeOpenFiles)return;
    const files=await bridge.takeOpenFiles().catch(()=>[]);if(!files?.length)return;
    if(api.getPages().length){api.snapshot();api.setPages([]);api.clearSelection();}
    pendingMode=files[0].mode==='edit'||files[0].mode==='view'?files[0].mode:null;
    await api.loadFiles(files.map((f)=>new File([f.data],f.name,{type:'application/pdf'})));
  }
  let pendingMode=null;
  window.waraqDesktop?.onOpenFiles?.(takeDesktopFiles);
  takeDesktopFiles();

  // ---------- viewer ----------
  function createViewer(){
    section.innerHTML=`
      <div class="pw-vbar" role="toolbar">
        <button type="button" data-v="thumbs" class="pw-icon"></button>
        <span class="pw-group"><button type="button" data-v="prev" class="pw-icon"></button><input id="pwPage" inputmode="numeric" class="pw-page-input"><span id="pwPageCount" class="pw-muted"></span><button type="button" data-v="next" class="pw-icon"></button></span>
        <span class="pw-group"><button type="button" data-v="zoomOut" class="pw-icon">−</button><select id="pwZoom"><option value="width"></option><option value="page"></option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select><button type="button" data-v="zoomIn" class="pw-icon">+</button></span>
        <span class="pw-group pw-find"><input id="pwFind" type="search" autocomplete="off"><button type="button" data-v="findPrev" class="pw-icon"></button><button type="button" data-v="findNext" class="pw-icon"></button><span id="pwFindCount" class="pw-muted" aria-live="polite"></span></span>
        <span class="pw-group pw-tools"><button type="button" data-v="hand" class="pw-icon" aria-pressed="false"></button><button type="button" data-v="zoomBox" class="pw-icon" aria-pressed="false"></button></span>
        <span class="pw-group pw-end"><button type="button" data-v="qtools" class="pw-chip" aria-expanded="false"></button><span class="pw-more-wrap"><button type="button" data-v="more" class="pw-icon" aria-haspopup="menu" aria-expanded="false"></button><div class="pw-menu" role="menu" hidden><button type="button" data-v="editPage" class="pw-menu-item" role="menuitem"></button><button type="button" data-v="spread" class="pw-menu-item" role="menuitem"></button><button type="button" data-v="night" class="pw-menu-item" role="menuitem"></button><button type="button" data-v="read" class="pw-menu-item" role="menuitem"></button><button type="button" data-v="print" class="pw-menu-item" role="menuitem"></button><button type="button" data-v="download" class="pw-menu-item" role="menuitem"></button></div></span><button type="button" data-v="edit" class="pw-to-edit"></button></span>
      </div>
      <div class="pw-vbody"><nav class="pw-thumbs" id="pwThumbs"></nav><div class="pw-pages" id="pwPages" tabindex="0"></div></div>
      <div class="pw-print" id="pwPrint" aria-hidden="true"></div>`;
    let layoutWidth=0,loadedBytes=null,renderId=null,heavy=false,doc=null,sizes=[],zoom=store.get('pwaraq-zoom','width'),scale=1,current=1,loadVersion=0,hits=[],hitIndex=-1,query='';
    const texts=new Map(),rendered=new Map(),pagesEl=$('#pwPages'),thumbsEl=$('#pwThumbs');
    if(store.get('pwaraq-thumbs','0')==='0')section.classList.add('no-thumbs');
    const io=new IntersectionObserver((entries)=>{for(const e of entries){const n=Number(e.target.dataset.page);if(e.isIntersecting)paint(n);}},{root:null,rootMargin:'600px 0px'});
    const tio=new IntersectionObserver((entries)=>{for(const e of entries)if(e.isIntersecting){thumb(Number(e.target.dataset.page));tio.unobserve(e.target);}},{root:thumbsEl,rootMargin:'200px'});
    const track=new IntersectionObserver((entries)=>{const v=entries.filter((e)=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(v){current=Number(v.target.dataset.page);syncPage();}},{threshold:[0.25,0.5,0.75]});

    function label(){
      const L=(v,en,ar)=>{const b=section.querySelector(`[data-v="${v}"]`);b.title=b.ariaLabel=t(en,ar);return b;};
      L('thumbs','Thumbnails (F4)','الصور المصغرة (F4)').innerHTML=api.icon('organize');
      L('prev','Previous page','الصفحة السابقة').innerHTML=api.icon(document.dir==='rtl'?'arrow-right':'arrow-left');
      L('next','Next page','الصفحة التالية').innerHTML=api.icon(document.dir==='rtl'?'arrow-left':'arrow-right');
      L('zoomOut','Zoom out (Ctrl −, or Ctrl + mouse wheel)','تصغير (Ctrl −، أو Ctrl مع عجلة الفأرة)');L('zoomIn','Zoom in (Ctrl +, or Ctrl + mouse wheel)','تكبير (Ctrl +، أو Ctrl مع عجلة الفأرة)');
      L('findPrev','Previous match','النتيجة السابقة').innerHTML='↑';L('findNext','Next match','النتيجة التالية').innerHTML='↓';
      L('spread','Two pages side by side','صفحتان متجاورتان').innerHTML=api.icon('nup');
      L('hand','Pan (H) — or hold Space, or drag with the middle mouse button','تحريك (H) — أو اضغط مع الاستمرار على المسافة، أو اسحب بزر الفأرة الأوسط').innerHTML=api.icon('move');
      L('zoomBox','Zoom to area (Z) — drag a box','تكبير منطقة (Z) — اسحب مربعاً').innerHTML=api.icon('resize');
      L('night','Night reading','قراءة ليلية').innerHTML=api.icon('grayscale');
      L('read','Read mode (Esc to exit)','وضع القراءة (Esc للخروج)').innerHTML=api.icon('document');
      L('print','Print','طباعة').innerHTML=api.icon('png');
      if(window.waraqDesktop?.isDesktop)L('download','Save as… (Ctrl+S)','حفظ باسم… (Ctrl+S)').innerHTML=api.icon('download');else L('download','Download PDF (Ctrl+S)','تنزيل PDF (Ctrl+S)').innerHTML=api.icon('download');
      L('editPage','Edit this page (photos and text)','تحرير هذه الصفحة (الصور والنصوص)').innerHTML=api.icon('crop');
      L('more','More','المزيد').innerHTML=api.icon('more');
      L('qtools','Tools','الأدوات').innerHTML=api.icon('star')+'<span>'+t('Tools','الأدوات')+'</span>';
      section.querySelectorAll('.pw-menu-item').forEach((b)=>b.insertAdjacentHTML('beforeend','<span>'+b.title+'</span>'));
      L('edit','Edit this PDF','حرّر هذا الملف').innerHTML=api.icon('annotate')+'<span>'+t('Edit','تحرير')+'</span>';
      const z=$('#pwZoom');z.options[0].text=t('Fit width','ملء العرض');z.options[1].text=t('Whole page','الصفحة كاملة');z.ariaLabel=t('Zoom','التكبير');
      $('#pwFind').placeholder=t('Find in document','ابحث في المستند');$('#pwFind').ariaLabel=t('Find in document','ابحث في المستند');
      $('#pwPage').ariaLabel=t('Page number','رقم الصفحة');
      section.ariaLabel=t('Document preview','معاينة المستند');
    }
    function fitScale(){
      if(!sizes.length)return 1;const spread=section.classList.contains('spread'),width=(pagesEl.clientWidth-48-(spread?18:0))/(spread?2:1),height=(pagesEl.clientHeight||window.innerHeight-120)-40,first=sizes[0];
      if(zoom==='width')return Math.max(0.25,Math.min(4,width/first.w));
      if(zoom==='page')return Math.max(0.25,Math.min(4,Math.min(width/first.w,height/first.h)));
      return Number(zoom)||1;
    }
    async function load(){
      const version=++loadVersion;
      pagesEl.innerHTML=`<p class="pw-muted pw-loading">${t('Preparing preview…','جارٍ تجهيز المعاينة…')}</p>`;
      const bytes=await api.output();if(version!==loadVersion)return;
      loadedBytes=bytes;renderId=null;
      if(doc){doc.destroy();doc=null;}
      // pdf.js takes ownership of the bytes it is given (they become empty here), so give it a copy when MuPDF may need them.
      doc=await api.pdfjsLib.getDocument({data:api.engineRender?bytes.slice():bytes,isEvalSupported:false}).promise;if(version!==loadVersion){doc.destroy();return;}
      sizes=new Array(doc.numPages);
      for(let first=1;first<=doc.numPages;first+=64){const batch=[];for(let n=first;n<Math.min(first+64,doc.numPages+1);n++)batch.push(doc.getPage(n).then((p)=>{const v=p.getViewport({scale:1});sizes[n-1]={w:v.width,h:v.height};}));await Promise.all(batch);if(version!==loadVersion)return;if(first===1&&doc.numPages>64)pagesEl.firstElementChild&&(pagesEl.firstElementChild.textContent=t(`Preparing ${doc.numPages} pages…`,`جارٍ تجهيز ${doc.numPages} صفحة…`));}
      if(api.engineRender&&!api.engineRender.enabled())await api.engineRender.ready?.(); // desktop: know whether MuPDF can draw before choosing
      if(version!==loadVersion)return;
      heavy=!!api.engineRender?.enabled()&&api.engineRender.isHeavy(bytes.length,sizes.length,Math.max(...sizes.map((x)=>x.w*x.h)));
      texts.clear();hits=[];hitIndex=-1;layout();buildThumbs();if(query)find(query,false);
    }
    function layout(){
      layoutWidth=pagesEl.clientWidth;scale=fitScale();rendered.forEach((r)=>r.cancel?.());rendered.clear();io.disconnect();track.disconnect();
      pagesEl.replaceChildren(...sizes.map((s,i)=>{const d=document.createElement('div');d.className='pw-page';d.dataset.page=i+1;d.style.width=Math.floor(s.w*scale)+'px';d.style.height=Math.floor(s.h*scale)+'px';d.style.setProperty('--scale-factor',scale);d.ariaLabel=t('Page ','الصفحة ')+(i+1);d.setAttribute('role','img');return d;}));
      pagesEl.querySelectorAll('.pw-page').forEach((d)=>{io.observe(d);track.observe(d);});
      showZoom();syncPage();
    }
    async function paint(n){
      if(rendered.has(n)||!doc)return;const host=pagesEl.querySelector(`[data-page="${n}"]`);if(!host)return;
      const job={cancel:null};rendered.set(n,job);
      if(!host.firstChild)host.innerHTML=`<div class="pw-rendering" role="status"><div class="pw-rendering-label"><span class="pw-spinner"></span>${t('Drawing page…','جارٍ رسم الصفحة…')}</div></div>`;
      try{
        if(heavy){ // CAD-size page: MuPDF draws it; the browser only adds the selectable text afterwards
          renderId||=await api.engineRender.upload(loadedBytes);
          const page=await doc.getPage(n),viewport=page.getViewport({scale}),img=new Image();img.alt='';img.className='pw-engine-img';img.src=api.engineRender.url(renderId,n,Math.min(8192,viewport.width*Math.min(window.devicePixelRatio||1,2)));
          await img.decode();if(rendered.get(n)!==job)return;
          const textDiv=document.createElement('div');textDiv.className='textLayer';host.replaceChildren(img,textDiv);scheduleDetail();prefetchHeavy();
          new api.pdfjsLib.TextLayer({textContentSource:page.streamTextContent(),container:textDiv,viewport}).render().then(()=>mark(n)).catch(()=>{});
          return;
        }
        const page=await doc.getPage(n),viewport=page.getViewport({scale}),area=viewport.width*viewport.height;
        // Keep each canvas under ~16 megapixels and 8192 px per side; beyond that the page is scaled by CSS.
        const ratio=Math.max(0.1,Math.min(window.devicePixelRatio||1,2,Math.sqrt(16_777_216/area),8192/viewport.width,8192/viewport.height));
        const canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
        const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null});if(ratio<1)host.classList.add('pw-capped');job.cancel=()=>task.cancel();
        await task.promise;if(rendered.get(n)!==job)return;
        const textDiv=document.createElement('div');textDiv.className='textLayer';
        host.replaceChildren(canvas,textDiv);scheduleDetail();
        const layer=new api.pdfjsLib.TextLayer({textContentSource:page.streamTextContent(),container:textDiv,viewport});await layer.render();
        mark(n);
      }catch(e){
        if(e?.name!=='RenderingCancelledException'){rendered.delete(n);console.warn('Page '+n+' could not be drawn',e);}
        if(heavy&&e?.name!=='RenderingCancelledException'){heavy=false;console.warn('MuPDF page drawing failed; drawing in the browser instead.',e);paint(n);return;} // never leave a page blank
      }
      // Free far-away pages so 200-page documents stay light.
      for(const k of [...rendered.keys()])if(Math.abs(k-current)>12){rendered.get(k).cancel?.();rendered.delete(k);const el=pagesEl.querySelector(`[data-page="${k}"]`);el?.replaceChildren();}
    }
    function buildThumbs(){
      tio.disconnect();
      thumbsEl.replaceChildren(...sizes.map((s,i)=>{const b=document.createElement('button');b.type='button';b.className='pw-thumb';b.dataset.page=i+1;b.style.aspectRatio=s.w+'/'+s.h;b.ariaLabel=t('Go to page ','انتقل إلى الصفحة ')+(i+1);b.innerHTML=`<span>${i+1}</span>`;b.onclick=()=>go(i+1);return b;}));
      thumbsEl.querySelectorAll('.pw-thumb').forEach((b)=>tio.observe(b));
    }
    async function thumb(n){
      const b=thumbsEl.querySelector(`[data-page="${n}"]`);if(!b||!doc)return;
      if(heavy){try{renderId||=await api.engineRender.upload(loadedBytes);const img=new Image();img.alt='';img.src=api.engineRender.url(renderId,n,240);await img.decode();b.prepend(img);return;}catch{}}
      const page=await doc.getPage(n),v=page.getViewport({scale:120/sizes[n-1].w}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;
      await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;b.prepend(c);
    }
    function syncPage(){
      $('#pwPage').value=current;$('#pwPageCount').textContent='/ '+sizes.length;
      thumbsEl.querySelectorAll('.pw-thumb').forEach((b)=>b.classList.toggle('active',Number(b.dataset.page)===current));
      const active=thumbsEl.querySelector('.pw-thumb.active');if(active){const a=active.getBoundingClientRect(),c=thumbsEl.getBoundingClientRect();if(a.top<c.top||a.bottom>c.bottom)thumbsEl.scrollTop+=a.top-c.top-12;}
    }
    function go(n){n=Math.max(1,Math.min(sizes.length,n|0));current=n;const el=pagesEl.querySelector(`[data-page="${n}"]`);if(el)pagesEl.scrollTo({top:pagesEl.scrollTop+el.getBoundingClientRect().top-pagesEl.getBoundingClientRect().top-16,behavior:'smooth'});syncPage();}
    function setZoom(z){zoom=String(z);store.set('pwaraq-zoom',zoom);const keep=current;layout();go(keep);showZoom();}
    function step(d){zoomAt(scale*(d>0?1.25:0.8));}
    // Zoom like CAD and PDF tools: the point under the cursor stays put. Pages are resized at once (the old image
    // is stretched, so it feels instant) and redrawn sharp shortly after the zooming stops.
    const MIN_SCALE=0.1,MAX_SCALE=8;let settleTimer=null;
    function zoomAt(target,cx,cy){
      target=Math.max(MIN_SCALE,Math.min(MAX_SCALE,target));if(!sizes.length||Math.abs(target-scale)<0.0005)return;
      const box=pagesEl.getBoundingClientRect();if(cx==null){cx=box.left+box.width/2;cy=box.top+box.height/2;}
      const under=document.elementFromPoint(cx,cy)?.closest?.('.pw-page');
      const anchor=under&&pagesEl.contains(under)?under:pagesEl.querySelector(`[data-page="${current}"]`);
      let fx=0.5,fy=0.5;if(anchor){const r=anchor.getBoundingClientRect();fx=(cx-r.left)/r.width;fy=(cy-r.top)/r.height;}
      scale=target;zoom=String(+target.toFixed(4));store.set('pwaraq-zoom',zoom);clearDetail();
      for(const d of pagesEl.children){const n=Number(d.dataset.page);if(!n)continue;const sz=sizes[n-1];d.style.width=Math.floor(sz.w*scale)+'px';d.style.height=Math.floor(sz.h*scale)+'px';d.style.setProperty('--scale-factor',scale);}
      if(anchor){const r=anchor.getBoundingClientRect();pagesEl.scrollLeft+=r.left+fx*r.width-cx;pagesEl.scrollTop+=r.top+fy*r.height-cy;}
      layoutWidth=pagesEl.clientWidth;showZoom();
      clearTimeout(settleTimer);settleTimer=setTimeout(redrawVisible,160);
    }
    // Heavy drawings: after the visible pages, the other pages are drawn in the background one at a time (same image
    // addresses as the viewer uses, so they come from the cache when scrolled to instead of a blank page for seconds).
    let prefetchToken=0,prefetchKey='';
    function prefetchHeavy(){
      const dpr=Math.min(window.devicePixelRatio||1,2),key=loadVersion+':'+scale;if(!heavy||!renderId||key===prefetchKey)return;
      prefetchKey=key;const token=++prefetchToken;
      setTimeout(async()=>{
        for(let n=1;n<=sizes.length;n++){
          if(token!==prefetchToken||!heavy||!renderId||!section.isConnected)return;
          if(pagesEl.querySelector(`[data-page="${n}"] .pw-engine-img`))continue;
          try{const r=await fetch(api.engineRender.url(renderId,n,Math.min(8192,sizes[n-1].w*scale*dpr)));await r.blob();}catch{}
        }
      },1500);
    }
    // Sharp detail when zoomed in: a whole page image is limited (8192 px from MuPDF, ~16 MP canvas), so after
    // zooming or scrolling stops, the visible part of each page is drawn again at full resolution on top of it.
    let detailTimer=null,detailToken=0;
    function scheduleDetail(ms=300){clearTimeout(detailTimer);detailTimer=setTimeout(detail,ms);}
    function clearDetail(){detailToken++;pagesEl.querySelectorAll('.pw-detail').forEach((e)=>e.remove());}
    async function detail(){
      if(!doc)return;const token=++detailToken,dpr=Math.min(window.devicePixelRatio||1,3),box=pagesEl.getBoundingClientRect();
      for(const host of pagesEl.querySelectorAll('.pw-page')){
        const r=host.getBoundingClientRect();if(r.bottom<box.top||r.top>box.bottom||r.right<box.left||r.left>box.right){host.querySelector('.pw-detail')?.remove();continue;}
        const n=Number(host.dataset.page),base=host.querySelector('.pw-engine-img,canvas:not(.pw-detail)');if(!base)continue;
        const need=sizes[n-1].w*scale*dpr,have=base.naturalWidth||base.width||0;
        if(have>=need*0.95){host.querySelector('.pw-detail')?.remove();continue;}
        // visible part of this page (plus a margin), in device pixels at the current zoom, on a 256 px grid
        const g=256,x0=Math.max(0,Math.floor((Math.max(box.left,r.left)-r.left-64)*dpr/g)*g),y0=Math.max(0,Math.floor((Math.max(box.top,r.top)-r.top-64)*dpr/g)*g);
        const x1=Math.min(Math.ceil(r.width*dpr),Math.ceil((Math.min(box.right,r.right)-r.left+64)*dpr/g)*g),y1=Math.min(Math.ceil(r.height*dpr),Math.ceil((Math.min(box.bottom,r.bottom)-r.top+64)*dpr/g)*g);
        const w=Math.min(4096,x1-x0),h=Math.min(4096,y1-y0);if(w<16||h<16)continue;
        const old=host.querySelector('.pw-detail');if(old&&old.dataset.key===`${scale}:${x0}:${y0}:${w}:${h}`)continue;
        const s=Math.round(scale*dpr*1000)/1000;let el;
        try{
          if(heavy&&renderId&&api.engineRender.tile){el=new Image();el.alt='';el.src=api.engineRender.tile(renderId,n,s,x0,y0,w,h);await el.decode();}
          else{
            const page=await doc.getPage(n);el=document.createElement('canvas');el.width=w;el.height=h;
            await page.render({canvasContext:el.getContext('2d'),viewport:page.getViewport({scale:s}),transform:[1,0,0,1,-x0,-y0]}).promise;
          }
        }catch{continue;}
        if(token!==detailToken||!host.isConnected)return;
        el.className='pw-detail';el.dataset.key=`${scale}:${x0}:${y0}:${w}:${h}`;
        Object.assign(el.style,{left:x0/dpr+'px',top:y0/dpr+'px',width:w/dpr+'px',height:h/dpr+'px'});
        host.querySelector('.pw-detail')?.remove();base.after(el);
      }
    }
    pagesEl.addEventListener('scroll',()=>scheduleDetail(250),{passive:true});
    function redrawVisible(){
      rendered.forEach((r)=>r.cancel?.());rendered.clear();
      const box=pagesEl.getBoundingClientRect();
      for(const d of pagesEl.querySelectorAll('.pw-page')){const r=d.getBoundingClientRect();if(r.bottom>box.top-400&&r.top<box.bottom+400)paint(Number(d.dataset.page));}
    }
    function showZoom(){
      const select=$('#pwZoom');if(!select)return;
      let custom=select.querySelector('option[value="custom"]');
      if(zoom==='width'||zoom==='page'){select.value=zoom;if(custom)custom.hidden=true;return;}
      const exact=[...select.options].find((o)=>o.value!=='custom'&&Math.abs(Number(o.value)-scale)<0.001);
      if(exact){select.value=exact.value;if(custom)custom.hidden=true;return;}
      if(!custom){custom=document.createElement('option');custom.value='custom';select.prepend(custom);}
      custom.hidden=false;custom.textContent=Math.round(scale*100)+'%';select.value='custom';
    }
    async function pageText(n){if(!texts.has(n)){const c=await (await doc.getPage(n)).getTextContent();texts.set(n,normalizeSearch(c.items.map((i)=>i.str).join(' ')));}return texts.get(n);}
    let findVersion=0;
    async function find(q,jump=true){
      const mine=++findVersion;
      query=normalizeSearch(q.trim());hits=[];hitIndex=-1;pagesEl.querySelectorAll('.pw-hit').forEach((s)=>s.classList.remove('pw-hit'));
      if(!query){$('#pwFindCount').textContent='';return;}
      for(let n=1;n<=sizes.length;n++){
        if(mine!==findVersion)return; // a newer search replaced this one
        if(n%40===0)$('#pwFindCount').textContent=t(`Searching ${n} / ${sizes.length}…`,`جارٍ البحث ${n} / ${sizes.length}…`);
        const text=await pageText(n);let i=text.indexOf(query);while(i>=0){hits.push(n);i=text.indexOf(query,i+query.length);}
        if(jump&&hits.length&&hitIndex<0){hitIndex=0;go(hits[0]);} // show the first match while the rest is searched
      }
      if(mine!==findVersion)return;
      $('#pwFindCount').textContent=hits.length?'':t('No results','لا نتائج');
      rendered.forEach((_,n)=>mark(n));if(hits.length){if(hitIndex<0&&jump)next(1);else $('#pwFindCount').textContent=(hitIndex+1)+' / '+hits.length;}
    }
    function mark(n){
      if(!query)return;const layer=pagesEl.querySelector(`[data-page="${n}"] .textLayer`);if(!layer)return;
      layer.querySelectorAll('span').forEach((s)=>s.classList.toggle('pw-hit',!!s.textContent&&normalizeSearch(s.textContent).includes(query)));
    }
    function next(d){if(!hits.length)return;hitIndex=(hitIndex+d+hits.length)%hits.length;$('#pwFindCount').textContent=(hitIndex+1)+' / '+hits.length;go(hits[hitIndex]);}
    async function print(){
      const host=$('#pwPrint');host.replaceChildren();api.msg('Preparing pages for printing…','جارٍ تجهيز الصفحات للطباعة…');
      for(let n=1;n<=sizes.length;n++){const page=await doc.getPage(n),v=page.getViewport({scale:2}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const img=new Image();img.src=c.toDataURL('image/jpeg',0.92);host.append(img);c.width=0;}
      document.body.classList.add('pw-printing');window.addEventListener('afterprint',()=>{document.body.classList.remove('pw-printing');host.replaceChildren();},{once:true});
      window.print();api.msg('','');
    }
    function toggleThumbs(){section.classList.toggle('no-thumbs');store.set('pwaraq-thumbs',section.classList.contains('no-thumbs')?'0':'1');}
    function exitRead(){document.body.classList.remove('pw-read');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}
    section.querySelector('.pw-vbar').addEventListener('click',(e)=>{
      const v=e.target.closest('[data-v]')?.dataset.v;if(!v)return;
      if(v==='thumbs')toggleThumbs();
      if(v==='hand')setTool('hand');if(v==='zoomBox')setTool('box');
      if(v==='more'){toggleMenu();return;}
      if(v==='qtools'){toggleTools();return;}
      if(e.target.closest('.pw-menu'))toggleMenu(false);
      if(v==='prev')go(current-1);if(v==='next')go(current+1);
      if(v==='zoomIn')step(1);if(v==='zoomOut')step(-1);
      if(v==='findNext')next(1);if(v==='findPrev')next(-1);
      if(v==='spread'){section.classList.toggle('spread');store.set('pwaraq-spread',section.classList.contains('spread')?'1':'0');setZoom(zoom);}
      if(v==='night'){section.classList.toggle('night');store.set('pwaraq-night',section.classList.contains('night')?'1':'0');}
      if(v==='read'){document.body.classList.add('pw-read');section.requestFullscreen?.().catch(()=>{});setTimeout(()=>setZoom(zoom),60);}
      if(v==='print')print();
      if(v==='download')$('#export')?.click();
      if(v==='edit')setMode('edit');
      if(v==='editPage')api.editPage?.(current);
    });
    if(store.get('pwaraq-night','0')==='1')section.classList.add('night');
    if(store.get('pwaraq-spread','0')==='1')section.classList.add('spread');
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('pw-read')){document.body.classList.remove('pw-read');setZoom(zoom);}});
    $('#pwZoom').onchange=(e)=>{if(e.target.value!=='custom')setZoom(e.target.value);};
    $('#pwPage').onchange=(e)=>go(Number(e.target.value));
    let findTimer;$('#pwFind').oninput=(e)=>{clearTimeout(findTimer);findTimer=setTimeout(()=>find(e.target.value),250);};
    $('#pwFind').onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();next(e.shiftKey?-1:1);}};
    // Ctrl + wheel (and touchpad pinch, which arrives as Ctrl + wheel) zooms at the mouse position.
    pagesEl.addEventListener('wheel',(e)=>{
      if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();
      const delta=e.deltaMode===1?e.deltaY*16:e.deltaY;zoomAt(scale*Math.exp(-delta*0.0022),e.clientX,e.clientY);
    },{passive:false});
    // Pan: hand tool (H), hold Space, or drag with the middle mouse button (as in AutoCAD).
    let tool='select',spaceHeld=false,drag=null,lastMiddle=0;
    function setTool(next){tool=tool===next?'select':next;section.dataset.tool=tool;section.querySelectorAll('[data-v="hand"],[data-v="zoomBox"]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.v===(tool==='hand'?'hand':tool==='box'?'zoomBox':''))));}
    pagesEl.addEventListener('pointerdown',(e)=>{
      if(e.button===1){e.preventDefault();const now=Date.now();if(now-lastMiddle<350){setZoom('page');lastMiddle=0;return;}lastMiddle=now;} // double middle click = fit page ("zoom extents")
      const pan=e.button===1||(e.button===0&&(tool==='hand'||spaceHeld)),box=e.button===0&&tool==='box'&&!spaceHeld;
      if(!pan&&!box)return;
      e.preventDefault();pagesEl.setPointerCapture(e.pointerId);
      drag={pan,x:e.clientX,y:e.clientY,left:pagesEl.scrollLeft,top:pagesEl.scrollTop,el:null};
      if(box){drag.el=document.createElement('div');drag.el.className='pw-zoombox';document.body.append(drag.el);}
      section.classList.add('pw-dragging');
    });
    pagesEl.addEventListener('pointermove',(e)=>{
      if(!drag)return;
      if(drag.pan){pagesEl.scrollLeft=drag.left-(e.clientX-drag.x);pagesEl.scrollTop=drag.top-(e.clientY-drag.y);return;}
      Object.assign(drag.el.style,{left:Math.min(e.clientX,drag.x)+'px',top:Math.min(e.clientY,drag.y)+'px',width:Math.abs(e.clientX-drag.x)+'px',height:Math.abs(e.clientY-drag.y)+'px'});
    });
    const endDrag=(e)=>{
      if(!drag)return;const d=drag;drag=null;section.classList.remove('pw-dragging');
      if(d.el){
        d.el.remove();const w=Math.abs(e.clientX-d.x),h=Math.abs(e.clientY-d.y),cx=(e.clientX+d.x)/2,cy=(e.clientY+d.y)/2,box=pagesEl.getBoundingClientRect();
        if(w<8||h<8)zoomAt(scale*2,cx,cy);
        else{zoomAt(scale*Math.min(box.width/w,box.height/h)*0.95,cx,cy);pagesEl.scrollLeft+=cx-(box.left+box.width/2);pagesEl.scrollTop+=cy-(box.top+box.height/2);}
        setTool('box'); // one zoom per use, like AutoCAD's zoom window
      }
    };
    pagesEl.addEventListener('pointerup',endDrag);pagesEl.addEventListener('pointercancel',endDrag);
    pagesEl.addEventListener('auxclick',(e)=>{if(e.button===1)e.preventDefault();});
    document.addEventListener('keyup',(e)=>{if(e.key===' '&&spaceHeld){spaceHeld=false;section.classList.remove('pw-space');}});
    // View mode keeps the screen for the drawing: secondary actions sit in the ⋯ menu, tools in a dropdown.
    const menu=section.querySelector('.pw-menu'),moreBtn=section.querySelector('[data-v="more"]'),toolsBtn=section.querySelector('[data-v="qtools"]');
    function toggleMenu(open=menu.hidden){if(open)for(const v of ['spread','night'])menu.querySelector(`[data-v="${v}"]`).setAttribute('aria-pressed',String(section.classList.contains(v)));menu.hidden=!open;moreBtn.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button')?.focus();}
    function toggleTools(open=!document.body.classList.contains('qb-open')){
      document.body.classList.toggle('qb-open',open);toolsBtn.setAttribute('aria-expanded',String(open));
      const bar=document.querySelector('.qb');if(open&&bar){const r=toolsBtn.getBoundingClientRect();bar.style.setProperty('--qb-top',Math.round(r.bottom+8)+'px');}
    }
    document.addEventListener('click',(e)=>{
      if(!menu.hidden&&!e.target.closest('.pw-more-wrap'))toggleMenu(false);
      if(document.body.classList.contains('qb-open')&&e.target.isConnected){ // a tab the bar just redrew is no longer in the page: not an outside click
        const inBar=e.target.closest('.qb');
        if((!inBar&&!e.target.closest('[data-v="qtools"]'))||(inBar&&e.target.closest('.qb-tool')&&!inBar.classList.contains('is-customizing')))toggleTools(false);
      }
    });
    document.addEventListener('keydown',(e)=>{if(e.key!=='Escape')return;if(!menu.hidden){toggleMenu(false);moreBtn.focus();}if(document.body.classList.contains('qb-open')){toggleTools(false);toolsBtn.focus();}});
    // Fit modes follow the real width of the page column (window resize, thumbnails toggled, first time it becomes visible).
    let resizeTimer;new ResizeObserver(()=>{const w=pagesEl.clientWidth;if(!w||Math.abs(w-layoutWidth)<4)return;if(!sizes.length||!(zoom==='width'||zoom==='page'))return;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>setZoom(zoom),120);}).observe(pagesEl);
    label();
    return{
      show(reload){label();if(reload||!doc)load();},
      translate:label,exitRead,
      key(e){
        if(e.target.closest?.('input,select,textarea,dialog'))return;
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('#pwFind').focus();return;}
        if((e.ctrlKey||e.metaKey)&&!e.altKey){
          const k=e.key,act={'=':()=>step(1),'+':()=>step(1),'-':()=>step(-1),'_':()=>step(-1),'0':()=>setZoom('page'),'1':()=>setZoom(1),'2':()=>setZoom('width')}[k];
          if(act){e.preventDefault();act();}return;
        }
        if(e.key==='F4'){e.preventDefault();toggleThumbs();return;}
        if(e.altKey)return;
        if(e.key===' '&&!spaceHeld){spaceHeld=true;section.classList.add('pw-space');e.preventDefault();return;}
        if(e.key==='h'||e.key==='H'){setTool('hand');return;}
        if(e.key==='z'||e.key==='Z'){setTool('box');return;}
        if(e.key==='Escape'&&tool!=='select'){setTool(tool);return;}
        const rtl=document.dir==='rtl';
        if(e.key==='PageDown'||(e.key==='ArrowRight'&&!rtl)||(e.key==='ArrowLeft'&&rtl)){go(current+1);e.preventDefault();}
        else if(e.key==='PageUp'||(e.key==='ArrowLeft'&&!rtl)||(e.key==='ArrowRight'&&rtl)){go(current-1);e.preventDefault();}
        else if(e.key==='Home'){go(1);e.preventDefault();}else if(e.key==='End'){go(sizes.length);e.preventDefault();}
        else if(e.key==='+'||e.key==='='){step(1);}else if(e.key==='-'){step(-1);}
        else if(e.key==='Escape')exitRead();
      }
    };
  }

  translate();
  setTimeout(offerRecovery,window.waraqDesktop?1200:300); // desktop: let files opened from Explorer arrive first
  return{
    translate,deliver,filterMessage,setMode,openCommands,
    get mode(){return mode;},get lastDelivery(){return lastDelivery;},
    markInput(ids,all){lastInput={ids,all};},resetInput(){lastInput=null;lastDelivery='';},
    onChange(){viewerDirty=true;scheduleRecovery();const has=api.getPages().length>0;bar.hidden=!has;fileBar.hidden=!has;if(!has&&mode==='view')setMode('edit');else if(mode==='view'&&viewer){viewer.show(true);viewerDirty=false;}},
    // Only a fresh document picks the default interface; adding files to an open one keeps the current interface.
    onDocumentLoaded(wasEmpty){const m=pendingMode||(wasEmpty?settings.mode:mode);pendingMode=null;viewerDirty=true;bar.hidden=false;setMode(m);}
  };
}
