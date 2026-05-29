import { expect, test } from '@playwright/test';

/**
 * Locks the data-quality public contract. The CI gate
 * (`backend/scripts/verify-data-quality.mjs`) reads this same
 * endpoint, so this spec is a safety net to catch shape drift
 * before a deploy.
 */
test('public data-quality endpoint exposes band + score + readiness', async ({ request }) => {
  const res = await request.get('/api/data-quality/public');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.band).toMatch(/^(green|amber|red)$/);
  expect(typeof body.score).toBe('number');
  expect(body.score).toBeGreaterThanOrEqual(0);
  expect(body.score).toBeLessThanOrEqual(100);
  expect(['ready', 'partial', 'limited']).toContain(body.readiness);
});

test('intercity routes endpoint returns at least the seeded routes', async ({ request }) => {
  const res = await request.get('/api/intercity/routes', { params: { from: 'cairo', to: 'alexandria' } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body)).toBeTruthy();
  // Allow zero on a brand-new install where the seed hasn't run yet,
  // but flag a missing seed so deploy gates can act on it.
  if (body.length === 0) {
    test.info().annotations.push({
      type: 'warning',
      description: 'intercity seed has not been run on this environment',
    });
  } else {
    const sample = body[0];
    expect(typeof sample.id).toBe('string');
    expect(typeof sample.carrier).toBe('string');
    expect(['bus', 'minibus', 'microbus', 'train', 'shared_taxi']).toContain(sample.vehicleType);
  }
});
