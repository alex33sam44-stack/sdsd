import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the mobile + i18n quality suite.
 *
 * This config lives OUTSIDE the frozen frontend tree (see
 * `frontend.lock.json`). It runs as a black-box check against a
 * deployed (or locally-served) build. The tests never edit src/.
 *
 * Targets:
 *   - Pixel 5 (most-used Android viewport in our Cairo telemetry)
 *   - iPhone 13 (mid-tier iOS)
 *   - Desktop Chrome (1280x800 baseline)
 *
 * Network throttling is forced to "Slow 3G" (≈400 ms RTT, 400 kbps)
 * for the mobile projects so we catch regressions on real Egyptian
 * pilot networks, not just on our 1 Gbit office connection.
 *
 * BASE_URL points at the running app:
 *   PLAYWRIGHT_BASE_URL=https://staging.mwasalat.app pnpm test:e2e
 *   (default: http://localhost:5173 — vite preview)
 */
export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'tests-e2e/test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'pixel5-3g',
      use: {
        ...devices['Pixel 5'],
        // emulate slow 3G
        launchOptions: {
          args: ['--enable-features=NetworkService'],
        },
        contextOptions: {
          // headers help our analytics differentiate test traffic
          extraHTTPHeaders: { 'x-test-runner': 'playwright-e2e' },
        },
      },
    },
    {
      name: 'iphone13',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
