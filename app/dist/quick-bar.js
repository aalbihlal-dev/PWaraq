// Quick tools bar: a slim ribbon above the document, like the Office / Acrobat quick access toolbar.
// Tabs switch between the user's favourites and each tool category. Favourites are chosen with the star
// (or right-click any tool), reordered by dragging or Alt + arrow keys, and remembered on this device.
const DEFAULT_FAVS=['pageEditor','annotate','signature','merge','split','compress','ocr','numbers','watermark'];
const TABS=[['favs','Favourites','المفضلة'],['organize','Organize','تنظيم'],['edit','Edit','تعديل'],['convert','Convert','تحويل'],['extract','Read & extract','قراءة واستخراج'],['protect','Protect','حماية']];
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v;}catch{return d;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};

export function readFavourites(raw,known){
  let list;try{list=JSON.parse(raw);}catch{list=null;}
  if(!Array.isArray(list))list=DEFAULT_FAVS;
  return [...new Set(list.filter((id)=>typeof id==='string'&&known.has(id)))];
}
// "Ctrl+Shift+M", "Alt+1", "F6": one stable name for a key press (Cmd counts as Ctrl on a Mac).
export function comboOf(e){
  const code=e.code||'',k=/^Key[A-Z]$/.test(code)?code.slice(3):/^Digit\d$/.test(code)?code.slice(5):e.key===' '?'Space':e.key.length===1?e.key.toUpperCase():e.key;
  return [(e.ctrlKey||e.metaKey)&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Shift',k].filter(Boolean).join('+');
}
export function readShortcuts(raw,byId){
  let o;try{o=JSON.parse(raw);}catch{o=null;}
  const out={};if(o&&typeof o==='object')for(const [k,v] of Object.entries(o))if(typeof v==='string'&&byId.has(v)&&/^[\w+=\-]+$/.test(k))out[k]=v;
  return out;
}
export function moveItem(list,id,to){
  const from=list.indexOf(id);if(from<0)return list;
  const next=list.slice();next.splice(from,1);next.splice(Math.max(0,Math.min(to,next.length)),0,id);return next;
}

export function setupQuickBar({t,icon,catalog,openTool,hasPages,msg,modal}){
  const byId=new Map(catalog.map((c)=>[c[0],c]));
  let favs=readFavourites(store.get('pwaraq-qb-favs',null),new Set(byId.keys()));
  let tab=store.get('pwaraq-qb-tab','favs');if(!TABS.some((x)=>x[0]===tab))tab='favs';
  let customizing=false,dragId=null;

  const root=document.createElement('div');root.className='qb';root.hidden=true;
  root.classList.toggle('is-collapsed',store.get('pwaraq-qb-collapsed','0')==='1');
  root.innerHTML='<div class="qb-tabs" role="tablist"></div><div class="qb-tools" role="toolbar"></div><div class="qb-side"><button type="button" class="qb-btn qb-custom" aria-pressed="false"></button><button type="button" class="qb-btn qb-reset" hidden></button><button type="button" class="qb-icon qb-collapse"></button></div>';
  document.querySelector('.shell > header')?.after(root);
  const tabsEl=root.querySelector('.qb-tabs'),toolsEl=root.querySelector('.qb-tools');

  const saveFavs=()=>store.set('pwaraq-qb-favs',JSON.stringify(favs));
  const name=(c)=>t(c[3],c[4]);
  function toggleFav(id){
    const on=favs.includes(id);favs=on?favs.filter((x)=>x!==id):[...favs,id];saveFavs();draw();
    const c=byId.get(id);msg?.(on?`Removed “${c[3]}” from favourites.`:`Added “${c[3]}” to favourites.`,on?`أزيلت «${c[4]}» من المفضلة.`:`أضيفت «${c[4]}» إلى المفضلة.`);
  }

  function drawTabs(){
    tabsEl.setAttribute('aria-label',t('Tool groups','مجموعات الأدوات'));
    tabsEl.replaceChildren(...TABS.map(([id,en,ar])=>{
      const b=document.createElement('button');b.type='button';b.role='tab';b.className='qb-tab';b.dataset.tab=id;
      b.setAttribute('aria-selected',String(id===tab));b.innerHTML=(id==='favs'?icon('star'):'')+`<span>${t(en,ar)}</span>`;
      b.onclick=()=>{tab=id;store.set('pwaraq-qb-tab',tab);if(root.classList.contains('is-collapsed'))setCollapsed(false);draw();};
      if(id==='favs'){ // drop a tool from any category on the Favourites tab to pin it
        b.ondragover=(e)=>{if(dragId&&!favs.includes(dragId)){e.preventDefault();b.classList.add('is-drop');}};
        b.ondragleave=()=>b.classList.remove('is-drop');
        b.ondrop=(e)=>{e.preventDefault();b.classList.remove('is-drop');if(dragId&&!favs.includes(dragId))toggleFav(dragId);};
      }
      return b;
    }));
  }
  function toolButton(c,index){
    const id=c[0],fav=favs.includes(id),b=document.createElement('button');
    b.type='button';b.className='qb-tool'+(fav?' is-fav':'');b.dataset.tool=id;b.draggable=true;
    b.innerHTML=`${icon(id==='browserOCR'?'ocr':c[2])}<span>${name(c)}</span>`+(customizing?`<span class="qb-star" aria-hidden="true">${icon('star')}</span>`:'');
    b.title=t(c[5],c[6])+(customizing?'':' — '+t('right-click to add to or remove from favourites','انقر بالزر الأيمن للإضافة إلى المفضلة أو الإزالة منها'));
    if(customizing){b.setAttribute('aria-pressed',String(fav));b.setAttribute('aria-label',t(`${c[3]} — favourite`,`${c[4]} — مفضلة`));}
    b.onclick=()=>customizing?toggleFav(id):openTool(id);
    b.oncontextmenu=(e)=>{e.preventDefault();toggleFav(id);};
    b.ondragstart=(e)=>{dragId=id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);b.classList.add('is-dragging');};
    b.ondragend=()=>{dragId=null;b.classList.remove('is-dragging');root.querySelectorAll('.is-drop').forEach((x)=>x.classList.remove('is-drop'));};
    if(tab==='favs'){
      b.ondragover=(e)=>{if(dragId&&dragId!==id){e.preventDefault();b.classList.add('is-drop');}};
      b.ondragleave=()=>b.classList.remove('is-drop');
      b.ondrop=(e)=>{e.preventDefault();if(!dragId||dragId===id)return;favs=favs.includes(dragId)?moveItem(favs,dragId,index):[...favs.slice(0,index),dragId,...favs.slice(index)];saveFavs();draw();};
      b.onkeydown=(e)=>{ // keyboard reordering for people who do not use a mouse
        if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
        const rtl=document.documentElement.dir==='rtl',dir=(e.key==='ArrowRight')!==rtl?1:-1;
        favs=moveItem(favs,id,index+dir);saveFavs();draw();toolsEl.querySelector(`[data-tool="${id}"]`)?.focus();
      };
    }
    return b;
  }
  function drawTools(){
    const list=tab==='favs'?favs.map((id)=>byId.get(id)):catalog.filter((c)=>c[1]===tab);
    toolsEl.setAttribute('aria-label',t('Quick tools','الأدوات السريعة'));
    toolsEl.replaceChildren(...list.map(toolButton));
    if(tab==='favs'&&!list.length){const p=document.createElement('p');p.className='qb-empty';p.textContent=t('No favourites yet. Open a group and press the star, or right-click a tool.','لا توجد مفضلة بعد. افتح مجموعة واضغط النجمة، أو انقر بالزر الأيمن على أداة.');toolsEl.append(p);}
  }
  function setCollapsed(v){root.classList.toggle('is-collapsed',v);store.set('pwaraq-qb-collapsed',v?'1':'0');drawSide();}
  function drawSide(){
    const custom=root.querySelector('.qb-custom'),reset=root.querySelector('.qb-reset'),col=root.querySelector('.qb-collapse'),collapsed=root.classList.contains('is-collapsed');
    custom.innerHTML=icon(customizing?'check':'star')+`<span>${customizing?t('Done','تم'):t('Customize','تخصيص')}</span>`;custom.setAttribute('aria-pressed',String(customizing));
    custom.title=t('Choose favourite tools. Drag to reorder, or use Alt + arrow keys.','اختر أدواتك المفضلة. اسحب لإعادة الترتيب، أو استخدم Alt مع الأسهم.');
    reset.hidden=!customizing;reset.textContent=t('Reset','استعادة');
    col.innerHTML=icon(collapsed?'chevron-down':'chevron-up');col.title=col.ariaLabel=collapsed?t('Show quick tools','إظهار الأدوات السريعة'):t('Hide quick tools','إخفاء الأدوات السريعة');
    col.setAttribute('aria-expanded',String(!collapsed));
  }
  root.querySelector('.qb-custom').onclick=()=>{customizing=!customizing;root.classList.toggle('is-customizing',customizing);draw();};
  root.querySelector('.qb-reset').onclick=()=>{favs=DEFAULT_FAVS.filter((id)=>byId.has(id));saveFavs();draw();};
  root.querySelector('.qb-collapse').onclick=()=>setCollapsed(!root.classList.contains('is-collapsed'));

  // ---------- my shortcuts: map any key combination to any tool (works only while switched on) ----------
  const RESERVED=new Set(['Ctrl+F','Ctrl+0','Ctrl+1','Ctrl+2','Ctrl+=','Ctrl+-','Ctrl+K','Ctrl+P','Ctrl+S','Ctrl+Z','Ctrl+Y','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+A','F4','H','Z','Space','Escape','Tab','Enter']);
  let shortcuts=readShortcuts(store.get('pwaraq-shortcuts','{}'),byId);
  const shortcutsOn=()=>store.get('pwaraq-shortcuts-on','0')==='1';
  document.addEventListener('keydown',(e)=>{
    if(!shortcutsOn()||e.repeat||document.querySelector('dialog[open]'))return;
    const el=e.target;if(el?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const id=shortcuts[comboOf(e)];if(id&&byId.has(id)&&hasPages()){e.preventDefault();e.stopPropagation();openTool(id);}
  },true);
  function openShortcuts(){
    if(!modal)return;
    const options=(sel)=>catalog.map((c)=>`<option value="${c[0]}"${c[0]===sel?' selected':''}>${name(c)}</option>`).join('');
    const rows=()=>Object.entries(shortcuts).map(([combo,id])=>`<li class="sc-row"><kbd>${combo.replace(/\+/g,' + ')}</kbd><select data-combo="${combo}" aria-label="${t('Tool for','الأداة لـ')} ${combo}">${options(id)}</select><button type="button" class="qb-icon" data-remove="${combo}" aria-label="${t('Remove','إزالة')} ${combo}">${icon('close')}</button></li>`).join('')||`<li class="qb-empty">${t('No shortcuts yet.','لا توجد اختصارات بعد.')}</li>`;
    modal(t('My shortcuts','اختصاراتي'),`
      <label class="pw-check"><input type="checkbox" id="scOn"${shortcutsOn()?' checked':''}> ${t('Use my shortcuts (they work only while this is on, and not while typing)','استخدم اختصاراتي (تعمل فقط عند التفعيل، ولا تعمل أثناء الكتابة)')}</label>
      <ul class="sc-list" id="scList">${rows()}</ul>
      <div class="sc-add"><select id="scTool" aria-label="${t('Tool','الأداة')}">${options('pageEditor')}</select><button type="button" class="qb-btn" id="scKey">${icon('plus')}<span>${t('Press a key to assign','اضغط مفتاحاً لتعيينه')}</span></button></div>
      <p class="pw-muted" id="scNote" role="status">${t('Examples: Alt+1, Ctrl+Shift+M, F6. Keys the viewer already uses are kept free.','أمثلة: Alt+1 أو Ctrl+Shift+M أو F6. المفاتيح التي يستخدمها العارض تبقى محفوظة.')}</p>`);
    const list=document.getElementById('scList'),note=document.getElementById('scNote');
    const save=()=>{store.set('pwaraq-shortcuts',JSON.stringify(shortcuts));list.innerHTML=rows();};
    document.getElementById('scOn').onchange=(e)=>store.set('pwaraq-shortcuts-on',e.target.checked?'1':'0');
    list.onchange=(e)=>{const c=e.target.dataset.combo;if(c){shortcuts[c]=e.target.value;save();}};
    list.onclick=(e)=>{const c=e.target.closest('[data-remove]')?.dataset.remove;if(c){delete shortcuts[c];save();}};
    const keyBtn=document.getElementById('scKey');
    keyBtn.onclick=()=>{
      keyBtn.classList.add('is-listening');keyBtn.querySelector('span').textContent=t('Press the keys now… (Esc cancels)','اضغط المفاتيح الآن… (Esc للإلغاء)');
      const listen=(e)=>{
        if(['Control','Shift','Alt','Meta'].includes(e.key))return;
        e.preventDefault();e.stopPropagation();document.removeEventListener('keydown',listen,true);keyBtn.classList.remove('is-listening');
        keyBtn.querySelector('span').textContent=t('Press a key to assign','اضغط مفتاحاً لتعيينه');
        if(e.key==='Escape')return;
        const combo=comboOf(e);
        if(RESERVED.has(combo)){note.textContent=t(`${combo} is already used by Waraq. Try another, e.g. Alt+1.`,`${combo} مستخدم في ورق. جرّب غيره، مثل Alt+1.`);return;}
        if(!/^(Ctrl|Alt|Shift)\+|^F\d+$/.test(combo)){note.textContent=t('Use a combination with Ctrl, Alt or Shift, or a function key (F1–F12), so it never fires while you read.','استخدم تركيبة مع Ctrl أو Alt أو Shift، أو مفتاح وظيفة (F1–F12)، حتى لا تعمل أثناء القراءة.');return;}
        const id=document.getElementById('scTool').value;shortcuts[combo]=id;save();
        note.textContent=t(`${combo} now opens “${byId.get(id)[3]}”.`,`${combo} يفتح الآن «${byId.get(id)[4]}».`);
        if(!shortcutsOn()){store.set('pwaraq-shortcuts-on','1');document.getElementById('scOn').checked=true;}
      };
      document.addEventListener('keydown',listen,true);
    };
  }

  function draw(){drawTabs();drawTools();drawSide();}
  function refresh(){const show=!!hasPages();if(root.hidden===show)root.hidden=!show;}
  draw();
  return {translate:draw,refresh,openShortcuts};
}
