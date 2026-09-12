import { expect, test, type Page } from '@playwright/test';

const square = '<svg viewBox="0 0 100 100"><path d="M20 20 L80 20 L80 80 L20 80 Z" fill="none" stroke="white"/></svg>';
async function importSvg(page: Page, svg = square) {
  await page.goto('/');
  await page.locator('#live-svg-code').fill(svg);
  await page.locator('#live-svg-code').blur();
  await expect(page.locator('.paths-path-row')).toHaveCount(svg.includes('<g') ? 2 : 1);
}
async function anchor(page: Page, index: number) {
  const box = await page.locator('.editor .anchor').nth(index).boundingBox();
  if (!box) throw new Error('Anchor missing');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('cross moon and star presets are available', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Cross', 'Moon', 'Star']) {
    await page.getByRole('button', { name: 'Add Preset Shape', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(page.locator('.paths-path-row')).toHaveCount(3);
});

test('smooth popover contains simplify controls and a filled slider', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Smooth Path', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Smooth and simplify' });
  await expect(popup).toBeVisible();
  await expect(page.locator('.controls-row').getByRole('slider')).toHaveCount(0);
  const slider = popup.getByRole('slider', { name: 'Simplify threshold', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('11');
  await expect(popup.getByRole('button', { name: 'Simplify Path', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Smooth Path', exact: true })).toBeVisible();
});

test('double clicking a grouped shape selects only that shape', async ({ page }) => {
  await importSvg(page, '<svg viewBox="0 0 100 100"><g id="pair"><rect x="10" y="10" width="30" height="30"/><rect x="60" y="60" width="30" height="30"/></g></svg>');
  await page.locator('.editor').focus();
  await page.keyboard.press('ControlOrMeta+a');
  const shape = page.locator('.editor > path').first();
  const b = await shape.boundingBox();
  if (!b) throw new Error('Shape missing');
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.paths-path-row.active')).toHaveCount(1);
});

test('viewBox moves and resizes without changing artwork and supports undo', async ({ page }) => {
  await importSvg(page);
  await page.getByRole('button', { name: 'Show viewBox', exact: true }).click();
  const before = await page.locator('#live-svg-code').inputValue();
  const artwork = await page.locator('.editor > path').first().getAttribute('d');
  const frame = page.locator('.viewbox-overlay');
  const b = await frame.boundingBox();
  if (!b) throw new Error('ViewBox missing');
  await page.mouse.move(b.x + b.width / 2, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + 20);
  await page.mouse.up();
  await expect(page.locator('#live-svg-code')).not.toHaveValue(before);
  await expect(page.locator('.editor > path').first()).toHaveAttribute('d', artwork!);
  const moved = await page.locator('#live-svg-code').inputValue();
  const handle = page.locator('[data-viewbox-handle="se"]');
  const h = await handle.boundingBox();
  if (!h) throw new Error('Resize handle missing');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2 + 30);
  await page.mouse.up();
  await expect(page.locator('#live-svg-code')).not.toHaveValue(moved);
  await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click();
  await expect(page.locator('#live-svg-code')).toHaveValue(moved);
  await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click();
  await expect(page.locator('#live-svg-code')).toHaveValue(before);
});

test('pen moves points, shows handles, deletes with Alt and inserts on the line', async ({ page }) => {
  await importSvg(page);
  await page.getByRole('button', { name: 'Pen Tool (P)', exact: true }).click();
  const p = await anchor(page, 0);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('.editor')).toHaveCSS('cursor', 'move');
  await page.mouse.down();
  await page.mouse.move(p.x + 25, p.y + 15);
  await page.mouse.up();
  await expect(page.locator('.editor .anchor')).toHaveCount(4);
  await expect(page.locator('.editor .handle')).toHaveCount(2);
  const moved = await anchor(page, 0);
  expect(moved.x).toBeCloseTo(p.x + 25, 0);
  await page.keyboard.down('Alt');
  await expect(page.locator('.editor')).not.toHaveCSS('cursor', 'move');
  await page.mouse.click(moved.x, moved.y);
  await page.keyboard.up('Alt');
  await expect(page.locator('.editor .anchor')).toHaveCount(3);
  const a = await anchor(page, 0);
  const b = await anchor(page, 1);
  const position = { x: a.x * 0.7 + b.x * 0.3, y: a.y * 0.7 + b.y * 0.3 };
  await page.mouse.move(position.x, position.y);
  const marker = await page.locator('.pen-add').boundingBox();
  expect(marker).not.toBeNull();
  expect(marker!.x + marker!.width / 2).toBeCloseTo(position.x, 0);
  expect(marker!.y + marker!.height / 2).toBeCloseTo(position.y, 0);
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('.editor .anchor')).toHaveCount(4);
});

test('pen draws a new closed shape on an empty canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Pen Tool (P)', exact: true }).click();
  const canvas = await page.locator('.editor').boundingBox();
  if (!canvas) throw new Error('Canvas missing');
  const x = canvas.x + canvas.width * 0.4;
  const y = canvas.y + canvas.height * 0.4;
  await page.mouse.click(x, y);
  await page.mouse.click(x + 100, y);
  await page.mouse.click(x + 50, y + 100);
  await page.mouse.click(x, y);
  await expect(page.locator('.paths-path-row')).toHaveCount(1);
  await expect(page.locator('.editor .anchor')).toHaveCount(3);
  await expect(page.locator('#live-svg-code')).toHaveValue(/Z/);
});
