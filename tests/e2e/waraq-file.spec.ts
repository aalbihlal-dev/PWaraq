import { test, expect, type Page } from '@playwright/test';
import { zip } from '../../src/lib/zip';

const enc = (s: string) => new TextEncoder().encode(s);
const m = (o: object) => ({ app: 'waraq-portfolio', version: 1, id: 'abc', name: 'x', created: 1, files: {}, sections: [], ...o });
const give = async (page: Page, name: string, bytes: Uint8Array) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
};

test('a damaged, foreign or hostile .waraq says "not a valid Waraq portfolio", never "not a PDF"', async ({ page }) => {
  for (const bytes of [enc('not a zip'), zip({ 'readme.txt': enc('hi') }), zip({ 'manifest.json': enc(JSON.stringify(m({ app: 'other' }))) }),
    zip({ 'manifest.json': enc(JSON.stringify(m({}))), '../evil': enc('x') })]) {
    await give(page, 'bad.waraq', bytes);
    await expect(page.getByRole('alert')).toHaveText('This is not a valid Waraq portfolio. The file may be damaged.');
  }
});

test('a portfolio made by a newer Waraq asks for an update; Arabic shows the Arabic message', async ({ page }) => {
  const newer = zip({ 'manifest.json': enc(JSON.stringify(m({ version: 2 }))) });
  await give(page, 'new.waraq', newer);
  await expect(page.getByRole('alert')).toHaveText('This portfolio was made with a newer Waraq. Update Waraq to open it.');
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await give(page, 'new.waraq', newer);
  await expect(page.getByRole('alert')).toContainText('بإصدار أحدث');
});

test('a good .waraq with an Arabic name still opens', async ({ page }) => {
  await give(page, 'الأسبوع.waraq', zip({ 'manifest.json': enc(JSON.stringify(m({ name: 'دورة', sections: [{ id: 's', title: 'مقدمة', fromFile: false, divider: true, note: '', pages: [] }] }))) }));
  await expect(page.locator('.sec')).toHaveCount(1);
});
