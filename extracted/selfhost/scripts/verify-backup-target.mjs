#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const envFile = process.env.ENV_FILE || path.join(root, 'selfhost/.env.production');
const evidenceDir = process.env.EVIDENCE_DIR || path.join(root, 'release-evidence/backup');
const evidenceFile = path.join(evidenceDir, 'external-backup-target-readiness.json');

function parseEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) throw new Error(`env file not found: ${file}`);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function commandExists(cmd) {
  try { execFileSync('command', ['-v', cmd], { shell: true, stdio: 'ignore' }); return true; } catch { return false; }
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

function dfDevice(target) {
  const lines = run('df', ['-P', target]).split(/\n/);
  return lines.at(-1).trim().split(/\s+/)[0];
}

function writeEvidence(passed, status, method, reason, detail = {}) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(evidenceFile, JSON.stringify({
    checked_at: now,
    tested_at: now,
    passed,
    status,
    evidence: 'external_backup_target_verification',
    method,
    reason,
    detail,
    env_file: envFile,
    accepted_as_public_launch_evidence: passed,
  }, null, 2) + '\n');
}

function fail(method, reason, detail = {}) {
  writeEvidence(false, 'failed', method, reason, detail);
  console.error(`ERROR: ${reason}`);
  console.error(`Wrote ${evidenceFile}`);
  process.exit(1);
}

function pass(method, reason, detail = {}) {
  writeEvidence(true, 'passed', method, reason, detail);
  console.log('Backup target readiness: passed');
  console.log(`Wrote ${evidenceFile}`);
}

let env;
try { env = parseEnv(envFile); } catch (error) { fail('env', error.message); }

const remote = env.BACKUP_RCLONE_REMOTE || process.env.BACKUP_RCLONE_REMOTE || '';
const remoteDir = env.BACKUP_REMOTE_DIR || process.env.BACKUP_REMOTE_DIR || '';
const verifyWrite = String(env.BACKUP_TARGET_VERIFY_WRITE ?? process.env.BACKUP_TARGET_VERIFY_WRITE ?? 'true').toLowerCase() !== 'false';
const requireMount = String(env.BACKUP_REMOTE_DIR_REQUIRE_MOUNT ?? process.env.BACKUP_REMOTE_DIR_REQUIRE_MOUNT ?? 'true').toLowerCase() !== 'false';

if (remote) {
  if (!commandExists('rclone')) fail('rclone', 'BACKUP_RCLONE_REMOTE is set but rclone is not installed', { remote });
  if (verifyWrite) {
    const tmp = path.join(os.tmpdir(), `mwasalat-backup-target-${Date.now()}-${process.pid}.txt`);
    const name = `backup-target-verify-${Date.now()}-${process.pid}.txt`;
    fs.writeFileSync(tmp, `mwasalat backup target verification ${new Date().toISOString()}\n`);
    try {
      execFileSync('rclone', ['copyto', tmp, `${remote}/${name}`, '--checksum'], { stdio: 'ignore' });
      try { execFileSync('rclone', ['deletefile', `${remote}/${name}`], { stdio: 'ignore' }); } catch {}
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch {}
      fail('rclone', 'rclone write verification failed', { remote, error: error.message });
    }
    try { fs.unlinkSync(tmp); } catch {}
  }
  pass('rclone', 'rclone remote is configured and writable', { remote, write_test: verifyWrite });
  process.exit(0);
}

if (!remoteDir) fail('none', 'set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR before public launch');
if (!path.isAbsolute(remoteDir)) fail('mounted_directory', 'BACKUP_REMOTE_DIR must be an absolute path', { remote_dir: remoteDir });

try { fs.mkdirSync(remoteDir, { recursive: true }); } catch (error) { fail('mounted_directory', `cannot create BACKUP_REMOTE_DIR: ${remoteDir}`, { error: error.message }); }
try { fs.accessSync(remoteDir, fs.constants.W_OK); } catch { fail('mounted_directory', `BACKUP_REMOTE_DIR is not writable: ${remoteDir}`, { remote_dir: remoteDir }); }

let mountTarget = '';
let mountSource = '';
let mountFstype = '';
if (commandExists('findmnt')) {
  try {
    const info = run('findmnt', ['-T', remoteDir, '-n', '-o', 'TARGET,SOURCE,FSTYPE']);
    const parts = info.split(/\s+/);
    mountTarget = parts[0] || '';
    mountSource = parts[1] || '';
    mountFstype = parts[2] || '';
  } catch {}
}

let rootDevice = '';
let remoteDevice = '';
try {
  rootDevice = dfDevice(root);
  remoteDevice = dfDevice(remoteDir);
} catch (error) {
  fail('mounted_directory', 'failed to inspect backup filesystem with df', { remote_dir: remoteDir, error: error.message });
}

if (requireMount) {
  if (!mountTarget) fail('mounted_directory', 'could not verify mount target for BACKUP_REMOTE_DIR', { remote_dir: remoteDir });
  if (mountTarget === '/') fail('mounted_directory', 'BACKUP_REMOTE_DIR resolves to root filesystem, not an external mount', { remote_dir: remoteDir, mount_target: mountTarget, mount_fstype: mountFstype, remote_device: remoteDevice });
  if (mountFstype === 'overlay') fail('mounted_directory', 'BACKUP_REMOTE_DIR resolves to Docker/root overlay filesystem, not an external backup mount', { remote_dir: remoteDir, mount_target: mountTarget, mount_fstype: mountFstype, root_device: rootDevice, remote_device: remoteDevice });
  if (rootDevice === remoteDevice) fail('mounted_directory', 'BACKUP_REMOTE_DIR is on the same device as the application root', { remote_dir: remoteDir, root_device: rootDevice, remote_device: remoteDevice, mount_target: mountTarget, mount_fstype: mountFstype });
}

if (verifyWrite) {
  const verifyFile = path.join(remoteDir, `backup-target-verify-${Date.now()}-${process.pid}.txt`);
  try {
    fs.writeFileSync(verifyFile, `mwasalat backup target verification ${new Date().toISOString()}\n`);
    if (fs.statSync(verifyFile).size === 0) throw new Error('verification file is empty');
    fs.unlinkSync(verifyFile);
  } catch (error) {
    fail('mounted_directory', 'write verification failed for BACKUP_REMOTE_DIR', { remote_dir: remoteDir, error: error.message });
  }
}

pass('mounted_directory', 'mounted backup directory is configured and writable', {
  remote_dir: remoteDir,
  mount_target: mountTarget,
  mount_source: mountSource,
  mount_fstype: mountFstype,
  root_device: rootDevice,
  remote_device: remoteDevice,
  write_test: verifyWrite,
});
