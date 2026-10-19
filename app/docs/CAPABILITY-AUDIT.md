# Waraq capability audit

Reviewed 9 October 2026. This audit distinguishes working browser tools, engine connections, and capabilities still requiring development. It is not a claim of Acrobat feature parity or an exhaustive census of PDF software.

## What is implemented locally

| Area | Current implementation | Practical limit |
| --- | --- | --- |
| Page organization | Merge, split, explicit ranges, reorder, rotate, duplicate, delete, blank pages, crop, reverse, selected export | Copied-page exports do not promise document-level bookmarks, attachments, interactive forms or signature preservation. Cropping changes visibility; it is not secure deletion. |
| Appearance | Arabic/English stamps, watermarks, page numbers, highlights, rectangle outlines, placed text, drawn/uploaded visual signatures | Added Arabic text is browser-shaped imagery. This does not replace existing text or produce a certificate signature. |
| Forms | Fill original-source AcroForm text, checkbox, dropdown and radio fields | Downloaded output is flattened. Arabic entries use text imagery. XFA, rich text, signature creation and unsupported field types are outside this tool. |
| OCR | Local Tesseract.js, Arabic/English/mixed recognition, page ranges, editable preview and TXT download | Maximum 20 pages per run, sequential rendering capped near 6 megapixels/page. Browser OCR does not create searchable PDFs; that operation uses the companion. |
| Privacy | Metadata edit/removal; drawn-region redaction | Metadata removal targets the Info dictionary and XMP. Redaction recreates every page as an image, without copying original text, attachments or interactive structures. The result loses searchability and interactivity. |
| Conversion | JPG/PNG to PDF, PDF to PNG ZIP, existing-text extraction, grayscale, image-only compression | Compression can increase the file size. Grayscale and compression rasterize pages. Existing-text extraction depends on the document's text layer and reading order. |
| Print layout | A4/A3/Letter/Legal resizing, 2/4/6/9-up sheets, RTL/LTR folded-booklet imposition | Vector page content is embedded, including its text; interactive annotations, links and form widgets are not carried over. Fill/flatten forms first. Printer duplex settings require a test sheet. |
| Comparison | Two-source page comparison at a shared physical scale, threshold control and PNG difference export | Compares visible preview pixels only, not semantic changes or a full-document text diff. Scanning offsets can cause widespread differences. |
| Creation | Bilingual document templates | Templates do not provide arbitrary existing PDF text reflow. |
| Offline use | Local assets and an offline preparation workflow | The application and needed OCR assets must be cached or served locally before connectivity is lost. A web address alone does not guarantee offline availability. |

The new layout, comparison and grayscale module is `dist/more-tools.js`, routed through the regular tool catalog. `more-tools-tests.cjs` exercises booklet pairing/padding, RTL ordering, 0/90/180/270-degree placement, resizing, N-up output, blank pages, pixel-difference thresholds and grayscale conversion. The existing composition, advanced PDF and naming suites also pass. Browser OCR was checked with the English sample; broad Arabic-document accuracy is still a validation task.

## Engine-backed capabilities

The website exposes explicit connections for OCR/searchable PDF, Office conversion, encryption/unlocking, repair, PDF/A, signature inspection, flattening, text-match redaction and AI extraction. Availability must come from `/api/capabilities`; a catalog entry or a configured URL is not evidence that a given engine is installed or functioning. These tools transmit the selected document only after the user chooses the visible “Send to engine and process” action, which names the destination.

A hosted static site cannot execute LibreOffice, OCRmyPDF or qpdf by itself. The companion is a distinct local or hosted service. Stirling and ocrbase adapters are not the same as embedding the entire upstream applications. Converting a PDF into Word is also different from editing its existing PDF text runs in place.

## opdf.io: useful reference, open-source status unverified

[Opdf](https://opdf.io/) presents a broad collection of browser tools. Its own [Arabic support page](https://opdf.io/blog/arabic-pdf-tools-free) describes local processing and RTL support; its [metadata guide](https://opdf.io/blog/pdf-metadata-guide) describes document-information/XMP editing. These are product claims, not a source-code audit.

No verifiable official repository and source license were identified in the primary material retrieved for this review. The homepage, About and Terms returned a JavaScript shell to the research tool. Therefore **do not label opdf.io open source, copy its implementation, or claim it is integrated**. Treat it as a product/UX reference until its owner provides an official repository and license. It is not established to be the separate `Charltsing/oPDF` project or `LibrePDF/OpenPDF` Java library.

## Full editing options

| Candidate | Evidence and fit | Integration decision |
| --- | --- | --- |
| OpenPdfEdit | The [official repository's indexed README](https://github.com/open-pdf-edit/OpenPdfEdit) advertises a Rust/WASM engine, text-run/image editing, true redaction and form creation. The indexed README identifies current code as AGPL-3.0-or-later, with exceptions for its MCP component and vendored account packages. It says releases through 1.0.1 used MIT OR Apache-2.0. Arabic is absent from its stated eight UI languages. | Promising browser engine candidate, but no code was imported. Direct repository/raw-file fetches returned errors during this review, so the exact live revision and license still need verification. Pin and inspect an actual release before considering integration. Validate Arabic shaping, subset fonts, RTL hit testing, save/reopen fidelity and redaction independently. |
| ONLYOFFICE Docs / PDF Editor | The [PDF editing guide](https://helpcenter.onlyoffice.com/docs/userguides/pdf_editor/EditPDF.aspx) documents detecting existing text boxes and editing them, plus page/object operations. [ONLYOFFICE Docs](https://www.onlyoffice.com/docs) describes its AGPL community offering and separate developer integration product. | A substantial editor/service integration, not a drop-in replacement for pdf-lib. Evaluate supported deployment/embedding terms and test Arabic PDFs. It could provide a dedicated full-editor route backed by an appropriately configured service. |
| PDF4QT | The [official repository](https://github.com/JakubMelka/PDF4QT) describes a Windows/Linux C++/Qt engine and desktop applications with editing, comparison, forms and signatures. It identifies its project license as MIT and separately lists dependencies. | Strong desktop/engine reference. Bringing it into this website would require a deliberate native companion or new WASM port; it is not currently bundled. |
| MuPDF | The [official JavaScript annotation reference](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/PDFAnnotation.html) distinguishes marking redaction from applying destructive content removal. | Candidate for selective content processing and redaction. Its APIs alone do not supply the complete editing UI, font recovery, text reflow and Arabic editing behavior expected from Acrobat. |

No white rectangle over existing text should be described as true replacement or redaction. Replacing text correctly requires identifying content operators, decoding font encodings, handling subset/embedded fonts, maintaining transforms and clipping, and writing a valid updated content stream. Arabic additionally requires shaping and bidirectional layout. Those are separate engine and editor responsibilities.

## Adobe and iLovePDF gaps

Adobe's [free online editor](https://www.adobe.com/acrobat/online/pdf-editor.html) documents annotations, text boxes, drawings and fill/sign, with server handling and account-based workflows. The broader [Acrobat feature page](https://www.adobe.com/acrobat/features.html) includes editing existing text/images. These are different product scopes; matching the free annotation page does not establish Acrobat parity.

iLovePDF's [advanced-editor announcement](https://www.ilovepdf.com/blog/new-advanced-pdf-editing-ilovepdf), dated 27 February 2026, describes editing existing text, formatting, creating form fields, and managing links, bookmarks, attachments and certificate properties. Its [platform features](https://www.ilovepdf.com/features) also describe cloud-storage integrations and desktop/mobile options. Waraq should not claim those capabilities based on stamps, templates, or connector placeholders.

| Missing or incomplete area | Needed work |
| --- | --- |
| Existing text and image editing | Integrate and validate an appropriate full content engine and selection/formatting UI. Test Arabic, mixed-direction lines, subset fonts and rotated content. |
| Persistent editing workspace | Maintain one editable document/session with undo/redo across edits, rather than downloading each advanced operation independently. |
| Native PDF annotations | Add editable comments, sticky notes, ink, highlight quads and export/import of annotation objects. Current markup is drawn page content. |
| Form creation and preservation | Add field creation/layout, interactive appearance generation with proper fonts, validation and supported save behavior. |
| Digital signing | Implement certificate/key handling, signing policy, validation and incremental-save rules; visual signatures are insufficient. |
| Conversion fidelity | Test Office round trips, tables, slides and Arabic reading order with reference documents. Advertise actual supported formats and engines. |
| Navigation and attachments | Implement document outlines, internal/external links and attachment management, with explicit safe handling. |
| Accessibility and archival conformance | Add tagging, reading-order tools and appropriate PDF/A/PDF/UA validation. A conversion command alone is not proof of conformance. |
| Collaboration | Add authenticated sharing, permissions and review/comment workflows only with explicit product requirements and a backend. |
| Large-document reliability | Add bounded-memory processing, cancellation and recovery across all tools, plus performance tests on long and image-heavy PDFs. |

The immediate browser tools meaningfully expand the workspace. The next full-editor integration should be chosen against a small fixture set covering Arabic text, English text, images, rotated/cropped pages, forms, encrypted files and signatures; require edit/save/reopen checks before exposing it as a finished capability.
Validation update, 10 October 2026: all four browser PDF/naming suites and 20 backend contract/security checks passed. Browser OCR recognized the English sample with the preview server stopped; both Arabic and English models loaded from the offline cache. Desktop development and packaged startup checks passed with 38 tool entries, local assets and isolated renderer. Portable and per-user NSIS x64 EXEs were built successfully. These are unsigned preview builds; installer installation/uninstallation and a broad Arabic accuracy corpus remain untested. Native engine conversions and Docker image execution were not tested because their dependencies are absent on this host.
