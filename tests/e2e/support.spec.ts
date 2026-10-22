import { test, expect, type Page } from '@playwright/test';
import { open, fixture } from './helpers';

// "Report a problem": a quiet item in the ⋯ menu of the top row and on the start screen; it opens the website's support
// page in a new tab with the version, system and language in the fragment.
const URL_RE = (lang: string) => new RegExp(`^https://www\.pwaraq\.com/support#v=[^&]+&os=[^&]+&lang=${lang}$`);
async function opens(page: Page, click: () => Promise<void>) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), click()]);
  const url = popup.url() || (await popup.waitForURL(/./).then(() => popup.url()));
  await popup.close();
  return url;
}

for (const [lang, label, menu] of [['en', 'Report a problem', 'Help and more'], ['ar', 'الإبلاغ عن مشكلة', 'المساعدة والمزيد']] as const) {
  test(`${lang}: Report a problem on the start screen and in the top row opens the support page with version, system and language`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
    await page.route('https://www.pwaraq.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>support</title>' }));
    await page.goto('/');
    expect(await opens(page, () => page.getByRole('button', { name: label }).click())).toMatch(URL_RE(lang));
    await open(page, fixture('small.pdf'));
    await page.getByRole('button', { name: menu }).click();
    expect(await opens(page, () => page.getByRole('menuitem', { name: label }).click())).toMatch(URL_RE(lang));
    await expect(page.getByRole('menuitem', { name: label })).toBeHidden();
  });
}
