'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {createWaraqServer}=require('../server.cjs');
const {createEngineService,run,compatibleStirling,compatibleOcrbase,resolveSchema}=require('./engines.cjs');
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return'http://127.0.0.1:'+server.address().port;}
function close(server){server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}
const pdf=Buffer.from('%PDF-1.7\nfixture\n%%EOF');
const payload={filename:'تجربة.pdf',data:pdf.toString('base64'),options:{}};
const headers={'Content-Type':'application/json','X-Waraq-Client':'1'};
function multipartSchema(properties,required=['fileInput']){return{post:{requestBody:{content:{'multipart/form-data':{schema:{type:'object',properties,required}}}}}};}
const fileInput={type:'string',format:'binary'};

(async()=>{
 let nativeCalls=0;
 const fake={maxInputBytes:1024,capabilities:async()=>({version:1,location:'local',engines:{},operations:{repair:{available:true,engine:'test'}}}),process:async(id,body)=>{nativeCalls++;assert.equal(id,'repair');return{bytes:pdf,filename:'تجربة-repair.pdf',type:'application/pdf',engine:'test'};}};
 const server=createWaraqServer({env:{},engineService:fake}),base=await listen(server);
 try{
  await check('capability JSON and static app are served',async()=>{assert.equal((await(await fetch(base+'/api/capabilities')).json()).version,1);assert.equal((await fetch(base+'/')).status,200);});
  await check('cross-origin requests are rejected before processing',async()=>{const r=await fetch(base+'/api/process/repair',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify(payload)});assert.equal(r.status,403);assert.equal(nativeCalls,0);});
  await check('DNS rebinding Host is rejected',async()=>{const status=await new Promise((resolve,reject)=>{const request=http.get(base+'/api/capabilities',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});assert.equal(status,403);});
  await check('JSON client header is mandatory',async()=>{const r=await fetch(base+'/api/process/repair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,403);assert.equal(nativeCalls,0);});
  await check('bad JSON gets a 400 without invoking engine',async()=>{const r=await fetch(base+'/api/process/repair',{method:'POST',headers,body:'{'});assert.equal(r.status,400);assert.equal(nativeCalls,0);});
  await check('successful export carries UTF-8 filename',async()=>{const r=await fetch(base+'/api/process/repair',{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/filename\*=UTF-8''%D8/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pdf);});
  await check('private paths and methods are rejected',async()=>{assert.equal((await fetch(base+'/.env')).status,403);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);assert.equal((await fetch(base+'/api/process/unknown',{method:'GET'})).status,404);});
 }finally{await close(server);}

 await check('remote bind and allowed-origin configuration require a token',async()=>{assert.throws(()=>createWaraqServer({env:{WARAQ_BIND:'0.0.0.0'},engineService:fake}),/WARAQ_API_TOKEN/);assert.throws(()=>createWaraqServer({env:{WARAQ_ALLOWED_ORIGINS:'https://trusted.example'},engineService:fake}),/WARAQ_API_TOKEN/);});
 const token='unit-test-token-01234567890123456789';
 const authenticated=createWaraqServer({env:{WARAQ_API_TOKEN:token,WARAQ_ALLOWED_ORIGINS:'https://trusted.example'},engineService:fake}),secureBase=await listen(authenticated);
 try{
  await check('configured token protects capabilities and processing',async()=>{assert.equal((await fetch(secureBase+'/api/capabilities')).status,401);assert.equal((await fetch(secureBase+'/api/capabilities',{headers:{Authorization:'Bearer '+token}})).status,200);});
  await check('CORS preflight permits only configured origins and headers',async()=>{const r=await fetch(secureBase+'/api/process/repair',{method:'OPTIONS',headers:{Origin:'https://trusted.example','Access-Control-Request-Headers':'Authorization, X-Waraq-Client','Access-Control-Request-Private-Network':'true'}});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://trusted.example');assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(r.headers.get('Access-Control-Allow-Private-Network'),'true');});
 }finally{await close(authenticated);}

 await check('subprocess uses literal arguments without shell interpretation',async()=>{const r=await run(process.execPath,['-e','process.stdout.write(process.argv[1])','$(echo secret); & dir']);assert.equal(r.stdout,'$(echo secret); & dir');});
 await check('subprocess deadline terminates a running job',async()=>{await assert.rejects(run(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:50}),e=>e.code==='TIMEOUT');});
 await check('subprocess cancellation terminates a running job',async()=>{const c=new AbortController();setTimeout(()=>c.abort(),50);await assert.rejects(run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:c.signal}),e=>e.code==='CANCELLED');});
 await check('schema references are resolved and unsupported required options block availability',async()=>{
  const doc={components:{schemas:{File:{properties:{fileInput},required:['fileInput']}}},paths:{'/api/v1/convert/pdf/xlsx':{post:{requestBody:{content:{'multipart/form-data':{schema:{$ref:'#/components/schemas/File'}}}}}}}};
  assert.ok(compatibleStirling(doc,'pdfToExcel'));doc.components.schemas.File.required.push('unsupported');assert.equal(compatibleStirling(doc,'pdfToExcel'),null);
  assert.deepEqual(resolveSchema({},{allOf:[{properties:{a:{type:'string'}},required:['a']},{properties:{b:{type:'boolean'}}}]}).required,['a']);
 });

 let upload='';
 const schema={openapi:'3.0.0',info:{version:'test-only'},paths:{
  '/api/v1/convert/pdf/xlsx':multipartSchema({fileInput,pageNumbers:{type:'string'}}),
  '/v1/parse':multipartSchema({file:{type:'string',format:'binary'},model:{type:'string'}},['file','model'])
 }};
 const upstream=http.createServer(async(req,res)=>{
  if(req.url==='/v3/api-docs'||req.url==='/openapi/json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(schema));return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);upload=Buffer.concat(chunks).toString();
  if(req.url==='/api/v1/convert/pdf/xlsx'){assert.equal(req.headers['x-api-key'],'stirling-secret');res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.end(Buffer.from('PK-test-contract-only'));return;}
  if(req.url==='/v1/parse'){assert.equal(req.headers.authorization,'Bearer ocr-secret');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({markdown:'Arabic + English fixture',model:'paddleocr'}));return;}
  res.writeHead(404).end();
 }),upstreamBase=await listen(upstream);
 try{
  const service=createEngineService({env:{WARAQ_STIRLING_URL:upstreamBase,WARAQ_STIRLING_API_KEY:'stirling-secret',WARAQ_OCRBASE_URL:upstreamBase,WARAQ_OCRBASE_API_KEY:'ocr-secret'}});
  await check('live schema discovery enables compatible tools and hides credentials',async()=>{const c=await service.capabilities();assert.equal(c.operations.pdfToExcel.available,true);assert.equal(c.operations.ocrText.available,true);assert.equal(c.operations.redactText.available,false);assert.ok(!JSON.stringify(c).includes('secret'));assert.ok(!JSON.stringify(c).includes('command'));});
  await check('Stirling adapter sends PDF multipart, API key and fixed page options',async()=>{const r=await service.process('pdfToExcel',payload);assert.equal(r.engine,'stirling');assert.match(r.filename,/\.xlsx$/);assert.match(upload,/name="fileInput"/);assert.match(upload,/name="pageNumbers"/);assert.match(upload,/%PDF-/);});
  await check('ocrbase adapter uses verified file field and returns parse JSON',async()=>{const r=await service.process('ocrText',payload);assert.equal(r.engine,'ocrbase');assert.equal(JSON.parse(r.bytes).model,'paddleocr');assert.match(upload,/name="file"/);assert.match(upload,/paddleocr/);});
  await check('invalid input never reaches a configured upstream',async()=>{await assert.rejects(service.process('pdfToExcel',{...payload,data:'not base64!'}),e=>e.code==='BAD_BASE64');await assert.rejects(service.process('pdfToExcel',{...payload,data:Buffer.from('not a PDF').toString('base64')}),e=>e.code==='FILE_TYPE');await assert.rejects(service.process('protect',{...payload,options:{password:'x\n--malicious'}}),e=>e.code==='BAD_OPTION');});
  await check('unsupported operation and missing engine return explicit errors',async()=>{await assert.rejects(service.process('doesNotExist',payload),e=>e.code==='UNKNOWN_OPERATION');await assert.rejects(service.process('redactText',{...payload,options:{text:'remove'}}),e=>e.code==='ENGINE_UNAVAILABLE');});
  await check('ocrbase incompatible schemas remain unavailable',async()=>{assert.equal(compatibleOcrbase({paths:{'/v1/parse':{post:{requestBody:{content:{'application/json':{schema:{properties:{url:{type:'string'}}}}}}}}}}),null);});
 }finally{await close(upstream);}
 console.log('\n'+passed+' backend checks passed. Native conversion fidelity requires installed-engine validation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
