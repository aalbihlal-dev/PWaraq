// What Edge's PDF viewer puts in the tab for a PDF with and without a document title (CDP target titles). usage: node tools/arabic/edge-title.mjs <name>...
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { createRequire } from 'node:module';
import { ROOT, OUT } from './lib.mjs';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
const srv = http.createServer((q, r) => { const f = path.join(OUT, decodeURIComponent(q.url.slice(1))); if (!fs.existsSync(f) || q.url.includes('favicon')) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', 'application/pdf'); r.end(fs.readFileSync(f)); }).listen(0);
const b = await chromium.launch({ channel: 'msedge', headless: false });
for (const f of process.argv.slice(2)) {
  const v = await b.newPage(); await v.goto(`http://127.0.0.1:${srv.address().port}/${f}.pdf`); await v.waitForTimeout(7000);
  const cdp = await v.context().newCDPSession(v), t = await cdp.send('Target.getTargets');
  console.log(f.padEnd(12), JSON.stringify([...new Set(t.targetInfos.filter((x) => x.url.includes(f + '.pdf') && !x.url.startsWith('chrome-extension')).map((x) => x.title))]));
  await v.close();
}
await b.close(); srv.close();
