#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requireEvidence = process.env.RELEASE_VERIFY_REQUIRE_EVIDENCE === '1';
const required = [
  { name: 'secret-hygiene', path: 'release-evidence/security/secret-hygiene-readiness.json', pass: (j) => j.passed === true && (j.status === 'passed' || j.status === 'passed_with_warnings') },
  { name: 'vps-preflight', path: 'release-evidence/vps-preflight/vps-preflight-latest.json', pass: (j) => j.status === 'passed' && j.publicLaunchPreflightReady === true },
  { name: 'staging-smoke', path: 'release-evidence/staging/staging-smoke-readiness.json', pass: (j) => j.passed === true || j.status === 'ready' || j.status === 'passed' },
  { name: 'docker-smoke', path: 'release-evidence/staging/docker-smoke-readiness.json', pass: (j) => j.passed === true || j.status === 'ready' || j.status === 'passed' },
  { name: 'restore', path: 'release-evidence/staging/restore-verified.json', pass: (j) => j.passed === true || j.status === 'ready' || j.status === 'passed' },
  { name: 'tenant-isolation', path: 'release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json', pass: (j) => j.passed === true || j.status === 'ready' || j.status === 'passed' },
  { name: 'initial-data', path: 'release-evidence/initial-data/initial-data-readiness.json', pass: (j) => j.status === 'ready' || j.passed === true },
  { name: 'platform-admin', path: 'release-evidence/platform-admin/platform-admin-readiness.json', pass: (j) => j.status === 'ready' || j.passed === true },
  {
    name: 'rollback',
    path: 'release-evidence/rollback/rollback-readiness.json',
    pass: (j) => j.status === 'deployed' || j.status === 'rolled-back' || j.status === 'ready' || j.passed === true,
    fallback: () => {
      const dir = resolve(root, 'release-evidence/rollback');
      return existsSync(dir) && readdirSync(dir).some((f) => /^deploy-rollback-.*\.json$/.test(f) && f !== 'deploy-rollback-pending.json');
    },
  },
  {
    name: 'external-backup-target',
    path: 'release-evidence/backup/external-backup-target-readiness.json',
    pass: (j) => {
      if (!(j.passed === true && j.evidence === 'external_backup_target_verification' && j.accepted_as_public_launch_evidence === true)) return false;
      if (j.method === 'rclone') return Boolean(j.detail?.remote || j.remote);
      if (j.method !== 'mounted_directory') return false;
      const detail = j.detail || {};
      if (!detail.remote_dir || String(detail.remote_dir).startsWith('/tmp/')) return false;
      if (!detail.mount_target || detail.mount_target === '/') return false;
      if (detail.mount_fstype === 'overlay') return false;
      if (detail.root_device && detail.remote_device && detail.root_device === detail.remote_device) return false;
      return true;
    },
  },
  {
    // Backup freshness: the cron must have actually run within the freshness
    // window. Configurable via the upstream script — we just trust the
    // accepted_as_public_launch_evidence flag it sets.
    name: 'backup-freshness',
    path: 'release-evidence/backup/backup-freshness-readiness.json',
    pass: (j) =>
      j.passed === true &&
      j.evidence === 'backup_freshness' &&
      j.accepted_as_public_launch_evidence === true,
  },
  {
    // Round-trip restore: the strongest single piece of evidence that the
    // off-server backup strategy actually works. This is what closes the
    // "no proof of execution" gap — sha256 match across the network plus a
    // successful mysql restore inside a throwaway container.
    name: 'backup-roundtrip',
    path: 'release-evidence/backup/backup-roundtrip-readiness.json',
    pass: (j) =>
      j.passed === true &&
      j.evidence === 'backup_roundtrip' &&
      j.accepted_as_public_launch_evidence === true,
  },
];

const results = [];
for (const item of required) {
  const fullPath = resolve(root, item.path);
  if (!existsSync(fullPath)) {
    results.push({ name: item.name, path: item.path, exists: false, passed: !requireEvidence, status: requireEvidence ? 'missing' : 'optional_missing' });
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    results.push({ name: item.name, path: item.path, exists: true, passed: false, status: 'invalid_json', error: error.message });
    continue;
  }
  const passed = item.pass(parsed) || Boolean(item.fallback?.());
  results.push({ name: item.name, path: item.path, exists: true, passed, status: parsed.status ?? (parsed.passed === true ? 'passed' : 'not_verified') });
}

const missing = results.filter((r) => !r.exists);
const notPassed = results.filter((r) => r.exists && !r.passed);
const blockingMissing = requireEvidence ? missing.length : 0;
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  requireEvidence,
  requiredEvidenceCount: required.length,
  missingCount: missing.length,
  notPassedCount: notPassed.length,
  publicLaunchReady: blockingMissing === 0 && notPassed.length === 0,
  results,
}, null, 2));

if (blockingMissing > 0 || notPassed.length > 0) process.exit(2);
