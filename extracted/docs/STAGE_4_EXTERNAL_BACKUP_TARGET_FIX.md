# Stage 4 — External Backup Target Hardening

This stage converts the external backup target from a documentation-only requirement into a release gate.

## What changed

Added:

- `selfhost/scripts/verify-backup-target.sh`
- `release-evidence/backup/external-backup-target-readiness.json`
- `npm run verify:backup-target`

Updated:

- `selfhost/scripts/mysql-backup.sh`
- `selfhost/scripts/collect-vps-release-evidence.sh`
- `scripts/validate-production-config.mjs`
- `scripts/validate-release-evidence.mjs`
- `scripts/release-verify.mjs`
- `selfhost/.env.production`
- `.env.production.example`

## Public launch rule

Before public launch, configure exactly one real external target:

```env
BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql
BACKUP_REMOTE_DIR=
```

or use a mounted external disk:

```env
BACKUP_RCLONE_REMOTE=
BACKUP_REMOTE_DIR=/mnt/backups/mwasalat-mysql
BACKUP_REMOTE_DIR_REQUIRE_MOUNT=true
```

When `BACKUP_REMOTE_DIR_REQUIRE_MOUNT=true`, the verifier rejects a directory that resolves to the VPS root filesystem or the same filesystem as the application root.

## VPS verification commands

```bash
npm run verify:backup-target
npm run verify:production-config
```

The backup verifier writes:

```text
release-evidence/backup/external-backup-target-readiness.json
```

The release verifier now treats that evidence as required for strict public launch verification.

## Backup execution behavior

`selfhost/scripts/mysql-backup.sh` now defaults to:

```env
BACKUP_REQUIRE_EXTERNAL_TARGET=true
BACKUP_VERIFY_TARGET_BEFORE_BACKUP=true
BACKUP_TARGET_VERIFY_WRITE=true
```

This means production backups fail fast instead of silently succeeding with only local backups.

For local development only, these can be overridden:

```env
BACKUP_REQUIRE_EXTERNAL_TARGET=false
BACKUP_VERIFY_TARGET_BEFORE_BACKUP=false
```
