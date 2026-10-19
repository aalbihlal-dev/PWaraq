'use strict';
// Certificate (digital) signatures: adbe.pkcs7.detached, readable by Acrobat and other validators.
// The CMS signature itself is produced by Windows (System.Security.Cryptography.Pkcs.SignedCms), so it works with
// .pfx/.p12 files and with certificates in the Windows store, including USB tokens and smart cards that ask for a PIN.
const fs=require('node:fs/promises'),path=require('node:path');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
const SIG_BYTES=16384,PLACEHOLDER='**********';

const PS_SIGN=`param([string]$Mode,[string]$Data,[string]$Out,[string]$Thumb,[string]$Pfx)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$pw=[Console]::In.ReadLine();if($pw -eq $null){$pw=''}
$X=[System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]
if($Mode -eq 'pfx'){$cert=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Pfx,$pw,$X::UserKeySet)}
else{$store=New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser');$store.Open('ReadOnly');$found=$store.Certificates.Find('FindByThumbprint',$Thumb,$false);if($found.Count -lt 1){throw 'WARAQ_CERT_NOT_FOUND'};$cert=$found[0]}
if(-not $cert.HasPrivateKey){throw 'WARAQ_NO_PRIVATE_KEY'}
if($cert.NotAfter -lt (Get-Date)){throw 'WARAQ_CERT_EXPIRED'}
$bytes=[IO.File]::ReadAllBytes($Data)
$ci=New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList (,$bytes)
$cms=New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $ci,$true
$signer=New-Object System.Security.Cryptography.Pkcs.CmsSigner -ArgumentList $cert
$signer.DigestAlgorithm=New-Object System.Security.Cryptography.Oid -ArgumentList '2.16.840.1.101.3.4.2.1'
$signer.IncludeOption=[System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain
[void]$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime))
$cms.ComputeSignature($signer,$false)
[IO.File]::WriteAllBytes($Out,$cms.Encode())
[Console]::Out.WriteLine('WARAQ_SIGNER '+$cert.GetNameInfo('SimpleName',$false))
if($Mode -eq 'pfx'){$cert.Reset()}
`;
const PS_LIST=`$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$store=New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser');$store.Open('ReadOnly')
$now=Get-Date
$list=@($store.Certificates|Where-Object{$_.HasPrivateKey -and $_.NotAfter -gt $now}|ForEach-Object{[ordered]@{thumbprint=$_.Thumbprint;subject=$_.GetNameInfo('SimpleName',$false);issuer=$_.GetNameInfo('SimpleName',$true);notAfter=$_.NotAfter.ToString('yyyy-MM-dd')}})
ConvertTo-Json -Compress -InputObject $list
`;
const psArgs=(script,args)=>['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args];

/** Certificates with a private key in the current user's Windows store. */
async function listCertificates(run,powershell,dir){
 const script=path.join(dir,'list.ps1');await fs.writeFile(script,'﻿'+PS_LIST,'utf8');
 const r=await run(powershell,psArgs(script,[]),{cwd:dir,timeout:20000});
 const parsed=JSON.parse(r.stdout.trim()||'[]');
 return (Array.isArray(parsed)?parsed:[parsed]).filter(c=>/^[0-9A-F]{40}$/i.test(c?.thumbprint||'')).slice(0,50);
}

function asciiOnly(text){return String(text||'').replace(/[^\x20-\x7e]/g,'').trim();}

/** Adds an empty signature field and reserves space for the CMS. Returns the saved bytes. */
async function addPlaceholder(pdfBytes,{reason='',location='',visible=false,signerName=''}){
 const {PDFDocument,PDFName,PDFHexString,PDFString,PDFNumber,PDFDict,PDFArray,StandardFonts,rgb}=PDFLib;
 const doc=await PDFDocument.load(pdfBytes,{updateMetadata:false});
 const acro=doc.catalog.lookupMaybe(PDFName.of('AcroForm'),PDFDict);
 const fields=acro?.lookupMaybe(PDFName.of('Fields'),PDFArray);
 if(fields)for(const ref of fields.asArray()){const f=doc.context.lookup(ref);if(f instanceof PDFDict&&f.get(PDFName.of('FT'))?.toString()==='/Sig'&&f.get(PDFName.of('V'))){const e=Error('This PDF is already signed. Signing again here would invalidate the existing signature.');e.code='ALREADY_SIGNED';throw e;}}
 const page=doc.getPage(doc.getPageCount()-1),box=page.getCropBox();
 let rect=[0,0,0,0];
 if(visible){
  // Drawn into the page so every viewer shows it; Helvetica only covers Latin, so the panel text stays ASCII.
  const font=await doc.embedFont(StandardFonts.Helvetica),w=210,h=54,x=box.x+box.width-w-24,y=box.y+24;
  page.drawRectangle({x,y,width:w,height:h,borderColor:rgb(.06,.46,.43),borderWidth:1,color:rgb(.94,.98,.97)});
  const name=asciiOnly(signerName).slice(0,40);
  page.drawText('Digitally signed'+(name?' by '+name:''),{x:x+8,y:y+h-18,size:9,font,color:rgb(.06,.3,.28)});
  page.drawText(new Date().toISOString().replace('T',' ').slice(0,16)+' UTC',{x:x+8,y:y+h-32,size:8,font,color:rgb(.2,.25,.24)});
  page.drawText('Verify in your PDF reader\'s signature panel',{x:x+8,y:y+10,size:6.5,font,color:rgb(.35,.4,.38)});
  rect=[x,y,x+w,y+h];
 }
 const ctx=doc.context;
 const sig=ctx.register(ctx.obj({Type:'Sig',Filter:'Adobe.PPKLite',SubFilter:'adbe.pkcs7.detached',
  ByteRange:[0,PDFName.of(PLACEHOLDER),PDFName.of(PLACEHOLDER),PDFName.of(PLACEHOLDER)],
  Contents:PDFHexString.of('0'.repeat(SIG_BYTES*2)),M:PDFString.fromDate(new Date()),
  ...(reason?{Reason:PDFHexString.fromText(reason)}:{}),...(location?{Location:PDFHexString.fromText(location)}:{})}));
 const count=(fields?.size()||0)+1;
 const widget=ctx.register(ctx.obj({Type:'Annot',Subtype:'Widget',FT:'Sig',Rect:rect,V:sig,T:PDFHexString.fromText('Signature'+count),F:132,P:page.ref}));
 page.node.addAnnot(widget);
 const form=doc.getForm();form.acroForm.addField(widget);form.acroForm.dict.set(PDFName.of('SigFlags'),PDFNumber.of(3));
 // Object streams would hide /ByteRange and /Contents inside compressed data.
 return Buffer.from(await doc.save({useObjectStreams:false,updateFieldAppearances:false}));
}

/** Fills /ByteRange and /Contents. `signer(data)` returns DER-encoded CMS for the covered bytes. */
async function embedSignature(pdf,signer){
 const marker=`[ 0 /${PLACEHOLDER} /${PLACEHOLDER} /${PLACEHOLDER} ]`,br=pdf.indexOf(marker);
 const hole='<'+'0'.repeat(SIG_BYTES*2)+'>',start=pdf.indexOf(hole);
 if(br<0||start<0||pdf.indexOf(marker,br+1)>=0)throw Error('Signature placeholder not found.');
 const end=start+hole.length,range=`[ 0 ${start} ${end} ${pdf.length-end} ]`;
 if(range.length>marker.length)throw Error('Document too large for the signature placeholder.');
 pdf.write(range.padEnd(marker.length,' '),br,'latin1');
 const cms=await signer(Buffer.concat([pdf.subarray(0,start),pdf.subarray(end)]));
 if(!cms.length||cms.length>SIG_BYTES)throw Error('The certificate chain is too large to embed.');
 pdf.write(cms.toString('hex').toUpperCase().padEnd(SIG_BYTES*2,'0'),start+1,'latin1');
 return{pdf,byteRange:[0,start,end,pdf.length-end]};
}

/** Signs `pdfBytes` in `dir` using PowerShell. options: {mode:'pfx'|'store', pfx, thumbprint, password, reason, location, visible} */
async function signPdf({pdfBytes,dir,run,powershell,signal,options}){
 const script=path.join(dir,'sign.ps1');await fs.writeFile(script,'﻿'+PS_SIGN,'utf8');
 if(options.mode==='pfx')await fs.writeFile(path.join(dir,'cert.pfx'),options.pfx,{mode:0o600});
 let signerName='';
 const prepared=await addPlaceholder(pdfBytes,{...options,signerName:options.signerName||''});
 const {pdf}=await embedSignature(prepared,async data=>{
  await fs.writeFile(path.join(dir,'tbs.bin'),data);
  const r=await run(powershell,psArgs(script,[options.mode,'tbs.bin','sig.p7s',options.thumbprint||'','cert.pfx']),{cwd:dir,signal,input:(options.password||'')+'\n',timeout:180_000});
  signerName=(r.stdout.match(/WARAQ_SIGNER (.*)/)||[])[1]?.trim()||'';
  return fs.readFile(path.join(dir,'sig.p7s'));
 });
 await fs.rm(path.join(dir,'cert.pfx'),{force:true});
 return{bytes:pdf,signer:signerName};
}
module.exports={signPdf,listCertificates,addPlaceholder,embedSignature,PS_SIGN,SIG_BYTES};
