'use strict';
// Wraps the NSIS installer (electron-builder output) in the branded Waraq setup window (desktop/setup-ui).
// The NSIS file becomes an embedded resource; the published Waraq-Setup-<version>-x64.exe is the window.
// Uses the C# compiler and WPF that ship with Windows (.NET Framework 4.x), so nothing extra is installed.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.join(root,'release-full'),{version}=require('../package.json');
const name=`Waraq-Setup-${version}-x64.exe`,nsis=path.join(out,name),work=path.join(out,'setup-ui');
const fw=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319'),csc=path.join(fw,'csc.exe'),wpf=path.join(fw,'WPF');
if(!fs.existsSync(nsis))throw Error(name+' (NSIS) is missing: run electron-builder first.');
if(!fs.existsSync(csc))throw Error('The .NET Framework 4 C# compiler is missing: '+csc);
fs.rmSync(work,{recursive:true,force:true});fs.mkdirSync(work,{recursive:true});
const payload=path.join(work,'payload.exe');fs.copyFileSync(nsis,payload); // the original stays until the window is built
for(const extra of ['.blockmap'])fs.rmSync(nsis+extra,{force:true});
// installed size, for the progress bar
const size=(d)=>fs.readdirSync(d,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?size(path.join(d,e.name)):fs.statSync(path.join(d,e.name)).size),0);
const installed=fs.existsSync(path.join(out,'win-unpacked'))?size(path.join(out,'win-unpacked')):400e6;
fs.writeFileSync(path.join(work,'info.txt'),`version=${version}\ninstalledBytes=${installed}\n`);
const logo=path.join(root,'..','Designs','Logo','pwaraq-mark-transparent.png');
const built=path.join(work,name);
execFileSync(csc,['/nologo','/codepage:65001','/target:winexe','/platform:anycpu','/optimize+',
  `/out:${built}`,`/win32icon:${path.join(root,'desktop','resources','waraq.ico')}`,
  ...['PresentationFramework.dll','PresentationCore.dll','WindowsBase.dll'].map((d)=>`/reference:${path.join(wpf,d)}`),`/reference:${path.join(fw,'System.Xaml.dll')}`,
  '/reference:System.dll','/reference:System.Core.dll',
  `/resource:${payload},payload.exe`,`/resource:${path.join(work,'info.txt')},info.txt`,`/resource:${logo},logo.png`,
  path.join(root,'desktop','setup-ui','WaraqSetup.cs')],{stdio:'inherit'});
fs.renameSync(built,nsis);fs.rmSync(work,{recursive:true,force:true});
console.log(`${name}: ${(fs.statSync(nsis).size/1048576).toFixed(0)} MB (branded setup window around the installer; ${(installed/1048576).toFixed(0)} MB installed)`);
