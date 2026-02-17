import { expect, test } from '@playwright/test';

test('app loads and about modal opens/closes', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Live SVG' })).toBeVisible();

  const brand = page.getByRole('button', { name: 'About Bz' });
  await expect(brand).toBeVisible();
  await brand.click();

  await expect(page.getByRole('heading', { name: 'Credits' })).toBeVisible();
  await page.locator('.about-modal').click();
  await expect(page.getByRole('heading', { name: 'Credits' })).toHaveCount(0);
});
