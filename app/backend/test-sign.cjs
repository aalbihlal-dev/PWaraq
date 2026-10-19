'use strict';
// Certificate signing + Arabic-detection tests. Windows only for signing (skips elsewhere).
// Creates a throwaway self-signed certificate in memory; nothing is added to the Windows certificate store.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
const {createEngineService,run,arabicTextBroken}=require('./engines.cjs');
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
(async()=>{
 await check('broken Arabic text layers are detected',async()=>{
  const good='هذا مستند تجريبي للتعرف على النص العربي ورق يساعدك على تنظيم الملفات وتحرير المستندات بسهولة في المكتب والمنزل والمدرسة';
  assert.equal(arabicTextBroken(good),false);
  assert.equal(arabicTextBroken(good.normalize('NFC').split('').map(c=>({'ه':'ﻫ','ذ':'ﺫ','ا':'ﺍ','م':'ﻣ','س':'ﺳ','ت':'ﺗ','ن':'ﻧ','ل':'ﻟ','ع':'ﻋ','ر':'ﺭ','ي':'ﻳ','و':'ﻭ','ب':'ﺑ','ف':'ﻓ','ك':'ﻛ','ح':'ﺣ','د':'ﺩ','ق':'ﻗ','ج':'ﺟ','ط':'ﻃ','ص':'ﺻ','ة':'ﺓ','ظ':'ﻇ','ض':'ﺿ','ش':'ﺷ','خ':'ﺧ','ز':'ﺯ','ث':'ﺛ','غ':'ﻏ','ى':'ﻯ'}[c]||c)).join('')),true,'presentation forms');
  const reversed=good.split(' ').map(w=>[...w].reverse().join('')).join(' ');
  assert.equal(arabicTextBroken(reversed),true,'reversed words');
  assert.equal(arabicTextBroken('Hello world'),false);
 });
 if(process.platform!=='win32'){console.log('SKIP signing tests: Windows only.');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'waraq-signtest-'));
 try{
  const ps=(script)=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{cwd:dir,timeout:60000});
  fs.writeFileSync(path.join(dir,'mk.ps1'),`$rsa=[Security.Cryptography.RSA]::Create(2048)
$req=New-Object Security.Cryptography.X509Certificates.CertificateRequest('CN=Waraq Test Signer, O=Test',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$cert=$req.CreateSelfSigned((Get-Date).AddDays(-1),(Get-Date).AddDays(30))
[IO.File]::WriteAllBytes((Join-Path $PWD 'test.pfx'),$cert.Export('Pfx','test-pass'))`);
  await ps('mk.ps1');
  const pfx=fs.readFileSync(path.join(dir,'test.pfx')).toString('base64');
  const src=await PDFLib.PDFDocument.create();src.addPage([300,400]).drawText('Signed document',{x:30,y:300,size:16});src.addPage([300,400]);
  const pdf=Buffer.from(await src.save());
  const engines=createEngineService({env:{}});
  const caps=await engines.capabilities();
  await check('signing is available on Windows and lists store certificates',async()=>{assert.equal(caps.operations.sign.available,true);assert.equal(caps.operations.sign.certificates,undefined,'capabilities stay fast: no PowerShell listing');assert.ok(Array.isArray(await engines.certificates()));});
  let signed;
  await check('a PDF is signed with a .pfx certificate (visible, Arabic reason)',async()=>{
   const r=await engines.process('sign',{filename:'عقد.pdf',data:pdf.toString('base64'),options:{mode:'pfx',pfx,password:'test-pass',reason:'موافقة على العقد',location:'Riyadh',visible:true}});
   signed=Buffer.from(r.bytes);assert.equal(r.engine,'wincms');
   const doc=await PDFLib.PDFDocument.load(signed);assert.equal(doc.getPageCount(),2);
  });
  await check('Windows verifies the CMS over the exact ByteRange',async()=>{
   const text=signed.toString('latin1'),m=text.match(/\/ByteRange \[ 0 (\d+) (\d+) (\d+) *\]/);assert.ok(m,'ByteRange present');
   const [a,b,c]=m.slice(1).map(Number);assert.equal(b+c,signed.length,'ByteRange covers the whole file except /Contents');
   fs.writeFileSync(path.join(dir,'data.bin'),Buffer.concat([signed.subarray(0,a),signed.subarray(b)]));
   // /Contents is zero-padded; take exactly the DER length from the ASN.1 header (a signature may itself end in 00).
   const padded=Buffer.from(text.slice(a+1,b-1),'hex');assert.equal(padded[0],0x30,'CMS starts with a SEQUENCE');
   const lenBytes=padded[1]&0x80?padded[1]&0x7f:0,derLength=lenBytes?2+lenBytes+padded.subarray(2,2+lenBytes).reduce((n,x)=>n*256+x,0):2+padded[1];
   fs.writeFileSync(path.join(dir,'sig.der'),padded.subarray(0,derLength));
   fs.writeFileSync(path.join(dir,'verify.ps1'),`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$ci=New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList (,[IO.File]::ReadAllBytes((Join-Path $PWD 'data.bin')))
$cms=New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $ci,$true
$cms.Decode([IO.File]::ReadAllBytes((Join-Path $PWD 'sig.der')))
$cms.CheckSignature($true)
'VERIFIED '+$cms.SignerInfos[0].Certificate.Subject+' '+$cms.SignerInfos[0].DigestAlgorithm.Value`);
   const out=(await ps('verify.ps1')).stdout;assert.match(out,/VERIFIED CN=Waraq Test Signer.* 2\.16\.840\.1\.101\.3\.4\.2\.1/);
   // Any change to covered bytes must break verification.
   const tampered=fs.readFileSync(path.join(dir,'data.bin'));tampered[100]^=1;fs.writeFileSync(path.join(dir,'data.bin'),tampered);
   await assert.rejects(ps('verify.ps1'));
  });
  await check('re-signing a signed PDF is refused',async()=>{
   await assert.rejects(engines.process('sign',{filename:'x.pdf',data:signed.toString('base64'),options:{mode:'pfx',pfx,password:'test-pass'}}),e=>e.code==='ALREADY_SIGNED');
  });
  await check('a wrong certificate password gets a clear error',async()=>{
   await assert.rejects(engines.process('sign',{filename:'x.pdf',data:pdf.toString('base64'),options:{mode:'pfx',pfx,password:'wrong'}}),e=>e.code==='BAD_PASSWORD');
  });
  await check('bad sign options are rejected before Windows is called',async()=>{
   await assert.rejects(engines.process('sign',{filename:'x.pdf',data:pdf.toString('base64'),options:{mode:'store',thumbprint:'nope'}}),e=>e.code==='BAD_CERTIFICATE');
  });
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 console.log(passed+' signing checks passed.');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
