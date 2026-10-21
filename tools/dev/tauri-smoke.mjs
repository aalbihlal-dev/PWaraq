// Desktop smoke test: builds the Tauri app in debug (unless --no-build), starts it with tests/fixtures/three.pdf on the
// command line in each theme (and once in Arabic), screenshots the window, and checks with win-shot.ps1 that the top
// edge is one flat colour merging with the task bar (no title bar, no line) and that the page is drawn.
//   node tools/dev/tauri-smoke.mjs [--no-build] [out dir]        (needs Rust; Windows only)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2), out = args.find((a) => !a.startsWith('--')) ?? path.join(root, 'test-results', 'tauri');
fs.mkdirSync(out, { recursive: true });
if (!args.includes('--no-build')) {
  const r = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
const exe = path.join(root, 'src-tauri', 'target', 'debug', 'waraq.exe');
const tokens = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
// the task bar colour (--surface) of a theme: the title bar merges with it once a document is open
const surface = (theme) => tokens.match(theme === 'light' ? /:root \{[\s\S]*?--surface: (#\w+)/ : new RegExp(`data-theme='${theme}'\\] \\{[\\s\\S]*?--surface: (#\\w+)`))[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
for (const [theme, lang] of [['light', 'en'], ['dim', 'en'], ['dark', 'en'], ['graphite', 'en'], ['light', 'ar']]) {
  const p = spawn(exe, [path.join(root, 'tests/fixtures/three.pdf')], { env: { ...process.env, WARAQ_UI: `${theme},${lang}` }, stdio: 'ignore' });
  await sleep(Number(process.env.SETTLE || 7000));
  const png = path.join(out, `${theme}-${lang}.png`);
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(import.meta.dirname, 'win-shot.ps1'), String(p.pid), png, surface(theme)], { encoding: 'utf8' });
  spawnSync('taskkill', ['/PID', String(p.pid), '/F', '/T'], { stdio: 'ignore' });
  console.log(`${theme} ${lang}: ${r.stdout.trim()} ${r.stderr.trim()}`);
  if (!/^OK/m.test(r.stdout)) failed++;
}
console.log(failed ? `${failed} failed` : 'all passed', '->', out);
process.exit(failed ? 1 : 0);
