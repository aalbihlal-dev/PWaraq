// End-to-end updater test with a local manifest server and two signed test builds (0.0.1 -> 0.0.2), in a separate
// test identity (com.waraq.test / WaraqTest) so the real install and its data are untouched. Windows only.
// Build the two installers first (each with TAURI_SIGNING_PRIVATE_KEY set), e.g.
//   tauri build --config {"productName":"WaraqTest","identifier":"com.waraq.test","version":"0.0.1",
//     "plugins":{"updater":{"endpoints":["http://127.0.0.1:8765/manifest.json"],"dangerousInsecureTransportProtocol":true}}}
// then:  node tools/dev/updater-test.mjs <dir with WaraqTest_0.0.1_x64-setup.exe, WaraqTest_0.0.2_x64-setup.exe + .sig> [shots dir]
// Steps: silent install 0.0.1 → the app finds 0.0.2, downloads it, shows "Restart to update" (screenshot) → click →
// installer runs passive and relaunches → 0.0.2 running, last-good = 0.0.2 → simulate a start that never reached the
// page (boot marker left, last-good 0.0.1) → next start rolls back to 0.0.1 silently and shows the note → 0.0.2 is
// not offered again → uninstall. Results go to release/TEST-REPORT.md.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dir, shotsArg] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '..', '..');
const shots = shotsArg ?? path.join(root, 'src-tauri', 'target', 'updater-test');
fs.mkdirSync(shots, { recursive: true });
const inst = path.join(process.env.LOCALAPPDATA, 'WaraqUpdTest'), exe = path.join(inst, 'waraq.exe');
const data = path.join(process.env.APPDATA, 'com.waraq.test'), updates = path.join(data, 'updates');
const webview = path.join(process.env.LOCALAPPDATA, 'com.waraq.test'); // WebView2 profile (localStorage: the once-a-day check stamp)
const setup = (v) => path.join(dir, `WaraqTest_${v}_x64-setup.exe`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (what, ok, note = '') => { results.push({ what, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${note}`); };
const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).stdout.trim();
const pids = () => ps(`Get-Process waraq -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${exe}' } | ForEach-Object Id`).split(/\s+/).filter(Boolean).map(Number);
const version = () => (ps(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WaraqTest' -ErrorAction SilentlyContinue).DisplayVersion`) || '');
const marker = (n) => { try { return fs.readFileSync(path.join(updates, n), 'utf8').trim(); } catch { return null; } };
const kill = () => { for (const p of pids()) spawnSync('taskkill', ['/PID', String(p), '/F', '/T'], { stdio: 'ignore' }); };
async function until(fn, ms = 60_000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(500); } return null; }

// CDP into the WebView2 (the app is started with --remote-debugging-port so the test can read and click the page)
async function cdp(port) {
  const target = await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { return null; } }, 30_000);
  if (!target) throw new Error('no CDP page');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0;
  const send = (method, params = {}) => new Promise((r) => { const my = ++id; const h = (e) => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); r(m.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id: my, method, params })); });
  const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
  const shot = async (name) => fs.writeFileSync(path.join(shots, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Runtime.enable'); await send('Page.bringToFront');
  return { ev, shot, close: () => ws.close() };
}
const start = (port) => spawn(exe, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: port ? `--remote-debugging-port=${port}` : '' }, stdio: 'ignore', detached: true }).unref();

// 0. clean slate
kill(); fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(webview, { recursive: true, force: true });
if (fs.existsSync(inst)) spawnSync(path.join(inst, 'uninstall.exe'), ['/S'], { stdio: 'ignore' });
await sleep(2000);

// 1. manifest + server
const bytes2 = fs.readFileSync(setup('0.0.2'));
const manifest = { version: '0.0.2', notes: 'Updater test', pub_date: new Date().toISOString(), platforms: { 'windows-x86_64': { signature: fs.readFileSync(setup('0.0.2') + '.sig', 'utf8').trim(), url: 'http://127.0.0.1:8765/WaraqTest_0.0.2_x64-setup.exe', sha256: createHash('sha256').update(bytes2).digest('hex') } } };
const served = [];
const server = http.createServer((req, res) => {
  served.push(req.url);
  if (req.url === '/manifest.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); }
  else if (req.url === '/WaraqTest_0.0.2_x64-setup.exe') { res.setHeader('content-length', bytes2.length); res.end(bytes2); }
  else { res.statusCode = 404; res.end(); }
}).listen(8765, '127.0.0.1');

try {
  // 2. install 0.0.1 silently and start it
  const r = spawnSync(setup('0.0.1'), ['/S', `/D=${inst}`], { stdio: 'ignore' });
  check('0.0.1 installed silently', r.status === 0 && version() === '0.0.1', `version ${version()}`);
  check('installer copy kept for rollback', fs.existsSync(path.join(updates, 'waraq-0.0.1.exe')));
  start(9351);
  const page = await cdp(9351);
  const ready = await until(() => page.ev(`!!document.querySelector('.updaterow .btn.primary')`), 90_000);
  check('update 0.0.2 found, downloaded, "Restart to update" shown', !!ready, `served ${served.join(' ')}`);
  check('last-good is 0.0.1 while 0.0.2 waits for the click', marker('last-good') === '0.0.1' && !marker('boot'), `last-good=${marker('last-good')}`);
  await page.shot('update-ready-real.png');
  const before = pids();
  await page.ev(`document.querySelector('.updaterow .btn.primary').click(); 1`);
  page.close();
  // 3. the installer runs (passive) and relaunches the app
  const gone = await until(() => !pids().some((p) => before.includes(p)));
  check('app exits for the installer', !!gone);
  const relaunched = await until(() => version() === '0.0.2' && pids().length === 1 ? pids()[0] : null, 120_000);
  check('0.0.2 installed and relaunched', !!relaunched, `version ${version()}, ${pids().length} process(es)`);
  const good2 = await until(() => marker('last-good') === '0.0.2' && !marker('boot'), 30_000);
  check('0.0.2 reached the page: last-good = 0.0.2, boot marker cleared', !!good2, `last-good=${marker('last-good')}`);
  check('0.0.2 installer kept, 0.0.1 installer kept for rollback', fs.existsSync(path.join(updates, 'waraq-0.0.2.exe')) && fs.existsSync(path.join(updates, 'waraq-0.0.1.exe')));
  if (relaunched) spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/dev/win-shot.ps1'), String(relaunched), path.join(shots, 'updated-0.0.2.png'), '#fafbf8', '-Start'], { stdio: 'ignore' });
  kill(); await sleep(1500);

  // 4. a start of 0.0.2 that never reached the page: boot marker left, last-good still 0.0.1
  fs.writeFileSync(path.join(updates, 'boot'), '0.0.2'); fs.writeFileSync(path.join(updates, 'last-good'), '0.0.1');
  start();
  const back = await until(() => version() === '0.0.1' && pids().length === 1 ? pids()[0] : null, 120_000);
  check('rolled back: 0.0.1 reinstalled silently and relaunched', !!back, `version ${version()}, ${pids().length} process(es)`);
  const good1 = await until(() => marker('last-good') === '0.0.1' && !marker('boot') && marker('rolled-back') === null, 30_000);
  check('0.0.1 is last-good again, rollback note consumed', !!good1, `last-good=${marker('last-good')} skip=${marker('skip')}`);
  check('0.0.2 marked as skipped', marker('skip') === '0.0.2');
  if (back) {
    const s = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/dev/win-shot.ps1'), String(back), path.join(shots, 'rolled-back-0.0.1.png'), '#fafbf8', '-Start'], { encoding: 'utf8' }); // start screen: the light paper colour
    check('rolled-back window captured, flat paper top edge, page drawn', s.stdout.trim().startsWith('OK'), s.stdout.trim());
  }
  kill(); await sleep(1500);

  // 5. the skipped version is not offered again (manual check)
  served.length = 0; start(9352);
  const page2 = await cdp(9352);
  await until(() => page2.ev(`!!document.querySelector('.updaterow .btn')`), 30_000);
  const rolledNote = await page2.ev(`document.querySelector('.updaterow [role=status]')?.textContent || ''`);
  await page2.ev(`[...document.querySelectorAll('.updaterow .btn')].find((b) => !b.classList.contains('primary'))?.click(); 1`);
  const latest = await until(() => page2.ev(`/latest version|أحدث إصدار/.test(document.querySelector('.updaterow')?.textContent || '')`), 30_000);
  check('skipped 0.0.2 is not offered again (manual check says latest)', !!latest, `served ${served.join(' ')} note="${rolledNote}"`);
  await page2.shot('update-skipped.png'); page2.close();
  kill(); await sleep(1000);
} finally {
  server.close();
  kill();
  spawnSync(path.join(inst, 'uninstall.exe'), ['/S'], { stdio: 'ignore' }); await sleep(3000);
  check('uninstalled, test data removed', !fs.existsSync(exe) && !fs.existsSync(updates));
  for (const d of [data, webview, inst]) fs.rmSync(d, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  const md = ['', `## Updater test — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — 0.0.1 → 0.0.2, local manifest server, identity com.waraq.test`, '', `${results.length} checks, ${failed} failed.`, '', '| Check | Result | Note |', '|---|---|---|', ...results.map((r) => `| ${r.what} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.note.replace(/\|/g, '/')} |`)];
  fs.appendFileSync(path.join(root, 'release', 'TEST-REPORT.md'), md.join('\n') + '\n');
  console.log(`${results.length} checks, ${failed} failed -> release/TEST-REPORT.md, screenshots in ${shots}`);
  process.exit(failed ? 1 : 0);
}
