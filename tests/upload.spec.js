import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('1. Actual Upload & Sample Loader', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('onepress-library');
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    });
    await page.reload();
  });

  test('upload low-contrast.png via filechooser and verify OCR extraction', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('public/notices/low-contrast.png'));

    // Verify image preview
    const previewImg = page.locator('.document-sheet img');
    await expect(previewImg).toBeVisible({ timeout: 15000 });
    const src = await previewImg.getAttribute('src');
    expect(src).toMatch(/^blob:/);

    // Verify OCR completion and extracted fields
    const transcript = page.locator('#transcript');
    await expect(transcript).toBeVisible();
    await expect(transcript).toHaveValue(/November 3, 2026/, { timeout: 60000 });
    await expect(transcript).toHaveValue(/10:15 AM/);
    await expect(transcript).toHaveValue(/D307/);

    const status = page.locator('.global-status');
    await expect(status).toContainText('OCR finished');
  });

  test('upload valid JPEG and verify extraction', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('tests/fixtures/valid.jpg'));

    const transcript = page.locator('#transcript');
    await expect(transcript).toHaveValue(/October 14, 2026/, { timeout: 60000 });
    await expect(transcript).toHaveValue(/2:30 PM/);
    await expect(transcript).toHaveValue(/B204/);
  });

  test('unsupported file type rejection', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('tests/fixtures/unsupported.txt'));

    const status = page.locator('.global-status');
    await expect(status).toContainText('Please choose a JPG or PNG image.');
  });

  test('corrupt image error handling', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('tests/fixtures/corrupt.png'));

    const status = page.locator('.global-status');
    await expect(status).toContainText('OCR failed', { timeout: 15000 });
  });

  test('cancelling the file chooser leaves UI stable', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    // Cancelling without choosing files
    await fileChooser.setFiles([]);

    const status = page.locator('.global-status');
    await expect(status).not.toContainText('OCR failed');
    await expect(page.locator('#transcript')).toHaveValue('');
  });

  test('upload valid image after an error succeeds', async ({ page }) => {
    // 1. Upload corrupt image
    let fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    let fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('tests/fixtures/corrupt.png'));
    await expect(page.locator('.global-status')).toContainText('OCR failed', { timeout: 15000 });

    // 2. Upload valid image
    fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('tests/fixtures/valid.jpg'));

    const transcript = page.locator('#transcript');
    await expect(transcript).toHaveValue(/October 14, 2026/, { timeout: 60000 });
    await expect(transcript).toHaveValue(/2:30 PM/);
    await expect(transcript).toHaveValue(/B204/);
  });

  test('sample loader operates independently', async ({ page }) => {
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();

    const transcript = page.locator('#transcript');
    await expect(transcript).toHaveValue(/Library orientation/, { timeout: 60000 });
    await expect(transcript).toHaveValue(/October 14, 2026/);
    await expect(transcript).toHaveValue(/2:30 PM/);
    await expect(transcript).toHaveValue(/B204/);
  });
});
