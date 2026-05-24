#!/usr/bin/env node
/**
 * End-to-end backup round-trip verification.
 *
 * Target reachability (verify-backup-target) only proves a 1-byte test file
 * can be written. This script proves the full path:
 *
 *   1. Pull the latest dump from the external target back onto local disk.
 *   2. Recompute its sha256 and match against the .sha256 sidecar that the
 *      backup script wrote at dump time. Any mid-transit corruption fails
 *      here.
 *   3. Decompress + restore into a *throwaway* MySQL container (docker run
 *      --rm), so a corrupted dump or schema regression is caught NOW, not
 *      during a real disaster.
 *   4. Run a smoke query to confirm at least one expected table exists.
 *
 * Writes release-evidence/backup/backup-roundtrip-readiness.json with the
 * full verification chain so reviewers can audit each step.
 *
 * The script is **read-only against production**: it pulls a copy of the
 * dump, restores into an isolated container, and tears the container down.
 * It never touches the production database.
 *
 * Required:
 *   docker (for the throwaway MySQL container)
 *   rclone (only if BACKUP_RCLONE_REMOTE is set)
 *   gzip + sha256sum
 *
 * Env (read from selfhost/.env.production by default):
 *   BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR  the same target the backup writes to
 *   MYSQL_DATABASE                             database name to restore into the throwaway container
 *   BACKUP_ROUNDTRIP_SMOKE_QUERY               override smoke query (default: SHOW TABLES)
 *   BACKUP_ROUNDTRIP_MYSQL_IMAGE               override MySQL image (default: mysql:8.0)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const envFile = process.env.ENV_FILE || join(root, 'selfhost/.env.production');
const evidenceFile = process.env.BACKUP_ROUNDTRIP_EVIDENCE_FILE
  || join(root, 'release-evidence/backup/backup-roundtrip-readiness.json');
const mysqlImage = process.env.BACKUP_ROUNDTRIP_MYSQL_IMAGE || 'mysql:8.0';
const smokeQuery = process.env.BACKUP_ROUNDTRIP_SMOKE_QUERY || 'SHOW TABLES';

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function commandExists(cmd) {
  const r = spawnSync('command', ['-v', cmd], { shell: true, stdio: 'ignore' });
  return r.status === 0;
}

function writeEvidence(payload) {
  mkdirSync(dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, JSON.stringify(payload, null, 2) + '\n');
}

function fail(step, reason, detail = {}) {
  writeEvidence({
    checked_at: new Date().toISOString(),
    evidence: 'backup_roundtrip',
    schema_version: 1,
    passed: false,
    status: 'failed',
    failed_at_step: step,
    reason,
    detail,
    accepted_as_public_launch_evidence: false,
  });
  console.error(`Round-trip FAILED at step "${step}": ${reason}`);
  console.error(`See ${evidenceFile}`);
  process.exit(2);
}

function pass(detail) {
  writeEvidence({
    checked_at: new Date().toISOString(),
    evidence: 'backup_roundtrip',
    schema_version: 1,
    passed: true,
    status: 'passed',
    detail,
    accepted_as_public_launch_evidence: true,
  });
  console.log('Backup round-trip verification PASSED');
  console.log(`Wrote ${evidenceFile}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = parseEnv(envFile);
  const remote = env.BACKUP_RCLONE_REMOTE || process.env.BACKUP_RCLONE_REMOTE || '';
  const remoteDir = env.BACKUP_REMOTE_DIR || process.env.BACKUP_REMOTE_DIR || '';
  const dbName = env.MYSQL_DATABASE || process.env.MYSQL_DATABASE;
  if (!dbName) fail('config', 'MYSQL_DATABASE is required to verify the restored schema');
  if (!remote && !remoteDir) fail('config', 'set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR before verifying round-trip');
  if (!commandExists('docker')) fail('prereq', 'docker is required for the throwaway restore container');
  if (!commandExists('gzip')) fail('prereq', 'gzip is required to decompress the dump');
  if (!commandExists('sha256sum')) fail('prereq', 'sha256sum is required to verify the checksum sidecar');
  if (remote && !commandExists('rclone')) fail('prereq', 'BACKUP_RCLONE_REMOTE is set but rclone is not installed');

  const stagingDir = join(tmpdir(), `mwasalat-roundtrip-${Date.now()}-${process.pid}`);
  mkdirSync(stagingDir, { recursive: true });

  let dumpPath;
  let shaPath;
  let source;
  let containerName = '';
  let containerStarted = false;
  try {
    if (remote) {
      source = { kind: 'rclone', location: remote };
      let json;
      try {
        json = JSON.parse(execFileSync('rclone', ['lsjson', remote, '--include', '*.sql.gz'], { encoding: 'utf8' }));
      } catch (error) {
        fail('list_remote', 'rclone lsjson failed', { error: error.message });
      }
      if (!Array.isArray(json) || json.length === 0) fail('list_remote', `no *.sql.gz at ${remote}`);
      // Pick the newest dump by ModTime — that is the one the most recent
      // cron run produced and the only one we can match a heartbeat against.
      json.sort((a, b) => Date.parse(b.ModTime) - Date.parse(a.ModTime));
      const newest = json[0];
      dumpPath = join(stagingDir, newest.Name);
      shaPath = `${dumpPath}.sha256`;
      try {
        execFileSync('rclone', ['copyto', `${remote}/${newest.Name}`, dumpPath], { stdio: 'inherit' });
        execFileSync('rclone', ['copyto', `${remote}/${newest.Name}.sha256`, shaPath], { stdio: 'inherit' });
      } catch (error) {
        fail('pull', `rclone copyto failed for ${newest.Name}`, { error: error.message });
      }
    } else {
      source = { kind: 'mounted_directory', location: remoteDir };
      if (!existsSync(remoteDir)) fail('list_remote', `BACKUP_REMOTE_DIR does not exist: ${remoteDir}`);
      const candidates = readdirSync(remoteDir)
        .filter((f) => f.endsWith('.sql.gz'))
        .map((f) => ({ name: f, full: join(remoteDir, f), mtime: statSync(join(remoteDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (candidates.length === 0) fail('list_remote', `no *.sql.gz at ${remoteDir}`);
      const newest = candidates[0];
      dumpPath = join(stagingDir, newest.name);
      shaPath = `${dumpPath}.sha256`;
      copyFileSync(newest.full, dumpPath);
      if (existsSync(`${newest.full}.sha256`)) copyFileSync(`${newest.full}.sha256`, shaPath);
      else fail('pull', `missing checksum sidecar for ${newest.name}`);
    }

    // Verify checksum: any mid-transit corruption shows up here, BEFORE we
    // bother spinning up a MySQL container.
    const expected = readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0];
    const actual = createHash('sha256').update(readFileSync(dumpPath)).digest('hex');
    if (expected !== actual) {
      fail('checksum', 'sha256 mismatch — dump corrupted in transit or at rest', {
        expected,
        actual,
        dump: dumpPath,
      });
    }

    const bytes = statSync(dumpPath).size;
    if (bytes < 1024) fail('checksum', `dump suspiciously small (${bytes} bytes) — likely truncated`);

    containerName = `mwasalat-roundtrip-${Date.now()}-${process.pid}`;
    const tempPwd = `roundtrip-${process.pid}-${Date.now().toString(36)}`;
    execFileSync('docker', [
      'run', '-d', '--rm',
      '--name', containerName,
      '-e', `MYSQL_ROOT_PASSWORD=${tempPwd}`,
      '-e', `MYSQL_DATABASE=${dbName}`,
      '--health-cmd', 'mysqladmin ping -uroot -p$MYSQL_ROOT_PASSWORD',
      '--health-interval=2s',
      '--health-retries=30',
      mysqlImage,
    ], { stdio: 'ignore' });
    containerStarted = true;

    let healthy = false;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const r = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim() === 'healthy') { healthy = true; break; }
      await sleep(1000);
    }
    if (!healthy) fail('docker_start', 'throwaway MySQL container did not become healthy in 90s');

    const restore = spawnSync('bash', [
      '-c',
      `gunzip -c "${dumpPath}" | docker exec -i -e MYSQL_PWD="${tempPwd}" ${containerName} mysql -uroot ${dbName}`,
    ], { stdio: 'inherit' });
    if (restore.status !== 0) fail('restore', `mysql restore exited with code ${restore.status}`);

    const probe = spawnSync('docker', [
      'exec', '-e', `MYSQL_PWD=${tempPwd}`, containerName,
      'mysql', '-uroot', '-N', '-B', dbName, '-e', smokeQuery,
    ], { encoding: 'utf8' });
    if (probe.status !== 0) fail('smoke_query', `smoke query exited with code ${probe.status}`, { stderr: probe.stderr });
    const tablesLine = probe.stdout.trim();
    if (!tablesLine) fail('smoke_query', 'restored database returned no tables — schema not preserved');

    pass({
      source,
      dump_name: dumpPath.split('/').pop(),
      bytes,
      sha256: actual,
      smoke_query: smokeQuery,
      smoke_output_first_line: tablesLine.split(/\r?\n/)[0],
      mysql_image: mysqlImage,
    });
  } finally {
    if (containerStarted && containerName) {
      try { execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' }); } catch {}
    }
    try {
      for (const name of readdirSync(stagingDir)) {
        try { unlinkSync(join(stagingDir, name)); } catch {}
      }
    } catch {}
  }
}

main().catch((error) => {
  // The fail() helper exits the process; if we reach here it is an
  // uncaught defect, not a verification failure. Surface it loudly.
  console.error('UNEXPECTED ERROR in verify-backup-roundtrip:');
  console.error(error?.stack ?? error);
  process.exit(1);
});
