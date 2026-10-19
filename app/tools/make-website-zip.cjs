'use strict';
// Builds publish/Waraq-Website-<version>.zip from dist/ exactly as it is (index.html at the ZIP root), for a
// Cloudflare Pages direct upload. Run after package-desktop-downloads.cjs and package-offline.cjs.
const fs=require('node:fs'),path=require('node:path'),JSZip=require('../dist/vendor/jszip.min.js');
const root=path.join(__dirname,'..'),dist=path.join(root,'dist'),{version}=require('../package.json');
const LIMIT=25*1024*1024; // Cloudflare Pages: 25 MiB per file
function walk(dir,base=dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap((e)=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p,base):[[path.relative(base,p).replaceAll('\\','/'),p]];});}
(async()=>{
  const files=walk(dist).filter(([n])=>!n.startsWith('__')),zip=new JSZip();let bytes=0;
  for(const [name,file] of files){const size=fs.statSync(file).size;if(size>LIMIT)throw Error(name+' is over 25 MiB');bytes+=size;zip.file(name,fs.readFileSync(file),{compression:name.endsWith('.bin')||name.endsWith('.zip')?'STORE':'DEFLATE'});}
  const manifest=JSON.parse(fs.readFileSync(path.join(dist,'downloads','manifest.json'),'utf8'));
  const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  if(/Pwaraq|PWARAQ/.test(html))throw Error('index.html still shows the old Pwaraq name');
  fs.mkdirSync(path.join(root,'publish'),{recursive:true});
  const out=path.join(root,'publish','Waraq-Website-'+version+'.zip');
  await new Promise((ok,fail)=>zip.generateNodeStream({type:'nodebuffer',streamFiles:true}).pipe(fs.createWriteStream(out)).on('finish',ok).on('error',fail));
  console.log(`${path.relative(root,out)}: ${files.length} files, ${(bytes/1048576).toFixed(0)} MB; downloads: ${manifest.artifacts.map((a)=>a.filename).join(', ')}`);
})().catch((e)=>{console.error(e.message);process.exitCode=1;});
