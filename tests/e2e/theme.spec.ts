import { test, expect } from '@playwright/test';

test('the theme button cycles Light, Dim, Dark and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
  await page.getByRole('button', { name: /^Theme: Light/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dim');
  await page.getByRole('button', { name: /^Theme: Dim/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /^Theme: Dark/ })).toBeVisible();
});
