#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/mwasalat}"
ENV_FILE="${ENV_FILE:-$APP_DIR/selfhost/.env.production}"
SCHEDULE="${BACKUP_CRON_SCHEDULE:-15 2 * * *}"
LOG_FILE="${BACKUP_CRON_LOG:-/var/log/mwasalat-mysql-backup.log}"
CRON_LINE="$SCHEDULE cd $APP_DIR && ENV_FILE=$ENV_FILE $APP_DIR/selfhost/scripts/mysql-backup.sh >> $LOG_FILE 2>&1"
MARKER="mwasalat-mysql-backup"
TMP="$(mktemp)"

crontab -l 2>/dev/null | grep -v "$MARKER" > "$TMP" || true
{
  cat "$TMP"
  printf '%s # %s\n' "$CRON_LINE" "$MARKER"
} | crontab -
rm -f "$TMP"
echo "Installed cron: $CRON_LINE # $MARKER"
