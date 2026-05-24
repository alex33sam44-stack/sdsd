#!/usr/bin/env node
/**
 * Backup freshness gate (CLI wrapper).
 *
 * The verdict logic lives in scripts/lib/backup-freshness.cjs so the same
 * code is reachable from Jest (CommonJS) and from this Node-ESM runner
 * without any build step.
 *
 * Reads release-evidence/backup/last-backup-heartbeat.json (written by
 * mysql-backup.sh on every successful run) and fails if the timestamp is
 * older than BACKUP_FRESHNESS_MAX_HOURS (default 25h — gives the daily
 * 02:15 cron a one-hour grace window before the gate trips).
 *
 * Writes release-evidence/backup/backup-freshness-readiness.json so the
 * existing validate-release-evidence.mjs picks it up like any other gate.
 *
 * Exit codes:
 *   0 — heartbeat exists and is fresh, evidence written as passed
 *   2 — heartbeat is missing, malformed, or stale; evidence written as failed
 *
 * Env:
 *   BACKUP_HEARTBEAT_FILE          override heartbeat path
 *   BACKUP_FRESHNESS_MAX_HOURS     freshness threshold in hours (default 25)
 *   BACKUP_FRESHNESS_EVIDENCE_FILE override evidence output path
 *   BACKUP_FRESHNESS_REQUIRE_EXTERNAL  if "1", a heartbeat with target_kind=local_only fails the gate
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateFreshness } = require('./lib/backup-freshness.cjs');

const DEFAULT_MAX_HOURS = 25;

const root = process.cwd();
const heartbeatPath = process.env.BACKUP_HEARTBEAT_FILE
  ? resolve(process.env.BACKUP_HEARTBEAT_FILE)
  : resolve(root, 'release-evidence/backup/last-backup-heartbeat.json');
const evidencePath = process.env.BACKUP_FRESHNESS_EVIDENCE_FILE
  ? resolve(process.env.BACKUP_FRESHNESS_EVIDENCE_FILE)
  : resolve(root, 'release-evidence/backup/backup-freshness-readiness.json');
const maxHours = Number.parseFloat(process.env.BACKUP_FRESHNESS_MAX_HOURS ?? '') || DEFAULT_MAX_HOURS;
const requireExternal = process.env.BACKUP_FRESHNESS_REQUIRE_EXTERNAL === '1';

let heartbeat = null;
let parseError = null;
if (existsSync(heartbeatPath)) {
  try {
    heartbeat = JSON.parse(readFileSync(heartbeatPath, 'utf8'));
  } catch (error) {
    parseError = error.message;
  }
}

const verdict = parseError
  ? { passed: false, status: 'failed', reason: 'heartbeat_unparseable', error: parseError }
  : evaluateFreshness({ heartbeat, nowMs: Date.now(), maxHours, requireExternal });

const evidence = {
  checked_at: new Date().toISOString(),
  evidence: 'backup_freshness',
  schema_version: 1,
  heartbeat_file: heartbeatPath,
  heartbeat_present: heartbeat !== null,
  require_external_target: requireExternal,
  max_hours: maxHours,
  ...verdict,
  accepted_as_public_launch_evidence: verdict.passed === true,
};

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');

if (!verdict.passed) {
  console.error(`Backup freshness check FAILED: ${verdict.reason}`);
  console.error(`See ${evidencePath}`);
  process.exit(2);
}
console.log(`Backup freshness check passed (age ${verdict.age_hours}h <= ${maxHours}h)`);
console.log(`Wrote ${evidencePath}`);
