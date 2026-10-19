# Open-source PDF system research

Reviewed 8 October 2026. This is a broad survey, not a claim to enumerate every project. Capabilities below describe upstream documentation; they are not verified integrations or independent benchmarks.

## Projects specifically requested

| Project and source | Role | License/status | Recommendation for Waraq |
|---|---|---|---|
| [PDFCraftTool / PDFCraft](https://github.com/PDFCraftTool/pdfcraft) | Browser-local toolkit covering organization, annotations, conversions and more | [AGPL-3.0](https://github.com/PDFCraftTool/pdfcraft/blob/main/LICENSE) | Closest complete product reference. Evaluate a fork separately from the current custom app; do not assume advertised tool counts imply all conversions preserve fidelity. |
| [Stirling PDF](https://github.com/Stirling-Tools/Stirling-PDF) | Broad desktop/web/server toolkit with APIs | [MIT outside enumerated excluded directories; open-core](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE) | Strong server-platform candidate. Inspect engine and proprietary directory licenses for the exact deployed version. |
| [pdfcn](https://github.com/shadcn-labs/pdfcn) | React PDF components using Takumi and Forme, invoices/reports/tables | MIT | Future document-template generator. It does not replace an existing-PDF editor. |
| [PDFx](https://github.com/akii09/pdfx) | React PDF components and CLI based on react-pdf | Repository labels [LICENSE](https://github.com/akii09/pdfx/blob/main/LICENSE) MIT, but inspected license text appears abbreviated | Generation reference; verify full license terms before copying code. Assumed this is the PDFx intended because pdfcn credits it. |
| [Lulzx/zpdf](https://github.com/Lulzx/zpdf) | Zig text extraction, structure/reading-order handling and Markdown export | CC0; README calls it alpha | Benchmark for extraction workloads. Not a full editing UI or OCR engine. |
| [Xero-Team/zpdf](https://github.com/Xero-Team/zpdf) | Rust parser/renderer plus writer, CLI and WASM capabilities | MIT | Separate namesake. Promising broad engine, but validate upstream editing/redaction/signature claims against an independent regression corpus before adoption. |
| [GenOffice](https://github.com/genspark-ai/genoffice) | Desktop Office/PDF editor with AI, CLI and MCP | Apache-2.0 with enterprise-directory exception; own branding required | Evaluate its document interoperability and Arabic handling; not a drop-in browser PDF library. AI needs provider access and may have usage costs. |
| [ocrbase](https://github.com/majcheradam/ocrbase) | API for parsing PDFs/images to text/Markdown or structured JSON through PaddleOCR-VL / GLM-OCR | MIT for wrapper; model terms separate | Useful optional OCR service adapter. Requires a separately running model inference server; the wrapper does not include models. The old ocrbase-hq organization is archived, so use current repository rather than assuming its hosted service works. |
| [make-look-scanned](https://github.com/overflowy/make-look-scanned) | Browser/WASM and CLI scan effects: skew, grain, paper tone, blur, JPEG | AGPL-3.0 | Likely interpretation of “marklookscan”; not confirmed. Suitable optional visual effect. Raster output loses selectable text. It is not OCR or secure redaction. |

## Other relevant projects

| Project | Main use | Upstream license family |
|---|---|---|
| [PDF Arranger](https://github.com/pdfarranger/pdfarranger) | Visual split/merge/reorder/rotate/crop desktop UI | GPL-3.0 |
| [PDFsam Basic](https://pdfsam.org/pdfsam-basic/) | Split/merge/rotate/mix; distinguish commercial Enhanced | AGPL-3.0 |
| [PDF4QT](https://github.com/JakubMelka/PDF4QT) | Desktop editing and C++/Qt engine | MIT |
| [LibreOffice](https://www.libreoffice.org/) | Office conversion and Draw editing | MPL-2.0 family |
| [ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer) | Collaborative Office and PDF editing | AGPL-3.0 community; other editions differ |
| [Xournal++](https://github.com/xournalpp/xournalpp) | Handwriting and PDF annotation | GPL-2.0 |
| [Okular](https://okular.kde.org/) | Reading, annotations and forms | GPL family |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Browser rendering and text extraction | Apache-2.0 |
| [pdf-lib](https://pdf-lib.js.org/) | JS PDF creation, copying and modification | MIT |
| [qpdf](https://github.com/qpdf/qpdf) | Structural transformation, repair, encryption | Apache-2.0 |
| [pikepdf](https://github.com/pikepdf/pikepdf) | Python interface to qpdf | MPL-2.0 |
| [pypdf](https://github.com/py-pdf/pypdf) | Python page and metadata manipulation | BSD-3-Clause |
| [pdfcpu](https://github.com/pdfcpu/pdfcpu) | Go toolkit and CLI | Apache-2.0 |
| [Apache PDFBox](https://github.com/apache/pdfbox) | Java PDF manipulation/rendering | Apache-2.0 |
| [MuPDF](https://github.com/ArtifexSoftware/mupdf) | Rendering and PDF processing | AGPL / commercial |
| [Ghostscript](https://github.com/ArtifexSoftware/ghostpdl) | Rendering and optimization | AGPL / commercial |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) | Searchable PDF OCR pipeline | MPL-2.0; dependencies differ |
| [Tesseract](https://github.com/tesseract-ocr/tesseract) | OCR including Arabic and English models | Apache-2.0 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Browser OCR on images | Apache-2.0 |

## Architecture decision

The delivered static edition uses pdf-lib + PDF.js + JSZip for local workflows. It does not incorporate the other projects' code. Browser operations stay in browser memory; optional remote engine operations explicitly send documents to the selected engine. This keeps the initial workbench deployable without an external processing server.

For the full system, retain the bilingual UI and introduce a capability API returning actual availability. Use isolated, resource-limited jobs for OCRmyPDF/Tesseract (ara+eng), LibreOffice conversion, and qpdf repair/encryption. A container host is required; the current Sites static/Workers environment cannot directly run those native binaries. Choose either a verified Stirling API deployment or a small dedicated processing service. Add explicit upload consent, job cancellation/status, authentication, retention/deletion policy, storage quotas, and per-job sandboxing when server processing is introduced.

For structured document generation, compare pdfcn and PDFx with Arabic shaping, mixed-direction lines, embedded fonts and pagination tests. For AI document extraction, make ocrbase optional and expose model/provider choice and processing location. For scan appearance, either integrate make-look-scanned with its source obligations or implement independent effects. Do not treat scan appearance as sanitization.

## Acceptance criteria before calling it “does it all”

- Arabic/English corpus: mixed direction, diacritics, tables, scanned pages, embedded/subset fonts, rotated/cropped pages, large and malformed files.
- True editing must alter text objects with predictable font handling, not paint over text.
- Redaction must remove underlying text, images, annotations and hidden information; test re-extraction after export.
- Verify form fields, bookmarks, attachments, links and signatures for each operation; explicitly report losses.
- Office round trips need visual comparisons. OCR needs an Arabic/English accuracy evaluation, not just a successful HTTP response.
- Verify each component's pinned-version license and notices before bundling it. “Free”, “open-core” and “open source” are different categories.

Update, October 9, 2026: browser OCR, annotations, raster redaction, form filling and templates are implemented. Optional engine adapters are being delivered separately; availability depends on installed dependencies. True existing-content editing and certified digital signing remain gaps. See CAPABILITY-AUDIT.md for the current comparison.

