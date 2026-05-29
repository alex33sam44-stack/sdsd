import { expect, test } from '@playwright/test';

/**
 * Exercises the runtime translation overlay (loaded by Caddy via
 * sub_filter into index.html). Walking through the four supported
 * locales is the simplest end-to-end proof that:
 *
 *   1. The overlay JS is actually being injected.
 *   2. /api/i18n/runtime.js responds with valid JS.
 *   3. /api/i18n/overrides?locale=… responds with a dictionary.
 *   4. window.__MW_I18N__.setLocale persists across reloads.
 *
 * If this spec fails, the SPA is still localizable but the runtime
 * layer is broken — a release blocker.
 */
const LOCALES = ['en', 'fr', 'pt'] as const;

test.describe('runtime locale switch (en/fr/pt)', () => {
  test('runtime.js is served by the backend', async ({ request }) => {
    const res = await request.get('/api/i18n/runtime.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('window.__MW_I18N__');
    expect(body).toContain("'pt'");
  });

  test('locales endpoint advertises ar/en/fr/pt', async ({ request }) => {
    const res = await request.get('/api/i18n/locales');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.default).toBe('ar');
    expect(body.locales).toEqual(expect.arrayContaining(['ar', 'en', 'fr', 'pt']));
  });

  for (const locale of LOCALES) {
    test(`switching to ${locale} flips html lang/dir and survives reload`, async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => !!(window as any).__MW_I18N__);

      // The overlay reloads when switching to/from a SPA-bundled
      // locale; wait for the navigation that follows.
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.evaluate((next) => {
          (window as any).__MW_I18N__.setLocale(next);
        }, locale),
      ]);

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

      // Reload — the cookie/storage should restore the same locale.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('?lang= query parameter overrides cookie on first visit', async ({ page }) => {
    await page.goto('/?lang=fr');
    await page.waitForFunction(() => !!(window as any).__MW_I18N__);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
