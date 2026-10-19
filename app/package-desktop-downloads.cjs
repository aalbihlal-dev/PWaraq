// Content-defined download chunks share identical runtime data between Windows builds.
// Picks up installers from release/ (regular build) and release-full/ (all-in-one build). Only files named by the
// shared artifact rule are published; the version is taken from the name, as the website and updater also do.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ARTIFACT=/^Waraq-(?:(Full|Lite)-)?(Setup|Portable)-([0-9]+\.[0-9]+\.[0-9]+)-x64\.exe$/;
const MAX_FILE=2000*1024*1024;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const table=new Uint32Array(256);let seed=0x74617277;for(let i=0;i<256;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;table[i]=seed>>>0;}
function* split(bytes){let start=0,rolling=0;for(let i=0;i<bytes.length;i++){rolling=((rolling<<1)+table[bytes[i]])>>>0;const length=i-start+1;if(length>=1024*1024&&((rolling&0x3fffff)===0||length>=16*1024*1024)){yield bytes.subarray(start,i+1);start=i+1;rolling=0;}}if(start<bytes.length)yield bytes.subarray(start);}
const LABELS={
 'Full:Setup':['Download Windows installer — Full (all engines)','تنزيل مثبت ويندوز — النسخة الكاملة (كل المحركات)'],
 'Lite:Setup':['Download Windows installer — Lite (no Office conversion)','تنزيل مثبت ويندوز — النسخة المختصرة (دون تحويل أوفيس)'],
 'Full:Portable':['Download portable Windows app — Full','تنزيل تطبيق ويندوز المحمول — النسخة الكاملة'],
 'Lite:Portable':['Download portable Windows app — Lite','تنزيل تطبيق ويندوز المحمول — النسخة المختصرة'],
 ':Setup':['Download Windows installer','تنزيل مثبت ويندوز'],
 ':Portable':['Download portable Windows app','تنزيل تطبيق ويندوز المحمول']
};
(async()=>{
 const out=path.join(__dirname,'dist/downloads'),found=new Map();
 for(const dir of ['release','release-full']){
  let names=[];try{names=await fs.readdir(path.join(__dirname,dir));}catch{continue;}
  for(const name of names){if(!name.endsWith('.exe'))continue;if(!ARTIFACT.test(name)){console.warn('Skipped (name does not follow the artifact rule): '+dir+'/'+name);continue;}found.set(name,path.join(__dirname,dir,name));}
 }
 if(!found.size)throw Error('No desktop artifacts built');
 if(found.size>6)throw Error('At most 6 downloads can be published; remove old builds from release/ and release-full/.');
 await fs.mkdir(out,{recursive:true});const artifacts=[],written=new Set();let total=0,unique=0;
 for(const [filename,file] of found){
  const [,edition='',kind,release]=ARTIFACT.exec(filename),bytes=await fs.readFile(file),chunks=[];
  if(bytes.length>MAX_FILE)throw Error(filename+' is larger than the website download limit.');
  total+=bytes.length;
  for(const part of split(bytes)){const sha256=hash(part),name=sha256+'.bin';if(!written.has(name)){await fs.writeFile(path.join(out,name),part);written.add(name);unique+=part.length;}chunks.push({path:name,size:part.length,sha256});}
  const [label_en,label_ar]=LABELS[edition+':'+kind];
  artifacts.push({filename,release,edition:edition||undefined,size:bytes.length,sha256:hash(bytes),label_en,label_ar,chunks});
 }
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({version:1,artifacts},null,2));
 // Remove only obsolete generated chunk files in this exact output directory.
 for(const name of await fs.readdir(out)){if(name.endsWith('.bin')&&!written.has(name))await fs.unlink(path.join(out,name));}
 console.log('Packaged '+artifacts.length+' downloads: '+total+' bytes reconstructed from '+unique+' unique bytes');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
