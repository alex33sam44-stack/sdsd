# External backup setup

Public launch must not use `/tmp`, the application disk, `/`, or Docker `overlay` as the backup target.
The project intentionally blocks launch until one real external target is configured and verified.

Choose exactly one option.

## Option A: rclone remote, recommended for S3/B2/object storage

1. Install and configure rclone on the VPS:

```bash
apt-get update
apt-get install -y rclone
rclone config
```

2. Run the project helper with a real remote and path:

```bash
BACKUP_RCLONE_REMOTE=your-remote:mwasalat/mysql \
APP_DOMAIN=app.mwasalat.com \
API_DOMAIN=api.mwasalat.com \
npm run setup:backup-rclone
```

The helper writes `BACKUP_RCLONE_REMOTE` to `selfhost/.env.production`, clears `BACKUP_REMOTE_DIR`, uploads and deletes a probe file, and then runs the backup/evidence/public-launch checks.

## Option B: mounted external disk/volume

Mount a real external volume on the VPS, then run:

```bash
BACKUP_REMOTE_DIR=/mnt/mwasalat-backups/mysql \
APP_DOMAIN=app.mwasalat.com \
API_DOMAIN=api.mwasalat.com \
npm run setup:backup-mount
```

If you already know the device path and it already has a filesystem, the helper can mount it and persist `/etc/fstab`:

```bash
BACKUP_DEVICE=/dev/disk/by-id/your-external-volume \
BACKUP_MOUNT_POINT=/mnt/mwasalat-backups \
BACKUP_REMOTE_DIR=/mnt/mwasalat-backups/mysql \
APP_DOMAIN=app.mwasalat.com \
API_DOMAIN=api.mwasalat.com \
npm run setup:backup-mount
```

The script refuses these unsafe states:

- `mount_target=/`
- `mount_fstype=overlay`
- backup device equals the application root device
- `BACKUP_REMOTE_DIR_REQUIRE_MOUNT=false`

## Final verification

After configuring one option, run:

```bash
npm run verify:backup-target
RELEASE_VERIFY_REQUIRE_EVIDENCE=1 npm run verify:evidence
npm run verify:public-launch
```

Only evidence generated on the actual VPS after the external target is configured should be accepted for launch.
