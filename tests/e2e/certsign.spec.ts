import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, choose, fixture } from './helpers';
import { listSignatures } from '../../src/lib/engine/signcert';
import { covered, verifyCms } from '../../src/lib/engine/pades';

async function drawSignature(page: Page) {
  await page.locator('.pad').scrollIntoViewIfNeeded(); // the signatures panel above may push the pad out of view
  const b = (await page.locator('.pad').boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 60); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(b.x + 20 + i * 10, b.y + 50 + 25 * Math.sin(i / 2));
  await page.mouse.up();
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waraq-certsign-'));

test('create a digital ID, sign with it, reopen: one valid signature; a later change is seen', async ({ page }, info) => {
  test.setTimeout(150_000);
  await open(page, fixture('sign-en.pdf'));
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.need')).toHaveCount(2);
  await drawSignature(page);
  await page.getByRole('button', { name: 'Save signature' }).click();
  await expect(page.locator('.sigbtn img')).toHaveCount(1);

  // the digital ID, made on this device and locked with a passphrase
  await page.getByLabel('Also sign with my digital ID').check();
  await expect(page.getByText('No digital ID yet')).toBeVisible();
  await page.getByRole('button', { name: 'New ID' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('Abdullah Test');
  await page.getByLabel('Email (optional)').fill('abdullah@example.com');
  await page.getByLabel('Passphrase', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Repeat the passphrase').fill('correct horse battery');
  await page.screenshot({ path: info.outputPath('certsign-1-create-id-en.png') });
  await page.getByRole('button', { name: 'Create ID' }).click();
  await expect(page.locator('.idbtn')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.idbtn')).toContainText('Abdullah Test');
  await expect(page.locator('.idbtn')).toContainText('self-signed');
  await page.getByLabel('Reason (optional)').fill('Approved');

  // the two places: the label on page 1 (the visible stamp) and the empty field on page 2 (drawn, then covered)
  await page.locator('.where').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.need')).toHaveCount(0);
  await page.getByLabel('Passphrase', { exact: true }).first().fill('correct horse battery');
  const files: Record<string, Uint8Array> = {};
  page.on('download', async (d) => { files[d.suggestedFilename()] = new Uint8Array(fs.readFileSync((await d.path())!)); });
  await page.getByRole('button', { name: 'Save all signed' }).click();
  await expect.poll(() => Object.keys(files)).toEqual(['sign-en-signed.pdf']);
  const signed = files['sign-en-signed.pdf'];

  // verified in Node with the same code: one signature, sound, over the whole file, in a field on page 1
  const list = listSignatures(m, signed);
  expect(list.length).toBe(1);
  expect(list[0].name).toBe('Abdullah Test'); expect(list[0].reason).toBe('Approved'); expect(list[0].page).toBe(0);
  const c = covered(signed, list[0].byteRange), check = await verifyCms(list[0].contents, c.ranges);
  expect(c.whole).toBe(true); expect(check.ok).toBe(true); expect(check.cert!.selfSigned).toBe(true); expect(check.cert!.email).toBe('abdullah@example.com');
  expect(signed.subarray(0, fs.statSync(fixture('sign-en.pdf')).size).length).toBeGreaterThan(0);

  // the open document is the signed one (shown in View): back in Sign, badge and panel say so
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText(/1 signature · Valid/, { timeout: 20_000 });
  await expect(page.locator('.sigitem')).toContainText('The file is exactly as it was when signed.');
  await expect(page.locator('.sigitem')).toContainText('not in a trusted list');
  await page.getByRole('button', { name: 'Previous page' }).click(); // page 1: the visible stamp of the certificate signature
  await expect(page.locator('.num.muted').first()).toContainText('Page 1 of 2');
  await page.screenshot({ path: info.outputPath('certsign-2-verified-en.png') });

  // reopened from disk: the same verdict
  const file = path.join(tmp, 'sign-en-signed.pdf');
  fs.writeFileSync(file, signed);
  await open(page, file);
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText(/1 signature · Valid/, { timeout: 20_000 });
  await expect(page.locator('.need')).toHaveText(['Signature needed on page 2Go']); // the label on page 1 sits under the signed field; the empty field on page 2 was only drawn over

  // something added after the signature (another increment): valid for an earlier version, the file changed
  const doc = new m.PDFDocument(signed); doc.getTrailer().get('Root').put('Lang', doc.newString('ar'));
  const later = path.join(tmp, 'sign-en-changed.pdf');
  fs.writeFileSync(later, doc.saveToBuffer('incremental').asUint8Array());
  await open(page, later);
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText(/1 signature · Changed after signing/, { timeout: 20_000 });
  await expect(page.locator('.sigitem')).toContainText('Valid for an earlier version');
  await page.screenshot({ path: info.outputPath('certsign-3-changed-en.png') });

  // a byte changed inside the signed part: invalid
  const broken = signed.slice(); broken[300] ^= 1;
  const brokenFile = path.join(tmp, 'sign-en-broken.pdf');
  fs.writeFileSync(brokenFile, broken);
  await open(page, brokenFile);
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText(/1 signature · Invalid/, { timeout: 20_000 });
  await expect(page.locator('.sigitem.bad')).toContainText('no longer matches');

  // placing a drawn set on a signed file warns (a bar, not a pop-up)
  await page.getByLabel('Also sign with my digital ID').uncheck();
  await page.locator('.where').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.note.warn')).toContainText('invalidates its certificate signatures');
});

test('Arabic: the signatures panel on a changed file, and a wrong passphrase is refused', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  const later = path.join(tmp, 'sign-en-changed.pdf');
  test.skip(!fs.existsSync(later), 'needs the file the first test saved');
  await open(page, later);
  await page.getByRole('button', { name: 'توقيع', exact: true }).click();
  await expect(page.locator('.badge')).toHaveText(/1 توقيع · عُدِّل بعد التوقيع/, { timeout: 20_000 });
  await expect(page.locator('.sigitem')).toContainText('صالح لنسخة سابقة');
  await page.screenshot({ path: info.outputPath('certsign-4-changed-ar.png') });
  await drawSignature(page);
  await page.getByRole('button', { name: 'حفظ التوقيع' }).click();
  await expect(page.locator('.sigbtn img')).toHaveCount(1);

  // a fresh browser profile: a P-256 ID is made here, then a wrong passphrase is refused when signing
  await page.getByLabel('وقِّع أيضًا بهويتي الرقمية').check();
  await page.getByRole('button', { name: 'هوية جديدة' }).click();
  await page.getByRole('textbox', { name: 'الاسم كاملًا' }).fill('عبدالله');
  await page.getByRole('radio', { name: 'ECDSA P-256' }).click();
  await page.getByLabel('عبارة المرور', { exact: true }).fill('correct horse battery');
  await page.getByLabel('أعد عبارة المرور').fill('correct horse battery');
  await page.getByRole('button', { name: 'إنشاء الهوية' }).click();
  await expect(page.locator('.idbtn')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.idbtn')).toContainText('موقَّعة ذاتيًا');
  await page.locator('.sheet').click({ position: { x: 200, y: 200 } });
  await page.getByLabel('عبارة المرور', { exact: true }).first().fill('wrong one');
  page.once('dialog', (d) => { expect(d.message()).toBe('عبارة المرور غير صحيحة.'); d.dismiss(); });
  await page.getByRole('button', { name: 'حفظ كل الملفات الموقّعة' }).click();
  await expect(page.locator('.busy')).toHaveCount(0);
});
