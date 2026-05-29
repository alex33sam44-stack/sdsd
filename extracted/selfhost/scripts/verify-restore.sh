#!/usr/bin/env sh
set -eu
if [ -z "${RESTORE_DATABASE_URL:-}" ]; then echo "RESTORE_DATABASE_URL is required for restore verification" >&2; exit 2; fi
case "$RESTORE_DATABASE_URL" in mysql://*) ;; *) echo "RESTORE_DATABASE_URL must be a mysql:// URL" >&2; exit 2;; esac
SQL="${RESTORE_VERIFY_SQL:-SELECT COUNT(*) FROM tenants; SELECT COUNT(*) FROM stations;}"
IMAGE="${MYSQL_CLIENT_IMAGE:-mysql:8.4}"
if command -v mysql >/dev/null 2>&1; then printf '%s\n' "$SQL" | mysql "$RESTORE_DATABASE_URL" >/dev/null
elif command -v docker >/dev/null 2>&1; then printf '%s\n' "$SQL" | docker run --rm -i "$IMAGE" mysql "$RESTORE_DATABASE_URL" >/dev/null
else echo "restore verification requires mysql client or docker" >&2; exit 2; fi
echo "[restore] verified restored database with real MySQL query"
