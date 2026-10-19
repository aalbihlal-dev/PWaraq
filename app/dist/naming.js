export function safeStem(filename='document') {
 let stem=String(filename).replace(/\.[a-z0-9]{1,8}$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').trim();
 if(!stem)stem='document';
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem))stem='_'+stem;
 return stem.slice(0,140);
}
export function outputName(original,operation='',extension='pdf') {
 const stem=safeStem(original);const branded=/(?:^|[-_ ])waraq(?:$|[-_ ])/i.test(stem)?stem:stem+'-waraq';
 const suffix=String(operation).replace(/[^a-z0-9-]/gi,'').slice(0,35);
 return branded+(suffix?'-'+suffix:'')+'.'+String(extension).replace(/[^a-z0-9]/gi,'');
}
export function brandDownload(filename) {
 const match=String(filename).match(/\.([a-z0-9]{1,8})$/i);
 return outputName(filename,'',match?.[1]||'pdf');
}
