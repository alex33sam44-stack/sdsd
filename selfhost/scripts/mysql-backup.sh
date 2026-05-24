#!/usr/bin/env bash
set -Eeuo pipefail

# MySQL logical backup for the Mwasalat self-hosted Docker stack.
# Creates a compressed dump locally (staging), then mirrors it to an external
# rclone remote or mounted directory. Each run actively refuses to keep the
# only copy on the same filesystem as the application: same-device, root,
# overlay, and unverified copies all fail loudly so the operator notices.

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
REQUIRE_OFFSITE_COPY="${BACKUP_REQUIRE_OFFSITE_COPY:-$REQUIRE_EXTERNAL_TARGET}"
VERIFY_TARGET_BEFORE_BACKUP="${BACKUP_VERIFY_TARGET_BEFORE_BACKUP:-true}"
VERIFY_OFFSITE_AFTER_COPY="${BACKUP_VERIFY_OFFSITE_AFTER_COPY:-true}"
REQUIRE_REMOTE_DIR_MOUNT="${BACKUP_REMOTE_DIR_REQUIRE_MOUNT:-true}"

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

# Re-resolve runtime knobs after sourcing the env file so values from the file
# take effect when not pre-exported in the parent shell.
REQUIRE_EXTERNAL_TARGET="${BACKUP_REQUIRE_EXTERNAL_TARGET:-$REQUIRE_EXTERNAL_TARGET}"
REQUIRE_OFFSITE_COPY="${BACKUP_REQUIRE_OFFSITE_COPY:-$REQUIRE_OFFSITE_COPY}"
VERIFY_TARGET_BEFORE_BACKUP="${BACKUP_VERIFY_TARGET_BEFORE_BACKUP:-$VERIFY_TARGET_BEFORE_BACKUP}"
VERIFY_OFFSITE_AFTER_COPY="${BACKUP_VERIFY_OFFSITE_AFTER_COPY:-$VERIFY_OFFSITE_AFTER_COPY}"
REQUIRE_REMOTE_DIR_MOUNT="${BACKUP_REMOTE_DIR_REQUIRE_MOUNT:-$REQUIRE_REMOTE_DIR_MOUNT}"
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

# ---- helpers ---------------------------------------------------------------

# Returns the device backing $1, or empty string if df fails.
df_device() {
  df -P "$1" 2>/dev/null | awk 'END { print $1 }'
}

# Returns "<target> <fstype>" for the mount that owns $1, or "" if findmnt
# is missing. Spaces are not expected in fstype/target produced by findmnt.
findmnt_target_fstype() {
  command -v findmnt >/dev/null 2>&1 || return 0
  findmnt -T "$1" -n -o TARGET,FSTYPE 2>/dev/null || true
}

assert_offsite_dir_safe() {
  local dir="$1"
  local require_mount="$2"

  [ -n "$dir" ] || fatal "offsite directory check called without a path"
  case "$dir" in
    /*) ;;
    *) fatal "BACKUP_REMOTE_DIR must be an absolute path: $dir" ;;
  esac

  mkdir -p "$dir" || fatal "cannot create BACKUP_REMOTE_DIR: $dir"
  [ -w "$dir" ] || fatal "BACKUP_REMOTE_DIR is not writable: $dir"

  local app_device stage_device offsite_device
  app_device="$(df_device "$ROOT_DIR")"
  stage_device="$(df_device "$BACKUP_DIR")"
  offsite_device="$(df_device "$dir")"

  [ -n "$offsite_device" ] || fatal "could not resolve filesystem device for $dir"

  if [ -n "$app_device" ] && [ "$app_device" = "$offsite_device" ]; then
    fatal "BACKUP_REMOTE_DIR is on the same device as the application root ($app_device); refusing to keep the only copy on the same filesystem"
  fi
  if [ -n "$stage_device" ] && [ "$stage_device" = "$offsite_device" ]; then
    fatal "BACKUP_REMOTE_DIR is on the same device as BACKUP_DIR ($stage_device); refusing to mirror onto the same filesystem"
  fi

  if [ "$require_mount" = "true" ]; then
    local info target fstype
    info="$(findmnt_target_fstype "$dir")"
    if [ -z "$info" ]; then
      fatal "could not verify mount for BACKUP_REMOTE_DIR ($dir); install findmnt or set BACKUP_REMOTE_DIR_REQUIRE_MOUNT=false at your own risk"
    fi
    target="$(printf '%s\n' "$info" | awk '{ print $1 }')"
    fstype="$(printf '%s\n' "$info" | awk '{ print $2 }')"
    if [ "$target" = "/" ]; then
      fatal "BACKUP_REMOTE_DIR resolves to root filesystem, not an external mount: $dir"
    fi
    if [ "$fstype" = "overlay" ]; then
      fatal "BACKUP_REMOTE_DIR resolves to a Docker/root overlay filesystem: $dir"
    fi
  fi
}

# ---- dump ------------------------------------------------------------------

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

# Local stage is always on the application FS; that is by design (it is just
# staging). What we never want is for it to be the *only* copy. Track success
# so we can fail the run if the off-site step is skipped or fails.
OFFSITE_OK="false"
OFFSITE_TARGET=""

find "$BACKUP_DIR" -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/[prune] /' || true

# ---- off-site mirror -------------------------------------------------------

if [ -n "$RCLONE_REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then fatal "BACKUP_RCLONE_REMOTE is set but rclone is not installed"; fi
  log "copying backup to rclone remote: $RCLONE_REMOTE"
  rclone copy "$OUT" "$RCLONE_REMOTE" --checksum
  rclone copy "$SHA" "$RCLONE_REMOTE" --checksum

  if [ "$VERIFY_OFFSITE_AFTER_COPY" = "true" ]; then
    # `rclone check` re-reads remote files and compares hashes against the
    # local source; fails non-zero on any mismatch so we keep the local
    # stage and surface the error.
    log "verifying rclone copy with remote hash check"
    rclone check "$OUT" "$RCLONE_REMOTE" --one-way \
      || fatal "rclone hash verification failed for $OUT against $RCLONE_REMOTE"
    rclone check "$SHA" "$RCLONE_REMOTE" --one-way \
      || fatal "rclone hash verification failed for $SHA against $RCLONE_REMOTE"
  fi

  if [ "$REMOTE_RETENTION_DAYS" -gt 0 ]; then
    rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include '*.sql.gz' --include '*.sql.gz.sha256' || true
  fi

  OFFSITE_OK="true"
  OFFSITE_TARGET="rclone:$RCLONE_REMOTE"
elif [ -n "$REMOTE_DIR" ]; then
  assert_offsite_dir_safe "$REMOTE_DIR" "$REQUIRE_REMOTE_DIR_MOUNT"
  log "copying backup to external directory: $REMOTE_DIR"
  cp -p "$OUT" "$SHA" "$REMOTE_DIR/"

  if [ "$VERIFY_OFFSITE_AFTER_COPY" = "true" ]; then
    local_dump_sha="$(awk '{ print $1 }' "$SHA")"
    remote_dump_path="$REMOTE_DIR/$(basename "$OUT")"
    remote_sha_path="$REMOTE_DIR/$(basename "$SHA")"

    [ -s "$remote_dump_path" ] || fatal "off-site dump missing or empty after copy: $remote_dump_path"
    [ -s "$remote_sha_path" ]  || fatal "off-site checksum missing or empty after copy: $remote_sha_path"

    remote_dump_sha="$(sha256sum "$remote_dump_path" | awk '{ print $1 }')"
    if [ "$local_dump_sha" != "$remote_dump_sha" ]; then
      fatal "off-site dump sha256 mismatch ($remote_dump_path); keeping local stage for retry"
    fi

    remote_recorded_sha="$(awk '{ print $1 }' "$remote_sha_path")"
    if [ "$remote_recorded_sha" != "$local_dump_sha" ]; then
      fatal "off-site recorded sha256 differs from local ($remote_sha_path)"
    fi
  fi

  find "$REMOTE_DIR" -type f \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) -mtime +"$REMOTE_RETENTION_DAYS" -print -delete | sed 's/^/[remote-prune] /' || true

  OFFSITE_OK="true"
  OFFSITE_TARGET="dir:$REMOTE_DIR"
fi

if [ "$OFFSITE_OK" != "true" ]; then
  if [ "$REQUIRE_OFFSITE_COPY" = "true" ]; then
    fatal "off-site copy is required but no BACKUP_RCLONE_REMOTE / BACKUP_REMOTE_DIR was usable; the only copy is on the application filesystem at $OUT"
  fi
  log "WARNING: off-site copy skipped; backup exists only at $OUT (set BACKUP_REQUIRE_OFFSITE_COPY=true to refuse this)"
fi

if [ "$OFFSITE_OK" = "true" ]; then
  log "off-site copy verified: $OFFSITE_TARGET"
fi

log "backup completed successfully"
