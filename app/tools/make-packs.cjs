'use strict';
// Splits the fetched engines (engines/win-x64, see tools/fetch-engines.ps1) into:
//   engines-core/            what the installer carries (MuPDF, qpdf), slimmed
//   dist/packs/*.bin + manifest.json   add-on packs as ≤16 MB pieces for the website (Cloudflare limit 25 MiB)
//   desktop/packs.json       the packs' SHA-256 pinned into the app, so only these exact files can be installed
// A pack ZIP is only rebuilt when its content changes (packs-cache/), so users do not re-download unchanged packs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {PACKS,CORE_DIRS,keep}=require('../desktop/pack-defs.cjs');
const root=path.join(__dirname,'..'),src=path.join(root,'engines','win-x64'),cache=path.join(root,'packs-cache');
const site=path.join(root,'dist','packs'),coreOut=path.join(root,'engines-core'),PIECE=16*1024*1024;
const TAR=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
const sha=(b)=>crypto.createHash('sha256').update(b).digest('hex');
const fileSha=(f)=>{const h=crypto.createHash('sha256'),fd=fs.openSync(f,'r'),buf=Buffer.alloc(1<<20);let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));fs.closeSync(fd);return h.digest('hex');};
function walk(dir,base=src){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...walk(p,base));else out.push(path.relative(base,p).replaceAll('\\','/'));}return out;}
const mb=(n)=>(n/1048576).toFixed(0)+' MB';
function stage(dirs,into){
  fs.rmSync(into,{recursive:true,force:true});let bytes=0,count=0,dropped=0;const files=[];
  for(const d of dirs)for(const rel of walk(path.join(src,d))){if(!keep(rel)){dropped+=fs.statSync(path.join(src,rel)).size;continue;}
    const to=path.join(into,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(src,rel),to);bytes+=fs.statSync(to).size;count++;files.push(rel);}
  for(const extra of ['THIRD-PARTY-ENGINES.txt'])if(fs.existsSync(path.join(src,extra)))fs.copyFileSync(path.join(src,extra),path.join(into,extra));
  return {bytes,count,dropped,files};
}
if(!fs.existsSync(src))throw Error('engines/win-x64 is missing: run tools/fetch-engines.ps1 first.');
fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(site,{recursive:true});

// core (installer)
const core=stage(CORE_DIRS,coreOut);
for(const f of ['ENGINE-SOURCES.json'])fs.copyFileSync(path.join(src,f),path.join(coreOut,f));
console.log(`core      ${mb(core.bytes)} (${core.count} files, ${mb(core.dropped)} left out) -> engines-core/`);

// packs (website)
const manifest={version:1,packs:[]},pinned={},written=new Set();
for(const [name,def] of Object.entries(PACKS)){
  const dir=path.join(cache,'stage-'+name),st=stage(def.dirs,dir);
  // content digest: every kept file's path and bytes
  const digest=sha(st.files.sort().map((rel)=>rel+'\0'+fileSha(path.join(dir,rel))).join('\n'));
  // tar + zstd level 19, long range (window 128 MB): about a third smaller than ZIP; the app decompresses zstd itself (desktop/packs.cjs).
  const zip=path.join(cache,`${name}-${digest.slice(0,16)}.tar.zst`);
  if(!fs.existsSync(zip)){
    for(const old of fs.readdirSync(cache))if(old.startsWith(name+'-')&&/\.(?:zip|tar\.zst)$/.test(old))fs.rmSync(path.join(cache,old));
    execFileSync(TAR,['--zstd','--options','zstd:compression-level=19,zstd:threads=0,zstd:long=27','-c','-f',zip,'-C',dir,'.'],{stdio:'inherit'});
  }
  fs.rmSync(dir,{recursive:true,force:true});
  const bytes=fs.readFileSync(zip),chunks=[];
  for(let at=0;at<bytes.length;at+=PIECE){const part=bytes.subarray(at,at+PIECE),h=sha(part),file=h+'.bin';if(!written.has(file)){fs.writeFileSync(path.join(site,file),part);written.add(file);}chunks.push({path:file,size:part.length,sha256:h});}
  const entry={name,sha256:sha(bytes),size:bytes.length,unpacked:st.bytes,chunks};
  manifest.packs.push(entry);pinned[name]={sha256:entry.sha256,size:entry.size,unpacked:entry.unpacked};
  console.log(`${name.padEnd(9)} ${mb(st.bytes)} unpacked, ${mb(bytes.length)} download (${chunks.length} pieces, ${mb(st.dropped)} left out)`);
}
fs.writeFileSync(path.join(site,'manifest.json'),JSON.stringify(manifest,null,2));
for(const f of fs.readdirSync(site))if(f.endsWith('.bin')&&!written.has(f))fs.rmSync(path.join(site,f));
fs.writeFileSync(path.join(root,'desktop','packs.json'),JSON.stringify(pinned,null,2)+'\n');
console.log('pinned    desktop/packs.json');
