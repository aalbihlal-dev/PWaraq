'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createEngineService,ApiError}=require('./backend/engines.cjs');
const {handleRender}=require('./backend/page-render.cjs');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm','.zip':'application/zip','.woff2':'font/woff2'};
const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]','::1']);
function isLoopback(host){return LOOPBACK.has(String(host).toLowerCase());}
function sameToken(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function json(res,status,body){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function parseOrigin(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new ApiError(403,'ORIGIN_DENIED','A valid origin is required.');return u.origin;}

/** Returns an unbound http.Server for Node or Electron. Uses Node built-ins only. */
function createWaraqServer(options={}){
 const env=options.env||process.env,root=path.resolve(options.root||path.join(__dirname,'dist'));
 const bind=options.host||env.WARAQ_BIND||'127.0.0.1',token=env.WARAQ_API_TOKEN||'';
 const origins=new Set((env.WARAQ_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean).map(parseOrigin));
 const publicOrigin=env.WARAQ_PUBLIC_ORIGIN?parseOrigin(env.WARAQ_PUBLIC_ORIGIN):'';
 if(publicOrigin)origins.add(publicOrigin);
 if((!isLoopback(bind)||origins.size)&&token.length<24)throw Error('Set WARAQ_API_TOKEN to at least 24 characters for a non-loopback bind or configured origins.');
 if(publicOrigin&&!publicOrigin.startsWith('https://'))throw Error('WARAQ_PUBLIC_ORIGIN must use HTTPS.');
 const engines=options.engineService||createEngineService({env}),maxInput=engines.maxInputBytes||50*1024*1024,maxBody=Math.ceil(maxInput*4/3)+1024*1024;
 let active=false;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  try{
   const hostURL=new URL('http://'+req.headers.host);
   if(hostURL.username||hostURL.password||hostURL.pathname!=='/')throw new ApiError(403,'HOST_DENIED','Host is not allowed.');
   if(!isLoopback(hostURL.hostname)&&hostURL.host!==(publicOrigin?new URL(publicOrigin).host:null))throw new ApiError(403,'HOST_DENIED','Host is not allowed.');
   const url=new URL(req.url,'http://'+req.headers.host),origin=req.headers.origin?parseOrigin(req.headers.origin):'';
   const sameOrigin=origin==='http://'+req.headers.host||origin==='https://'+req.headers.host;
   if(origin&&!sameOrigin&&!origins.has(origin))throw new ApiError(403,'ORIGIN_DENIED','This website is not in WARAQ_ALLOWED_ORIGINS.');
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','Content-Disposition, X-Waraq-Engine');}
   if(req.method==='OPTIONS'&&url.pathname.startsWith('/api/')){
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Waraq-Client, Authorization, X-Waraq-Filename, X-Waraq-Options');res.setHeader('Access-Control-Max-Age','600');
    if(req.headers['access-control-request-private-network']==='true'&&origin)res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204).end();return;
   }
   if(url.pathname.startsWith('/api/')){
    if(token&&!sameToken(req.headers.authorization||'','Bearer '+token))throw new ApiError(401,'AUTH_REQUIRED','A valid companion access token is required.');
    if(await handleRender(req,res,url,engines,{json,maxBytes:maxInput}))return;
    if(req.method==='GET'&&url.pathname==='/api/capabilities'){json(res,200,await engines.capabilities({refresh:url.searchParams.has('refresh')}));return;}
    if(req.method==='GET'&&url.pathname==='/api/certificates'){json(res,200,{certificates:engines.certificates?await engines.certificates():[]});return;}
    const match=url.pathname.match(/^\/api\/process\/([a-zA-Z]+)$/);
    if(req.method!=='POST'||!match)throw new ApiError(404,'NOT_FOUND','Unknown API endpoint.');
    if(req.headers['x-waraq-client']!=='1')throw new ApiError(403,'CLIENT_REQUIRED','X-Waraq-Client: 1 is required.');
    const raw=/^application\/octet-stream(?:;|$)/i.test(req.headers['content-type']||'');
    if(!raw&&!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ApiError(415,'CONTENT_TYPE','Send application/json or application/octet-stream.');
    if(active){res.setHeader('Retry-After','5');throw new ApiError(429,'BUSY','Another document is processing. Try again when it finishes.');}
    if(Number(req.headers['content-length']||0)>maxBody)throw new ApiError(413,'TOO_LARGE','The document limit is 50 MiB.');
    active=true;
    const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',cancel);res.once('close',cancel);
    try{
     let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBody)throw new ApiError(413,'TOO_LARGE','The document limit is 50 MiB.');chunks.push(chunk);}
     let body;
     if(raw){let options={},filename='document.pdf';try{const h=req.headers['x-waraq-options'];options=h?JSON.parse(Buffer.from(h,'base64').toString('utf8')):{};}catch{throw new ApiError(400,'BAD_OPTION','The options header is not valid.');}try{filename=decodeURIComponent(req.headers['x-waraq-filename']||filename);}catch{}body={filename,bytes:Buffer.concat(chunks),options};}
     else{try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON','The request is not valid JSON.');}}
     const result=await engines.process(match[1],body,controller.signal);if(res.destroyed)return;
     const encodedName=encodeURIComponent(result.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
     res.writeHead(200,{'Content-Type':result.type,'Content-Length':result.bytes.length,'Content-Disposition':'attachment; filename="'+result.filename.replace(/[^a-zA-Z0-9._-]/g,'_')+'"; filename*=UTF-8\'\''+encodedName,'Cache-Control':'no-store','X-Waraq-Engine':result.engine});res.end(result.bytes);
    }finally{active=false;req.off('aborted',cancel);res.off('close',cancel);}return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');throw new ApiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');}
   let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{throw new ApiError(400,'BAD_PATH','Invalid path.');}
   if(decoded.includes('\0')||decoded.split(/[\\/]/).some(p=>p.startsWith('.')))throw new ApiError(403,'PATH_DENIED','Path is not allowed.');
   let file=path.resolve(root,'.'+decoded);if(file===root)file=path.join(root,'index.html');
   if(!file.startsWith(root+path.sep))throw new ApiError(403,'PATH_DENIED','Path is not allowed.');
   let real;try{real=await fs.realpath(file);}catch{throw new ApiError(404,'NOT_FOUND','Not found.');}
   if(!real.startsWith(root+path.sep))throw new ApiError(403,'PATH_DENIED','Path is not allowed.');
   const stat=await fs.stat(real);if(!stat.isFile())throw new ApiError(404,'NOT_FOUND','Not found.');
   res.writeHead(200,{'Content-Type':TYPES[path.extname(real)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
   if(req.method==='HEAD')res.end();else res.end(await fs.readFile(real));
  }catch(e){json(res,e.status||500,{error:e instanceof ApiError?e.message:'The companion could not complete this request.',code:e.code||'INTERNAL_ERROR'});}
 });
 server.engines=engines;server.requestTimeout=60_000;server.headersTimeout=15_000;server.keepAliveTimeout=5_000;server.maxRequestsPerSocket=100;return server;
}
if(require.main===module){const host=process.env.WARAQ_BIND||'127.0.0.1',server=createWaraqServer({host});server.on('error',e=>{console.error('Waraq could not start: '+e.message);process.exitCode=1;});server.listen(Number(process.env.PORT||4173),host,()=>console.log('Waraq: http://'+(host.includes(':')?'['+host+']':host)+':'+server.address().port));}
module.exports={createWaraqServer};
