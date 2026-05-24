#!/usr/bin/env bash
set -Eeuo pipefail

# MySQL logical backup for the Mwasalat self-hosted Docker stack.
# Creates encrypted-friendly gzip dumps locally, prunes old local dumps,
# then optionally copies them to an external rclone remote or mounted directory.
#
# After every successful run this script writes a heartbeat JSON to
# release-evidence/backup/last-backup-heartbeat.json. The file is the only
# trustworthy signal that "a real backup just happened" — it carries the
# bytes, sha256, target kind, and timestamp. validate-backup-freshness.mjs
# later refuses a release if the heartbeat is older than the threshold,
# so a silently-failed cron cannot drift unnoticed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/selfhost/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/selfhost/backups/mysql}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
REMOTE_RETENTION_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-30}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
LOCK_FILE="${LOCK_FILE:-/tmp/mwasalat-mysql-backup.lock}"
REQUIRE_EXTERNAL_TARGET="${BACKUP_REQUIRE_EXTERNAL_TARGET:-true}"
VERIFY_TARGET_BEFORE_BACKUP="${BACKUP_VERIFY_TARGET_BEFORE_BACKUP:-true}"
HEARTBEAT_FILE="${BACKUP_HEARTBEAT_FILE:-$ROOT_DIR/release-evidence/backup/last-backup-heartbeat.json}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fatal() { log "ERROR: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fatal "env file not found: $ENV_FILE"
# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

REQUIRE_EXTERNAL_TARGET="${BACKUP_REQUIRE_EXTERNAL_TARGET:-$REQUIRE_EXTERNAL_TARGET}"
VERIFY_TARGET_BEFORE_BACKUP="${BACKUP_VERIFY_TARGET_BEFORE_BACKUP:-$VERIFY_TARGET_BEFORE_BACKUP}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-$REMOTE_DIR}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-$RCLONE_REMOTE}"

if [ "$REQUIRE_EXTERNAL_TARGET" = "true" ] && [ -z "$RCLONE_REMOTE" ] && [ -z "$REMOTE_DIR" ]; then
  fatal "external backup target required; set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR"
fi

if [ "$VERIFY_TARGET_BEFORE_BACKUP" = "true" ]; then
  "$ROOT_DIR/selfhost/scripts/verify-backup-target.sh"
fi

mkdir -p "$BACKUP_DIR"

if ! command -v docker >/dev/null 2>&1; then fatal "docker is required"; fi
if ! docker compose version >/dev/null 2>&1; then fatal "docker compose plugin is required"; fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  fatal "another backup is already running ($LOCK_FILE)"
fi

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR")}" 
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
OUT="$BACKUP_DIR/${PROJECT_NAME}_${MYSQL_DATABASE}_${STAMP}.sql.gz"
SHA="$OUT.sha256"

log "starting mysqldump for database '$MYSQL_DATABASE'"
# MYSQL_PWD avoids exposing the password as a mysqldump command argument.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e MYSQL_PWD="$MYSQL_PASSWORD" "$MYSQL_SERVICE" \
  mysqldump \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --default-character-set=utf8mb4 \
    -u "$MYSQL_USER" "$MYSQL_DATABASE" \
  | gzip -9 > "$OUT"

[ -s "$OUT" ] || fatal "backup file is empty: $OUT"
sha256sum "$OUT" > "$SHA"
log "local backup written: $OUT"
log "checksum written: $SHA"

find "$BACKUP_DIR" -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/[prune] /' || true

# Track for the heartbeat. If an external copy is configured, target_kind
# moves from 'local_only' to 'rclone' / 'mounted_directory' below.
TARGET_KIND="local_only"
TARGET_LOCATION=""

if [ -n "$RCLONE_REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then fatal "BACKUP_RCLONE_REMOTE is set but rclone is not installed"; fi
  log "copying backup to rclone remote: $RCLONE_REMOTE"
  rclone copy "$OUT" "$RCLONE_REMOTE" --checksum
  rclone copy "$SHA" "$RCLONE_REMOTE" --checksum
  if [ "$REMOTE_RETENTION_DAYS" -gt 0 ]; then
    rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include '*.sql.gz' --include '*.sql.gz.sha256' || true
  fi
  TARGET_KIND="rclone"
  TARGET_LOCATION="$RCLONE_REMOTE"
elif [ -n "$REMOTE_DIR" ]; then
  mkdir -p "$REMOTE_DIR"
  log "copying backup to external directory: $REMOTE_DIR"
  cp -p "$OUT" "$SHA" "$REMOTE_DIR/"
  find "$REMOTE_DIR" -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -mtime +"$REMOTE_RETENTION_DAYS" -print -delete | sed 's/^/[remote-prune] /' || true
  TARGET_KIND="mounted_directory"
  TARGET_LOCATION="$REMOTE_DIR"
else
  if [ "$REQUIRE_EXTERNAL_TARGET" = "true" ]; then
    fatal "external backup target required; set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR"
  fi
  log "no external backup target configured; set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR"
fi

# ─── Heartbeat ────────────────────────────────────────────────────────────────
# A successful run must leave a machine-readable trail so freshness gates can
# verify "the cron actually fires". We write to a temp file and rename to make
# the write atomic — a half-written heartbeat is worse than a stale one.
mkdir -p "$(dirname "$HEARTBEAT_FILE")"
HEARTBEAT_TMP="${HEARTBEAT_FILE}.tmp.$$"
BACKUP_BYTES="$(stat -c '%s' "$OUT" 2>/dev/null || stat -f '%z' "$OUT")"
BACKUP_SHA256="$(awk '{print $1}' "$SHA")"
COMPLETED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
cat > "$HEARTBEAT_TMP" <<JSON
{
  "completed_at": "$COMPLETED_AT",
  "database": "$MYSQL_DATABASE",
  "local_path": "$OUT",
  "bytes": $BACKUP_BYTES,
  "sha256": "$BACKUP_SHA256",
  "target_kind": "$TARGET_KIND",
  "target_location": "$TARGET_LOCATION",
  "external_target_configured": $([ "$TARGET_KIND" != "local_only" ] && echo true || echo false),
  "evidence": "mysql_backup_heartbeat",
  "schema_version": 1
}
JSON
mv "$HEARTBEAT_TMP" "$HEARTBEAT_FILE"
log "heartbeat written: $HEARTBEAT_FILE"

log "backup completed successfully"
