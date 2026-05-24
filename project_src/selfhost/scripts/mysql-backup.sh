#!/usr/bin/env bash
set -Eeuo pipefail

# MySQL logical backup for the Mwasalat self-hosted Docker stack.
#
# Two modes:
#
#   1) Default: creates a local gzip dump under BACKUP_DIR, then copies it
#      to BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR. Local copies are
#      retained per BACKUP_RETENTION_DAYS for fast on-box restore.
#
#   2) BACKUP_STREAM_DIRECT=true: streams mysqldump → gzip → rclone rcat
#      directly to the remote, with no intermediate file on local disk.
#      Required for hosts where the system disk is too small to hold a
#      full uncompressed dump (the failure mode where the cron silently
#      truncates because /tmp / /var fills up). Only valid with
#      BACKUP_RCLONE_REMOTE.
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
STREAM_DIRECT="${BACKUP_STREAM_DIRECT:-false}"

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
STREAM_DIRECT="${BACKUP_STREAM_DIRECT:-$STREAM_DIRECT}"

if [ "$REQUIRE_EXTERNAL_TARGET" = "true" ] && [ -z "$RCLONE_REMOTE" ] && [ -z "$REMOTE_DIR" ]; then
  fatal "external backup target required; set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR"
fi

# Streaming mode requires rclone (the local-disk-free path is the whole
# point of streaming). REMOTE_DIR cp is fast enough that streaming there
# would only add complexity without reducing disk usage.
if [ "$STREAM_DIRECT" = "true" ]; then
  if [ -z "$RCLONE_REMOTE" ]; then
    fatal "BACKUP_STREAM_DIRECT=true requires BACKUP_RCLONE_REMOTE (no local intermediate file)"
  fi
  if ! command -v rclone >/dev/null 2>&1; then
    fatal "BACKUP_STREAM_DIRECT=true requires rclone in PATH"
  fi
  if ! command -v node >/dev/null 2>&1; then
    fatal "BACKUP_STREAM_DIRECT=true requires node (for stream-backup-checksum.mjs)"
  fi
fi

if [ "$VERIFY_TARGET_BEFORE_BACKUP" = "true" ]; then
  "$ROOT_DIR/selfhost/scripts/verify-backup-target.sh"
fi

if ! command -v docker >/dev/null 2>&1; then fatal "docker is required"; fi
if ! docker compose version >/dev/null 2>&1; then fatal "docker compose plugin is required"; fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  fatal "another backup is already running ($LOCK_FILE)"
fi

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR")}" 
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
REMOTE_NAME="${PROJECT_NAME}_${MYSQL_DATABASE}_${STAMP}.sql.gz"

# Initialised by whichever branch runs (streaming or write-then-copy) so
# the heartbeat block at the end can be branch-agnostic.
BACKUP_BYTES=""
BACKUP_SHA256=""
LOCAL_PATH=""
TARGET_KIND="local_only"
TARGET_LOCATION=""

if [ "$STREAM_DIRECT" = "true" ]; then
  # Streaming path: dump → gzip → checksum probe → rclone rcat. No file on
  # local disk, no /tmp pressure, no risk of truncation when the system
  # disk fills. The bytes/sha256 of the uploaded blob are computed by the
  # node helper as data flows through; we read them out of the temp files
  # the helper wrote on EOF.
  TMP_SHA="$(mktemp)"
  TMP_SIZE="$(mktemp)"
  trap 'rm -f "$TMP_SHA" "$TMP_SIZE"' EXIT INT TERM

  log "streaming mysqldump → gzip → rclone rcat to $RCLONE_REMOTE/$REMOTE_NAME"
  log "(BACKUP_STREAM_DIRECT=true: no local intermediate file)"

  # set -o pipefail (set above) ensures any failure in the pipe — mysqldump,
  # gzip, the checksum probe, or rclone — aborts the script with a non-zero
  # exit. Without pipefail, a silent rclone failure would still leave a
  # "successful" log line.
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
    | gzip -9 \
    | node "$ROOT_DIR/selfhost/scripts/stream-backup-checksum.mjs" \
        --hash-out "$TMP_SHA" --bytes-out "$TMP_SIZE" \
    | rclone rcat "$RCLONE_REMOTE/$REMOTE_NAME"

  BACKUP_BYTES="$(cat "$TMP_SIZE" | tr -d '[:space:]')"
  BACKUP_SHA256="$(cat "$TMP_SHA" | tr -d '[:space:]')"
  rm -f "$TMP_SHA" "$TMP_SIZE"

  if [ -z "$BACKUP_BYTES" ] || [ "$BACKUP_BYTES" = "0" ]; then
    fatal "streamed backup produced 0 bytes — refusing to record success"
  fi

  # Upload sha256 sidecar matching the conventional `sha256sum <name>`
  # format so verify-backup-roundtrip.mjs can match against it.
  printf '%s  %s\n' "$BACKUP_SHA256" "$REMOTE_NAME" \
    | rclone rcat "$RCLONE_REMOTE/$REMOTE_NAME.sha256"

  # Best-effort remote retention prune.
  if [ "$REMOTE_RETENTION_DAYS" -gt 0 ]; then
    rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include '*.sql.gz' --include '*.sql.gz.sha256' || true
  fi

  TARGET_KIND="rclone_streaming"
  TARGET_LOCATION="$RCLONE_REMOTE"
  log "streamed backup completed: $BACKUP_BYTES bytes, sha256=$BACKUP_SHA256"
else
  # Traditional path: write the gzip dump to BACKUP_DIR, sha256 it, prune
  # old local copies, then push to the remote. This keeps a fast on-box
  # restore copy at the cost of needing enough free disk for one dump.
  mkdir -p "$BACKUP_DIR"
  OUT="$BACKUP_DIR/$REMOTE_NAME"
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

  LOCAL_PATH="$OUT"
  BACKUP_BYTES="$(stat -c '%s' "$OUT" 2>/dev/null || stat -f '%z' "$OUT")"
  BACKUP_SHA256="$(awk '{print $1}' "$SHA")"
fi

# ─── Heartbeat ────────────────────────────────────────────────────────────────
# A successful run must leave a machine-readable trail so freshness gates can
# verify "the cron actually fires". We write to a temp file and rename to make
# the write atomic — a half-written heartbeat is worse than a stale one.
mkdir -p "$(dirname "$HEARTBEAT_FILE")"
HEARTBEAT_TMP="${HEARTBEAT_FILE}.tmp.$$"
COMPLETED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [ "$TARGET_KIND" = "local_only" ]; then
  EXTERNAL_FLAG="false"
else
  EXTERNAL_FLAG="true"
fi
cat > "$HEARTBEAT_TMP" <<JSON
{
  "completed_at": "$COMPLETED_AT",
  "database": "$MYSQL_DATABASE",
  "local_path": "$LOCAL_PATH",
  "remote_name": "$REMOTE_NAME",
  "bytes": $BACKUP_BYTES,
  "sha256": "$BACKUP_SHA256",
  "target_kind": "$TARGET_KIND",
  "target_location": "$TARGET_LOCATION",
  "external_target_configured": $EXTERNAL_FLAG,
  "stream_direct": $STREAM_DIRECT,
  "evidence": "mysql_backup_heartbeat",
  "schema_version": 2
}
JSON
mv "$HEARTBEAT_TMP" "$HEARTBEAT_FILE"
log "heartbeat written: $HEARTBEAT_FILE"

log "backup completed successfully"
