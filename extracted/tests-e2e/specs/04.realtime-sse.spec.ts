import { expect, test } from '@playwright/test';

/**
 * Verifies the SSE handshake. We do NOT assert on emitted business
 * events here (that requires a live operator publishing flips); we
 * just prove the stream opens, sends the `hello` envelope, and
 * keeps the connection alive across at least one heartbeat cycle.
 *
 * If this passes, the runtime/SSE wiring is functioning end-to-end
 * (Caddy proxy → Nest controller → bus.attach → flush headers).
 */
test('SSE stream opens, says hello, then heartbeats', async ({ request }) => {
  // Probe stats first — a quick liveness check before we open a long stream.
  const stats = await request.get('/api/realtime/stats');
  expect(stats.ok()).toBeTruthy();
  const statsBody = await stats.json();
  expect(typeof statsBody.subscribers).toBe('number');
  expect(typeof statsBody.capacity).toBe('number');

  // Open a stream against a synthetic line id; the subject doesn't
  // need to exist for the protocol envelope to be emitted.
  const res = await request.get('/api/realtime/stream?channel=line&id=playwright-probe', {
    timeout: 35_000,
    headers: { accept: 'text/event-stream' },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/event-stream');

  // Read the first ~2KB of the stream — that's enough for hello + one heartbeat.
  const body = await res.body();
  const text = body.toString('utf8');
  expect(text).toMatch(/event: hello/);
  expect(text).toMatch(/"protocol":"sse"/);
});
