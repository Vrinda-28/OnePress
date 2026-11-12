import { test, expect } from '@playwright/test';

test.describe('4. Speech & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept native speech API to track calls and parameters deterministically
    await page.addInitScript(() => {
      window.__spokenUtterances = [];
      window.__speechCalls = [];

      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak = function (utt) {
          window.__speechCalls.push({ action: 'speak', text: utt.text, rate: utt.rate, pitch: utt.pitch, voice: utt.voice?.name });
          window.__spokenUtterances.push(utt);
        };
        window.speechSynthesis.pause = function () {
          window.__speechCalls.push({ action: 'pause' });
        };
        window.speechSynthesis.resume = function () {
          window.__speechCalls.push({ action: 'resume' });
        };
        window.speechSynthesis.cancel = function () {
          window.__speechCalls.push({ action: 'cancel' });
        };
      }
    });

    await page.goto('/');
  });

  test('Read aloud uses corrected text and voice, speed, pitch reach the API', async ({ page }) => {
    // Set text in editor
    const transcript = page.locator('#transcript');
    await transcript.fill('Library session in Room B210. All students are welcome.');

    // Adjust rate and pitch
    await page.locator('.playback-settings select').first().selectOption('1.25');
    const pitchSlider = page.locator('.playback-settings input[type="range"]');
    await pitchSlider.fill('1.2');

    // Click Read aloud
    const playButton = page.locator('.play-button');
    await playButton.click();

    // Check API received utterance with corrected text, speed, and pitch
    const calls = await page.evaluate(() => window.__speechCalls);
    const speakCall = calls.find((c) => c.action === 'speak');
    expect(speakCall).toBeDefined();
    expect(speakCall.text).toContain('B210');
    expect(speakCall.rate).toBe(1.25);
    expect(speakCall.pitch).toBeCloseTo(1.2, 2);
  });

  test('Pause, Resume, Stop, and sentence highlighting behavior', async ({ page }) => {
    const transcript = page.locator('#transcript');
    await transcript.fill('Sentence one for test. Sentence two for follow up.');

    const playButton = page.locator('.play-button');
    await playButton.click();

    // Expect playing state
    await expect(playButton).toContainText('Pause');
    await expect(page.locator('.sentences button').first()).toHaveClass(/current-sentence/);

    // Click Pause
    await playButton.click();
    await expect(playButton).toContainText('Resume');
    let calls = await page.evaluate(() => window.__speechCalls);
    expect(calls.some((c) => c.action === 'pause')).toBe(true);

    // Click Resume
    await playButton.click();
    await expect(playButton).toContainText('Pause');
    calls = await page.evaluate(() => window.__speechCalls);
    expect(calls.some((c) => c.action === 'resume')).toBe(true);

    // Trigger onend on first utterance to test sentence progression
    await page.evaluate(() => {
      const utt = window.__spokenUtterances[0];
      if (utt && utt.onend) utt.onend();
    });

    // Expect sentence 2 to be highlighted
    await expect(page.locator('.sentences button').nth(1)).toHaveClass(/current-sentence/);

    // Click Stop
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(playButton).toContainText('Read aloud');
    calls = await page.evaluate(() => window.__speechCalls);
    expect(calls.some((c) => c.action === 'cancel')).toBe(true);
  });

  test('unavailable speech displays fallback message and disables narration', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Delete speechSynthesis to simulate unsupported environment
    await page.addInitScript(() => {
      delete window.speechSynthesis;
    });
    await page.goto('/');

    const status = page.locator('.playback .small[role="status"]');
    await expect(status).toContainText('Speech is unavailable in this browser');

    const playButton = page.locator('.play-button');
    await expect(playButton).toBeDisabled();
    await context.close();
  });

  test('keyboard navigation, shortcuts dialog, and visible focus', async ({ page }) => {
    // Skip link is present
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main');

    // Test shortcut dialog toggle via keyboard shortcut Ctrl+/ or Cmd+/
    await page.keyboard.press('Meta+/');
    const dialog = page.locator('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Keyboard shortcuts');

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Tab key navigation
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test('high contrast and font size scaling accessibility', async ({ page }) => {
    const contrastButton = page.getByRole('button', { name: 'Toggle high contrast' });
    await contrastButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');

    const sizeDown = page.getByRole('button', { name: 'Decrease text size' });
    const sizeUp = page.getByRole('button', { name: 'Increase text size' });

    await sizeUp.click();
    let fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(fontSize).toBe('110%');

    await sizeDown.click();
    fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(fontSize).toBe('100%');
  });

  test('narrow mobile layout responsiveness (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify page has no horizontal scrolling
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Verify main interactive elements remain visible and accessible
    await expect(page.getByRole('button', { name: 'Upload Notice Photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try a sample notice' })).toBeVisible();
  });
});
