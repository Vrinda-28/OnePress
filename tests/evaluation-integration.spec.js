import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('5. Evaluation & End-to-End Integration', () => {
  test('technical evaluation runs from UI, updates metrics and exports CSV', async ({ page }) => {
    await page.goto('/#evaluation');

    const statusStrip = page.locator('.status-strip');
    await expect(statusStrip).toContainText('Recorded technical test');

    // Run test
    const runButton = page.getByRole('button', { name: 'Run technical test' });
    await runButton.click();

    // Verify completion
    await expect(statusStrip).toContainText('Technical test completed in this browser', { timeout: 120000 });

    // Verify metrics cards
    const metricsCards = page.locator('.metrics article strong');
    await expect(metricsCards.nth(0)).toHaveText('6/9'); // Overall fields matched
    await expect(metricsCards.nth(1)).toHaveText('3/3'); // Clear
    await expect(metricsCards.nth(2)).toHaveText('0/3'); // Blurry
    await expect(metricsCards.nth(3)).toHaveText('3/3'); // Low-contrast

    // Download CSV
    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export results CSV' }).click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toBe('onepress-technical-test.csv');

    const content = await (await csvDownload.createReadStream()).toArray();
    const csvText = Buffer.concat(content).toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(Boolean);

    expect(lines[0]).toBe('"notice","condition","field","expected","actual","correct"');
    expect(lines.length).toBe(10); // 1 header + 9 field rows
  });

  test('end-to-end integration trace: file input -> processing -> OCR -> editor -> speech & storage -> reopen', async ({ page }) => {
    // 1. Monitor network to verify image never leaves browser
    const outboundPosts = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && !req.url().includes('127.0.0.1')) {
        outboundPosts.push(req.url());
      }
    });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // 2. Upload file via filechooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload Notice Photo' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('public/notices/low-contrast.png'));

    // 3. Image preview & OCR completion
    const transcript = page.locator('#transcript');
    await expect(transcript).toHaveValue(/November 3, 2026/, { timeout: 60000 });

    // 4. Edit text in editor
    const current = await transcript.inputValue();
    await transcript.fill(current.replace('D307', 'D399'));

    // 5. Save to IndexedDB
    await page.getByRole('button', { name: 'Save Notice' }).click();
    await expect(page.locator('.global-status')).toContainText('Notice saved on this device.');

    // 6. Reload and reopen
    await page.reload();
    await page.getByRole('link', { name: 'Saved Notices' }).click();
    await expect(page.locator('.saved-card .excerpt')).toContainText('D399');
    await page.getByRole('button', { name: 'Open in reader' }).click();
    await expect(page.locator('#transcript')).toHaveValue(/D399/);

    // 7. Verify no outbound POST containing image data occurred
    expect(outboundPosts.length).toBe(0);
    // Filter out known benign errors if any
    const realErrors = consoleErrors.filter(err => !err.includes('favicon'));
    expect(realErrors.length).toBe(0);
  });
});
