'use strict';
// Locates the native engines shipped inside the all-in-one Windows build (resources/engines) so the local server
// finds them without the user installing anything. Layout is produced by tools/fetch-engines.ps1.
const fs=require('node:fs'),path=require('node:path');
const LAYOUT={
 WARAQ_QPDF:['qpdf/bin/qpdf.exe','qpdf/bin/qpdf'],
 WARAQ_MUTOOL:['mupdf/mutool.exe','mupdf/mutool'],
 WARAQ_TESSERACT:['tesseract/tesseract.exe','tesseract/tesseract'],
 WARAQ_LIBREOFFICE:['libreoffice/program/soffice.com','libreoffice/program/soffice.exe','libreoffice/program/soffice'], // .com prints to the console; .exe prints nothing
 WARAQ_DWG2DXF:['libredwg/dwg2dxf.exe','libredwg/bin/dwg2dxf.exe','libredwg/dwg2dxf']
};
function firstFile(base,candidates){for(const rel of candidates){const full=path.join(base,rel);try{if(fs.statSync(full).isFile())return full;}catch{}}return null;}

/** Returns env entries for engines found under `enginesDir`. Explicit values in `current` win unless preferBundled. */
function bundledEngineEnv(enginesDir,current={},{preferBundled=true}={}){
 const found={};if(!enginesDir||!fs.existsSync(enginesDir))return found;
 for(const[key,candidates]of Object.entries(LAYOUT)){const file=firstFile(enginesDir,candidates);if(file&&(preferBundled||!current[key]))found[key]=file;}
 const tessdata=path.join(enginesDir,'tesseract','tessdata');
 if(found.WARAQ_TESSERACT&&fs.existsSync(tessdata)&&(preferBundled||!current.TESSDATA_PREFIX))found.TESSDATA_PREFIX=tessdata;
 return found;
}
module.exports={bundledEngineEnv,LAYOUT};
