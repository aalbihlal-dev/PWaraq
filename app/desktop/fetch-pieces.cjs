'use strict';
// Downloads a file published as numbered pieces (the website's 16 MB parts): several pieces are fetched at the same
// time, each is checked against its SHA-256, and they are written strictly in order while the whole file is hashed.
// A failed piece is retried a few times before the download gives up.
const {net}=require('electron');
const fs=require('node:fs'),crypto=require('node:crypto');

async function fetchPiece(url,chunk,tries=3){
  for(let attempt=1;;attempt++){
    try{
      const r=await net.fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
      const bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length!==chunk.size||crypto.createHash('sha256').update(bytes).digest('hex')!==chunk.sha256)throw Error('A downloaded piece is damaged');
      return bytes;
    }catch(e){if(attempt>=tries)throw e;await new Promise((ok)=>setTimeout(ok,1000*attempt));}
  }
}
/** Writes all pieces to `file` and returns the SHA-256 of the whole. onProgress(doneBytes) after every piece. */
async function downloadPieces({chunks,urlOf,file,onProgress=()=>{},parallel=4}){
  const out=fs.createWriteStream(file),whole=crypto.createHash('sha256'),pending=new Map();let next=0,done=0;
  const start=(i)=>{if(i<chunks.length&&!pending.has(i))pending.set(i,fetchPiece(urlOf(chunks[i]),chunks[i]));};
  try{
    for(let i=0;i<Math.min(parallel,chunks.length);i++)start(i);
    for(let i=0;i<chunks.length;i++){
      const bytes=await pending.get(i);pending.delete(i);start(i+parallel); // keep `parallel` pieces in flight
      whole.update(bytes);if(!out.write(bytes))await new Promise((ok)=>out.once('drain',ok));
      done+=bytes.length;onProgress(done);next=i+1;
    }
    await new Promise((ok,fail)=>out.end((e)=>e?fail(e):ok()));
    return whole.digest('hex');
  }catch(e){
    for(const p of pending.values())p.catch(()=>{}); // let the remaining requests finish quietly
    out.destroy();throw e;
  }
}
module.exports={downloadPieces};
