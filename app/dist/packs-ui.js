// Desktop add-on packs (Office & CAD, OCR): offered the first time a tool needs one, and listed in Preferences.
// The download, checksum check and unpacking happen in the desktop app (desktop/packs.cjs); this only shows them.
const api=()=>window.waraqDesktop?.packs;
let list=[];const listeners=new Set();
if(api()){api().status().then((l)=>{list=l||[];listeners.forEach((f)=>f(list));}).catch(()=>{});api().onChange((l)=>{list=l||[];listeners.forEach((f)=>f(list));});}
const mb=(n)=>Math.max(1,Math.round(n/1048576))+' MB';
export const packsSupported=()=>!!api();
/** The pack an operation needs, when it is not installed yet (null when nothing is missing). */
export function missingPack(op){const p=list.find((x)=>x.ops.includes(op));return p&&!p.installed&&p.available?p:null;}
export function packLabel(op,t){const p=missingPack(op);return p?t(`Add-on · ${mb(p.size)}`,`إضافة · ${mb(p.size)}`):'';}
function progressText(p,t){
  const j=p.job;if(!j)return '';
  if(j.phase==='download')return t(`Downloading ${Math.floor(100*j.done/Math.max(1,j.total))}% (${mb(j.done)} of ${mb(j.total)})`,`جارٍ التنزيل ${Math.floor(100*j.done/Math.max(1,j.total))}٪ (${mb(j.done)} من ${mb(j.total)})`);
  if(j.phase==='unpack')return t('Checked. Unpacking…','تم التحقق. جارٍ فك الحزمة…');
  if(j.phase==='error')return t('Could not install: ','تعذر التثبيت: ')+j.message;
  return '';
}
/** Offers the missing pack for `op`. Returns true when it took over (the tool then runs after the install). */
export async function offerPack(ctx,op,then){
  const p=missingPack(op);if(!p)return false;const {t}=ctx;
  ctx.modal(t(p.label[0]+' needed',p.label[1]+' مطلوبة'),`
    <p>${t(p.detail[0],p.detail[1])}</p>
    <p class="pw-muted">${t(`One-time download of ${mb(p.size)} (${mb(p.unpacked)} on disk). It is checked against the checksum built into Waraq, then installed for this Windows user. You can remove it in Preferences.`,`تنزيل لمرة واحدة بحجم ${mb(p.size)} (${mb(p.unpacked)} على القرص). يُتحقق منه ببصمة مدمجة في ورق ثم يُثبَّت لهذا المستخدم. يمكنك إزالته من التفضيلات.`)}</p>
    <progress id="packProgress" max="100" value="0" hidden style="width:100%"></progress>
    <p id="packStatus" role="status" aria-live="polite"></p>
    <button type="button" class="primary" id="packGo">${t(`Download and continue (${mb(p.size)})`,`نزّل وتابع (${mb(p.size)})`)}</button>`);
  const go=document.querySelector('#packGo'),bar=document.querySelector('#packProgress'),line=document.querySelector('#packStatus');
  let started=false;
  const update=(l)=>{
    const now=l.find((x)=>x.name===p.name);if(!now||!started||!go.isConnected)return;
    line.textContent=progressText(now,t);
    if(now.job?.phase==='download'){bar.hidden=false;bar.value=100*now.job.done/Math.max(1,now.job.total);}
    if(now.job?.phase==='error'){go.disabled=false;go.textContent=t('Try again','حاول مجدداً');started=false;}
    if(now.installed){listeners.delete(update);line.textContent=t('Installed. Starting the tool…','تم التثبيت. جارٍ تشغيل الأداة…');setTimeout(()=>{document.querySelector('#dialog')?.close();then();},400);}
  };
  listeners.add(update);document.querySelector('#dialog')?.addEventListener('close',()=>listeners.delete(update),{once:true});
  go.onclick=()=>{started=true;go.disabled=true;line.textContent=t('Starting the download…','جارٍ بدء التنزيل…');api().install(p.name);};
  return true;
}
/** Preferences → Add-on packs: what is installed, sizes, install or remove. */
export function openPacks(ctx){
  const {t}=ctx;
  const row=(p)=>`<li class="pack-row"><div><b>${t(...p.label)}</b><p class="pw-muted">${t(...p.detail)}</p><p class="pw-muted" data-pack-status="${p.name}">${p.installed?t(`Installed · ${mb(p.unpacked)} on disk`,`مثبتة · ${mb(p.unpacked)} على القرص`):p.job?progressText(p,t):t(`Not installed · ${mb(p.size)} download`,`غير مثبتة · تنزيل ${mb(p.size)}`)}</p></div>${p.installed?`<button type="button" data-pack-remove="${p.name}">${t('Remove','إزالة')}</button>`:`<button type="button" class="primary" data-pack-install="${p.name}" ${p.job&&p.job.phase!=='error'?'disabled':''}>${t('Install','تثبيت')}</button>`}</li>`;
  ctx.modal(t('Add-on packs','الحزم الإضافية'),`<p>${t('Heavy engines are downloaded only when you need them, so Waraq stays small.','تُنزَّل المحركات الكبيرة فقط عند الحاجة، ليبقى ورق صغيراً.')}</p><ul class="pack-list" id="packList">${list.map(row).join('')}</ul>`);
  const ul=document.querySelector('#packList');
  const render=(l)=>{if(ul.isConnected)ul.innerHTML=l.map(row).join('');};
  listeners.add(render);document.querySelector('#dialog')?.addEventListener('close',()=>listeners.delete(render),{once:true});
  ul.onclick=(e)=>{const i=e.target.closest('[data-pack-install]')?.dataset.packInstall,r=e.target.closest('[data-pack-remove]')?.dataset.packRemove;if(i)api().install(i);if(r)api().remove(r);};
}
export function onPacksChange(f){listeners.add(f);}
