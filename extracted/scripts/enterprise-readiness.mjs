#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const outputPath = resolve(root, 'release-evidence/enterprise-readiness.json');
const tenantIsolationEvidencePath = resolve(root, 'release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json');
const stagingEvidence = {
  staging_smoke: resolve(root, 'release-evidence/staging/staging-smoke-readiness.json'),
  docker_smoke: resolve(root, 'release-evidence/staging/docker-smoke-readiness.json'),
  restore_verified: resolve(root, 'release-evidence/staging/restore-verified.json'),
};

function readJsonIfExists(path) {
  if (!existsSync(path)) return { exists: false, data: null };
  return { exists: true, data: JSON.parse(readFileSync(path, 'utf8')) };
}

function isRealHttpsUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    if (/(^|\.)((example|yourdomain|localhost)(\.|$)|example\.com$|example\.org$|example\.net$|example\.invalid$|test$|invalid$)/i.test(parsed.hostname)) return false;
    if (/^(127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const mysqlTenantIsolation = readJsonIfExists(tenantIsolationEvidencePath);
const mysqlTenantIsolationPassed =
  mysqlTenantIsolation.exists &&
  mysqlTenantIsolation.data?.passed === true &&
  mysqlTenantIsolation.data?.database === 'mysql' &&
  mysqlTenantIsolation.data?.evidence === 'real_mysql_integration_test';

function stagingGate(id, path, requiredEvidence) {
  const evidence = readJsonIfExists(path);
  const apiUrl = evidence.data?.api_url ?? null;
  const passed = evidence.exists && evidence.data?.passed === true && (!requiredEvidence || evidence.data?.evidence === requiredEvidence) && (!apiUrl || isRealHttpsUrl(apiUrl));
  return {
    status: passed ? 'pass' : 'blocked',
    evidence: {
      path: path.replace(`${root}/`, ''),
      exists: evidence.exists,
      passed: evidence.data?.passed === true,
      api_url: apiUrl,
      api_https_url_real: apiUrl ? isRealHttpsUrl(apiUrl) : false,
      tested_at: evidence.data?.tested_at ?? null,
      placeholder_url_accepted_as_proof: false,
    },
  };
}

const stagingSmoke = stagingGate('staging_smoke', stagingEvidence.staging_smoke, 'real_https_staging_smoke_test');
const dockerSmoke = stagingGate('docker_smoke', stagingEvidence.docker_smoke, 'docker_compose_stage0_up_build_succeeded');
const restoreVerified = stagingGate('restore_verified', stagingEvidence.restore_verified, 'restore_verification_command_succeeded');

const gates = {
  mysql_tenant_isolation: {
    status: mysqlTenantIsolationPassed ? 'pass' : 'blocked',
    evidence: {
      path: 'release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json',
      exists: mysqlTenantIsolation.exists,
      env_flag_accepted_as_proof: false,
      tested_at: mysqlTenantIsolation.data?.tested_at ?? null,
    },
  },
  staging_smoke: stagingSmoke,
  docker_smoke: dockerSmoke,
  restore_verified: restoreVerified,
};

const blocked = Object.values(gates).filter((gate) => gate.status !== 'pass').length;
const passed = Object.values(gates).filter((gate) => gate.status === 'pass').length;
const report = {
  generated_at: new Date().toISOString(),
  gates,
  summary: { blocked, passed },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.summary.blocked > 0) process.exit(1);
