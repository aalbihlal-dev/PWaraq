'use strict';
// Add-on packs: heavy engines that are downloaded the first time a tool needs them, instead of being in the
// installer. The core installer keeps MuPDF (viewer, CAD drawings, text removal) and qpdf (repair, compress).
// Paths are relative to the engines folder (layout from tools/fetch-engines.ps1), always with forward slashes.

const PACKS={
  office:{
    label:['Office & CAD pack','حزمة أوفيس و CAD'],
    detail:['Word, Excel and PowerPoint to and from PDF, and DWG/DXF drawings to PDF (LibreOffice + LibreDWG).','تحويل وورد وإكسل وباوربوينت من PDF وإليه، ورسومات DWG/DXF إلى PDF (LibreOffice + LibreDWG).'],
    dirs:['libreoffice','libredwg'],
    ops:['officeToPdf','pdfToWord','pdfToExcel','pdfToPowerPoint','cadToPdf']
  },
  ocr:{
    label:['OCR pack','حزمة OCR'],
    detail:['Searchable PDFs, archive PDF/A and Arabic text repair with the native Tesseract engine (Arabic + English).','ملفات PDF قابلة للبحث وأرشفة PDF/A وإصلاح النص العربي بمحرك Tesseract الأصلي (عربي + إنجليزي).'],
    dirs:['tesseract'],
    ops:['ocr','pdfa','fixArabic']
  }
};
const CORE_DIRS=['mupdf','qpdf'];

// What a converter that never shows a window does not need. Everything else is kept.
const DROP=[
  // LibreOffice: spell-check dictionaries and Java add-ons, interface translations, help, templates, galleries,
  // wizards, the Python script runtime, extra icon themes and non-Arabic/English language settings.
  /^libreoffice\/share\/extensions\//,
  /^libreoffice\/program\/resource\//,
  /^libreoffice\/help\//,
  /^libreoffice\/share\/(?:gallery|template|wizards|autotext)\//,
  /^libreoffice\/program\/python[^/]*(?:\/|$)/,
  /^libreoffice\/program\/python-core-[^/]*\//,
  /^libreoffice\/share\/config\/images_(?!colibre\.zip$)[^/]*$/,
  /^libreoffice\/share\/registry\/Langpack-(?!en-US\.|ar\.)[^/]*\.xcd$/,
  /^libreoffice\/share\/registry\/res\/(?:fcfg_langpack|registry)_(?!en-US\.|ar\.)[^/]*\.xcd$/,
  /^libreoffice\/readmes\/readme_(?!en-US\.)[^/]*$/,
  // Tesseract: training tools, manuals and Java viewer files; only the OCR program and its libraries stay.
  /^tesseract\/doc\//,
  /^tesseract\/[^/]*\.(?:html|jar)$/,
  /^tesseract\/(?!tesseract\.exe$)[^/]*\.exe$/,
  /^tesseract\/tessdata\/[^/]*\.jar$/,
  // qpdf: developer headers and libraries; manuals other than the licence
  /^qpdf\/(?:include|lib)\//,
  /^qpdf\/share\/(?![^/]*\/(?:[^/]*(?:licen[cs]e|copying|notice|readme)[^/]*)$).*/i
];
const keep=(rel)=>!DROP.some((re)=>re.test(rel));
const packForOperation=(op)=>Object.keys(PACKS).find((name)=>PACKS[name].ops.includes(op))||null;

module.exports={PACKS,CORE_DIRS,DROP,keep,packForOperation};
