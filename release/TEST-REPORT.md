
## Installer test — 2026-10-21 11:46 — Waraq_1.0.0-dev_x64-setup.exe

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
