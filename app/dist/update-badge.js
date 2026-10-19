/* "Update available" indicator in the top bar.
   Desktop: the app checks automatically; this button shows a newer version and installs it with one click
   (download, checksum, silent install, restart), with progress. Website: compares this site's own public downloads/manifest.json with the
   running version; a newer one means an older cached copy is running, and the badge offers a reload. */
export const APP_VERSION='0.3.3'; // keep equal to package.json "version" (update-tests.cjs checks this)
// Same rule as desktop/release-manifest.cjs and dist/downloads.js: the version is part of the installer name.
const ARTIFACT=/^Waraq-(?:(?:Full|Lite)-)?(?:Setup|Portable)-([0-9]+\.[0-9]+\.[0-9]+)-x64\.exe$/;
export const newer=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};
/** Highest release in a downloads manifest, or null when the manifest is not understood (never a false "update"). */
export function latestFromManifest(manifest){
  if(!manifest||manifest.version!==1||!Array.isArray(manifest.artifacts)||!manifest.artifacts.length)return null;
  const versions=manifest.artifacts.map((a)=>ARTIFACT.exec(a?.filename||'')?.[1]);
  if(versions.some((v)=>!v))return null;
  return versions.sort((a,b)=>newer(a,b)?-1:1)[0];
}
export function decideWebUpdate(current,manifest){const latest=latestFromManifest(manifest);return latest&&newer(latest,current)?{available:true,latest,current}:{available:false,latest,current};}

export function setupUpdateBadge({t,icon}){
  const desktop=window.waraqDesktop?.isDesktop===true;
  const badge=document.createElement('button');badge.type='button';badge.className='pw-update';badge.hidden=true;
  document.querySelector('.header-actions')?.prepend(badge);
  let status=null;
  function render(){
    if(!status?.available){badge.hidden=true;return;}
    badge.hidden=false;const p=status.progress;
    let text=t(`Update to ${status.latest}`,`حدّث إلى ${status.latest}`),detail;
    if(desktop&&p?.phase==='download'){text=t('Downloading update','جارٍ تنزيل التحديث')+' '+Math.floor(100*p.done/Math.max(1,p.total))+'%';detail=text;}
    else if(desktop&&p?.phase==='install'){text=t('Installing… Waraq will restart','جارٍ التثبيت… سيُعاد تشغيل ورق');detail=text;}
    else if(desktop&&p?.phase==='error'){text=t('Update failed — try again','تعذر التحديث — حاول مجدداً');detail=t('The download was interrupted or did not match its checksum. Nothing was changed.','انقطع التنزيل أو لم يطابق بصمته. لم يتغير شيء.');}
    else detail=desktop?t(`Waraq ${status.latest} is available (you have ${status.current}). One click downloads it, checks it, installs it and restarts Waraq. Your files and settings are kept.`,`يتوفر ورق ${status.latest} (لديك ${status.current}). بنقرة واحدة يُنزَّل ويُتحقق منه ويُثبَّت ثم يُعاد تشغيل ورق. تبقى ملفاتك وإعداداتك.`)
      :t(`A newer version (${status.latest}) is ready. Reload to use it.`,`نسخة أحدث (${status.latest}) جاهزة. أعد التحميل لاستخدامها.`);
    const busy=desktop&&(p?.phase==='download'||p?.phase==='install');badge.disabled=busy;badge.classList.toggle('is-busy',busy);
    badge.innerHTML=`<span class="pw-update-dot" aria-hidden="true"></span>${icon('download')}<span>${text}</span>`;
    badge.title=detail;badge.setAttribute('aria-label',text+'. '+detail);
  }
  badge.onclick=async()=>{
    if(desktop){window.waraqDesktop.installUpdate?.();return;}
    try{const reg=await navigator.serviceWorker?.getRegistration();await reg?.update();}catch{}
    location.reload();
  };
  if(desktop){
    window.waraqDesktop.getUpdateStatus?.().then((s)=>{status=s;render();}).catch(()=>{});
    window.waraqDesktop.onUpdateStatus?.((s)=>{status=s;render();});
  }else if(location.protocol==='https:'||location.hostname==='127.0.0.1'||location.hostname==='localhost'){
    // Same-origin public file only; nothing about the user or their documents is sent.
    const check=()=>fetch('./downloads/manifest.json',{cache:'no-store',credentials:'omit'}).then((r)=>r.ok?r.json():null).then((m)=>{status=decideWebUpdate(APP_VERSION,m);render();}).catch(()=>{});
    (window.requestIdleCallback||((fn)=>setTimeout(fn,2000)))(check);
  }
  return{translate:render,get status(){return status;}};
}
