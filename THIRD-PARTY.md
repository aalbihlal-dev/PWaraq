# Third-party components

Waraq is licensed under the GNU AGPL v3 or later (see [LICENSE](LICENSE)). It includes or downloads these components,
each under its own licence.

## Waraq 1.0 (`next/`)
| Component | Use | Licence |
|---|---|---|
| [MuPDF](https://mupdf.com) 1.28.5 (our WebAssembly build, `next/engine`) | PDF engine: drawing, text, search, page assembly | AGPL-3.0-or-later |
| [Svelte](https://svelte.dev) | Interface | MIT |
| [Vite](https://vitejs.dev) | Build tool | MIT |
| [Tajawal](https://fonts.google.com/specimen/Tajawal) | Interface and written pages font | SIL OFL 1.1 |

## Waraq 0.3 (`app/`)
Website libraries (notices also in `app/dist/vendor/THIRD-PARTY.html`):
| Component | Licence |
|---|---|
| pdf-lib 1.17.1 | MIT |
| PDF.js 4.10.38 | Apache-2.0 |
| JSZip 3.10.1 | MIT (dual-licensed MIT/GPLv3, used under MIT) |
| Tesseract.js 6.0.1, tesseract.js-core 6.0.0, Arabic and English trained data | Apache-2.0 |
| Tajawal, Reem Kufi fonts | SIL OFL 1.1 |

Windows app and its add-on packs (downloaded on first use, checked by SHA-256):
| Component | Use | Licence |
|---|---|---|
| Electron | Desktop shell | MIT |
| MuPDF (mutool) | Drawing, conversion | AGPL-3.0-or-later |
| qpdf | Repair, encryption | Apache-2.0 |
| LibreOffice | Office documents to PDF | MPL-2.0 |
| LibreDWG | CAD (DWG) files | GPL-3.0-or-later |
| Tesseract | OCR | Apache-2.0 |
