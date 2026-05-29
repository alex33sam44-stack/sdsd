# Backup evidence status

This packaged archive intentionally does not contain passing backup evidence, because the external backup target must be verified on the real VPS.

Passing public-launch evidence is accepted only when one of these is true:

1. `BACKUP_RCLONE_REMOTE` points to a configured and writable rclone remote; or
2. `BACKUP_REMOTE_DIR` points to a separate mounted filesystem with `BACKUP_REMOTE_DIR_REQUIRE_MOUNT=true`.

Rejected states include:

- `/tmp` backup paths
- `BACKUP_REMOTE_DIR_REQUIRE_MOUNT=false`
- `mount_target=/`
- `mount_fstype=overlay`
- backup target on the same device as the app root

Use one of:

```bash
npm run setup:backup-rclone
npm run setup:backup-mount
```

Then verify:

```bash
npm run verify:backup-target
RELEASE_VERIFY_REQUIRE_EVIDENCE=1 npm run verify:evidence
npm run verify:public-launch
```
