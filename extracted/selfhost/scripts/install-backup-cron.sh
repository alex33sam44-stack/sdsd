#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/mwasalat}"
ENV_FILE="${ENV_FILE:-$APP_DIR/selfhost/.env.production}"
SCHEDULE="${BACKUP_CRON_SCHEDULE:-15 2 * * *}"
LOG_FILE="${BACKUP_CRON_LOG:-/var/log/mwasalat-mysql-backup.log}"
PRUNE_SCHEDULE="${PRUNE_CRON_SCHEDULE:-15 3 * * *}"
PRUNE_LOG_FILE="${PRUNE_CRON_LOG:-/var/log/mwasalat-db-prune.log}"
CRON_LINE="$SCHEDULE cd $APP_DIR && ENV_FILE=$ENV_FILE $APP_DIR/selfhost/scripts/mysql-backup.sh >> $LOG_FILE 2>&1"
PRUNE_LINE="$PRUNE_SCHEDULE cd $APP_DIR/backend && /usr/bin/env -S bash -lc 'set -a; source $ENV_FILE; set +a; node scripts/db-prune.mjs --json' >> $PRUNE_LOG_FILE 2>&1"
MARKER="mwasalat-mysql-backup"
PRUNE_MARKER="mwasalat-db-prune"
TMP="$(mktemp)"

crontab -l 2>/dev/null | grep -v "$MARKER" | grep -v "$PRUNE_MARKER" > "$TMP" || true
{
  cat "$TMP"
  printf '%s # %s\n' "$CRON_LINE" "$MARKER"
  printf '%s # %s\n' "$PRUNE_LINE" "$PRUNE_MARKER"
} | crontab -
rm -f "$TMP"
echo "Installed cron: $CRON_LINE # $MARKER"
echo "Installed cron: $PRUNE_LINE # $PRUNE_MARKER"
