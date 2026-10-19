'use strict';
// electron-builder config for the all-in-one build: the regular config from package.json plus the native engines
// from engines/win-x64 (see tools/fetch-engines.ps1), shipped outside app.asar so they can be executed.
// Produces an installer only: a portable .exe would re-extract several hundred MB on every launch.
// Set WARAQ_FULL_PORTABLE=1 to also build a portable .exe (reasonable for a bundle fetched with -SkipOffice).
const fs=require('node:fs'),path=require('node:path');
const base=require('../package.json').build;
const lock=path.join(__dirname,'..','engines','win-x64','ENGINE-SOURCES.json');
if(!fs.existsSync(lock))throw Error('Native bundle manifest is missing. Fetch and verify the engines before building.');
const manifest=JSON.parse(fs.readFileSync(lock,'utf8').replace(/^\uFEFF/,''));
if(typeof manifest.bundle?.office!=='boolean')throw Error('Native bundle edition is missing from ENGINE-SOURCES.json.');
module.exports={
 ...base,
 directories:{...base.directories,output:'release-full'},
 // Only the slim core (MuPDF, qpdf) is installed; Office & CAD and OCR are add-on packs (tools/make-packs.cjs).
 extraResources:[...(base.extraResources||[]),{from:'engines-core',to:'engines',filter:['**/*']}],
 // Code signing: set CSC_LINK (path or base64 of a .pfx) and CSC_KEY_PASSWORD before building and the installer and
 // app are signed, which removes the SmartScreen "unknown publisher" warning. Without them the build stays unsigned.
 win:{...base.win,...(process.env.CSC_LINK||process.env.WIN_CSC_LINK?{signAndEditExecutable:true,signtoolOptions:{rfc3161TimeStampServer:'http://timestamp.digicert.com'}}:{}),target:[{target:'nsis',arch:['x64']},...(process.env.WARAQ_FULL_PORTABLE==='1'?[{target:'portable',arch:['x64']}]:[])]},
 nsis:{...base.nsis,artifactName:'Waraq-Setup-${version}-${arch}.${ext}',createDesktopShortcut:true},
 portable:{...base.portable,artifactName:'Waraq-Portable-${version}-${arch}.${ext}'}
};
