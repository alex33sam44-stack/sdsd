# MySQL backup runbook

This project includes a production-ready `mysqldump` backup flow for the self-hosted Docker stack.

## Files

- `selfhost/scripts/mysql-backup.sh` — creates a compressed MySQL dump using the running `mysql` Docker service.
- `selfhost/scripts/install-backup-cron.sh` — installs the daily cron job.
- `selfhost/cron/mysqldump.cron` — copy/paste cron entry for manual installation.
- `selfhost/scripts/verify-restore.sh` — verifies a restored database with a real MySQL query.

## What the backup does

The script:

1. Loads `selfhost/.env.production`.
2. Runs `mysqldump` inside the Docker MySQL service.
3. Uses `--single-transaction`, `--quick`, routines, triggers, and events.
4. Compresses the dump as `.sql.gz`.
5. Writes a `.sha256` checksum.
6. Prunes old local backups.
7. Copies the dump to either:
   - `BACKUP_RCLONE_REMOTE`, such as an S3/B2/Wasabi/rclone target, or
   - `BACKUP_REMOTE_DIR`, such as a mounted external disk or backup volume.
8. Re-verifies the off-site copy (per-run, not just at deploy time):
   - `BACKUP_REMOTE_DIR` must resolve to a different filesystem device than
     both the application root and the local staging dir; root and Docker
     overlay are refused outright.
   - For `BACKUP_REMOTE_DIR` the off-site `sha256` is recomputed and
     compared with the local checksum after `cp`.
   - For `BACKUP_RCLONE_REMOTE` the script runs `rclone check` so a silent
     remote corruption does not get accepted.
9. If the off-site step is skipped or fails, the run exits non-zero and
   keeps the local dump in place so the operator can retry. To disable this
   guard for purely local development, set `BACKUP_REQUIRE_OFFSITE_COPY=false`.

## Runtime safety knobs

| Env var | Default | Purpose |
| --- | --- | --- |
| `BACKUP_REQUIRE_EXTERNAL_TARGET` | `true` | Refuses to start when neither off-site target is configured. |
| `BACKUP_REQUIRE_OFFSITE_COPY` | inherits `BACKUP_REQUIRE_EXTERNAL_TARGET` | Refuses to *finish* if the off-site copy step did not run successfully. |
| `BACKUP_VERIFY_TARGET_BEFORE_BACKUP` | `true` | Runs `verify-backup-target` before dumping. |
| `BACKUP_VERIFY_OFFSITE_AFTER_COPY` | `true` | Re-verifies the off-site copy after it lands. |
| `BACKUP_REMOTE_DIR_REQUIRE_MOUNT` | `true` | Requires `BACKUP_REMOTE_DIR` to be a real mount, not `/` or overlay. |

## Production setup

On the VPS, deploy the project under `/opt/mwasalat`, then run:

```bash
cd /opt/mwasalat
chmod +x selfhost/scripts/mysql-backup.sh selfhost/scripts/install-backup-cron.sh
```

Edit `selfhost/.env.production` and set one external target.

### Option A — mounted external directory

```env
BACKUP_REMOTE_DIR=/mnt/backups/mwasalat-mysql
BACKUP_RCLONE_REMOTE=
```

Then ensure the directory exists and is on external storage:

```bash
sudo mkdir -p /mnt/backups/mwasalat-mysql
sudo chown -R "$USER:$USER" /mnt/backups/mwasalat-mysql
```

### Option B — rclone remote, recommended for off-site backups

Install and configure rclone:

```bash
sudo apt-get update
sudo apt-get install -y rclone
rclone config
```

Example `.env.production` values:

```env
BACKUP_REMOTE_DIR=
BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql
```

## Test one backup manually

```bash
cd /opt/mwasalat
ENV_FILE=/opt/mwasalat/selfhost/.env.production ./selfhost/scripts/mysql-backup.sh
```

Expected output includes:

```text
backup completed successfully
```

Confirm files exist:

```bash
ls -lh selfhost/backups/mysql
```

## Install the daily cron job

Default schedule: every day at 02:15 server time.

```bash
cd /opt/mwasalat
APP_DIR=/opt/mwasalat ./selfhost/scripts/install-backup-cron.sh
crontab -l | grep mwasalat-mysql-backup
```

Logs:

```bash
tail -f /var/log/mwasalat-mysql-backup.log
```

## Restore test procedure

Copy a dump to a safe test database, then import:

```bash
gunzip -c backup.sql.gz | mysql "mysql://user:password@host:3306/test_database"
```

Then verify:

```bash
RESTORE_DATABASE_URL="mysql://user:password@host:3306/test_database" \
  ./selfhost/scripts/verify-restore.sh
```

## Security notes

- Do not commit real `.env.production` values.
- Keep the backup target private.
- Prefer encrypted object storage or an encrypted disk for external backups.
- Test restoration monthly; untested backups are not reliable backups.
