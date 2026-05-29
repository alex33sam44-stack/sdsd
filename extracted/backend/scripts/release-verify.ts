import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const strict = process.env.RELEASE_VERIFY_STRICT === '1';
const backendUrl = (process.env.VERIFY_HTTP_BASE_URL ?? '').replace(/\/$/, '');
const requireEvidence = process.env.RELEASE_VERIFY_REQUIRE_EVIDENCE === '1';
const requireRemote = process.env.RELEASE_VERIFY_REMOTE === '1';

type CheckStatus = 'pass' | 'warn' | 'fail';
const checks: Array<{ id: string; status: CheckStatus; detail: unknown }> = [];

function add(id: string, status: CheckStatus, detail: unknown) {
  checks.push({ id, status, detail });
}

async function remoteCheck(path: string) {
  if (!backendUrl) {
    add(`remote:${path}`, strict && requireRemote ? 'fail' : 'warn', 'VERIFY_HTTP_BASE_URL not provided');
    return;
  }
  const normalized = backendUrl.endsWith('/api') ? `${backendUrl}${path}` : `${backendUrl}/api${path}`;
  try {
    const res = await fetch(normalized);
    const text = await res.text();
    add(`remote:${path}`, res.ok ? 'pass' : 'fail', `${res.status} ${text.slice(0, 300)}`);
  } catch (error) {
    add(`remote:${path}`, strict ? 'fail' : 'warn', String(error));
  }
}


function verifyMysqlTenantIsolationEvidence() {
  const evidencePath = resolve(process.cwd(), '../release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json');
  if (!existsSync(evidencePath)) {
    add('tenant-isolation:mysql:evidence', strict && requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence, env_flag_accepted_as_proof: false });
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const passed = evidence?.passed === true && evidence?.database === 'mysql' && evidence?.evidence === 'real_mysql_integration_test';
    add('tenant-isolation:mysql:evidence', passed ? 'pass' : 'fail', {
      exists: true,
      passed: evidence?.passed === true,
      database: evidence?.database ?? null,
      tested_at: evidence?.tested_at ?? null,
      env_flag_accepted_as_proof: false,
    });
  } catch (error) {
    add('tenant-isolation:mysql:evidence', 'fail', { exists: true, parse_error: String(error), env_flag_accepted_as_proof: false });
  }
}

async function main() {
  add('env:DATABASE_URL', process.env.DATABASE_URL ? 'pass' : strict ? 'fail' : 'warn', process.env.DATABASE_URL ? 'configured' : 'missing');
  const accessSecret = process.env.JWT_ACCESS_SECRET?.trim();
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
  add('env:JWT_ACCESS_SECRET', accessSecret && accessSecret !== 'dev-secret' && accessSecret.length >= 32 ? 'pass' : strict ? 'fail' : 'warn', accessSecret ? 'configured_non_dev_min_32' : 'missing');
  add('env:JWT_REFRESH_SECRET', refreshSecret && refreshSecret !== 'dev-secret' && refreshSecret.length >= 32 ? 'pass' : strict ? 'fail' : 'warn', refreshSecret ? 'configured_non_dev_min_32' : 'missing');
  add('env:APP_VERSION', process.env.APP_VERSION ? 'pass' : 'warn', process.env.APP_VERSION ?? 'missing');
  add('env:SENTRY_DSN', process.env.SENTRY_DSN ? 'pass' : 'warn', process.env.SENTRY_DSN ? 'configured' : 'missing');
  verifyMysqlTenantIsolationEvidence();

  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      add('db:connectivity', 'pass', 'SELECT 1 succeeded');

      const [tenants, memberships, stations, lines, routeStops, auditLogs, favorites] = await Promise.all([
        prisma.tenant.count(),
        prisma.tenantMembership.count(),
        prisma.station.count(),
        prisma.line.count(),
        prisma.routeStop.count(),
        prisma.auditLog.count(),
        prisma.favorite.count(),
      ]);
      add('db:counts', 'pass', { tenants, memberships, stations, lines, routeStops, auditLogs, favorites });
    } catch (error) {
      add('db:connectivity', strict ? 'fail' : 'warn', error instanceof Error ? error.message : String(error));
    }
  }

  await remoteCheck('/health');
  await remoteCheck('/stations');

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };

  const report = { timestamp: new Date().toISOString(), strict, backendUrl: backendUrl || null, checks, summary };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  if (strict && summary.fail > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
