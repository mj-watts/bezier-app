import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureSvg = readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'cassie-logo.svg'), 'utf8');
const dotMultilineSvg = readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'dot-multiline.svg'), 'utf8');
const groupInheritedClipSvg = readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'group-inherited-clip.svg'), 'utf8');

test.describe('visual regression - svg import fidelity', () => {
  async function importAndSnapshot(page: Page, svgText: string, snapshotName: string) {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto('/');

    const code = page.locator('#live-svg-code');
    await expect(code).toBeVisible();
    await code.fill(svgText);

    await page.waitForTimeout(400);
    await expect(page.locator('.error')).toHaveCount(0);

    // Hide interactive overlays so the snapshot compares imported artwork only.
    await page.addStyleTag({
      content: `
        .anchor, .guide, .handle, .scale-box, .scale-edge-hit, .scale-handle, .scale-rotate-handle, .scale-rotate-arm, .scale-size-tag, .pen-add { display: none !important; }
        svg.editor path[stroke="#ff9a00"] { display: none !important; }
      `,
    });

    const editor = page.locator('svg.editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveScreenshot(snapshotName, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.005,
    });
  }

  test('clip-path logo keeps geometry and i dot', async ({ page }) => {
    await importAndSnapshot(page, fixtureSvg, 'import-cassie-logo.png');
  });

  test('multiline dot path is preserved', async ({ page }) => {
    await importAndSnapshot(page, dotMultilineSvg, 'import-dot-multiline.png');
  });

  test('group-inherited clip-path and stroke styles are preserved', async ({ page }) => {
    await importAndSnapshot(page, groupInheritedClipSvg, 'import-group-inherited-clip.png');
  });
});
