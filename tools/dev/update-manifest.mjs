// Prints the updater manifest for the installer in release/ (Tauri updater format + the installer's SHA-256, which
// the app checks after the signature). Nothing is uploaded: the owner puts the file at
// https://www.pwaraq.com/downloads-1.0/manifest.json together with the installer, after the release gate.
//   node tools/dev/update-manifest.mjs [notes] > manifest.json
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..'), dir = path.join(root, 'release');
const exe = fs.readdirSync(dir).filter((f) => f.endsWith('-setup.exe')).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!exe || !fs.existsSync(exe + '.sig')) throw new Error('release/ needs the installer and its .sig (build with TAURI_SIGNING_PRIVATE_KEY set)');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
console.log(JSON.stringify({
  version,
  notes: process.argv[2] ?? '',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: fs.readFileSync(exe + '.sig', 'utf8').trim(),
      url: `https://www.pwaraq.com/downloads-1.0/${path.basename(exe)}`,
      sha256: createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),
    },
  },
}, null, 2));
