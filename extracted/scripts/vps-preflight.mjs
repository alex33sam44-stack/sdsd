#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const root = process.cwd();
const outDir = path.join(root, 'release-evidence', 'vps-preflight');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const latestPath = path.join(outDir, 'vps-preflight-latest.json');
const timestampPath = path.join(outDir, `vps-preflight-${stamp}.json`);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
loadEnvFile(path.join(root, 'selfhost', '.env.production'));
const env = process.env;
const realVps = env.VPS_PREFLIGHT_REAL === '1';
const strict = env.VPS_PREFLIGHT_STRICT === '1' || realVps;
const allowPortsInUse = env.ALLOW_PORTS_IN_USE === '1';
const skipNetwork = env.SKIP_NETWORK_PREFLIGHT !== '0' && !realVps;
const skipDocker = env.SKIP_DOCKER_PREFLIGHT !== '0' && !realVps;

const minDiskMb = Number(env.MIN_FREE_DISK_MB || 2048);
const minMemMb = Number(env.MIN_MEMORY_MB || 1024);
const checks = [];
function add(name, status, detail, extra = {}) { checks.push({ name, status, detail, ...extra }); }
function fail(name, detail, extra) { add(name, 'failed', detail, extra); }
function pass(name, detail, extra) { add(name, 'passed', detail, extra); }
function warn(name, detail, extra) { add(name, 'warning', detail, extra); }
function run(cmd, args = [], opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 20000, env: process.env });
  return { ok: res.status === 0, status: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), error: res.error ? String(res.error.message || res.error) : null };
}
function hasCmd(cmd) { const res = run('bash', ['-lc', `command -v ${cmd}`]); return res.ok ? res.stdout.split('\n')[0] : ''; }
function cleanHost(value) { return String(value || '').trim().replace(/^https?:\/\//, '').split('/')[0]; }
function validateDomainVar(name) {
  const value = env[name] || ''; const host = cleanHost(value);
  if (!value) return fail(`env:${name}`, `${name} is required`);
  if (value !== host) return fail(`env:${name}`, `${name} must be hostname only, without scheme or path`);
  if (/localhost|\.local$|example\.com|your-domain|yourdomain/i.test(host)) return fail(`env:${name}`, `${name} still looks like a placeholder: ${host}`);
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes('.')) return fail(`env:${name}`, `${name} is not a valid public hostname: ${host}`);
  pass(`env:${name}`, `${name}=${host}`);
}
async function checkDns(host, name = `dns:${host}`) {
  try { const records = await dns.lookup(host, { all: true }); records.length ? pass(name, `resolved ${host}`, { addresses: records.map(r => r.address) }) : fail(name, `no DNS records for ${host}`); }
  catch (err) { fail(name, `DNS lookup failed for ${host}: ${err.code || err.message}`); }
}
async function checkPort(port) {
  await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', err => { add(`port:${port}`, allowPortsInUse ? 'warning' : 'failed', `cannot bind port ${port}: ${err.code || err.message}`); resolve(); });
    server.once('listening', () => server.close(() => { pass(`port:${port}`, `port ${port} is available for Caddy`); resolve(); }));
    server.listen(port, '0.0.0.0');
  });
}
async function main() {
  validateDomainVar('APP_DOMAIN'); validateDomainVar('API_DOMAIN');
  if (env.APP_DOMAIN && env.API_DOMAIN && env.APP_DOMAIN === env.API_DOMAIN) fail('env:domains-distinct', 'APP_DOMAIN and API_DOMAIN must be different hostnames');
  else if (env.APP_DOMAIN && env.API_DOMAIN) pass('env:domains-distinct', 'APP_DOMAIN and API_DOMAIN are distinct');
  if (!env.BACKUP_RCLONE_REMOTE && !env.BACKUP_REMOTE_DIR) fail('env:backup-target', 'Set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR before first run');
  else if (env.BACKUP_RCLONE_REMOTE) pass('env:backup-target', `BACKUP_RCLONE_REMOTE=${env.BACKUP_RCLONE_REMOTE}`);
  else pass('env:backup-target', `BACKUP_REMOTE_DIR=${env.BACKUP_REMOTE_DIR}`);
  for (const cmd of ['bash','node','npm','curl','openssl','tar','gzip']) { const found = hasCmd(cmd); found ? pass(`cmd:${cmd}`, found) : fail(`cmd:${cmd}`, `${cmd} is required`); }
  if (!skipDocker) { const found = hasCmd('docker'); found ? pass('cmd:docker', found) : fail('cmd:docker', 'docker is required'); } else warn('cmd:docker', 'SKIP_DOCKER_PREFLIGHT set/default local mode; docker checks skipped');
  if (env.BACKUP_RCLONE_REMOTE) { const rclone = hasCmd('rclone'); rclone ? pass('cmd:rclone', rclone) : fail('cmd:rclone', 'rclone is required when BACKUP_RCLONE_REMOTE is set'); }
  const nodeVersion = run('node', ['--version']);
  if (nodeVersion.ok) { const major = Number(nodeVersion.stdout.replace(/^v/,'').split('.')[0]); major >= 20 ? pass('runtime:node-version', nodeVersion.stdout) : fail('runtime:node-version', `Node 20+ required/recommended; found ${nodeVersion.stdout}`); }
  if (!skipDocker) {
    const dockerVersion = run('docker', ['--version']); dockerVersion.ok ? pass('docker:client', dockerVersion.stdout) : fail('docker:client', dockerVersion.error || dockerVersion.stderr || 'docker client unavailable');
    const composeVersion = run('docker', ['compose', 'version']); composeVersion.ok ? pass('docker:compose-v2', composeVersion.stdout) : fail('docker:compose-v2', composeVersion.error || composeVersion.stderr || 'Docker Compose v2 unavailable');
    const dockerInfo = run('docker', ['info'], { timeout: 30000 }); dockerInfo.ok ? pass('docker:daemon', 'Docker daemon reachable') : fail('docker:daemon', dockerInfo.error || dockerInfo.stderr || 'Docker daemon is not reachable');
  } else warn('docker:skipped', 'Docker checks skipped in local/offline verification mode; set VPS_PREFLIGHT_REAL=1 on the VPS');
  const df = run('df', ['-Pk', '.']);
  if (df.ok) { const parts = (df.stdout.split('\n')[1] || '').trim().split(/\s+/); const availMb = Math.floor(Number(parts[3] || 0) / 1024); availMb >= minDiskMb ? pass('system:disk-free', `${availMb} MB available`, { minDiskMb }) : fail('system:disk-free', `only ${availMb} MB available; require at least ${minDiskMb} MB`, { minDiskMb }); } else warn('system:disk-free', df.stderr || 'df unavailable');
  const memMb = Math.floor(os.totalmem()/1024/1024); memMb >= minMemMb ? pass('system:memory', `${memMb} MB total`, { minMemMb }) : warn('system:memory', `${memMb} MB total; recommended at least ${minMemMb} MB`, { minMemMb });
  await checkPort(80); await checkPort(443);
  if (!skipNetwork) {
    await checkDns('registry.npmjs.org'); await checkDns('github.com'); await checkDns('hub.docker.com');
    if (env.APP_DOMAIN) await checkDns(cleanHost(env.APP_DOMAIN), 'dns:APP_DOMAIN');
    if (env.API_DOMAIN) await checkDns(cleanHost(env.API_DOMAIN), 'dns:API_DOMAIN');
    const npmPing = run('npm', ['ping', '--registry=https://registry.npmjs.org/'], { timeout: 30000 }); npmPing.ok ? pass('network:npm-registry', npmPing.stdout || 'npm ping passed') : fail('network:npm-registry', npmPing.stderr || npmPing.error || 'npm registry ping failed');
    const github = run('curl', ['-fsSI', 'https://github.com'], { timeout: 30000 }); github.ok ? pass('network:github-https', 'github.com reachable over HTTPS') : fail('network:github-https', github.stderr || github.error || 'github.com HTTPS check failed');
  } else warn('network:skipped', 'SKIP_NETWORK_PREFLIGHT=1 set; network checks skipped');
  fs.existsSync(path.join(root,'docker-compose.yml')) ? pass('file:docker-compose', 'docker-compose.yml exists') : fail('file:docker-compose', 'docker-compose.yml missing');
  fs.existsSync(path.join(root,'selfhost','.env.production')) ? pass('file:selfhost-env', 'selfhost/.env.production exists') : fail('file:selfhost-env', 'selfhost/.env.production missing');
  const failed = checks.filter(c => c.status === 'failed'); const warnings = checks.filter(c => c.status === 'warning');
  const report = { checkedAt:new Date().toISOString(), status: failed.length ? 'failed' : 'passed', strict, publicLaunchPreflightReady: failed.length === 0, failureCount: failed.length, warningCount: warnings.length, checks, notes:[ 'Run this on the real VPS before vps:first-run. It checks server prerequisites only; runtime release evidence is still required after deployment.', 'Use ALLOW_PORTS_IN_USE=1 only when Caddy or another reverse proxy is intentionally already bound to ports 80/443.', 'Use SKIP_NETWORK_PREFLIGHT=1 only for offline dry runs, not for public launch approval.' ] };
  fs.writeFileSync(timestampPath, `${JSON.stringify(report,null,2)}\n`); fs.writeFileSync(latestPath, `${JSON.stringify(report,null,2)}\n`); console.log(JSON.stringify(report,null,2));
  if (strict && failed.length) process.exit(1);
}
main().catch(err => { const report = { checkedAt:new Date().toISOString(), status:'failed', publicLaunchPreflightReady:false, fatal:err.stack || String(err) }; fs.writeFileSync(latestPath, `${JSON.stringify(report,null,2)}\n`); console.error(JSON.stringify(report,null,2)); process.exit(1); });
