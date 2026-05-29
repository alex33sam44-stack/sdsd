#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy the self-hosted stack with automatic rollback.
# Intended to run on the VPS from inside an unpacked release directory.
# It keeps timestamped release directories, switches the current symlink only
# after the new stack passes health checks, and restores the previous stack on failure.

ROOT_DIR="${DEPLOY_ROOT:-/opt/mwasalat}"
RELEASES_DIR="${RELEASES_DIR:-$ROOT_DIR/releases}"
CURRENT_LINK="${CURRENT_LINK:-$ROOT_DIR/current}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT_DIR/release-evidence/rollback}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-selfhost/.env.production}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mwasalat}"
HEALTH_URL="${HEALTH_URL:-}"
HEALTH_RETRIES="${HEALTH_RETRIES:-18}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-10}"
RUN_BACKUP_BEFORE_DEPLOY="${RUN_BACKUP_BEFORE_DEPLOY:-true}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
DEPLOY_SOURCE="${DEPLOY_SOURCE:-$(pwd)}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"
PREVIOUS_RELEASE=""
STATUS="failed"
FAILURE_REASON=""
BACKUP_STATUS="not-run"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVIDENCE_FILE="$EVIDENCE_DIR/deploy-rollback-$TIMESTAMP.json"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

json_escape() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1]))
PY
}

write_evidence() {
  local finished_at
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$EVIDENCE_DIR"
  cat > "$EVIDENCE_FILE" <<JSON
{
  "status": $(json_escape "$STATUS"),
  "startedAt": $(json_escape "$STARTED_AT"),
  "finishedAt": $(json_escape "$finished_at"),
  "deployRoot": $(json_escape "$ROOT_DIR"),
  "projectName": $(json_escape "$PROJECT_NAME"),
  "newRelease": $(json_escape "$NEW_RELEASE"),
  "previousRelease": $(json_escape "$PREVIOUS_RELEASE"),
  "currentLink": $(json_escape "$CURRENT_LINK"),
  "healthUrl": $(json_escape "$HEALTH_URL"),
  "healthRetries": $HEALTH_RETRIES,
  "healthIntervalSeconds": $HEALTH_INTERVAL_SECONDS,
  "backupStatus": $(json_escape "$BACKUP_STATUS"),
  "failureReason": $(json_escape "$FAILURE_REASON"),
  "rollbackWasAttempted": $([ "$STATUS" = "rolled-back" ] && echo true || echo false)
}
JSON
  cp "$EVIDENCE_FILE" "$EVIDENCE_DIR/rollback-readiness.json"
  log "Evidence written: $EVIDENCE_FILE"
  log "Canonical rollback evidence updated: $EVIDENCE_DIR/rollback-readiness.json"
}

compose() {
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

resolve_health_url() {
  if [ -n "$HEALTH_URL" ]; then
    return 0
  fi
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
  fi
  if [ -n "${API_DOMAIN:-}" ]; then
    HEALTH_URL="https://${API_DOMAIN}/api/health"
  else
    HEALTH_URL="http://127.0.0.1:4000/api/health"
  fi
}

check_health() {
  local attempt code
  resolve_health_url
  log "Checking health: $HEALTH_URL"
  for attempt in $(seq 1 "$HEALTH_RETRIES"); do
    code="$(curl -k -sS -o /tmp/mwasalat-health-body.txt -w '%{http_code}' "$HEALTH_URL" || true)"
    if [ "$code" = "200" ]; then
      log "Health check passed on attempt $attempt"
      return 0
    fi
    log "Health check attempt $attempt/$HEALTH_RETRIES failed with HTTP $code"
    sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

copy_release() {
  mkdir -p "$RELEASES_DIR" "$EVIDENCE_DIR"
  log "Creating release: $NEW_RELEASE"
  mkdir -p "$NEW_RELEASE"
  tar \
    --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./release-evidence' \
    --exclude='./dist' \
    --exclude='./backend/node_modules' \
    -C "$DEPLOY_SOURCE" -cf - . | tar -C "$NEW_RELEASE" -xf -
}

backup_before_deploy() {
  if [ "$RUN_BACKUP_BEFORE_DEPLOY" != "true" ]; then
    BACKUP_STATUS="skipped"
    return 0
  fi
  if [ -x "$CURRENT_LINK/selfhost/scripts/mysql-backup.sh" ]; then
    log "Running database backup before deploy"
    (cd "$CURRENT_LINK" && ./selfhost/scripts/mysql-backup.sh)
    BACKUP_STATUS="passed"
  else
    log "No existing backup script found; skipping backup"
    BACKUP_STATUS="skipped-no-script"
  fi
}

activate_release() {
  ln -sfn "$NEW_RELEASE" "$CURRENT_LINK.next"
  mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
}

rollback() {
  STATUS="rolled-back"
  log "Rollback started"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
    (cd "$CURRENT_LINK" && compose up -d --remove-orphans)
    if check_health; then
      log "Rollback completed and previous release is healthy"
    else
      FAILURE_REASON="rollback health check failed after original failure: $FAILURE_REASON"
      log "$FAILURE_REASON"
    fi
  else
    FAILURE_REASON="no previous release available for rollback; original failure: $FAILURE_REASON"
    log "$FAILURE_REASON"
  fi
  write_evidence
}

cleanup_old_releases() {
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn \
    | awk "NR>$KEEP_RELEASES {print \$2}" \
    | xargs -r rm -rf
}

on_error() {
  local exit_code=$?
  if [ -z "$FAILURE_REASON" ]; then
    FAILURE_REASON="deploy command failed with exit code $exit_code"
  fi
  rollback
  exit "$exit_code"
}
trap on_error ERR

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }

if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
elif [ -d "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$CURRENT_LINK"
fi

copy_release
backup_before_deploy
activate_release

cd "$CURRENT_LINK"
if [ ! -f "$ENV_FILE" ]; then
  FAILURE_REASON="missing env file: $ENV_FILE"
  false
fi

log "Building and starting Docker stack"
compose up -d --build --remove-orphans

if ! check_health; then
  FAILURE_REASON="new release failed health checks"
  false
fi

STATUS="deployed"
write_evidence
cleanup_old_releases
log "Deploy completed successfully"
