/* Every applied tool result adds a document source (parsed PDF, preview engine, original bytes). Sources that no
   page and no undo step refers to any more are released, so repeated edits do not keep every old copy in memory.
   Slots stay in the array (page records refer to sources by index); only their contents are dropped. */
export function referencedSources(pages,history){
  const used=new Set();
  for(const p of pages)if(p.source!==null&&p.source!==undefined)used.add(p.source);
  for(const snapshot of history)for(const p of snapshot)if(p.source!==null&&p.source!==undefined)used.add(p.source);
  return used;
}
export function releaseUnusedSources(sources,pages,history){
  const used=referencedSources(pages,history);let released=0;
  sources.forEach((s,i)=>{
    if(!s||s.released||used.has(i))return;
    try{s.viewer?.destroy?.();}catch{}
    s.doc=null;s.viewer=null;s.originalBytes=null;s.renderId=null;s.released=true;released++;
  });
  return released;
}
