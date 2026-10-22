// Prints the updater manifest for the installer in release/ (Tauri updater format + the installer's SHA-256, which
// the app checks after the signature). Nothing is uploaded. The manifest goes to https://www.pwaraq.com/downloads-1.0/manifest.json
// (waraq-site-1.0's stage.cjs copies it); the installer goes to the GitHub release v<version> (Cloudflare Pages takes files < 25 MiB only).
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
      url: `https://github.com/tshi-dev/PWaraq/releases/download/v${version}/${path.basename(exe)}`,
      sha256: createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),
    },
  },
}, null, 2));
