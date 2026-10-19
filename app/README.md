# Waraq | ورق

Arabic RTL and English PDF workspace. Browser tools process documents on your device. Optional engines are identified before a document is sent.

## Run and take offline

Run `node server.cjs` with Node.js 22+, then open `http://127.0.0.1:4173`. The offline ZIP contains the website, PDF libraries, Tesseract WebAssembly and Arabic/English OCR models. Node must already be installed. Windows users can run the ZIP's `START-WARAQ.cmd`.

The `dist` folder is a portable static website: serve it using an HTTP/HTTPS static web server, including under a subdirectory. Opening `index.html` through `file://` is unsupported because modules and workers require a server. HTTPS or localhost is required for service-worker caching. Use “Save app in this browser” before disconnecting; browser storage can be evicted, so retain the ZIP.

The Windows app (current release 0.3.3) is downloaded from https://www.pwaraq.com: a small per-user installer (no administrator rights) with MuPDF and qpdf built in; Office/CAD and OCR engines arrive as add-on packs the first time they are used, verified by SHA-256. The builds are unsigned (Windows SmartScreen may ask for confirmation). Build and security details are in `desktop/README.md`.

## Tools and filenames

Page organization: merge, split, ranges, extraction, reorder, rotate, duplicate, delete, reverse, blank pages, crop and undo. Editing: annotations, Arabic/English text stamps, watermarks, page numbers, drawn/image signatures, flattened AcroForm filling and raster redaction. Conversion: image import, PNG export, existing text extraction, image-only compression, scan effects, and bilingual letter/invoice templates. Additional layout and comparison tools are described in `CAPABILITY-AUDIT.md`.

Output names retain the original basename with Waraq branding and an operation suffix where applicable. Combined documents use the first input name unless changed in the output field. Templates use their title.

## OCR

PDF.js renders selected pages into images. Tesseract.js 6.0.1 runs Tesseract WebAssembly 6.0.0 in a local worker with English, Arabic, or both models. Sequential processing is limited to 20 pages per run with bounded image dimensions. The browser tool returns editable UTF-8 text, not a searchable PDF. Accuracy depends on resolution, language, fonts, skew and layout; review the output.

Searchable PDF uses optional OCRmyPDF with locally installed Tesseract Arabic/English data. Office conversion, encryption, repair and other native operations require their listed engines. Capabilities must report an operation as available. Connecting a remote engine sends the document there after the explicit processing action; local browser tools do not.

## Editing and fidelity limits

This is not yet a full Acrobat replacement. Existing text-object editing, font-preserving paragraph reflow, arbitrary image replacement, certified digital signing, comprehensive accessibility tagging and all PDF/XFA features are not implemented. Visual signatures are not certificate signatures. See `CAPABILITY-AUDIT.md` for comparisons and candidate engines.

Limits: 50 MB/input, 200 workspace pages; memory use depends on content. Page-copy exports do not guarantee preservation of document-level forms, bookmarks, attachments or digital signatures. Form filling uses the original document and produces a flattened copy. Cropping hides margins rather than removing content. Raster redaction rebuilds every page as an image, discarding original text and interactive objects; review marked regions before sharing. Compression, scan effects, templates and grayscale are image-based and lose searchable text/interactivity. Compression may not reduce size. Arabic stamps/templates are rasterized for shaping. Crop thumbnails retain the source preview with a cropped label. Page numbers/stamps use unrotated page coordinates.

Documents live in memory and disappear on reload. Application caching does not include workspace documents. Language and engine address preferences may be stored locally; entered engine tokens remain in session memory.

## Validation and packaging

Run `node test.cjs`, `node advanced-tests.cjs`, `node naming-tests.cjs`, and `node more-tools-tests.cjs` here. Backend/desktop checks are documented in their folders. Run `node package-offline.cjs` after finalizing assets to create the offline ZIP and cache manifest.

Bundled dependencies: pdf-lib 1.17.1 (MIT), PDF.js 4.10.38 (Apache-2.0), JSZip 3.10.1 (MIT option), Tesseract.js 6.0.1 and tesseract.js-core 6.0.0 (Apache-2.0), Arabic/English Tesseract data (Apache-2.0). Notices: `dist/vendor/THIRD-PARTY.html`. Other referenced projects are not automatically bundled or integrated.
