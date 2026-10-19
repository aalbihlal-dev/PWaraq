'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('waraqDesktop',Object.freeze({isDesktop:true,offline:true,version:'0.3.3',platform:process.platform,takeOpenFiles:()=>ipcRenderer.invoke('waraq:take-open-files'),onOpenFiles:(callback)=>{ipcRenderer.on('waraq:open-files',()=>callback());},getUpdateStatus:()=>ipcRenderer.invoke('waraq:get-update-status'),installUpdate:()=>ipcRenderer.invoke('waraq:install-update'),packs:Object.freeze({status:()=>ipcRenderer.invoke('waraq:packs-status'),install:(name)=>ipcRenderer.invoke('waraq:pack-install',String(name)),remove:(name)=>ipcRenderer.invoke('waraq:pack-remove',String(name)),onChange:(callback)=>{ipcRenderer.on('waraq:packs',(_event,list)=>callback(list));}}),onMenu:(callback)=>{ipcRenderer.on('waraq:menu',(_event,action)=>{if(action==='open'||action==='close')callback(action);});},onUpdateStatus:(callback)=>{ipcRenderer.on('waraq:update-status',(_event,status)=>callback(status));}}));
// Only trusted pointer/keyboard activation of an external link reaches the main process.
window.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('click',event=>{
    if(!event.isTrusted || event.defaultPrevented || event.button!==0)return;
    const anchor=event.target.closest?.('a[href]');if(!anchor)return;
    let url;try{url=new URL(anchor.href,location.href);}catch{return;}
    if(url.origin===location.origin)return;
    event.preventDefault();event.stopPropagation();
    if(url.protocol==='https:')ipcRenderer.send('waraq:external-link',url.href);
  },true);
});
