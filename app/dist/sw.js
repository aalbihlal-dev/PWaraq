const CACHE='waraq-v3-pwaraq-14';
const SHELL=['./','./index.html','./guide.html','./download.html','./download-page.css','./download-page.js','./install.html','./install.js','./brand-mark.svg','./style.css','./typography.css','./spacing.css','./fonts/Tajawal-Regular.ttf','./fonts/Tajawal-Medium.ttf','./fonts/Tajawal-Bold.ttf','./fonts/ReemKufi-Semibold.ttf','./app.js','./core.js','./naming.js','./more-tools.js','./workspace-plus.js','./design.css','./update-badge.js','./quick-bar.js','./packs-ui.js','./crop-tool.js','./source-pool.js','./page-editor.js','./workspace-plus.css','./arabic-text.js','./engine-guide.js','./batch.js','./color-tools.js','./icons.js','./advanced.js','./ocr.js','./integrations.js','./offline.js','./downloads.js','./desktop-downloads.css','./templates.js','./manifest.webmanifest','./app-icon.svg','./vendor/pdf-lib.min.js','./vendor/pdf.min.mjs','./vendor/pdf.worker.min.mjs','./vendor/jszip.min.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('waraq-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
// App code (pages, scripts, styles, lists) comes from the network first so a new release is never mixed with
// files cached from an older one; the cache is only the offline fallback. Large files that never change between
// releases (fonts, PDF/OCR libraries, icons) are served from the cache first.
const STABLE=/\/(?:vendor|fonts|icons)\/|\.(?:ttf|wasm|gz|png)$/;
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||url.pathname.includes('/offline/')||url.pathname.includes('/downloads/'))return;
 const scope=new URL(self.registration.scope).pathname;if(!url.pathname.startsWith(scope))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);
  if(STABLE.test(url.pathname)&&event.request.mode!=='navigate'){const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok&&!response.redirected)await cache.put(event.request,response.clone());return response;}
  try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok&&!response.redirected)await cache.put(event.request,response.clone());return response;}
  catch{return await cache.match(event.request,{ignoreSearch:event.request.mode==='navigate'})||Response.error();}
 })());
});
self.addEventListener('message',event=>{if(event.data?.type!=='CACHE_ALL')return;const port=event.ports[0];event.waitUntil((async()=>{try{const r=await fetch('./offline-assets.json',{cache:'no-store'});if(!r.ok)throw Error('Asset list unavailable');const paths=await r.json();const cache=await caches.open(CACHE);let done=0;for(const path of paths){if(!await cache.match(path))await cache.add(path);port.postMessage({progress:++done,total:paths.length});}port.postMessage({done:true});}catch(e){port.postMessage({error:e.message});}})());});






