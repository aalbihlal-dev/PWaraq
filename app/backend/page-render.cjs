'use strict';
// Page images drawn by MuPDF for the desktop viewer and thumbnails. CAD exports can hold millions of drawing commands
// per page; the browser's PDF engine needs tens of seconds for those, MuPDF (native) far less.
// A document is uploaded once (POST /api/render/doc, raw bytes) and then pages are requested by width:
// GET /api/render/<id>/<page>?w=<pixels>. Files live in a private temp folder that is removed when the app exits.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {run}=require('./engines.cjs');
const ROOT=path.join(os.tmpdir(),'pwaraq-render-'+process.pid+'-'+crypto.randomBytes(4).toString('hex'));
const MAX_DOCS=4,MAX_PARALLEL=2,docs=new Map();let active=0;const waiting=[];
process.once('exit',()=>{try{fs.rmSync(ROOT,{recursive:true,force:true});}catch{}});
function limited(fn){return new Promise((resolve,reject)=>{const go=()=>{active++;fn().then(resolve,reject).finally(()=>{active--;waiting.shift()?.();});};active<MAX_PARALLEL?go():waiting.push(go);});}
async function readBody(req,max){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>max){const e=new Error('Too large');e.status=413;throw e;}chunks.push(c);}return Buffer.concat(chunks);}
async function evict(){
  if(docs.size<=MAX_DOCS)return;
  const [oldest]=[...docs.entries()].sort((a,b)=>a[1].used-b[1].used);docs.delete(oldest[0]);
  for(const name of await fsp.readdir(ROOT).catch(()=>[]))if(name.startsWith(oldest[0]))await fsp.rm(path.join(ROOT,name),{force:true}).catch(()=>{});
}
/** Handles /api/render/* routes. Returns true when the request was handled. */
async function handleRender(req,res,url,engines,{json,maxBytes}){
  if(!url.pathname.startsWith('/api/render/'))return false;
  const mutool=await engines.renderer?.();
  if(!mutool){json(res,503,{error:'Page rendering needs the MuPDF engine.',code:'ENGINE_UNAVAILABLE'});return true;}
  if(req.method==='POST'&&url.pathname==='/api/render/doc'){
    if(req.headers['x-waraq-client']!=='1'){json(res,403,{error:'X-Waraq-Client: 1 is required.',code:'CLIENT_REQUIRED'});return true;}
    const body=await readBody(req,maxBytes);
    if(!body.subarray(0,1024).includes(Buffer.from('%PDF-'))){json(res,415,{error:'This is not a PDF.',code:'FILE_TYPE'});return true;}
    const id=crypto.createHash('sha256').update(body).digest('hex').slice(0,32);
    if(!docs.has(id)){await fsp.mkdir(ROOT,{recursive:true});await fsp.writeFile(path.join(ROOT,id+'.pdf'),body,{mode:0o600});}
    docs.set(id,{used:Date.now()});await evict();
    json(res,200,{id});return true;
  }
  const tile=url.pathname.match(/^\/api\/render\/([0-9a-f]{32})\/(\d{1,5})\/tile$/);
  if(req.method==='GET'&&tile)return renderTile(res,url,mutool,tile[1],Number(tile[2]),json);
  const m=url.pathname.match(/^\/api\/render\/([0-9a-f]{32})\/(\d{1,5})$/);
  if(req.method!=='GET'||!m){json(res,404,{error:'Unknown render request.',code:'NOT_FOUND'});return true;}
  const [,id,pageText]=m,page=Number(pageText),doc=docs.get(id);
  if(!doc){json(res,404,{error:'Document is no longer cached; upload it again.',code:'DOC_EXPIRED'});return true;}
  doc.used=Date.now();
  // Reading a CAD page costs MuPDF the same at any size (about 6 s for 14.6 million commands), so a few fixed sizes
  // are drawn and the screen scales them: zooming rarely triggers a new draw.
  const asked=Math.min(8192,Math.max(32,Math.round(Number(url.searchParams.get('w'))||800)));
  const width=[256,1024,2048,4096,8192].find((b)=>b>=asked)||8192;
  const out=path.join(ROOT,`${id}-${page}-${width}-l1.png`);
  if(!fs.existsSync(out)){
    // -l 1: lines never thinner than one pixel. CAD drawings are full of hairlines; scaled down without this they
    // fade to near-white and the drawing looks half missing (browsers and CAD viewers keep them at one pixel too).
    try{await limited(()=>run(mutool,['draw','-q','-l','1','-w',String(width),'-o',out,path.join(ROOT,id+'.pdf'),String(page)],{cwd:ROOT,timeout:300_000}).catch(()=>run(mutool,['draw','-l','1','-w',String(width),'-o',out,path.join(ROOT,id+'.pdf'),String(page)],{cwd:ROOT,timeout:300_000})));}
    catch{json(res,422,{error:'MuPDF could not draw this page.',code:'RENDER_FAILED'});return true;}
  }
  const png=await fsp.readFile(out);
  res.writeHead(200,{'Content-Type':'image/png','Content-Length':png.length,'Cache-Control':'private, max-age=3600'});res.end(png);return true;
}
// Deep zoom: only the visible part of a page is drawn, at full sharpness (a whole A0 drawing at 800 % would be
// ~50 000 px wide). GET /api/render/<id>/<page>/tile?s=<pixels per point>&x=&y=&w=&h= (pixels at that scale).
const REGION_JS=`var a=scriptArgs,doc=Document.openDocument(a[0]),page=doc.loadPage(parseInt(a[1],10)-1);
var s=parseFloat(a[2]),x=parseInt(a[3],10),y=parseInt(a[4],10),w=parseInt(a[5],10),h=parseInt(a[6],10);
var pix=new Pixmap(ColorSpace.DeviceRGB,[x,y,x+w,y+h],false);pix.clear(255);
var dev=new DrawDevice(Matrix.identity,pix);page.run(dev,Matrix.scale(s,s));dev.close();pix.saveAsPNG(a[7]);`;
async function renderTile(res,url,mutool,id,page,json){
  const doc=docs.get(id);
  if(!doc){json(res,404,{error:'Document is no longer cached; upload it again.',code:'DOC_EXPIRED'});return true;}
  doc.used=Date.now();
  const q=(k)=>Number(url.searchParams.get(k)),scale=Math.round(q('s')*1000)/1000,[x,y,w,h]=['x','y','w','h'].map((k)=>Math.round(q(k)));
  if(!(scale>=0.05&&scale<=64)||![x,y].every((v)=>Number.isFinite(v)&&v>=0&&v<=1e6)||![w,h].every((v)=>Number.isFinite(v)&&v>=16&&v<=4096)){
    json(res,400,{error:'Tile size or position is out of range.',code:'BAD_TILE'});return true;}
  const script=path.join(ROOT,'region.js');if(!fs.existsSync(script))await fsp.writeFile(script,REGION_JS);
  const out=path.join(ROOT,`${id}-${page}-t${scale}-${x}-${y}-${w}-${h}.png`);
  if(!fs.existsSync(out)){
    try{await limited(()=>run(mutool,['run',script,path.join(ROOT,id+'.pdf'),String(page),String(scale),String(x),String(y),String(w),String(h),out],{cwd:ROOT,timeout:300_000}));}
    catch{json(res,422,{error:'MuPDF could not draw this part of the page.',code:'RENDER_FAILED'});return true;}
  }
  const png=await fsp.readFile(out);
  res.writeHead(200,{'Content-Type':'image/png','Content-Length':png.length,'Cache-Control':'private, max-age=3600'});res.end(png);return true;
}
module.exports={handleRender};
