#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT_DIR/selfhost/.env.production}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"
APP_DOMAIN="${APP_DOMAIN:-app.mwasalat.com}"
API_DOMAIN="${API_DOMAIN:-api.mwasalat.com}"

usage() {
  cat <<'USAGE'
Usage:
  BACKUP_RCLONE_REMOTE=remote-name:path/to/mysql \
  APP_DOMAIN=app.example.com API_DOMAIN=api.example.com \
  ./selfhost/scripts/setup-rclone-backup.sh

This script does not create rclone credentials. Configure rclone first with one of:
  rclone config
  rclone config create ...
  copy a vetted rclone.conf to ~/.config/rclone/rclone.conf

It then:
  1. verifies rclone exists and the remote is writable
  2. writes BACKUP_RCLONE_REMOTE into selfhost/.env.production
  3. clears BACKUP_REMOTE_DIR so backups use rclone, not the root filesystem
  4. runs backup/public-launch evidence checks
USAGE
}

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -n "$REMOTE" ] || { usage; fail "BACKUP_RCLONE_REMOTE is required"; }
command -v rclone >/dev/null 2>&1 || fail "rclone is not installed. Install it, then run: rclone config"
[ -f "$ENV_FILE" ] || fail "Missing env file: $ENV_FILE"

probe="mwasalat-backup-probe-$(date -u +%Y%m%dT%H%M%SZ)-$$.txt"
tmp="$(mktemp)"
printf 'mwasalat rclone backup verification %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
trap 'rm -f "$tmp"' EXIT

rclone copyto "$tmp" "${REMOTE%/}/$probe" --checksum
rclone deletefile "${REMOTE%/}/$probe"

python3 - "$ENV_FILE" "$REMOTE" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
remote = sys.argv[2]
updates = {
    'BACKUP_RCLONE_REMOTE': remote,
    'BACKUP_REMOTE_DIR': '',
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

APP_DOMAIN="$APP_DOMAIN" API_DOMAIN="$API_DOMAIN" BACKUP_RCLONE_REMOTE="$REMOTE" \
  "$ROOT_DIR/selfhost/scripts/configure-production-env.sh"

cd "$ROOT_DIR"
npm run verify:backup-target
RELEASE_VERIFY_REQUIRE_EVIDENCE=1 npm run verify:evidence
npm run verify:public-launch

echo "External backup is configured through rclone: $REMOTE"
