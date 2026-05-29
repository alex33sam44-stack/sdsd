#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
function run(command, args, options = {}) { const r = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options }); if (r.error) throw r.error; if (r.status !== 0) process.exit(r.status ?? 1); }
const stagingUrl = process.env.STAGING_URL || process.env.API || process.argv[2] || '';
if (!stagingUrl) { console.error('STAGING_URL is required, e.g. STAGING_URL=https://staging.yourdomain.tld npm run prove:enterprise'); process.exit(2); }
run(process.execPath, ['scripts/validate-real-url.mjs', stagingUrl, 'staging API URL']);
run('npm', ['--prefix', 'backend', 'run', 'test:tenant-isolation:mysql:docker'], { env: process.env });
run('npm', ['run', 'staging:smoke'], { env: { ...process.env, STAGING_URL: stagingUrl, API: stagingUrl } });
run('npm', ['run', 'verify:enterprise']);
