# Waraq for Windows

Waraq bundles the web workspace, PDF libraries, and Arabic and English OCR models in a Windows application. Its browser tools work without an internet connection, with no Node.js or browser installation required. Both builds target Windows x64.

- `Waraq-Setup-<version>-x64.exe` (current: 0.3.3): installs for the current user and adds a Start menu shortcut. Administrator elevation is not requested. Office/CAD and OCR engines are add-on packs downloaded on first use (`packs.json`, SHA-256 pinned).

These initial builds are **unsigned**. Verify the SHA-256 hash from the download manifest before running. Code signing is needed for a production distribution with a verified publisher.

## Offline scope

Page organization, browser editing, local OCR, templates, and other browser tools are bundled. Office conversion, qpdf operations and searchable OCR through OCRmyPDF require their documented local engines. Certificate signing is not implemented. These executables do not include LibreOffice, qpdf, OCRmyPDF, Tesseract CLI, Docker, or certificate signing services. The tools report actual local availability instead of claiming that those engines are installed.

No automatic updater, remote asset loading, telemetry, or remote engine connection is enabled in the desktop renderer. The application serves its packaged files over a private loopback port and denies requests to other origins. A deliberately clicked HTTPS project link opens in the user's external browser. The application does not send document contents with that link.

## Build

Use Node.js 22 or later and pnpm. Initial dependency installation and packaging require internet access to obtain the pinned Electron runtime and installer tooling. The finished executables do not require the network to run bundled tools.

```powershell
pnpm install --frozen-lockfile
pnpm desktop:test
pnpm desktop:check
pnpm desktop:build
pnpm desktop:smoke
```

Artifacts are written to `release/`. The package includes `dist/`, except generated `offline/` and `downloads/` distributions, and the local backend. This prevents recursive packaging of executables and ZIP files. No external native PDF engines are bundled. Do not package personal files, environment secrets, certificates, or signing keys.

The portable executable extracts its bundled runtime into a temporary directory when launched. Preferences use Electron's normal per-user application data directory. Closing the application shuts down its loopback server.

## Security choices

The renderer uses Electron sandboxing, context isolation, disabled Node integration and WebViews, denied permissions, origin-checked navigation, and a restrictive Content Security Policy. The preload exposes application metadata only. It forwards trusted HTTPS link clicks through a narrowly validated handler. It exposes no filesystem or shell API to page code.

Electron 44.7.0 and electron-builder 26.17.0 are pinned. Keep them updated when preparing later releases.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Electron 44.7.0](https://releases.electronjs.org/release/v44.7.0), [electron-builder release](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder@26.17.0), [NSIS and portable packaging](https://www.electron.build/docs/nsis/).

