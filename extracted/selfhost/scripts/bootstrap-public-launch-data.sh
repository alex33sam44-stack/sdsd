#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ADMIN_EMAIL=${ADMIN_EMAIL:-"mosm97829@gmail.com"}
ADMIN_DISPLAY_NAME=${ADMIN_DISPLAY_NAME:-"mah mos"}
ADMIN_BOOTSTRAP_PASSWORD=${ADMIN_BOOTSTRAP_PASSWORD:-}
ADMIN_BOOTSTRAP_PASSWORD_HASH=${ADMIN_BOOTSTRAP_PASSWORD_HASH:-}

cd "$ROOT_DIR"

echo "[bootstrap] applying initial stations/lines/stops seeds"
./selfhost/scripts/seed-initial-data.sh

echo "[bootstrap] verifying initial public data"
./selfhost/scripts/verify-initial-data.sh

echo "[bootstrap] ensuring platform_admin account and role for $ADMIN_EMAIL"
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" ADMIN_BOOTSTRAP_PASSWORD="$ADMIN_BOOTSTRAP_PASSWORD" ADMIN_BOOTSTRAP_PASSWORD_HASH="$ADMIN_BOOTSTRAP_PASSWORD_HASH" ./selfhost/scripts/grant-platform-admin.sh

echo "[bootstrap] public launch data bootstrap complete"
