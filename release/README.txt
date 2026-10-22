Waraq 1.0.0-dev — Windows installer (NSIS, per-user, no administrator rights)
File:    Waraq_1.0.0-dev_x64-setup.exe
Size:    30017909 bytes (28.6 MB)
SHA-256: 7a550b134afe4d3f777058f9063181924e804e4208b0876462f2ff8c24c6eace
Built:   2026-10-22 14:15 local, from waraq-next 56079db, signed for the updater

Silent install:   Waraq_x_y_z_x64-setup.exe /S            (optional: /D=C:\path, last argument, no quotes)
Silent uninstall: "%LOCALAPPDATA%\Waraq\uninstall.exe" /S
The installer offers "Open with Waraq" for .pdf (never takes over the default), owns .waraq, and adds a right-click
"Open in Waraq" entry for both; all per-user registry keys are removed on uninstall (src-tauri/installer/hooks.nsh).
Not code-signed (owner declined a certificate, 2026-10): SmartScreen shows "unknown publisher" on first run.
Updater: the .exe.sig beside the installer is its minisign signature; `node tools/dev/update-manifest.mjs` prints the
manifest for https://www.pwaraq.com/downloads-1.0/manifest.json (upload installer + manifest only after the release gate).
Microsoft Store: `packaging/msix/build.ps1` makes release/Waraq_<v>.msix (identity placeholders: see packaging/msix/README.md).
