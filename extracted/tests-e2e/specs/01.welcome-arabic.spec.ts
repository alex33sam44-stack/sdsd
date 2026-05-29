import { expect, test } from '@playwright/test';

/**
 * The platform's source-of-truth language is Arabic (RTL). This
 * spec verifies that on a fresh visit the document is laid out RTL,
 * the html lang is "ar", and the home page renders the canonical
 * value proposition. Regression here would mean the i18n layer
 * itself is broken.
 */
test.describe('welcome page — arabic baseline', () => {
  test('renders RTL with html lang=ar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('shows the canonical hook somewhere on the page', async ({ page }) => {
    await page.goto('/');
    // The hook may be wrapped in any container; we look for the
    // distinctive Arabic phrase rather than a CSS selector tied to
    // the (frozen) DOM structure.
    await expect(page.getByText('اعرف تركب', { exact: false })).toBeVisible();
  });

  test('mw_locale cookie is set to ar by the runtime overlay', async ({ page, context }) => {
    await page.goto('/');
    // give the overlay a tick to set the cookie
    await page.waitForFunction(() => document.cookie.includes('mw_locale='));
    const cookies = await context.cookies();
    const mw = cookies.find((c) => c.name === 'mw_locale');
    expect(mw?.value).toBe('ar');
  });
});
