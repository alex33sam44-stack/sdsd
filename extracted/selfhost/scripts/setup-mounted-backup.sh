#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT_DIR/selfhost/.env.production}"
MOUNT_POINT="${BACKUP_MOUNT_POINT:-/mnt/mwasalat-backups}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-$MOUNT_POINT/mysql}"
DEVICE="${BACKUP_DEVICE:-}"
APP_DOMAIN="${APP_DOMAIN:-app.mwasalat.com}"
API_DOMAIN="${API_DOMAIN:-api.mwasalat.com}"

usage() {
  cat <<'USAGE'
Usage, already-mounted external volume:
  BACKUP_REMOTE_DIR=/mnt/mwasalat-backups/mysql \
  APP_DOMAIN=app.example.com API_DOMAIN=api.example.com \
  ./selfhost/scripts/setup-mounted-backup.sh

Usage, mount a real block device and persist it in /etc/fstab:
  BACKUP_DEVICE=/dev/disk/by-id/your-external-volume \
  BACKUP_MOUNT_POINT=/mnt/mwasalat-backups \
  BACKUP_REMOTE_DIR=/mnt/mwasalat-backups/mysql \
  APP_DOMAIN=app.example.com API_DOMAIN=api.example.com \
  ./selfhost/scripts/setup-mounted-backup.sh

Safety:
  - The script refuses root/overlay filesystems.
  - It does NOT format disks automatically.
  - If the device has no filesystem, create one yourself after verifying the device:
      mkfs.ext4 /dev/disk/by-id/your-external-volume
USAGE
}

fail() { echo "FAIL: $*" >&2; exit 1; }
[ -f "$ENV_FILE" ] || fail "Missing env file: $ENV_FILE"
[ "${REMOTE_DIR#/}" != "$REMOTE_DIR" ] || { usage; fail "BACKUP_REMOTE_DIR must be absolute"; }

if [ -n "$DEVICE" ]; then
  [ -b "$DEVICE" ] || fail "BACKUP_DEVICE is not a block device: $DEVICE"
  mkdir -p "$MOUNT_POINT"
  if ! findmnt -T "$MOUNT_POINT" >/dev/null 2>&1 || [ "$(findmnt -T "$MOUNT_POINT" -n -o TARGET || true)" = "/" ]; then
    mount "$DEVICE" "$MOUNT_POINT"
  fi
  uuid="$(blkid -s UUID -o value "$DEVICE" || true)"
  fstype="$(findmnt -T "$MOUNT_POINT" -n -o FSTYPE || true)"
  [ -n "$uuid" ] || fail "Could not read UUID for $DEVICE"
  [ -n "$fstype" ] || fail "Could not read filesystem type for $MOUNT_POINT"
  if ! grep -q "UUID=$uuid" /etc/fstab; then
    printf 'UUID=%s %s %s defaults,nofail 0 2\n' "$uuid" "$MOUNT_POINT" "$fstype" >> /etc/fstab
  fi
fi

mkdir -p "$REMOTE_DIR"
mount_target="$(findmnt -T "$REMOTE_DIR" -n -o TARGET || true)"
mount_fstype="$(findmnt -T "$REMOTE_DIR" -n -o FSTYPE || true)"
root_device="$(df -P "$ROOT_DIR" | awk 'END{print $1}')"
remote_device="$(df -P "$REMOTE_DIR" | awk 'END{print $1}')"

[ -n "$mount_target" ] || fail "Could not inspect mount target for $REMOTE_DIR"
[ "$mount_target" != "/" ] || fail "Backup target resolves to root filesystem: $REMOTE_DIR"
[ "$mount_fstype" != "overlay" ] || fail "Backup target resolves to overlay filesystem: $REMOTE_DIR"
[ "$root_device" != "$remote_device" ] || fail "Backup target is on the same device as the app root: $REMOTE_DIR"

python3 - "$ENV_FILE" "$REMOTE_DIR" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
remote_dir = sys.argv[2]
updates = {
    'BACKUP_REMOTE_DIR': remote_dir,
    'BACKUP_RCLONE_REMOTE': '',
    'BACKUP_REMOTE_DIR_REQUIRE_MOUNT': 'true',
}
lines = path.read_text().splitlines()
seen = set()
out = []
for line in lines:
    if '=' in line and not line.lstrip().startswith('#'):
        key = line.split('=', 1)[0]
        if key in updates:
            out.append(f'{key}={updates[key]}')
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f'{key}={value}')
path.write_text('\n'.join(out) + '\n')
PY

APP_DOMAIN="$APP_DOMAIN" API_DOMAIN="$API_DOMAIN" BACKUP_REMOTE_DIR="$REMOTE_DIR" \
  "$ROOT_DIR/selfhost/scripts/configure-production-env.sh"

cd "$ROOT_DIR"
npm run verify:backup-target
RELEASE_VERIFY_REQUIRE_EVIDENCE=1 npm run verify:evidence
npm run verify:public-launch

echo "External backup is configured through mounted directory: $REMOTE_DIR"
