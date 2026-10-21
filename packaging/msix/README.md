# Waraq 1.0 — Microsoft Store package (MSIX)

Prepared, **not submitted**. The Store signs the package itself, so a Store listing is the way to get Waraq onto
PCs without the SmartScreen "unknown publisher" warning (the owner declined a paid code-signing certificate).

## What is here
- `AppxManifest.xml` — the package manifest (full-trust Win32 app, English + Arabic, `.pdf` offered in *Open with*,
  `.waraq` owned). Three `PLACEHOLDER` values must come from Partner Center → *Product management → Product identity*:
  `Package/Identity/Name`, `Package/Identity/Publisher` (the `CN=…` string, **not** the display name) and
  `Package/Properties/PublisherDisplayName`.
- `Assets/` — tile images in the sizes the Store needs (44, 71, 150, 310, 310×150, 50 StoreLogo, 620×300 splash),
  made from `src-tauri/icons/icon.png` (transparent, mark centred; the tile background is Waraq green `#15775d`).
- `build.ps1` — builds `release/Waraq_<version>.msix` with `MakeAppx.exe` from the Windows SDK: release build of the
  app, the assets, the manifest with the version from `package.json` (`1.0.0-dev` → `1.0.0.0`), and a `store-build`
  marker file next to `waraq.exe` so the app never runs its own updater (the Store updates it).
  `-SelfSign` signs with a throw-away test certificate for a local sideload test; `-NoBuild` reuses the last build.

## On this PC (checked 21 Oct 2026)
Windows SDK **10.0.26100.0** is installed with `MakeAppx.exe`, `MakePri.exe` and `SignTool.exe`
(`C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64`), so `build.ps1` runs here.

## What the Store needs from the owner (decisions)
1. **Partner Center account** (one-time developer registration, individual or company; paid once by Microsoft),
   then *Create a new app* → reserve the name **Waraq** → copy the product identity values into the manifest.
2. **Privacy policy URL** — required because the app has internet access (updater off in the Store build, but the
   add-on pack download and the crash-report links remain). Use <https://www.pwaraq.com/support> or a dedicated
   page that says: files never leave the device; the Office & CAD add-on is downloaded from pwaraq.com after a click;
   crash reports are sent only when the person sends them.
3. **Age rating** questionnaire (IARC) in Partner Center — a PDF tool with no user content sharing rates "3+/Everyone".
4. **Store listing**: description EN + AR, 3–10 screenshots (1366×768 or larger; the ones in
   `../Archive-2026-10-12/screenshots/` fit), category *Productivity*, support contact support@pwaraq.com.
5. **Package upload**: `release/Waraq_<version>.msix` from `build.ps1` (unsigned is fine — the Store signs).
   Certification usually takes 1–3 days; the Store then handles updates, so a Store release is a separate upload
   per version (the pwaraq.com updater stays for the NSIS installer).

## Not possible to test here without the account
- The real package identity (so the MSIX from `build.ps1` cannot be installed from the Store; a sideload with
  `-SelfSign` works after importing the test certificate into *Trusted People* and running
  `Add-AppxPackage release\Waraq_<version>.msix`).
- File associations and the Store-signed first run.

## Known limits of the Store build
- The app data folder is virtualized by MSIX (`%LOCALAPPDATA%\Packages\<identity>\LocalCache\Roaming\com.waraq.app`),
  so drafts, crash log and the add-on pack live there; LibreOffice runs from that folder (not verified under MSIX yet).
- The updater row shows "You have the latest version." (updates come from the Store).
