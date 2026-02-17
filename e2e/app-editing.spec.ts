import { expect, test } from '@playwright/test';

test('core editing controls update UI and code', async ({ page }) => {
  await page.goto('/');

  const code = page.locator('#live-svg-code');
  const closedBtn = page.getByRole('button', { name: 'Closed' });
  const viewBoxBtn = page.getByRole('button', { name: 'Show viewBox' });
  const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
  const zoomReadout = page.locator('.zoom-readout');

  await expect(code).toBeVisible();
  await expect(closedBtn).toBeVisible();

  const beforeCode = await code.inputValue();
  const beforePressed = (await closedBtn.getAttribute('aria-pressed')) ?? 'false';

  await closedBtn.click();

  const afterPressed = (await closedBtn.getAttribute('aria-pressed')) ?? 'false';
  expect(afterPressed).not.toBe(beforePressed);

  await expect
    .poll(async () => code.inputValue(), {
      message: 'live SVG text should update after toggling Closed',
    })
    .not.toBe(beforeCode);

  await expect(page.locator('.viewbox-overlay')).toHaveCount(0);
  await viewBoxBtn.click();
  await expect(page.locator('.viewbox-overlay')).toHaveCount(1);
  await viewBoxBtn.click();
  await expect(page.locator('.viewbox-overlay')).toHaveCount(0);

  await expect(zoomReadout).toHaveText('100%');
  await zoomInBtn.click();
  await expect(zoomReadout).not.toHaveText('100%');
});
