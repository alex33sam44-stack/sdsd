'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Pure freshness verdict for the backup heartbeat.
//
// Lives in CommonJS so it can be consumed by:
//   - scripts/validate-backup-freshness.mjs (Node ESM, runs on the VPS)
//   - backend/test/backup-freshness.spec.ts (Jest + ts-jest, no transform)
//
// Pure-function-only contract: no I/O, no Date.now(), no env reads. The
// caller passes nowMs, the function returns a verdict. That keeps every
// test deterministic and lets the gate's policy live in one place.
// ─────────────────────────────────────────────────────────────────────────────

function evaluateFreshness({ heartbeat, nowMs, maxHours, requireExternal }) {
  if (!heartbeat || typeof heartbeat !== 'object' || Array.isArray(heartbeat)) {
    return { passed: false, status: 'failed', reason: 'heartbeat_missing_or_invalid' };
  }
  const completedAt = heartbeat.completed_at;
  if (typeof completedAt !== 'string' || !completedAt) {
    return { passed: false, status: 'failed', reason: 'heartbeat_missing_completed_at' };
  }
  const completedMs = Date.parse(completedAt);
  if (!Number.isFinite(completedMs)) {
    return { passed: false, status: 'failed', reason: 'heartbeat_completed_at_unparseable', completed_at: completedAt };
  }
  if (completedMs > nowMs + 60 * 1000) {
    // More than a minute in the future is suspicious — clock skew or someone
    // hand-wrote the file. Refuse rather than accept silently.
    return { passed: false, status: 'failed', reason: 'heartbeat_in_future', completed_at: completedAt };
  }
  const ageHours = (nowMs - completedMs) / (60 * 60 * 1000);
  if (ageHours > maxHours) {
    return { passed: false, status: 'failed', reason: 'heartbeat_stale', completed_at: completedAt, age_hours: roundHours(ageHours), max_hours: maxHours };
  }
  if (requireExternal && heartbeat.external_target_configured !== true) {
    return { passed: false, status: 'failed', reason: 'external_target_not_configured', target_kind: heartbeat.target_kind != null ? heartbeat.target_kind : null };
  }
  if (typeof heartbeat.bytes !== 'number' || !Number.isFinite(heartbeat.bytes) || heartbeat.bytes <= 0) {
    return { passed: false, status: 'failed', reason: 'heartbeat_bytes_missing_or_zero', bytes: heartbeat.bytes != null ? heartbeat.bytes : null };
  }
  if (typeof heartbeat.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(heartbeat.sha256)) {
    return { passed: false, status: 'failed', reason: 'heartbeat_sha256_invalid', sha256: heartbeat.sha256 != null ? heartbeat.sha256 : null };
  }
  return {
    passed: true,
    status: 'passed',
    reason: 'heartbeat_fresh',
    completed_at: completedAt,
    age_hours: roundHours(ageHours),
    max_hours: maxHours,
    target_kind: heartbeat.target_kind != null ? heartbeat.target_kind : null,
    bytes: heartbeat.bytes,
  };
}

function roundHours(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { evaluateFreshness };
