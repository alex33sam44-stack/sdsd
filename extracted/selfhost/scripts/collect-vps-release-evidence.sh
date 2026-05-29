#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${API:?Set API to the real public HTTPS staging API URL, for example https://staging.example.tld}"
: "${RESTORE_VERIFY_COMMAND:?Set RESTORE_VERIFY_COMMAND to the command that verifies restore from backup}"
ADMIN_EMAIL="${ADMIN_EMAIL:-mosm97829@gmail.com}"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-mah mos}"
HEALTH_URL="${HEALTH_URL:-${API%/}/api/health}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-selfhost/.env.production}"
STAGING_COMPOSE_FILE="${STAGING_COMPOSE_FILE:-docker-compose.yml}"

RUN_NPM_INSTALL="${RUN_NPM_INSTALL:-1}"
RUN_PRODUCTION_CONFIG="${RUN_PRODUCTION_CONFIG:-0}"
RUN_TENANT_ISOLATION="${RUN_TENANT_ISOLATION:-1}"
RUN_STAGING_SMOKE="${RUN_STAGING_SMOKE:-1}"
RUN_BOOTSTRAP_DATA="${RUN_BOOTSTRAP_DATA:-1}"
RUN_BACKUP_TARGET="${RUN_BACKUP_TARGET:-1}"
RUN_DEPLOY_ROLLBACK="${RUN_DEPLOY_ROLLBACK:-1}"
RUN_RELEASE_VERIFY="${RUN_RELEASE_VERIFY:-1}"
RUN_EVIDENCE_VERIFY="${RUN_EVIDENCE_VERIFY:-1}"

log() { printf '[evidence] %s
' "$*"; }
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[evidence] $1 is required on the VPS/CI runner." >&2
    exit 1
  }
}
run_optional() {
  local flag="$1"
  local label="$2"
  shift 2
  if [ "${!flag}" != "1" ]; then
    log "Skipping $label because $flag=${!flag}"
    return 0
  fi
  log "$label"
  "$@"
}

require_cmd docker
require_cmd npm
if ! docker compose version >/dev/null 2>&1; then
  echo "[evidence] Docker Compose v2 is required on the VPS/CI runner." >&2
  exit 1
fi

if [ "$RUN_NPM_INSTALL" = "1" ]; then
  log "Installing frontend/root dependencies"
  npm ci --no-audit --no-fund

  log "Installing backend dependencies"
  (
    cd backend
    if [ -f package-lock.json ]; then
      npm ci --no-audit --no-fund
    else
      npm install --no-audit --no-fund
    fi
  )
else
  log "Skipping dependency installation because RUN_NPM_INSTALL=0"
fi

run_optional RUN_PRODUCTION_CONFIG "Verifying production config" npm run verify:production-config

if [ "$RUN_TENANT_ISOLATION" = "1" ]; then
  log "Running Docker-backed MySQL tenant isolation proof"
  (cd backend && npm run test:tenant-isolation:mysql:docker)
else
  log "Skipping tenant isolation proof because RUN_TENANT_ISOLATION=0"
fi

run_optional RUN_STAGING_SMOKE "Running staging smoke proof against $API" env   API="$API"   RESTORE_VERIFY_COMMAND="$RESTORE_VERIFY_COMMAND"   STAGING_ENV_FILE="$STAGING_ENV_FILE"   STAGING_COMPOSE_FILE="$STAGING_COMPOSE_FILE"   npm run staging:smoke

run_optional RUN_BOOTSTRAP_DATA "Applying and verifying public launch seed data" env   ADMIN_EMAIL="$ADMIN_EMAIL"   ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME"   ./selfhost/scripts/bootstrap-public-launch-data.sh

run_optional RUN_BACKUP_TARGET "Verifying external/off-site backup target" ./selfhost/scripts/verify-backup-target.sh

run_optional RUN_DEPLOY_ROLLBACK "Running deploy with automatic rollback evidence capture" env   HEALTH_URL="$HEALTH_URL"   EVIDENCE_DIR="$ROOT_DIR/release-evidence/rollback"   ./selfhost/scripts/deploy-with-auto-rollback.sh

run_optional RUN_RELEASE_VERIFY "Running release verifier" env   BACKEND_URL="$API"   RELEASE_VERIFY_STRICT=1   npm run verify:release

run_optional RUN_EVIDENCE_VERIFY "Validating all required release evidence files" npm run verify:evidence

log "Done. Expected evidence files:"
printf ' - %s
'   "release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json"   "release-evidence/staging/staging-smoke-readiness.json"   "release-evidence/staging/docker-smoke-readiness.json"   "release-evidence/staging/restore-verified.json"   "release-evidence/initial-data/initial-data-readiness.json"   "release-evidence/platform-admin/platform-admin-readiness.json"   "release-evidence/rollback/rollback-readiness.json"   "release-evidence/backup/external-backup-target-readiness.json"
