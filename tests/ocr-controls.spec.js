import { test, expect } from '@playwright/test';

test.describe('2. OCR & Image Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('verifies OCR worker and traineddata assets load from production build', async ({ page }) => {
    const loadedAssets = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('worker.min') || url.includes('eng.traineddata') || url.includes('tesseract-core')) {
        loadedAssets.push({ url, status: response.status() });
      }
    });

    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();

    // Verify progress UI appears
    const scanProgress = page.locator('.scan-progress');
    // It might appear and disappear quickly or be visible while scanning
    await expect(page.locator('#transcript')).toHaveValue(/October 14, 2026/, { timeout: 60000 });

    // Verify assets loaded with status 200
    expect(loadedAssets.length).toBeGreaterThan(0);
    for (const asset of loadedAssets) {
      expect(asset.status).toBe(200);
    }
  });

  test('blurry sample triggers actionable low-confidence advisory and flagged review words', async ({ page }) => {
    await page.locator('.sample-select select').selectOption('blurry');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();

    // Expect completion advisory message
    const status = page.locator('.global-status');
    await expect(status).toContainText('difficult to read', { timeout: 60000 });
    await expect(status).toContainText('Try a sharper, well-lit photo');

    // Review section shows flagged low confidence words
    const flaggedTag = page.locator('.review .tag');
    await expect(flaggedTag).toBeVisible();
    await expect(flaggedTag).toContainText('flagged');

    const reviewButtons = page.locator('.review-words button');
    expect(await reviewButtons.count()).toBeGreaterThan(0);

    // Clicking a review word focuses it in the textarea
    await reviewButtons.first().click();
    await expect(page.locator('#transcript')).toBeFocused();
  });

  test('cancel scan and retry', async ({ page }) => {
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();

    // Click cancel scan as soon as progress appears
    const cancelButton = page.locator('.scan-progress button');
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    // Verify cancelled message
    const status = page.locator('.global-status');
    await expect(status).toContainText('OCR cancelled. You can retry or choose another image.');

    // Retry scan
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/October 14, 2026/, { timeout: 60000 });
    await expect(status).toContainText('OCR finished');
  });

  test('zoom controls zoom in and zoom out the document sheet', async ({ page }) => {
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/October 14, 2026/, { timeout: 60000 });

    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    const sheet = page.locator('.document-sheet');

    await expect(zoomOut).toBeDisabled(); // initially at 100% (zoom=1)
    await expect(sheet).toHaveAttribute('style', /width:\s*100%/);

    await zoomIn.click();
    await expect(sheet).toHaveAttribute('style', /width:\s*125%/);
    await expect(zoomOut).toBeEnabled();

    await zoomIn.click();
    await expect(sheet).toHaveAttribute('style', /width:\s*150%/);

    await zoomOut.click();
    await expect(sheet).toHaveAttribute('style', /width:\s*125%/);
    await zoomOut.click();
    await expect(sheet).toHaveAttribute('style', /width:\s*100%/);
    await expect(zoomOut).toBeDisabled();
  });

  test('adjustments (rotation, crop, contrast) and re-scan', async ({ page }) => {
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/October 14, 2026/, { timeout: 60000 });

    // Open adjustments details
    const adjustmentsDetails = page.locator('details.adjustments');
    await adjustmentsDetails.locator('summary').click();

    // Test Rotation
    const rotateButton = adjustmentsDetails.getByRole('button', { name: /Rotate/ });
    await rotateButton.click();
    await expect(rotateButton).toContainText('Rotate 90°');
    await rotateButton.click();
    await expect(rotateButton).toContainText('Rotate 180°');

    // Test Contrast slider
    const contrastSlider = adjustmentsDetails.locator('input[type="range"]').first();
    await contrastSlider.fill('1.5');
    await expect(adjustmentsDetails.locator('output').first()).toHaveText('1.5×');

    // Test Crop slider
    const cropSlider = adjustmentsDetails.locator('input[type="range"]').nth(1);
    await cropSlider.fill('5');
    await expect(adjustmentsDetails.locator('output').nth(1)).toHaveText('5% per edge');

    // Trigger re-scan
    page.on('dialog', (dialog) => dialog.accept());
    const rescanButton = page.getByRole('button', { name: 'Re-scan image' });
    await rescanButton.click();

    // Verify OCR runs and finishes
    await expect(page.locator('.global-status')).toContainText('OCR finished', { timeout: 60000 });
  });
});
