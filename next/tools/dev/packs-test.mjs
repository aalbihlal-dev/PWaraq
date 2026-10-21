// End-to-end add-on test in the real desktop build: starts waraq.exe with a .docx on the command line, expects the
// "Download the Office & CAD add-on" prompt (screenshot), clicks Download (the real 137 MB pack from pwaraq.com —
// network needed), waits for the download, the unpacking and the conversion, and checks that the converted document
// is open (screenshot). Then converts the other fixtures through the same window and records the timings.
//   node tools/dev/packs-test.mjs [waraq.exe] [shots dir]   (default: src-tauri/target/release/waraq.exe)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const exe = process.argv[2] ?? path.join(root, 'src-tauri', 'target', 'release', 'waraq.exe');
const shots = process.argv[3] ?? path.join(root, 'src-tauri', 'target', 'packs-test');
fs.mkdirSync(shots, { recursive: true });
const fixtures = path.join(root, 'tests', 'fixtures', 'office');
const pack = path.join(process.env.APPDATA, 'com.waraq.app', 'engines', 'office');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (what, ok, note = '') => { results.push({ what, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${note}`); };
async function until(fn, ms = 60_000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(500); } return null; }

spawnSync('taskkill', ['/IM', 'waraq.exe', '/F'], { stdio: 'ignore' });
if (fs.existsSync(pack)) { console.log('pack already installed: removing it so the prompt shows'); fs.rmSync(pack, { recursive: true, force: true }); }
const proc = spawn(exe, [path.join(fixtures, 'arabic.docx')], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9353' }, stdio: 'ignore' });
const target = await until(async () => { try { return (await (await fetch('http://127.0.0.1:9353/json')).json()).find((t) => t.type === 'page'); } catch { return null; } }, 30_000);
if (!target) throw new Error('no CDP page');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0;
const send = (method, params = {}) => new Promise((r) => { const my = ++id; const h = (e) => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); r(m.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id: my, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const shot = async (name) => fs.writeFileSync(path.join(shots, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
await send('Runtime.enable'); await send('Page.bringToFront');

try {
  const prompt = await until(() => ev(`!!document.querySelector('dialog[open] #pack-h')`), 30_000);
  check('first .docx asks for the add-on', !!prompt, await ev(`document.querySelector('#pack-h')?.textContent || ''`));
  await shot('pack-prompt-real.png');
  const t0 = Date.now();
  await ev(`[...document.querySelectorAll('dialog[open] .btn.primary')][0].click(); 1`);
  const progress = await until(() => ev(`!!document.querySelector('dialog[open] progress')`), 15_000);
  check('download starts after the click, with progress', !!progress);
  await sleep(3000); await shot('pack-downloading-real.png');
  const open = await until(() => ev(`!!document.querySelector('.page canvas')`), 600_000);
  check('pack downloaded, unpacked, .docx converted and opened', !!open, `${Math.round((Date.now() - t0) / 1000)} s including the download`);
  check('pack folder holds LibreOffice and LibreDWG', fs.existsSync(path.join(pack, 'libreoffice/program/soffice.exe')) && fs.existsSync(path.join(pack, 'libredwg/dwg2dxf.exe')));
  check('no pack temp files left', !fs.existsSync(pack + '.tar.zst') && !fs.existsSync(pack + '.partial'));
  await sleep(2000); await shot('converted-docx-open.png');
  const pages = await ev(`document.querySelectorAll('.page').length`);
  check('converted document has pages', pages > 0, `${pages} page(s)`);
  // the other fixtures through the running window (the picker is a hidden input: hand it the bytes via a DataTransfer)
  for (const f of ['table.xlsx', 'slide.pptx', 'plan.dxf', 'plan.dwg']) {
    const b64 = fs.readFileSync(path.join(fixtures, f)).toString('base64');
    const t = Date.now();
    await ev(`window.__prev = document.querySelector('.page'); 1`); // the new document replaces the page elements
    await ev(`(() => { const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], '${f}')); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const ok = await until(() => ev(`(document.querySelector('.name')?.title || '').startsWith('${f.replace(/\.\w+$/, '')}') && !!document.querySelector('.page canvas') && document.querySelector('.page') !== window.__prev`), 120_000);
    const n = await ev(`document.querySelectorAll('.page').length`);
    check(`${f} converted and opened`, !!ok && n > 0, `${Date.now() - t} ms, ${n} page(s)`);
  }
  await shot('converted-dwg-open.png');
  const left = fs.readdirSync(process.env.TEMP).filter((n) => n.startsWith('waraq-convert-'));
  check('no conversion temp folders left', left.length === 0, left.join(' '));
} finally {
  ws.close();
  spawnSync('taskkill', ['/PID', String(proc.pid), '/F', '/T'], { stdio: 'ignore' });
  const failed = results.filter((r) => !r.ok).length;
  const md = ['', `## Add-on pack test — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — real pack from pwaraq.com, ${path.basename(path.dirname(exe))}\\${path.basename(exe)}`, '', `${results.length} checks, ${failed} failed.`, '', '| Check | Result | Note |', '|---|---|---|', ...results.map((r) => `| ${r.what} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.note.replace(/\|/g, '/')} |`)];
  fs.appendFileSync(path.join(root, 'release', 'TEST-REPORT.md'), md.join('\n') + '\n');
  console.log(`${results.length} checks, ${failed} failed -> release/TEST-REPORT.md, screenshots in ${shots}`);
  process.exit(failed ? 1 : 0);
}
