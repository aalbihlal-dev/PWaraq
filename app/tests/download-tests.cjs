'use strict';
// Website download of the Windows installer: parts are fetched several at a time, each is checked, the result is
// byte-exact, and after a failure a retry only fetches the parts that are still missing.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
globalThis.location={href:'https://www.pwaraq.com/',origin:'https://www.pwaraq.com'};
(async()=>{
  const {downloadArtifact}=await import(pathToFileURL(path.join(__dirname,'..','dist','downloads.js')).href);
  const sha=(b)=>crypto.createHash('sha256').update(b).digest('hex');
  const file=crypto.randomBytes(5*1000+123),parts=[];for(let at=0;at<file.length;at+=1000)parts.push(file.subarray(at,at+1000));
  const artifact={filename:'Waraq-Setup-0.3.2-x64.exe',size:file.length,sha256:sha(file),label_en:'x',label_ar:'x',chunks:parts.map((p)=>({path:sha(p)+'.bin',size:p.length,sha256:sha(p)}))};
  const byName=new Map(parts.map((p)=>[sha(p)+'.bin',p]));
  let active=0,peak=0,calls=[],failOnce=new Set([artifact.chunks[3].path]);
  const fetchImpl=async(url)=>{
    const name=String(url).split('/').pop();calls.push(name);active++;peak=Math.max(peak,active);
    await new Promise((r)=>setTimeout(r,5+Math.random()*15)); // parts finish out of order
    active--;
    if(failOnce.delete(name))throw new TypeError('network down');
    const body=byName.get(name);return {ok:!!body,headers:{get:()=>String(body.length)},arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.length)};
  };
  const resume={};
  await assert.rejects(downloadArtifact(artifact,{fetchImpl,resume,parallel:4}),(e)=>e.code==='network'||/network/.test(e.message));
  assert.ok(peak>1&&peak<=4,'several parts at once, never more than 4 (peak '+peak+')');
  const fetchedBefore=calls.length;calls=[];
  const blob=await downloadArtifact(artifact,{fetchImpl,resume,parallel:4});
  assert.ok(calls.length<parts.length,`retry fetched only the missing parts (${calls.length} of ${parts.length}; first try ${fetchedBefore})`);
  assert.equal(sha(Buffer.from(await blob.arrayBuffer())),artifact.sha256,'byte-exact installer');
  console.log('3 download checks passed (parallel, resume, byte-exact).');
})().catch((e)=>{console.error('FAIL',e.message);process.exit(1);});
