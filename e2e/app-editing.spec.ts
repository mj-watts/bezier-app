import { expect, test } from '@playwright/test';

test('clear leaves an empty document and supports undo and redo', async ({ page }) => {
  await page.goto('/');
  const code = page.locator('#live-svg-code');
  const original = await code.inputValue();
  expect(original).toMatch(/<path\b/);

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(code).not.toHaveValue(/<(path|rect|circle|ellipse|line|polyline|polygon)\b/);
  const empty = await code.inputValue();
  expect(empty).toContain('<svg');

  await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click();
  await expect(code).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)', exact: true }).click();
  await expect(code).toHaveValue(empty);
});

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


test('delete acts immediately and undo restores the selected path', async ({ page }) => {
  await page.goto('/');
  const code = page.locator('#live-svg-code');
  const original = await code.inputValue();
  const paths = page.getByRole('listbox', { name: 'Paths' }).locator('.paths-path-row');
  const count = await paths.count();
  await paths.first().click();
  await page.getByRole('button', { name: 'Delete Path', exact: true }).click();
  await expect(paths).toHaveCount(count - 1);
  await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click();
  await expect(paths).toHaveCount(count);
  await expect(code).toHaveValue(original);
});

test('select replaces the redundant transform button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Select Tool (V)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transform Tool (T)', exact: true })).toHaveCount(0);
});
