#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backendDir = resolve(process.cwd().endsWith('/backend') ? process.cwd() : `${process.cwd()}/backend`);
const rootDir = resolve(backendDir, '..');
const evidenceDir = resolve(rootDir, 'release-evidence/tenant-isolation');
const evidenceFile = resolve(evidenceDir, 'mysql-tenant-isolation-readiness.json');
const composeFile = resolve(backendDir, 'compose.mysql-isolation.yml');
const port = process.env.MYSQL_TENANT_ISOLATION_PORT || '33306';
const databaseUrl = process.env.DATABASE_URL || `mysql://tenant_isolation:tenant_isolation_password@127.0.0.1:${port}/mwasalat_tenant_isolation`;
const keep = process.env.KEEP_MYSQL_TENANT_ISOLATION === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: backendDir, stdio: 'inherit', shell: false, env: { ...process.env, DATABASE_URL: databaseUrl, MYSQL_TENANT_ISOLATION_PORT: port }, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
}
if (!existsSync(composeFile)) { console.error(`[mysql-isolation] missing compose file: ${composeFile}`); process.exit(1); }
if (spawnSync('docker', ['--version'], { stdio: 'ignore' }).status !== 0) { console.error('[mysql-isolation] docker is required. Run this on the VPS/CI runner with Docker.'); process.exit(1); }
try {
  console.log('[mysql-isolation] starting disposable MySQL 8.4');
  run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait']);
  console.log('[mysql-isolation] applying Prisma migrations');
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy']);
  console.log('[mysql-isolation] running real MySQL tenant isolation test');
  run(process.execPath, ['scripts/run-mysql-tenant-isolation.mjs']);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidenceFile, JSON.stringify({
    status: 'ready',
    passed: true,
    evidence: 'docker_backed_mysql_tenant_isolation_proof_succeeded',
    databaseUrlHost: '127.0.0.1',
    mysqlPort: port,
    testedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`[mysql-isolation] evidence written: ${evidenceFile}`);
  console.log('[mysql-isolation] proof complete');
} finally {
  if (!keep) spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], { cwd: backendDir, stdio: 'inherit', env: { ...process.env, MYSQL_TENANT_ISOLATION_PORT: port } });
}
