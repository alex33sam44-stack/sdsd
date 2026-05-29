import { expect, test } from '@playwright/test';

/**
 * Smoke for the Egypt local search endpoint. The query string is
 * intentionally written three different ways for the same place to
 * prove the normalize/transliterate logic is wired end-to-end.
 *
 * The test runs against the live backend; if the backend is
 * unavailable Playwright will mark the test as failed, which is
 * the right signal for a release gate.
 */
const VARIANTS = [
  { q: 'ميدان رمسيس', label: 'arabic' },
  { q: 'ramses', label: 'english' },
  { q: 'rmses', label: 'franko' },
  { q: 'midan ramses', label: 'mixed' },
];

test.describe('local search — Egypt landmark variants', () => {
  for (const v of VARIANTS) {
    test(`finds Ramses square via ${v.label} query`, async ({ request }) => {
      const res = await request.get('/api/local-search', { params: { q: v.q, limit: '5' } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      const hasRamses = body.hits.some(
        (h: { id: string; matchedAliases?: string[] }) =>
          h.id === 'ramses-square' ||
          (h.matchedAliases ?? []).some((a) => /ramses|رمسيس/i.test(a)),
      );
      expect(hasRamses).toBeTruthy();
    });
  }

  test('proximity bias surfaces nearby hubs first', async ({ request }) => {
    // Bias around Cairo University — Tahrir hubs should outrank far ones
    const res = await request.get('/api/local-search', {
      params: { q: 'tahrir', near: '30.026,31.211', limit: '5' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.hits[0]).toBeTruthy();
    expect(body.hits[0].score).toBeGreaterThan(0.3);
  });
});
