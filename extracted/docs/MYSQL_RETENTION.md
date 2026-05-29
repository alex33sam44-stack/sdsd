# MySQL Retention & Pruning Runbook

> Companion to `docs/MYSQL_BACKUP_RUNBOOK.md`. The backup runbook
> defines how we capture data; this runbook defines how we keep
> the live database compact enough to capture quickly.

## Why we prune

Several tables grow O(traffic) and never shrink without intervention:

| Table | Growth driver | Why we don't keep it forever |
|---|---|---|
| `audit_logs` | every state-changing API call | regulatory window is 180 days |
| `search_logs` | every search request | only useful for short-term ops analytics |
| `availability_logs` | every microbus availability flip | minute-by-minute rows lose value after 30 days |
| `refresh_tokens` | every login | revoked/expired rows are dead weight |
| `email_verification_tokens` | every signup / re-verification | one-shot, useless after consumption |
| `billing_webhook_events` | Stripe / Lemon webhooks | only need to keep them long enough for chargeback windows |
| `draft_changes` | each operator action | applied/rejected drafts are historical, not active |

Without pruning, our 90-day-old VPS hits multi-GB nightly backup
sizes that exceed the rclone mount window. With pruning, backups
stay under 250 MB on a typical pilot deployment.

## What we never prune

| Domain | Reasoning |
|---|---|
| `tenants`, `users`, `profiles` | Identity is permanent. |
| `cities`, `stations`, `lines`, `route_stops`, `station_layouts`, `layout_zones` | Catalog content; the product. |
| `favorites` | User-owned. |
| `tenant_*` (memberships / invites / settings / plan / billing_profile / subscription) | Source of truth for billing. |
| `translations`, `translation_cache`, `i18n_overrides` | Cheap to keep, expensive to lose. |
| `intercity_routes`, `intercity_schedules` | Catalog content. |
| `email_verification_tokens` that are still valid | Active users may have sent the link. |

## Default windows

Configured via env vars (overridable per environment):

| Env var | Default (days) | Table |
|---|---|---|
| `AUDIT_RETENTION_DAYS` | 180 | `audit_logs` |
| `SEARCH_RETENTION_DAYS` | 90 | `search_logs` |
| `AVAILABILITY_RETENTION_DAYS` | 30 | `availability_logs` |
| `AUTH_RETENTION_DAYS` | 14 | `refresh_tokens` (only revoked or expired) |
| `EMAIL_TOKEN_RETENTION_DAYS` | 7 | `email_verification_tokens` (only consumed or expired) |
| `BILLING_EVENT_RETENTION_DAYS` | 90 | `billing_webhook_events` (only `status='processed'`) |
| `DRAFT_RETENTION_DAYS` | 60 | `draft_changes` (only `applied` or `rejected`) |

## Running

### One-shot, dry-run (recommended first run)

```bash
DATABASE_URL=mysql://app:****@127.0.0.1:3306/mwasalat \
  node backend/scripts/db-prune.mjs --dry-run
```

Output (sample):

```
OK audit_logs                  retention=180d candidate=412   WOULD delete=0
OK search_logs                 retention=90d  candidate=1843  WOULD delete=0
OK availability_logs           retention=30d  candidate=58234 WOULD delete=0
OK refresh_tokens              retention=14d  candidate=23    WOULD delete=0
OK email_verification_tokens   retention=7d   candidate=4     WOULD delete=0
OK billing_webhook_events      retention=90d  candidate=0     WOULD delete=0
OK draft_changes               retention=60d  candidate=12    WOULD delete=0
```

### Live run

```bash
DATABASE_URL=mysql://... node backend/scripts/db-prune.mjs --json
```

### Single table (helpful while testing window changes)

```bash
DATABASE_URL=mysql://... node backend/scripts/db-prune.mjs --table=availability_logs
```

## Cron installation (VPS)

Drop the bundled cron file in place:

```bash
sudo cp selfhost/cron/db-prune.cron /etc/cron.d/mwasalat-db-prune
sudo systemctl reload cron
```

Or use the bundled installer (which also installs the backup cron):

```bash
sudo bash selfhost/scripts/install-backup-cron.sh
```

The cron runs nightly at **03:15**, fifteen minutes after the
mysqldump backup so the daily snapshot still includes all rows.

## Verifying after pruning

```bash
# 1. row counts compact?
mysql -h127.0.0.1 -uapp -p mwasalat -e "
  SELECT 'audit_logs', COUNT(*) FROM audit_logs
  UNION ALL SELECT 'search_logs', COUNT(*) FROM search_logs
  UNION ALL SELECT 'availability_logs', COUNT(*) FROM availability_logs;"

# 2. no domain rows leaked?
mysql -h127.0.0.1 -uapp -p mwasalat -e "
  SELECT 'stations', COUNT(*) FROM stations
  UNION ALL SELECT 'lines', COUNT(*) FROM lines
  UNION ALL SELECT 'route_stops', COUNT(*) FROM route_stops;"

# 3. data quality gate still green?
node backend/scripts/verify-data-quality.mjs --min=85 --band=green
```

## Disaster recovery

If a prune deleted something it shouldn't have, the most recent
nightly mysqldump is the recovery target. Follow
`docs/MYSQL_BACKUP_RUNBOOK.md` → "Restore from latest snapshot".
The pruned tables are operational so the only loss is observability
data older than the backup horizon — never user-facing content.

## Tuning windows

Reasons to **shorten** a window:

- Backups exceed rclone upload window (`mysqldump | gzip` > 500 MB).
- Aggregate query latency on the pruned table degrades.

Reasons to **lengthen** a window:

- Compliance requirement (e.g. payment chargeback dispute = 120 d).
- Active investigation needs the older rows.

Update the env vars in `selfhost/.env.production`, redeploy the
backend container, and the next nightly cron picks up the change.

## Manual emergency runs

```bash
# Drop everything older than 7 days everywhere, in batches of 5000.
DATABASE_URL=mysql://... AUDIT_RETENTION_DAYS=7 SEARCH_RETENTION_DAYS=7 \
  AVAILABILITY_RETENTION_DAYS=7 AUTH_RETENTION_DAYS=7 \
  EMAIL_TOKEN_RETENTION_DAYS=7 BILLING_EVENT_RETENTION_DAYS=7 \
  DRAFT_RETENTION_DAYS=7 \
  node backend/scripts/db-prune.mjs --batch=5000 --json
```

Always pair an emergency run with a fresh manual mysqldump first:

```bash
bash selfhost/scripts/mysql-backup.sh
```
