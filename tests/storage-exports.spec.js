import { test, expect } from '@playwright/test';

test.describe('3. Storage & Exports', () => {
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

  test('edit B204 to B210, save, verify through search, reopen, and reload in same context', async ({ page }) => {
    // 1. Load Clear sample
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    const transcript = page.locator('#transcript');
    await expect(transcript).toHaveValue(/B204/, { timeout: 60000 });

    // 2. Edit B204 to B210
    const originalText = await transcript.inputValue();
    const updatedText = originalText.replace('B204', 'B210');
    await transcript.fill(updatedText);

    // 3. Save notice
    await page.getByRole('button', { name: 'Save Notice' }).click();
    await expect(page.locator('.global-status')).toContainText('Notice saved on this device.');

    // 4. Verify in Library via search
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    const searchInput = page.getByPlaceholder('Search by title, date, or notice text…');
    await searchInput.fill('B210');
    await expect(page.locator('.result-count')).toHaveText('1 notice shown');
    await expect(page.locator('.saved-card .excerpt')).toContainText('B210');

    // 5. Reopen in reader
    await page.getByRole('button', { name: 'Open in reader' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/B210/);

    // 6. Reload in same browser context
    await page.reload();
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    await expect(page.locator('.saved-card .excerpt')).toContainText('B210');
    await page.getByRole('button', { name: 'Open in reader' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/B210/);
  });

  test('updating the same notice does not duplicate it', async ({ page }) => {
    // Load and save notice first time
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/B204/, { timeout: 60000 });
    await page.getByRole('button', { name: 'Save Notice' }).click();
    await expect(page.locator('.global-status')).toContainText('Notice saved on this device.');

    // Edit title and save again
    const titleInput = page.getByPlaceholder('Give this notice a name');
    await titleInput.fill('Orientation Revised');
    await page.getByRole('button', { name: 'Save Notice' }).click();
    await expect(page.locator('.global-status')).toContainText('Notice saved on this device.');

    // Check library has exactly 1 notice
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    await expect(page.locator('.result-count')).toHaveText('1 notice shown');
    await expect(page.locator('.saved-card h2')).toHaveText('Orientation Revised');
  });

  test('delete and undo notice restoration', async ({ page }) => {
    // Save a notice
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/B204/, { timeout: 60000 });
    await page.getByRole('button', { name: 'Save Notice' }).click();

    // Go to library and delete it
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    await page.getByRole('button', { name: /Delete Library orientation/ }).click();

    // Confirm dialog
    const modal = page.locator('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Delete notice' }).click();

    // Verify empty state
    await expect(page.locator('.result-count')).toHaveText('0 notices shown');
    await expect(page.locator('.empty')).toBeVisible();

    // Undo delete
    const undoButton = page.getByRole('button', { name: 'Undo delete' });
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Verify restored
    await expect(page.locator('.result-count')).toHaveText('1 notice shown');
    await expect(page.locator('.saved-card')).toBeVisible();
  });

  test('fresh browser context starts with an empty library', async ({ browser }) => {
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    await freshPage.goto('/#library');

    await expect(freshPage.locator('.result-count')).toHaveText('0 notices shown');
    await expect(freshPage.locator('.empty')).toBeVisible();
    await expect(freshPage.locator('.big-number')).toHaveText('0');
    await context.close();
  });

  test('preferences persist across page reload', async ({ page }) => {
    // Increase text size
    await page.getByRole('button', { name: 'Increase text size' }).click();
    // Toggle high contrast
    await page.getByRole('button', { name: 'Toggle high contrast' }).click();
    // Change speech rate
    await page.locator('.playback-settings select').first().selectOption('1.25');

    // Reload
    await page.reload();

    // Verify styles and attributes
    const contrast = await page.locator('html').getAttribute('data-contrast');
    expect(contrast).toBe('high');

    const fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(fontSize).toBe('110%');

    const rate = await page.locator('.playback-settings select').first().inputValue();
    expect(rate).toBe('1.25');
  });

  test('TXT and JSON exports contain actual notice data', async ({ page }) => {
    // Load and save notice
    await page.locator('.sample-select select').selectOption('clear');
    await page.getByRole('button', { name: 'Try a sample notice' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/October 14, 2026/, { timeout: 60000 });
    await page.getByRole('button', { name: 'Save Notice' }).click();

    // 1. Export text (TXT) from Reader
    const txtDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export text' }).click();
    const txtDownload = await txtDownloadPromise;
    expect(txtDownload.suggestedFilename()).toBe('Library orientation.txt');
    const txtContent = await (await txtDownload.createReadStream()).toArray();
    const txtString = Buffer.concat(txtContent).toString('utf-8');
    expect(txtString).toContain('October 14, 2026');
    expect(txtString).toContain('2:30 PM');
    expect(txtString).toContain('B204');

    // 2. Export JSON from Library
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export all transcripts' }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toBe('onepress-transcripts.json');
    const jsonContent = await (await jsonDownload.createReadStream()).toArray();
    const jsonParsed = JSON.parse(Buffer.concat(jsonContent).toString('utf-8'));
    expect(Array.isArray(jsonParsed)).toBe(true);
    expect(jsonParsed.length).toBe(1);
    expect(jsonParsed[0].title).toBe('Library orientation');
    expect(jsonParsed[0].text).toContain('October 14, 2026');
    expect(jsonParsed[0].image).toBeUndefined(); // Blobs stripped
  });
});
