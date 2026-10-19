import {showDesktopDownloads} from './downloads.js';
import {icon} from './icons.js';
let installPrompt=null;
export async function setupOffline({t,modal}){
 const $=s=>document.querySelector(s),desktop=window.waraqDesktop?.isDesktop,dialog=$('#dialog');
 const refresh=()=>{if($('#connectionStatus'))$('#connectionStatus').textContent=desktop?t('Desktop · offline','سطح المكتب · دون اتصال'):navigator.onLine?t('Browser mode','وضع المتصفح'):t('Offline mode','وضع عدم الاتصال');};
 window.addEventListener('online',refresh);window.addEventListener('offline',refresh);refresh();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
 if('serviceWorker'in navigator&&!desktop){
  // When a new release takes over this page, reload once so the page and its code come from the same release.
  const hadController=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloaded){reloaded=true;location.reload();}});
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then((r)=>r.update()).catch(()=>{});
 }
 let downloadApi=null;
 dialog.addEventListener('close',()=>{dialog.classList.remove('download-pop');downloadApi?.dispose();downloadApi=null;});
 const share='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 9H4v12h16V9h-3M12 15V2m-4 4 4-4 4 4"/></svg>';
 const plus='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/></svg>';
 function deviceKind(){if(window.waraqDesktop?.isDesktop)return 'windows';const ua=navigator.userAgent;const ipad=/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);return ipad||/Android|iPhone|iPod|Mobi|Windows Phone|Silk|KAIOS/i.test(ua)?'phone':'windows';}
 function open(selected='phone'){
  modal(t('Waraq, wherever you work','ورق، أينما تعمل'),`<div class="download-tabs" role="group" aria-label="${t('Download options','خيارات التنزيل')}"><button data-panel="phone">${icon('install')}${t('Phone','الهاتف')}</button><button data-panel="windows">${icon('device')}Windows</button><button data-panel="website">${icon('download')}${t('Website ZIP','الموقع ZIP')}</button></div><section id="downloadPanel"></section>`);
  dialog.classList.add('download-pop');
  async function panel(name){downloadApi?.dispose();downloadApi=null;document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===name)));const target=$('#downloadPanel');
   if(name==='phone'){
    target.innerHTML=`<div class="phone-title"><img src="brand-mark.svg" alt="" width="42" height="42"><div><h3>${t('A place on your home screen','مكان على شاشتك الرئيسية')}</h3><p>${t('Open in Safari on iPhone or iPad.','افتح الموقع في سفاري على آيفون أو آيباد.')}</p></div></div><ol class="install-steps"><li>${t('Tap Share','اضغط مشاركة')} <span class="share-symbol">${share}</span></li><li>${t('Choose Add to Home Screen, then Add.','اختر إضافة إلى الشاشة الرئيسية، ثم إضافة.')}</li></ol><div class="share-demo" aria-label="${t('Illustration of the Safari share menu','رسم توضيحي لقائمة المشاركة في سفاري')}"><div class="sheet-handle"></div><div class="share-site"><img src="brand-mark.svg" width="30" height="30" alt=""><b>ورق / Waraq</b><span>${share}</span></div><div class="share-menu-item">${icon('bookmark')}<span>${t('Add Bookmark','إضافة إشارة مرجعية')}</span></div><div class="share-menu-item home-highlight">${plus}<strong>${t('Add to Home Screen','إضافة إلى الشاشة الرئيسية')}</strong></div><small>${t('Illustration · menu appearance varies by iOS version','رسم توضيحي · يختلف شكل القائمة حسب إصدار iOS')}</small></div><p class="install-note">${t('If shown, turn on Open as Web App. On Android, use the browser menu → Install app / Add to Home screen.','فعّل فتح كتطبيق ويب إن ظهر. في أندرويد: قائمة المتصفح ← تثبيت التطبيق / إضافة إلى الشاشة الرئيسية.')}</p><div class="popup-actions">${installPrompt?`<button id="nativeInstall" class="primary">${t('Install app','تثبيت التطبيق')}</button>`:''}<button id="preparePhone">${icon('download')}${t('Save for offline use','الحفظ دون اتصال')}</button></div><p id="cacheStatus" role="status"></p>`;
    if($('#nativeInstall'))$('#nativeInstall').onclick=async()=>{await installPrompt.prompt();installPrompt=null;$('#nativeInstall').hidden=true;};
    $('#preparePhone').onclick=async()=>{const button=$('#preparePhone'),status=$('#cacheStatus');button.disabled=true;let channel,timer;try{status.textContent=t('Saving app and OCR models…','جارٍ حفظ التطبيق ونماذج OCR…');await navigator.serviceWorker.register('./sw.js');const registration=await navigator.serviceWorker.ready;channel=new MessageChannel();await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),180000);channel.port1.onmessage=e=>{if(e.data.progress)status.textContent=t('Saving files: ','حفظ الملفات: ')+e.data.progress+'/'+e.data.total;if(e.data.done)resolve();if(e.data.error)reject(Error(e.data.error));};registration.active.postMessage({type:'CACHE_ALL'},[channel.port2]);});status.textContent=t('Ready for offline use. Browser storage may be cleared; engine tools need their own server.','جاهز دون اتصال. قد يمسح المتصفح التخزين؛ وتحتاج أدوات المحركات إلى خادمها.');}catch{status.textContent=t('Could not complete offline storage. Retry while connected.','تعذر إكمال التخزين. حاول مجدداً أثناء الاتصال.');}finally{clearTimeout(timer);channel?.port1.close();button.disabled=false;}};
   }else if(name==='windows'){
    if(desktop){target.innerHTML=`<p>${t('You are already using the offline desktop edition.','أنت تستخدم إصدار سطح المكتب دون اتصال بالفعل.')}</p>`;return;}
    target.innerHTML='<div id="popupWindows"></div><p class="install-note">'+t('v0.3.3 · Unsigned preview. Keep this popup open until the file is saved.','v0.3.3 · إصدار تجريبي غير موقّع. أبقِ النافذة مفتوحة حتى حفظ الملف.')+'</p>';const container=$('#popupWindows');const api=await showDesktopDownloads(container,t);if(!container.isConnected||!dialog.open)api.dispose();else downloadApi=api;
   }else target.innerHTML=`<div class="zip-summary">${icon('download')}<h3>${t('Your own offline workspace','مساحتك الخاصة دون اتصال')}</h3><p>${t('Website, PDF tools and Arabic/English OCR. About 16 MB.','الموقع وأدوات PDF وOCR بالعربية والإنجليزية. نحو 16 ميغابايت.')}</p><a class="primary button-link" href="offline/waraq-offline.zip" download>${t('Download ZIP','تنزيل ZIP')}</a><p class="install-note">${t('Extract, then run START-WARAQ.cmd. Requires Node.js 22+. Native engine tools need separate dependencies.','فك الضغط ثم شغّل START-WARAQ.cmd. يتطلب Node.js 22 أو أحدث. تحتاج أدوات المحركات إلى اعتماديات منفصلة.')}</p></div>`;
  }
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>panel(b.dataset.panel));panel(selected);
 }
 // The installed app updates itself (see update-badge.js), so it shows no download or install buttons.
 if(desktop){$('#offlineDownload')?.remove();$('#installApp')?.remove();return refresh;}
 $('#offlineDownload').onclick=()=>open(deviceKind());
 $('#installApp').hidden=false;$('#installApp').onclick=()=>open(deviceKind());
 if(new URLSearchParams(location.search).has('downloads')){open(deviceKind());history.replaceState(null,'',location.pathname);}
 return refresh;
}
