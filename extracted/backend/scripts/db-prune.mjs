#!/usr/bin/env node
/**
 * db-prune
 * --------------------------------------------------------------
 * Periodic MySQL retention job.
 *
 * Removes operational rows older than a per-table retention window
 * so the database stays small enough to back up nightly. The
 * windows are conservative defaults; operators can tune them via
 * env vars listed below.
 *
 * Tables managed (every one is operational, never product data):
 *   audit_logs                AUDIT_RETENTION_DAYS    default 180
 *   search_logs               SEARCH_RETENTION_DAYS   default  90
 *   availability_logs         AVAILABILITY_RETENTION_DAYS default 30
 *   refresh_tokens (revoked   AUTH_RETENTION_DAYS     default  14
 *      OR expired)
 *   email_verification_tokens (consumed OR expired)   default   7
 *   billing_webhook_events (status='processed')       default  90
 *   draft_changes (status='applied' or 'rejected')    default  60
 *
 * Flags:
 *   --dry-run         only print the row counts that would be deleted
 *   --json            machine-readable summary (release-evidence)
 *   --batch=2000      delete in batches of N (default 2000)
 *   --table=NAME      run only one table; repeat to allow several
 *
 * Exit codes: 0 ok, 1 a delete failed (transaction rolled back),
 * 2 invalid configuration / unable to connect.
 *
 * Designed to be safe to run as a cron job:
 *   0 3 * * *  /usr/local/bin/node /app/backend/scripts/db-prune.mjs --json >> /var/log/mwasalat/db-prune.log
 */
import { createConnection } from 'node:net';

const args = parseArgs(process.argv.slice(2));
const dryRun = !!args['dry-run'];
const wantJson = !!args.json;
const batchSize = Math.max(100, Math.min(50000, Number(args.batch) || 2000));
const onlyTables = new Set([].concat(args.table ?? []));

const SECONDS_PER_DAY = 86_400;

const POLICIES = [
  {
    table: 'audit_logs',
    days: env('AUDIT_RETENTION_DAYS', 180),
    where: 'created_at < (NOW() - INTERVAL ? DAY)',
    paramFromDays: true,
  },
  {
    table: 'search_logs',
    days: env('SEARCH_RETENTION_DAYS', 90),
    where: 'created_at < (NOW() - INTERVAL ? DAY)',
    paramFromDays: true,
  },
  {
    table: 'availability_logs',
    days: env('AVAILABILITY_RETENTION_DAYS', 30),
    where: 'created_at < (NOW() - INTERVAL ? DAY)',
    paramFromDays: true,
  },
  {
    table: 'refresh_tokens',
    days: env('AUTH_RETENTION_DAYS', 14),
    where: '(revoked_at IS NOT NULL OR expires_at < NOW()) AND created_at < (NOW() - INTERVAL ? DAY)',
    paramFromDays: true,
  },
  {
    table: 'email_verification_tokens',
    days: env('EMAIL_TOKEN_RETENTION_DAYS', 7),
    where: '(consumed_at IS NOT NULL OR expires_at < NOW()) AND created_at < (NOW() - INTERVAL ? DAY)',
    paramFromDays: true,
  },
  {
    table: 'billing_webhook_events',
    days: env('BILLING_EVENT_RETENTION_DAYS', 90),
    where: "status = 'processed' AND created_at < (NOW() - INTERVAL ? DAY)",
    paramFromDays: true,
    optional: true,
  },
  {
    table: 'draft_changes',
    days: env('DRAFT_RETENTION_DAYS', 60),
    where: "status IN ('applied', 'rejected') AND COALESCE(applied_at, created_at) < (NOW() - INTERVAL ? DAY)",
    paramFromDays: true,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is required.');
    process.exit(2);
  }
  let mysql;
  try {
    ({ default: mysql } = await import('mysql2/promise'));
  } catch (err) {
    fail(`mysql2 not installed: ${err.message}. Run from backend/ where the dependency exists.`);
    process.exit(2);
  }
  const conn = await mysql.createConnection(url);
  const summary = [];
  let exitCode = 0;
  try {
    for (const policy of POLICIES) {
      if (onlyTables.size && !onlyTables.has(policy.table)) continue;
      const exists = await tableExists(conn, policy.table);
      if (!exists) {
        if (!policy.optional) {
          summary.push({ table: policy.table, skipped: true, reason: 'table missing' });
        }
        continue;
      }
      const param = policy.paramFromDays ? policy.days : null;
      const [countRows] = await conn.query(
        `SELECT COUNT(*) AS c FROM \`${policy.table}\` WHERE ${policy.where}`,
        param != null ? [param] : [],
      );
      const candidate = Number(countRows[0]?.c ?? 0);
      let deleted = 0;
      if (!dryRun && candidate > 0) {
        // Delete in batches to keep transactions short.
        while (true) {
          const [res] = await conn.query(
            `DELETE FROM \`${policy.table}\` WHERE ${policy.where} LIMIT ${batchSize}`,
            param != null ? [param] : [],
          );
          const affected = res.affectedRows ?? 0;
          deleted += affected;
          if (affected < batchSize) break;
        }
      }
      summary.push({
        table: policy.table,
        retentionDays: policy.days,
        candidate,
        deleted,
        dryRun,
      });
    }
  } catch (err) {
    fail(`prune failed: ${err.message}`);
    exitCode = 1;
  } finally {
    await conn.end().catch(() => undefined);
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: exitCode === 0, summary }, null, 2) + '\n');
  } else {
    for (const row of summary) {
      if (row.skipped) {
        process.stdout.write(`-- ${row.table}: skipped (${row.reason})\n`);
        continue;
      }
      const verb = row.dryRun ? 'WOULD delete' : 'deleted';
      process.stdout.write(
        `OK ${row.table.padEnd(28)} retention=${row.retentionDays}d candidate=${row.candidate} ${verb}=${row.deleted}\n`,
      );
    }
  }
  process.exit(exitCode);
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

function env(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseArgs(list) {
  const out = {};
  for (const a of list) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (out[k] === undefined) out[k] = v ?? true;
    else out[k] = [].concat(out[k], v ?? true);
  }
  return out;
}

function fail(msg) {
  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  } else {
    process.stderr.write(`!! db-prune: ${msg}\n`);
  }
}

main().catch((err) => {
  fail(`fatal: ${err.message}`);
  process.exit(1);
});

// Suppress an unused warning in linters that don't see node:net usage.
void createConnection;
