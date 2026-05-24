// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateFreshness } = require('../../scripts/lib/backup-freshness.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Backup freshness gate: pure function exposed by scripts/lib/backup-freshness.cjs
// (consumed at runtime by validate-backup-freshness.mjs and at test time by
// this spec). Locks every branch of the verdict so "is this backup fresh
// enough to ship a release?" cannot regress quietly. Stale backup = data-loss
// risk in the worst case, so each rule below corresponds to a real failure
// mode we want to fail the release on.
// ─────────────────────────────────────────────────────────────────────────────

const validHeartbeat = (overrides: Record<string, unknown> = {}) => ({
  completed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
  database: 'mwasalat',
  local_path: '/var/backups/mwasalat_20260524.sql.gz',
  bytes: 1234567,
  sha256: 'a'.repeat(64),
  target_kind: 'rclone',
  target_location: 's3:mwasalat-prod-backups/mysql',
  external_target_configured: true,
  evidence: 'mysql_backup_heartbeat',
  schema_version: 1,
  ...overrides,
});

const NOW = Date.parse('2026-05-24T12:00:00Z');

describe('evaluateFreshness — core happy path', () => {
  it('passes when the heartbeat is fresh, complete, and external-targeted', () => {
    const heartbeat = validHeartbeat({ completed_at: '2026-05-24T11:00:00Z' });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: true });
    expect(verdict).toMatchObject({ passed: true, status: 'passed', reason: 'heartbeat_fresh' });
    expect(verdict.age_hours).toBeCloseTo(1, 1);
  });

  it('reports age_hours rounded to 2 decimal places', () => {
    const heartbeat = validHeartbeat({ completed_at: '2026-05-24T10:30:00Z' }); // 1.5h ago
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict.passed).toBe(true);
    expect(verdict.age_hours).toBe(1.5);
  });
});

describe('evaluateFreshness — staleness', () => {
  it('fails when heartbeat is older than maxHours', () => {
    const heartbeat = validHeartbeat({
      // 26h ago, threshold 25h → fail.
      completed_at: new Date(NOW - 26 * 60 * 60 * 1000).toISOString(),
    });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict).toMatchObject({ passed: false, status: 'failed', reason: 'heartbeat_stale' });
    expect(verdict.age_hours).toBeGreaterThan(25);
    expect(verdict.max_hours).toBe(25);
  });

  it('treats exactly at the threshold as still fresh (inclusive boundary)', () => {
    // The cron may legitimately fire at the same HH:MM each day; a strict
    // "<" boundary would flake every day. Be inclusive and stable.
    const heartbeat = validHeartbeat({
      completed_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict.passed).toBe(true);
  });

  it('fails when heartbeat timestamp is more than 1 minute in the future', () => {
    const heartbeat = validHeartbeat({
      completed_at: new Date(NOW + 2 * 60 * 1000).toISOString(),
    });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict).toMatchObject({ passed: false, reason: 'heartbeat_in_future' });
  });

  it('tolerates small clock skew (up to 1 minute in the future)', () => {
    const heartbeat = validHeartbeat({
      completed_at: new Date(NOW + 30 * 1000).toISOString(),
    });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict.passed).toBe(true);
  });
});

describe('evaluateFreshness — input validation', () => {
  it('fails when heartbeat is null, undefined, an array, or a primitive', () => {
    for (const bad of [null, undefined, [], 'not-an-object', 42]) {
      expect(evaluateFreshness({ heartbeat: bad as any, nowMs: NOW, maxHours: 25, requireExternal: false }))
        .toMatchObject({ passed: false, reason: 'heartbeat_missing_or_invalid' });
    }
  });

  it('fails when completed_at is missing or not a string', () => {
    expect(evaluateFreshness({ heartbeat: validHeartbeat({ completed_at: undefined }), nowMs: NOW, maxHours: 25, requireExternal: false }))
      .toMatchObject({ passed: false, reason: 'heartbeat_missing_completed_at' });
    expect(evaluateFreshness({ heartbeat: validHeartbeat({ completed_at: 12345 as any }), nowMs: NOW, maxHours: 25, requireExternal: false }))
      .toMatchObject({ passed: false, reason: 'heartbeat_missing_completed_at' });
  });

  it('fails when completed_at is not parseable as a date', () => {
    const verdict = evaluateFreshness({
      heartbeat: validHeartbeat({ completed_at: 'not-a-real-date' }),
      nowMs: NOW,
      maxHours: 25,
      requireExternal: false,
    });
    expect(verdict).toMatchObject({ passed: false, reason: 'heartbeat_completed_at_unparseable' });
  });

  it('fails when bytes is missing, zero, or non-numeric', () => {
    for (const bytes of [undefined, 0, -1, '1234' as any]) {
      const verdict = evaluateFreshness({
        heartbeat: validHeartbeat({ bytes }),
        nowMs: NOW,
        maxHours: 25,
        requireExternal: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.reason).toBe('heartbeat_bytes_missing_or_zero');
    }
  });

  it('fails when sha256 is malformed (not 64 hex chars)', () => {
    for (const sha256 of [undefined, '', 'short', 'g'.repeat(64), 'a'.repeat(63)]) {
      const verdict = evaluateFreshness({
        heartbeat: validHeartbeat({ sha256 }),
        nowMs: NOW,
        maxHours: 25,
        requireExternal: false,
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.reason).toBe('heartbeat_sha256_invalid');
    }
  });

  it('accepts uppercase sha256 hex', () => {
    const verdict = evaluateFreshness({
      heartbeat: validHeartbeat({ sha256: 'A'.repeat(64) }),
      nowMs: NOW,
      maxHours: 25,
      requireExternal: false,
    });
    expect(verdict.passed).toBe(true);
  });
});

describe('evaluateFreshness — requireExternal flag', () => {
  it('passes when requireExternal is false even if the backup is local-only', () => {
    const heartbeat = validHeartbeat({ external_target_configured: false, target_kind: 'local_only' });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: false });
    expect(verdict.passed).toBe(true);
  });

  it('fails when requireExternal is true and the backup is local-only', () => {
    // This is the production-launch posture: a local-only dump on the same
    // VPS as the database is not a disaster-recovery story, so the gate
    // refuses to ship.
    const heartbeat = validHeartbeat({ external_target_configured: false, target_kind: 'local_only' });
    const verdict = evaluateFreshness({ heartbeat, nowMs: NOW, maxHours: 25, requireExternal: true });
    expect(verdict).toMatchObject({ passed: false, reason: 'external_target_not_configured' });
  });
});
