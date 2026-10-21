
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
| rolled-back window captured | pass | FAIL top=#ffffff page: white 43% dark 70 px, window 1282x802 edge: (24,0)=#fafbf8 (200,0)=#fafbf8 (641,0)=#fafbf8 (24,12)=#fafbf8 (200,12)=#fafbf8 (641,12)=#fafbf8 |
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
