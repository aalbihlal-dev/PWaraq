// Drives the Waraq 1.0 dev build in a visible window: open a PDF, time first drawings, zoom, screenshot.
import {spawn} from 'node:child_process';import fs from 'node:fs';
const [electron,win,file,outDir]=process.argv.slice(2);
const proc=spawn(electron,[win,'http://localhost:5188/?timing'],{stdio:'ignore'});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));let target;
for(let i=0;i<40&&!target;i++){await sleep(500);try{target=(await (await fetch('http://127.0.0.1:9350/json')).json()).find(t=>t.type==='page');}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const logs=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')logs.push('EXC '+m.params.exceptionDetails.exception?.description?.slice(0,200));if(m.method==='Runtime.consoleAPICalled'&&/error|info/.test(m.params.type))logs.push(Math.round((Date.now()-(globalThis.T0||Date.now()))/100)/10+'s '+m.params.args.map(a=>a.value??a.description).join(' ').slice(0,200));});
const send=(method,params={})=>new Promise(r=>{const my=++id;const h=(e)=>{const m=JSON.parse(e.data);if(m.id===my){ws.removeEventListener('message',h);r(m.result);}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:my,method,params}));});
const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${x}})()`,returnByValue:true,awaitPromise:true});return r?.exceptionDetails?'EXC '+r.exceptionDetails.exception?.description?.slice(0,300):r?.result?.value;};
const shot=async(n)=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(outDir+'/'+n+'.png',Buffer.from(s.data,'base64'));};
await send('Runtime.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
for(let i=0;i<40;i++){if(await ev(`return !!document.querySelector('input[type=file]')`))break;await sleep(250);}
await shot('n-0-start');
const t0=Date.now();globalThis.T0=t0;
await ev(`const b=await (await fetch('/_test/${file}')).blob();const dt=new DataTransfer();dt.items.add(new File([b],'${file}',{type:'application/pdf'}));const i=document.querySelector('input[type=file]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 1`);
const drawn=`return [...document.querySelectorAll('.page')].slice(0,3).map(p=>p.querySelector('canvas').width)`;
for(let i=0;i<120;i++){const s=await ev(drawn);if(Array.isArray(s)&&s.length&&s[0]!==300)break;await sleep(250);}
console.log('first page drawn after',Date.now()-t0,'ms', JSON.stringify(await ev(drawn)), 'pages', await ev(`return document.querySelectorAll('.page').length`));
await sleep(Number(process.env.SETTLE||1500));await shot('n-1-open');console.log('engine jobs so far',JSON.stringify(await ev(`return (window.engineTimes||[]).slice(0,12)`)));
// zoom deep at the centre and wait for the sharp tile
const t1=Date.now();await ev(`const s=document.querySelector('.scroller'),r=s.getBoundingClientRect();for(let i=0;i<14;i++)s.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,clientX:r.left+r.width*0.5,clientY:r.top+r.height*0.4,bubbles:true,cancelable:true}));return 1`);
for(let i=0;i<120;i++){if(await ev(`return [...document.querySelectorAll('canvas.tile')].some(c=>!c.hidden)`))break;await sleep(250);}
console.log('sharp zoom tile after',Date.now()-t1,'ms');
await sleep(500);await shot('n-2-zoom');
const term=process.argv[6];if(term){ // SEARCH
 const ts=Date.now();await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,200));const i=document.querySelector('.find input');i.value='${term}';i.dispatchEvent(new Event('input',{bubbles:true}));return 1`);
 let out;for(let i=0;i<120;i++){out=await ev(`return {count:document.querySelector('.find .num')?.textContent,marks:document.querySelectorAll('.marks i').length,spans:document.querySelectorAll('.text span').length,sample:[...document.querySelectorAll('.text span')].slice(0,3).map(s=>s.textContent)}`);if(out.count&&!out.count.includes('…')&&out.count!=='')break;await sleep(250);}
 console.log('search',JSON.stringify(out),'after',Date.now()-ts,'ms','| top bar visible:',await ev(`const r=document.querySelector('.bar').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight`));await shot('n-3-search');}
console.log(logs.join(String.fromCharCode(10)));
ws.close();proc.kill();spawn('taskkill',['/PID',String(proc.pid),'/F','/T'],{stdio:'ignore'});
