// Regression tests for BOUNDARY-REVIEW-2026-10-12.md: source retention, recovery limits, batch name collisions.
const assert=require('node:assert/strict'),path=require('node:path');
const load=(f)=>import(require('node:url').pathToFileURL(path.join(require('node:path').join(__dirname,'..'),'dist',f)));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
(async()=>{
 const {releaseUnusedSources}=await load('source-pool.js');
 await check('finding 1: 30 applied results keep only the copies that pages and undo still use',async()=>{
  const destroyed=[];const sources=Array.from({length:30},(_,i)=>({doc:{},viewer:{destroy:()=>destroyed.push(i)},originalBytes:new Uint8Array(1024*1024),name:'r'+i}));
  const pages=[{source:29,index:0}],history=Array.from({length:20},(_,k)=>[{source:9+k,index:0}]); // history capped at 20 steps
  const released=releaseUnusedSources(sources,pages,history);
  assert.equal(released,9,'sources 0-8 are no longer reachable');
  assert.deepEqual(destroyed,[0,1,2,3,4,5,6,7,8],'their preview engines are destroyed');
  assert.ok(sources.slice(0,9).every(s=>s.released&&s.originalBytes===null&&s.doc===null));
  assert.ok(sources.slice(9).every(s=>!s.released&&s.originalBytes),'reachable sources are untouched');
  assert.equal(releaseUnusedSources(sources,pages,history),0,'idempotent');
  assert.equal(releaseUnusedSources(sources,[{source:null,index:0}],[]),21,'blank pages reference nothing');
 });

 const {createRecoveryScheduler}=await load('workspace-plus.js');
 const harness=(opts)=>{const queue=[];const timers={set:(fn)=>{queue.push(fn);return queue.length;},clear:(id)=>{queue[id-1]=null;}};let stored='older copy';const statuses=[];
  const store={save:opts.save||(async(r)=>{stored=r;}),clear:async()=>{stored=null;}};
  const s=createRecoveryScheduler({store,timers,isEnabled:()=>true,name:()=>'doc',onStatus:(x)=>statuses.push(x),...opts.sched});
  return{s,run:async()=>{for(const fn of queue.splice(0))if(fn)await fn();},get stored(){return stored;},statuses};};
 await check('finding 2: crossing the page limit clears the stale copy and reports it',async()=>{
  const h=harness({sched:{getPageCount:()=>1001,maxPages:1000,output:async()=>new Uint8Array(1)}});h.s.schedule();await h.run();await new Promise(r=>setImmediate(r));
  assert.equal(h.stored,null,'older copy removed, so it cannot be restored by mistake');assert.deepEqual(h.statuses,['too-large']);
 });
 await check('finding 2: crossing the size limit clears the stale copy and reports it',async()=>{
  const h=harness({sched:{getPageCount:()=>5,maxBytes:10,output:async()=>new Uint8Array(11)}});h.s.schedule();await h.run();
  assert.equal(h.stored,null);assert.deepEqual(h.statuses,['too-large']);
 });
 await check('finding 2: a failed save (storage full) is reported, a good save is confirmed',async()=>{
  const bad=harness({save:async()=>{throw new Error('QuotaExceededError');},sched:{getPageCount:()=>5,output:async()=>new Uint8Array(3)}});bad.s.schedule();await bad.run();
  assert.deepEqual(bad.statuses,['failed']);
  const good=harness({sched:{getPageCount:()=>5,output:async()=>new Uint8Array(3)}});good.s.schedule();await good.run();
  assert.deepEqual(good.statuses,['saved']);assert.equal(good.stored.pages,5);
 });

 const {uniqueEntry,BATCH_BUDGET}=await load('batch.js');
 await check('finding 3: batch outputs with the same name are all kept',async()=>{
  const taken=new Set();
  assert.deepEqual(['a/report.pdf','b/report.pdf','report.pdf','Report.PDF','report.pdf','notes'].map(n=>uniqueEntry(taken,n)),['a/report.pdf','b/report.pdf','report.pdf','Report (2).PDF','report (3).pdf','notes']);
  assert.equal(uniqueEntry(taken,'notes'),'notes (2)');assert.equal(uniqueEntry(taken,'v1.2/plan'),'v1.2/plan');
  assert.ok(BATCH_BUDGET>=512*1024*1024);
 });
 console.log(passed+' boundary checks passed.');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
