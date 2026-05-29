#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, '..');
const repoRoot = resolve(backendDir, '..');
const evidencePath = resolve(repoRoot, 'release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json');

function runTests() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['jest', '--runInBand', 'test/tenant-isolation.mysql.test.ts'],
      {
        cwd: backendDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          RUN_MYSQL_TENANT_ISOLATION: '1',
        },
      },
    );

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`MySQL tenant isolation test failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

await runTests();
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(
  evidencePath,
  JSON.stringify(
    {
      passed: true,
      tested_at: new Date().toISOString(),
      database: 'mysql',
      evidence: 'real_mysql_integration_test',
      env_flag_accepted_as_proof: false,
      test_file: 'backend/test/tenant-isolation.mysql.test.ts',
      assertions: [
        'Tenant B listAll returns zero rows for Tenant A station data',
        'Tenant B listPublished returns zero rows for Tenant A station data',
        'Tenant B cannot read Tenant A station details by id',
        'Tenant B line query returns zero rows for Tenant A line data',
      ],
    },
    null,
    2,
  ),
);
console.log(`Wrote ${evidencePath}`);
