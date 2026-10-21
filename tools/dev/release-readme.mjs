// After `tauri build`: copies the NSIS installer (and its updater signature, if any) to release/ and records its
// version, size and SHA-256 in release/README.txt. Nothing is uploaded; the owner decides what goes live.
//   node tools/dev/release-readme.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const nsis = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const exe = fs.readdirSync(nsis).filter((f) => f.endsWith('.exe')).map((f) => path.join(nsis, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!exe) throw new Error('no installer in ' + nsis);
const out = path.join(root, 'release');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(exe, path.join(out, path.basename(exe)));
if (fs.existsSync(exe + '.sig')) fs.copyFileSync(exe + '.sig', path.join(out, path.basename(exe) + '.sig'));
const bytes = fs.readFileSync(exe), sha = createHash('sha256').update(bytes).digest('hex');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const lines = [
  `Waraq ${version} — Windows installer (NSIS, per-user, no administrator rights)`,
  `File:    ${path.basename(exe)}`,
  `Size:    ${bytes.length} bytes (${(bytes.length / 1048576).toFixed(1)} MB)`,
  `SHA-256: ${sha}`,
  `Built:   ${new Date().toISOString()}`,
  '',
  'Silent install:   Waraq_x_y_z_x64-setup.exe /S            (optional: /D=C:\\path, last argument, no quotes)',
  'Silent uninstall: "%LOCALAPPDATA%\\Waraq\\uninstall.exe" /S',
  'The installer offers "Open with Waraq" for .pdf (never takes over the default), owns .waraq, and adds a right-click',
  '"Open in Waraq" entry for both; all per-user registry keys are removed on uninstall (src-tauri/installer/hooks.nsh).',
  'Not code-signed (owner declined a certificate, 2026-10): SmartScreen shows "unknown publisher" on first run.',
  'Updater: the .exe.sig beside the installer is its minisign signature; `node tools/dev/update-manifest.mjs` prints the',
  'manifest for https://www.pwaraq.com/downloads-1.0/manifest.json (upload installer + manifest only after the release gate).',
  'Microsoft Store: `packaging/msix/build.ps1` makes release/Waraq_<v>.msix (identity placeholders: see packaging/msix/README.md).',
  '',
];
fs.writeFileSync(path.join(out, 'README.txt'), lines.join('\n'));
console.log(lines.slice(0, 5).join('\n'));
