#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const url = process.env.API || process.env.STAGING_URL || process.argv[2] || '';
const envFile = process.env.STAGING_ENV_FILE || 'selfhost/.env.staging';
const composeFile = process.env.STAGING_COMPOSE_FILE || 'selfhost/compose.stage0.yml';
const evidenceDir = resolve(root, 'release-evidence/staging');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['scripts/validate-real-url.mjs', url, 'staging API URL']);
run('docker', ['--version']);
run('docker', ['compose', '-f', composeFile, '--env-file', envFile, 'up', '-d', '--build']);
run('sh', ['selfhost/scripts/smoke-test.sh', url], { env: { ...process.env, API: url } });

const now = new Date().toISOString();
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(resolve(evidenceDir, 'staging-smoke-readiness.json'), JSON.stringify({
  passed: true,
  evidence: 'real_https_staging_smoke_test',
  api_url: url,
  tested_at: now,
}, null, 2));
writeFileSync(resolve(evidenceDir, 'docker-smoke-readiness.json'), JSON.stringify({
  passed: true,
  evidence: 'docker_compose_stage0_up_build_succeeded',
  compose_file: composeFile,
  env_file: envFile,
  tested_at: now,
}, null, 2));

if (process.env.RESTORE_VERIFY_COMMAND) {
  run('sh', ['-lc', process.env.RESTORE_VERIFY_COMMAND]);
  writeFileSync(resolve(evidenceDir, 'restore-verified.json'), JSON.stringify({
    passed: true,
    evidence: 'restore_verification_command_succeeded',
    tested_at: new Date().toISOString(),
  }, null, 2));
} else {
  console.error('[staging] RESTORE_VERIFY_COMMAND is required to produce restore-verified.json');
  process.exit(1);
}
console.log('[staging] evidence written to release-evidence/staging');
