import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, choose, fixture } from './helpers';

// Recovery plan A: the engine crashes or hangs, unsaved work survives an unclean exit, a save is checked before it replaces
// anything, damaged PDFs open with what could be read, a portfolio keeps earlier versions.
const three = () => new Uint8Array(fs.readFileSync(fixture('three.pdf')));
const give = (page: Page, name: string, bytes: Uint8Array) => page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
/** Deletes the first page in Organize and goes back to View: the document is changed and not saved. */
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Organize' }).click();
  await expect(page.locator('.cell')).toHaveCount(3);
  await page.locator('.cell').first().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.cell')).toHaveCount(2);
  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.page')).toHaveCount(2);
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
}
const drafts = (page: Page) => page.evaluate(async () => {
  try { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('vault')).getDirectoryHandle('drafts'); const n: string[] = []; for await (const [name] of (d as any).entries()) n.push(name); return n.sort(); } catch { return []; }
});

test('the engine dies in the middle of a job: it is restarted, the job is repeated, the document is still there', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, fixture('three.pdf'));
  const done = page.evaluate(async () => { // a 2.5 s job is in the engine when its worker dies
    const p = (window as any).waraqPool, job = p.run({ op: 'wait', page: 0, priority: 0, args: { ms: 2500 } });
    setTimeout(() => p.workers[0].dispatchEvent(new ErrorEvent('error', { message: 'worker died' })), 500);
    return job;
  });
  await expect(page.getByRole('status')).toHaveText('Waraq recovered — nothing was lost.', { timeout: 10_000 });
  expect(await done).toBe(true); // repeated on the new worker
  // a job that kills every worker it reaches is reported, not repeated for ever; the engine works afterwards
  const outcome = await page.evaluate(async () => { const p = (window as any).waraqPool; return p.run({ op: 'crash', page: 0, priority: 0, args: {} }).then(() => 'done', (e: Error) => e.message); });
  expect(outcome).toBe('CRASHED');
  const width = await page.evaluate(async () => (await (window as any).waraqPool.run({ op: 'render', page: 1, priority: 0, args: { scale: 0.5 } })).width);
  expect(width).toBeGreaterThan(100); // the document is still open in the new workers
  await page.getByRole('button', { name: 'Organize' }).click();
  await expect(page.locator('.cell')).toHaveCount(3);
});

test('a job that hangs gets a Cancel button; cancelling replaces the engine and keeps the document', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, fixture('three.pdf'));
  const job = page.evaluate(async () => { const p = (window as any).waraqPool; p.slowMs = 1000; return p.run({ op: 'wait', page: 0, priority: 0, args: { ms: 60_000 } }).then(() => 'done', (e: Error) => e.message); });
  await expect(page.getByRole('status')).toContainText('Still working', { timeout: 15_000 });
  await page.getByRole('status').getByRole('button', { name: 'Cancel' }).click();
  expect(await job).toBe('cancelled');
  await expect(page.getByRole('status')).toHaveCount(0);
  const width = await page.evaluate(async () => (await (window as any).waraqPool.run({ op: 'render', page: 0, priority: 0, args: { scale: 0.5 } })).width);
  expect(width).toBeGreaterThan(100);
});

test('unsaved work is kept as a draft and offered after an unclean exit; Save removes the draft', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page, fixture('three.pdf'));
  await edit(page);
  await expect.poll(() => drafts(page)).toHaveLength(2); // <id>.json + <id>.pdf
  // a normal reload is a clean exit: nothing is offered
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open a PDF' })).toBeVisible();
  await expect(page.getByText('Restore your unsaved work')).toHaveCount(0);
  // another run that never said goodbye (its lock is gone): the start screen offers the draft
  await page.evaluate(() => localStorage.setItem('waraq-sessions', JSON.stringify(['crashed-run'])));
  await page.reload();
  await expect(page.getByText(/^Restore your unsaved work from /)).toBeVisible();
  await page.screenshot({ path: info.outputPath('restore-en.png') });
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('.page')).toHaveCount(2); // with the page deleted
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  // saving removes the draft
  await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  await expect.poll(() => drafts(page)).toHaveLength(0);
});

test('the Arabic start screen offers the draft too', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'تنظيم' }).click();
  await page.locator('.cell').first().click();
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'عرض' }).click();
  await expect.poll(() => drafts(page)).toHaveLength(2);
  await page.evaluate(() => localStorage.setItem('waraq-sessions', JSON.stringify(['crashed-run'])));
  await page.reload();
  await expect(page.getByText(/^استعد عملك غير المحفوظ من /)).toBeVisible();
  await page.screenshot({ path: info.outputPath('restore-ar.png') });
});

test('draft rotation: 5 kept, none older than 30 days', async ({ page }) => {
  test.skip(!!process.env.PREVIEW, 'imports the source module');
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const d = await import('/src/lib/drafts.ts'), bytes = new Uint8Array([1, 2, 3]);
    for (let i = 0; i < 7; i++) { await d.saveDraft('d' + i, 'n' + i, bytes, 1); await new Promise((ok) => setTimeout(ok, 15)); }
    const kept = (await d.listDrafts()).map((x: any) => x.id);
    await d.prune(Date.now() + 31 * 86_400_000);
    return { kept, after: (await d.listDrafts()).length };
  });
  expect(r.kept).toEqual(['d6', 'd5', 'd4', 'd3', 'd2']);
  expect(r.after).toBe(0);
});

test('Undo close: the closed document comes back with its changes', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, fixture('three.pdf'));
  await edit(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Undo close: three.pdf' }).click();
  await expect(page.locator('.page')).toHaveCount(2);
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
});

test('a damaged PDF: "Open what could be read" shows the pages MuPDF recovered; garbage gets plain messages', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const bytes = three(), cut = bytes.slice(0, bytes.length - 120); // the end of the file (xref, trailer) is gone
  await give(page, 'broken.pdf', cut);
  await expect(page.getByRole('alert')).toContainText('“broken.pdf” is damaged. Waraq could read 3 pages of it.', { timeout: 30_000 });
  await page.screenshot({ path: info.outputPath('damaged-en.png') });
  await page.getByRole('button', { name: 'Open what could be read' }).click();
  await expect(page.locator('.page')).toHaveCount(3);
  await expect(page.locator('.name')).toHaveText('broken (repaired).pdf');
  await page.getByRole('button', { name: 'Close' }).click();
  await give(page, 'nothing.pdf', new TextEncoder().encode('%PDF-1.4\nthis was cut off'));
  await expect(page.getByRole('alert')).toHaveText('This PDF is incomplete or damaged, and nothing could be read from it.');
  await give(page, 'note.pdf', new TextEncoder().encode('just a text note'));
  await expect(page.getByRole('alert')).toHaveText('This file could not be opened as a PDF.');
});

// the desktop app: Save goes through save_temp -> read back -> check -> save_commit (the Rust side is tested with cargo test)
const desktopStub = () => {
  const calls: string[] = [], files: Record<string, Uint8Array> = {}; (window as any).tauriCalls = calls; (window as any).tauriFiles = files;
  const win = { isMaximized: async () => false, onResized: () => {}, minimize() {}, toggleMaximize() {}, close() {} };
  (window as any).__TAURI__ = {
    core: { invoke: async (cmd: string, args: any, opts: any) => {
      calls.push(cmd);
      if (cmd === 'save_temp') { const path = decodeURIComponent(opts.headers.path); files[path + '.waraq-tmp'] = (window as any).tauriCorrupt ? args.slice(0, 40) : args; return path + '.waraq-tmp'; }
      if (cmd === 'read_file') return files[args.path].buffer;
      if (cmd === 'save_commit') { files[args.path] = files[args.tmp]; delete files[args.tmp]; return; }
      if (cmd === 'save_discard') { delete files[args.tmp]; return; }
      return cmd === 'vault_list' || cmd === 'launch_paths' ? [] : undefined;
    } },
    event: { listen: async () => () => {} }, dialog: { save: async () => 'C:\\docs\\out.pdf' }, window: { getCurrentWindow: () => win },
  };
};
test('desktop save: the new file is read back and checked before it replaces anything', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(desktopStub);
  await open(page, fixture('three.pdf'));
  await edit(page);
  await page.evaluate(() => ((window as any).tauriCorrupt = true)); // the disk gives back a half-written file
  const alerted = new Promise<string>((ok) => page.once('dialog', (d) => { ok(d.message()); d.dismiss(); }));
  await page.getByRole('button', { name: 'Save' }).first().click();
  expect(await alerted).toContain('Nothing was overwritten');
  expect(await page.evaluate(() => (window as any).tauriCalls.filter((c: string) => c.startsWith('save_')))).toEqual(['save_temp', 'save_discard']);
  expect(await page.evaluate(() => Object.keys((window as any).tauriFiles))).toEqual([]); // no file written, no temp file left
  await expect(page.getByText('Changed — not saved yet')).toBeVisible(); // still unsaved, still open
  await page.evaluate(() => { (window as any).tauriCorrupt = false; (window as any).tauriCalls.length = 0; });
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Changed — not saved yet')).toBeHidden();
  expect(await page.evaluate(() => (window as any).tauriCalls.filter((c: string) => c.startsWith('save_')))).toEqual(['save_temp', 'save_commit']);
  const out = await page.evaluate(() => Array.from((window as any).tauriFiles['C:\\docs\\out.pdf'] as Uint8Array));
  expect(m.Document.openDocument(new Uint8Array(out), 'application/pdf').countPages()).toBe(2);
});

test('portfolio: earlier versions are kept and "Restore previous version" brings one back (Undo undoes it)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await expect.poll(() => page.evaluate(async () => { try { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('vault')).getDirectoryHandle('portfolio-versions'); for await (const _ of (d as any).entries()) return 1; } catch {} return 0; })).toBe(1);
  await page.getByRole('button', { name: 'Restore previous version' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(1, { timeout: 10_000 }); // the state it was opened in: empty
  await page.getByRole('button', { name: 'Restore previous version' }).click(); // closes the menu
  await choose(page, () => page.locator('.empty').click(), [fixture('three.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore previous version' }).click();
  await page.getByRole('menuitem').first().click();
  await expect(page.locator('.sec')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.sec')).toHaveCount(1);
});
