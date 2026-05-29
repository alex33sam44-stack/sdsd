#!/usr/bin/env node
/**
 * verify-restore
 * --------------------------------------------------------------
 * Backup-restore drill: restores the latest mysqldump snapshot
 * into a temporary database, verifies row-count parity for the
 * core tables, then drops the temporary database.
 *
 * Designed to run monthly (selfhost/cron/backup-drill.cron) so we
 * have evidence the snapshot is restorable BEFORE we ever need it.
 *
 *   node backend/scripts/verify-restore.mjs --json
 *
 * Flags:
 *   --backup-dir=PATH   override default $BACKUP_REMOTE_DIR
 *   --keep              do NOT drop the temporary DB after the drill
 *   --json              machine-readable output
 *
 * Exit codes: 0 verified, 1 mismatch / restore failed,
 *             2 transport / configuration error.
 *
 * Required env (read from selfhost/.env.production via cron):
 *   MYSQL_ROOT_PASSWORD  used to create + drop the verify_* DB
 *   MYSQL_USER           same user used by the live app
 *   MYSQL_PASSWORD       same password as the live app
 *   MYSQL_HOST           defaults to 127.0.0.1
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const wantJson = !!args.json;
const keep = !!args.keep;
const backupDir = args['backup-dir'] ?? process.env.BACKUP_REMOTE_DIR ?? '/mnt/mwasalat-backups';
const sourceDb = process.env.MYSQL_DATABASE ?? 'mwasalat';
const host = process.env.MYSQL_HOST ?? '127.0.0.1';
const port = process.env.MYSQL_PORT ?? '3306';
const adminUser = process.env.MYSQL_USER ?? 'app';
const adminPass = process.env.MYSQL_PASSWORD;

const CORE_TABLES = ['tenants', 'users', 'stations', 'lines', 'route_stops', 'cities'];

async function main() {
  if (!adminPass) {
    fail('MYSQL_PASSWORD is required (read from selfhost/.env.production).');
    process.exit(2);
  }

  const snapshot = pickLatestSnapshot(backupDir);
  if (!snapshot) {
    fail(`No .sql.gz snapshot found in ${backupDir}.`);
    process.exit(2);
  }

  const verifyDb = `verify_${Date.now()}`;
  const summary = {
    backupDir,
    snapshot: snapshot.path,
    snapshotBytes: snapshot.size,
    snapshotMtime: snapshot.mtime,
    verifyDb,
    sourceCounts: {},
    restoredCounts: {},
    matched: 0,
    mismatched: 0,
    durationMs: 0,
  };
  const start = Date.now();

  try {
    summary.sourceCounts = await tableCounts(sourceDb);
    await runMysql(`CREATE DATABASE \`${verifyDb}\` CHARACTER SET utf8mb4`);
    await restore(snapshot.path, verifyDb);
    summary.restoredCounts = await tableCounts(verifyDb);
    for (const t of CORE_TABLES) {
      if ((summary.sourceCounts[t] ?? 0) === (summary.restoredCounts[t] ?? 0)) {
        summary.matched += 1;
      } else {
        summary.mismatched += 1;
      }
    }
  } catch (err) {
    fail(`drill failed: ${err.message}`);
    if (!keep) await runMysql(`DROP DATABASE IF EXISTS \`${verifyDb}\``).catch(() => undefined);
    process.exit(1);
  } finally {
    summary.durationMs = Date.now() - start;
    if (!keep) {
      await runMysql(`DROP DATABASE IF EXISTS \`${verifyDb}\``).catch(() => undefined);
    }
  }

  const ok = summary.mismatched === 0 && summary.matched > 0;
  const out = { ok, ...summary };
  if (wantJson) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else
    process.stdout.write(
      `${ok ? 'OK ' : '!! '}restore drill: matched=${summary.matched} mismatched=${summary.mismatched} ` +
        `snapshot=${snapshot.path} duration=${summary.durationMs}ms\n`,
    );
  process.exit(ok ? 0 : 1);
}

function pickLatestSnapshot(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const sql = entries.filter((n) => n.endsWith('.sql.gz')).map((n) => {
    const full = resolve(dir, n);
    const s = statSync(full);
    return { path: full, size: s.size, mtime: s.mtime.toISOString() };
  });
  sql.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return sql[0] ?? null;
}

async function tableCounts(db) {
  const out = {};
  for (const t of CORE_TABLES) {
    try {
      const result = await runMysql(`SELECT COUNT(*) AS c FROM \`${t}\``, db);
      const match = result.match(/^\s*(\d+)\s*$/m);
      out[t] = match ? Number(match[1]) : 0;
    } catch {
      out[t] = 0;
    }
  }
  return out;
}

function runMysql(sql, db) {
  return new Promise((res, rej) => {
    const args = ['-h', host, '-P', port, '-u', adminUser, `-p${adminPass}`, '-N', '-B', '-e', sql];
    if (db) args.unshift(db);
    const child = spawn('mysql', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', rej);
    child.on('close', (code) => {
      if (code === 0) res(stdout);
      else rej(new Error(stderr.trim() || `mysql exit ${code}`));
    });
  });
}

function restore(snapshotPath, db) {
  return new Promise((res, rej) => {
    const gunzip = spawn('gunzip', ['-c', snapshotPath]);
    const mysql = spawn('mysql', ['-h', host, '-P', port, '-u', adminUser, `-p${adminPass}`, db], {
      stdio: ['pipe', 'inherit', 'pipe'],
    });
    gunzip.stdout.pipe(mysql.stdin);
    let stderr = '';
    mysql.stderr.on('data', (d) => (stderr += d.toString()));
    mysql.on('close', (code) => {
      if (code === 0) res();
      else rej(new Error(stderr.trim() || `restore exit ${code}`));
    });
  });
}

function parseArgs(list) {
  const out = {};
  for (const a of list) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

function fail(msg) {
  if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  else process.stderr.write(`!! verify-restore: ${msg}\n`);
}

main();
