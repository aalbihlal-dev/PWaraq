
## Updater test — 2026-10-21 09:32 — 0.0.1 → 0.0.2, local manifest server, identity com.waraq.test

14 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| 0.0.1 installed silently | pass | version 0.0.1 |
| installer copy kept for rollback | pass |  |
| update 0.0.2 found, downloaded, "Restart to update" shown | pass | served /manifest.json /WaraqTest_0.0.2_x64-setup.exe |
| last-good is 0.0.1 while 0.0.2 waits for the click | pass | last-good=0.0.1 |
| app exits for the installer | pass |  |
| 0.0.2 installed and relaunched | pass | version 0.0.2, 1 process(es) |
| 0.0.2 reached the page: last-good = 0.0.2, boot marker cleared | pass | last-good=0.0.2 |
| 0.0.2 installer kept, 0.0.1 installer kept for rollback | pass |  |
| rolled back: 0.0.1 reinstalled silently and relaunched | pass | version 0.0.1, 1 process(es) |
| 0.0.1 is last-good again, rollback note consumed | pass | last-good=0.0.1 skip=0.0.2 |
| 0.0.2 marked as skipped | pass |  |
| rolled-back window captured: flat paper top edge, page drawn | pass | re-measured 2026-10-21 on the start screen: OK top=#fafbf8 page: white 17% dark 70 px, window 1282x802. The old row passed because it only checked that the screenshot file existed; its probe expected #ffffff (the colour of an open document's bar) but the start screen's top edge is paper #fafbf8, so the "FAIL" was a wrong probe, not a window problem. win-shot.ps1 now has -Start for the start screen and the row requires "OK" |
| skipped 0.0.2 is not offered again (manual check says latest) | pass | served /manifest.json note="" |
| uninstalled, test data removed | pass |  |

## Add-on pack test — 2026-10-21 09:43 — real pack from pwaraq.com, release\waraq.exe

11 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| first .docx asks for the add-on | pass | هل تريد تنزيل إضافة أوفيس و CAD (137 ميغابايت)؟ |
| download starts after the click, with progress | pass |  |
| pack downloaded, unpacked, .docx converted and opened | pass | 21 s including the download |
| pack folder holds LibreOffice and LibreDWG | pass |  |
| no pack temp files left | pass |  |
| converted document has pages | pass | 1 page(s) |
| table.xlsx converted and opened | pass | 6653 ms, 1 page(s) |
| slide.pptx converted and opened | pass | 6133 ms, 2 page(s) |
| plan.dxf converted and opened | pass | 5112 ms, 1 page(s) |
| plan.dwg converted and opened | pass | 6119 ms, 1 page(s) |
| no conversion temp folders left | pass |  |

## Installer test — 2026-10-21 12:44 — Waraq_1.0.0-dev_x64-setup.exe

Silent install into `C:\Users\Abdullah\AppData\Local\WaraqInstallTest` (per-user), launch by file, silent uninstall. 29 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| silent install exits 0 | pass | exit 0 |
| waraq.exe installed | pass |  |
| uninstall.exe installed | pass |  |
| Start menu shortcut | pass |  |
| desktop shortcut (silent installs create it) | pass |  |
| uninstall entry (per-user) | pass | version 1.0.0-dev |
| uninstall entry points at the test dir | pass |  |
| .pdf default handler untouched | pass | before='' after='' |
| .pdf offered: OpenWithProgids\Waraq.PDF | pass |  |
| Waraq.PDF open command | pass |  |
| .waraq associated (Waraq.Portfolio) | pass |  |
| Waraq.Portfolio open command | pass |  |
| right-click 'Open in Waraq' on .pdf | pass |  |
| right-click 'Open in Waraq' on .waraq | pass |  |
| installer copy kept for rollback | pass |  |
| PDF opens Waraq via the right-click verb | pass | 1 process(es) |
| window shows the document (screenshot) | pass | OK top=#ffffff page: white 98% dark 185 px, window 1282x802 |
| second file goes to the running window (single instance) | pass | 1 process(es) |
| silent uninstall exits 0 | pass | exit 0 |
| install folder removed | pass |  |
| Start menu shortcut removed | pass |  |
| desktop shortcut removed | pass |  |
| uninstall entry removed | pass |  |
| Waraq.PDF removed | pass |  |
| OpenWithProgids\Waraq.PDF removed | pass |  |
| .pdf default handler still untouched | pass |  |
| .waraq association removed | pass |  |
| right-click entries removed | pass |  |
| rollback copies removed | pass |  |

## Installer test — 2026-10-21 13:33 — Waraq_1.0.0-dev_x64-setup.exe

Silent install into `C:\Users\Abdullah\AppData\Local\WaraqInstallTest` (per-user), launch by file, silent uninstall. 29 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| silent install exits 0 | pass | exit 0 |
| waraq.exe installed | pass |  |
| uninstall.exe installed | pass |  |
| Start menu shortcut | pass |  |
| desktop shortcut (silent installs create it) | pass |  |
| uninstall entry (per-user) | pass | version 1.0.0-dev |
| uninstall entry points at the test dir | pass |  |
| .pdf default handler untouched | pass | before='' after='' |
| .pdf offered: OpenWithProgids\Waraq.PDF | pass |  |
| Waraq.PDF open command | pass |  |
| .waraq associated (Waraq.Portfolio) | pass |  |
| Waraq.Portfolio open command | pass |  |
| right-click 'Open in Waraq' on .pdf | pass |  |
| right-click 'Open in Waraq' on .waraq | pass |  |
| installer copy kept for rollback | pass |  |
| PDF opens Waraq via the right-click verb | pass | 1 process(es) |
| window shows the document (screenshot) | pass | OK top=#ffffff page: white 98% dark 185 px, window 1282x802 |
| second file goes to the running window (single instance) | pass | 1 process(es) |
| silent uninstall exits 0 | pass | exit 0 |
| install folder removed | pass |  |
| Start menu shortcut removed | pass |  |
| desktop shortcut removed | pass |  |
| uninstall entry removed | pass |  |
| Waraq.PDF removed | pass |  |
| OpenWithProgids\Waraq.PDF removed | pass |  |
| .pdf default handler still untouched | pass |  |
| .waraq association removed | pass |  |
| right-click entries removed | pass |  |
| rollback copies removed | pass |  |

## Add-on pack test — 2026-10-21 10:37 — real pack from pwaraq.com, release\waraq.exe

11 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| first .docx asks for the add-on | pass | هل تريد تنزيل إضافة أوفيس و CAD (137 ميغابايت)؟ |
| download starts after the click, with progress | pass |  |
| pack downloaded, unpacked, .docx converted and opened | pass | 207 s including the download |
| pack folder holds LibreOffice and LibreDWG | pass |  |
| no pack temp files left | pass |  |
| converted document has pages | pass | 1 page(s) |
| table.xlsx converted and opened | pass | 8186 ms, 1 page(s) |
| slide.pptx converted and opened | pass | 7168 ms, 2 page(s) |
| plan.dxf converted and opened | pass | 6112 ms, 1 page(s) |
| plan.dwg converted and opened | pass | 6144 ms, 1 page(s) |
| no conversion temp folders left | pass |  |

## Converted Arabic font test — 2026-10-21 — arabic.docx / table.xlsx / slide.pptx through the real pack

LibreOffice substituted a calligraphic font (Ghalam) for Arabic because the .docx names Mangal (a Devanagari font) for complex text. Now Amiri (OFL) is copied beside LibreOffice and a replacement table maps such fonts to it. `cargo test office_fixtures` then `python tools/dev/arabic-fonts-test.py`: 16 checks, 0 failed. Screenshot: converted-docx-open.png (before: -BEFORE-nastaliq).

| Check | Result |
|---|---|
| arabic-docx: word مرحباً extracted  | pass |
| arabic-docx: word بكم extracted  | pass |
| arabic-docx: word في extracted  | pass |
| arabic-docx: word ورق extracted  | pass |
| arabic-docx: word هذا extracted  | pass |
| arabic-docx: word نص extracted  | pass |
| arabic-docx: word عربي extracted  | pass |
| arabic-docx: word حقيقي extracted  | pass |
| arabic-docx: word للتجربة extracted  | pass |
| arabic-docx: word العدد extracted  | pass |
| arabic-docx: word ١٢٣ extracted digits as in the source | pass |
| arabic-docx: word والتاريخ extracted  | pass |
| arabic-docx: word ٢٠٢٦ extracted digits as in the source | pass |
| arabic-docx: Arabic font is Amiri Amiri-Regular, Arial-BoldMT, TimesNewRomanPSMT | pass |
| table-xlsx: Arabic font is Amiri Amiri-Regular, ArialMT, TimesNewRomanPSMT | pass |
| slide-pptx: Arabic font is Amiri Amiri-Regular, ArialMT | pass |

## Installer test — 2026-10-22 09:37 — Waraq_1.0.0-dev_x64-setup.exe

Silent install into `C:\Users\Abdullah\AppData\Local\WaraqInstallTest` (per-user), launch by file, silent uninstall. 29 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| silent install exits 0 | pass | exit 0 |
| waraq.exe installed | pass |  |
| uninstall.exe installed | pass |  |
| Start menu shortcut | pass |  |
| desktop shortcut (silent installs create it) | pass |  |
| uninstall entry (per-user) | pass | version 1.0.0-dev |
| uninstall entry points at the test dir | pass |  |
| .pdf default handler untouched | pass | before='' after='' |
| .pdf offered: OpenWithProgids\Waraq.PDF | pass |  |
| Waraq.PDF open command | pass |  |
| .waraq associated (Waraq.Portfolio) | pass |  |
| Waraq.Portfolio open command | pass |  |
| right-click 'Open in Waraq' on .pdf | pass |  |
| right-click 'Open in Waraq' on .waraq | pass |  |
| installer copy kept for rollback | pass |  |
| PDF opens Waraq via the right-click verb | pass | 1 process(es) |
| window shows the document (screenshot) | pass | OK top=#ffffff page: white 98% dark 185 px, window 1282x802 |
| second file goes to the running window (single instance) | pass | 1 process(es) |
| silent uninstall exits 0 | pass | exit 0 |
| install folder removed | pass |  |
| Start menu shortcut removed | pass |  |
| desktop shortcut removed | pass |  |
| uninstall entry removed | pass |  |
| Waraq.PDF removed | pass |  |
| OpenWithProgids\Waraq.PDF removed | pass |  |
| .pdf default handler still untouched | pass |  |
| .waraq association removed | pass |  |
| right-click entries removed | pass |  |
| rollback copies removed | pass |  |

## Installer test — 2026-10-22 13:35 — Waraq_1.0.0-dev_x64-setup.exe

Silent install into `C:\Users\Abdullah\AppData\Local\WaraqInstallTest` (per-user), launch by file, silent uninstall. 29 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| silent install exits 0 | pass | exit 0 |
| waraq.exe installed | pass |  |
| uninstall.exe installed | pass |  |
| Start menu shortcut | pass |  |
| desktop shortcut (silent installs create it) | pass |  |
| uninstall entry (per-user) | pass | version 1.0.0-dev |
| uninstall entry points at the test dir | pass |  |
| .pdf default handler untouched | pass | before='' after='' |
| .pdf offered: OpenWithProgids\Waraq.PDF | pass |  |
| Waraq.PDF open command | pass |  |
| .waraq associated (Waraq.Portfolio) | pass |  |
| Waraq.Portfolio open command | pass |  |
| right-click 'Open in Waraq' on .pdf | pass |  |
| right-click 'Open in Waraq' on .waraq | pass |  |
| installer copy kept for rollback | pass |  |
| PDF opens Waraq via the right-click verb | pass | 1 process(es) |
| window shows the document (screenshot) | pass | OK top=#ffffff page: white 98% dark 193 px, window 1282x802 |
| second file goes to the running window (single instance) | pass | 1 process(es) |
| silent uninstall exits 0 | pass | exit 0 |
| install folder removed | pass |  |
| Start menu shortcut removed | pass |  |
| desktop shortcut removed | pass |  |
| uninstall entry removed | pass |  |
| Waraq.PDF removed | pass |  |
| OpenWithProgids\Waraq.PDF removed | pass |  |
| .pdf default handler still untouched | pass |  |
| .waraq association removed | pass |  |
| right-click entries removed | pass |  |
| rollback copies removed | pass |  |

## Installer test — 2026-10-22 14:16 — Waraq_1.0.0-dev_x64-setup.exe

Silent install into `C:\Users\Abdullah\AppData\Local\WaraqInstallTest` (per-user), launch by file, silent uninstall. 29 checks, 0 failed.

| Check | Result | Note |
|---|---|---|
| silent install exits 0 | pass | exit 0 |
| waraq.exe installed | pass |  |
| uninstall.exe installed | pass |  |
| Start menu shortcut | pass |  |
| desktop shortcut (silent installs create it) | pass |  |
| uninstall entry (per-user) | pass | version 1.0.0-dev |
| uninstall entry points at the test dir | pass |  |
| .pdf default handler untouched | pass | before='' after='' |
| .pdf offered: OpenWithProgids\Waraq.PDF | pass |  |
| Waraq.PDF open command | pass |  |
| .waraq associated (Waraq.Portfolio) | pass |  |
| Waraq.Portfolio open command | pass |  |
| right-click 'Open in Waraq' on .pdf | pass |  |
| right-click 'Open in Waraq' on .waraq | pass |  |
| installer copy kept for rollback | pass |  |
| PDF opens Waraq via the right-click verb | pass | 1 process(es) |
| window shows the document (screenshot) | pass | OK top=#ffffff page: white 98% dark 193 px, window 1282x802 |
| second file goes to the running window (single instance) | pass | 1 process(es) |
| silent uninstall exits 0 | pass | exit 0 |
| install folder removed | pass |  |
| Start menu shortcut removed | pass |  |
| desktop shortcut removed | pass |  |
| uninstall entry removed | pass |  |
| Waraq.PDF removed | pass |  |
| OpenWithProgids\Waraq.PDF removed | pass |  |
| .pdf default handler still untouched | pass |  |
| .waraq association removed | pass |  |
| right-click entries removed | pass |  |
| rollback copies removed | pass |  |
