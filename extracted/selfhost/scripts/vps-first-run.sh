#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

APP_DOMAIN="${APP_DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-mosm97829@gmail.com}"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-mah mos}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
BACKUP_REMOTE_DIR="${BACKUP_REMOTE_DIR:-}"
RESTORE_VERIFY_COMMAND="${RESTORE_VERIFY_COMMAND:-./selfhost/scripts/verify-restore.sh}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/mwasalat}"
SKIP_COLLECT_EVIDENCE="${SKIP_COLLECT_EVIDENCE:-0}"
INSTALL_BACKUP_CRON="${INSTALL_BACKUP_CRON:-1}"
RUN_STATE_DIR="${RUN_STATE_DIR:-release-evidence/vps-first-run}"
FORCE_RERUN_STEPS=",${FORCE_RERUN_STEPS:-},"
SKIP_STEPS=",${SKIP_STEPS:-},"
RESET_FIRST_RUN_STATE="${RESET_FIRST_RUN_STATE:-0}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_VPS_PREFLIGHT="${SKIP_VPS_PREFLIGHT:-0}"

usage() {
  cat <<'USAGE'
Usage:
  APP_DOMAIN=app.example.com \
  API_DOMAIN=api.example.com \
  BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql \
  ADMIN_EMAIL=mosm97829@gmail.com \
  ./selfhost/scripts/vps-first-run.sh

Required:
  APP_DOMAIN and API_DOMAIN must be real hostnames without https:// or paths.
  Configure one external backup target: BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR.

Optional:
  ADMIN_DISPLAY_NAME='mah mos'
  ADMIN_BOOTSTRAP_PASSWORD='<optional one-time password; generated if omitted>'
  ADMIN_BOOTSTRAP_PASSWORD_HASH='<optional precomputed argon2id hash>'
  RESTORE_VERIFY_COMMAND='./selfhost/scripts/verify-restore.sh'
  DEPLOY_ROOT=/opt/mwasalat
  SKIP_COLLECT_EVIDENCE=1     only configure/deploy/bootstrap, do not run full evidence suite
  INSTALL_BACKUP_CRON=0       skip cron installation
  RUN_STATE_DIR=release-evidence/vps-first-run
  FORCE_RERUN_STEPS=deploy-with-auto-rollback,collect-evidence
  SKIP_STEPS=install-backup-cron
  RESET_FIRST_RUN_STATE=1     remove prior step markers before starting
  DRY_RUN=1                   validate orchestration without executing step commands
  SKIP_VPS_PREFLIGHT=1         skip server prerequisite checks (not for public launch)
USAGE
}

fail() { echo "FAIL: $*" >&2; usage >&2; exit 1; }
log() { printf '[vps-first-run] %s\n' "$*"; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required"; }
contains_csv() { case "$1" in *",$2,"*) return 0 ;; *) return 1 ;; esac; }

[ -n "$APP_DOMAIN" ] || fail "APP_DOMAIN is required"
[ -n "$API_DOMAIN" ] || fail "API_DOMAIN is required"
if [ -z "$BACKUP_RCLONE_REMOTE" ] && [ -z "$BACKUP_REMOTE_DIR" ]; then
  fail "Set BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR"
fi

need_cmd npm
need_cmd docker
need_cmd curl
need_cmd python3
if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is required"
fi

mkdir -p "$RUN_STATE_DIR/logs"
REPORT="$RUN_STATE_DIR/vps-first-run-latest.json"
EVENTS="$RUN_STATE_DIR/vps-first-run-events.jsonl"

if [ "$RESET_FIRST_RUN_STATE" = "1" ]; then
  log "Resetting first-run state in $RUN_STATE_DIR"
  rm -f "$RUN_STATE_DIR"/*.ok "$RUN_STATE_DIR"/*.failed "$REPORT" "$EVENTS"
  rm -rf "$RUN_STATE_DIR/logs"
  mkdir -p "$RUN_STATE_DIR/logs"
fi

event_json() {
  local step="$1" status="$2" detail="$3" log_file="${4:-}"
  node - <<'NODE' "$step" "$status" "$detail" "$log_file" >> "$EVENTS"
const [step, status, detail, logFile] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  at: new Date().toISOString(),
  step,
  status,
  detail,
  logFile: logFile || null
}) + '\n');
NODE
}

write_report() {
  local status="${1:-passed}"
  node - <<'NODE' "$RUN_STATE_DIR" "$REPORT" "$status" "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_EMAIL" "$DEPLOY_ROOT"
const fs = require('fs');
const path = require('path');
const [dir, reportPath, status, appDomain, apiDomain, adminEmail, deployRoot] = process.argv.slice(2);
const steps = [
  'vps-preflight',
  'configure-production-env',
  'install-root-dependencies',
  'verify-production-config',
  'verify-prisma-migrations',
  'deploy-with-auto-rollback',
  'bootstrap-public-launch-data',
  'install-backup-cron',
  'collect-evidence',
  'public-launch-check'
];
const stepReports = steps.map((step) => {
  const okPath = path.join(dir, `${step}.ok`);
  const failedPath = path.join(dir, `${step}.failed`);
  let state = 'pending';
  let completedAt = null;
  let failure = null;
  if (fs.existsSync(okPath)) {
    state = 'passed';
    completedAt = fs.readFileSync(okPath, 'utf8').trim();
  }
  if (fs.existsSync(failedPath)) {
    state = 'failed';
    failure = fs.readFileSync(failedPath, 'utf8').trim();
  }
  return { step, state, completedAt, failure };
});
const report = {
  checkedAt: new Date().toISOString(),
  status,
  publicLaunchReady: false,
  appDomain,
  apiDomain,
  adminEmail,
  deployRoot,
  resumable: true,
  rerunHints: {
    forceOneStep: 'FORCE_RERUN_STEPS=step-name ./selfhost/scripts/vps-first-run.sh',
    resetAllState: 'RESET_FIRST_RUN_STATE=1 ./selfhost/scripts/vps-first-run.sh'
  },
  steps: stepReports,
  notes: [
    'This file tracks orchestration progress only. Public launch approval still requires release-evidence/public-launch/public-launch-check-latest.json with publicLaunchReady=true.',
    'Completed steps are skipped on re-run unless FORCE_RERUN_STEPS includes the step name.'
  ]
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
NODE
}

run_step() {
  local step="$1"
  shift
  local marker="$RUN_STATE_DIR/${step}.ok"
  local failed_marker="$RUN_STATE_DIR/${step}.failed"
  local log_file="$RUN_STATE_DIR/logs/${step}.log"

  if contains_csv "$SKIP_STEPS" "$step"; then
    log "Skipping $step because SKIP_STEPS includes it"
    event_json "$step" "skipped" "operator-skip" ""
    return 0
  fi

  if [ -f "$marker" ] && ! contains_csv "$FORCE_RERUN_STEPS" "$step"; then
    log "Skipping $step; already completed. Use FORCE_RERUN_STEPS=$step to re-run."
    event_json "$step" "skipped" "already-completed" ""
    return 0
  fi

  log "Running $step"
  rm -f "$failed_marker"
  if [ "$DRY_RUN" = "1" ]; then
    printf '%q ' "$@" | sed 's/ $/\n/' > "$log_file"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$marker"
    event_json "$step" "passed" "dry-run" "$log_file"
    return 0
  fi

  set +e
  "$@" >"$log_file" 2>&1
  local code=$?
  set -e

  if [ "$code" -eq 0 ]; then
    date -u +%Y-%m-%dT%H:%M:%SZ > "$marker"
    rm -f "$failed_marker"
    event_json "$step" "passed" "exit_code=0" "$log_file"
    log "PASS $step"
  else
    printf 'failed_at=%s\nexit_code=%s\nlog=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$code" "$log_file" > "$failed_marker"
    event_json "$step" "failed" "exit_code=$code" "$log_file"
    echo "FAIL: $step failed with exit code $code. See $log_file" >&2
    write_report "failed"
    exit "$code"
  fi
}


if [ "$SKIP_VPS_PREFLIGHT" != "1" ]; then
  run_step "vps-preflight" env \
    APP_DOMAIN="$APP_DOMAIN" \
    API_DOMAIN="$API_DOMAIN" \
    BACKUP_RCLONE_REMOTE="$BACKUP_RCLONE_REMOTE" \
    BACKUP_REMOTE_DIR="$BACKUP_REMOTE_DIR" \
    npm run verify:vps-preflight
else
  log "Skipping vps-preflight because SKIP_VPS_PREFLIGHT=1"
  event_json "vps-preflight" "skipped" "SKIP_VPS_PREFLIGHT=1" ""
fi

run_step "configure-production-env" env \
  APP_DOMAIN="$APP_DOMAIN" \
  API_DOMAIN="$API_DOMAIN" \
  BACKUP_RCLONE_REMOTE="$BACKUP_RCLONE_REMOTE" \
  BACKUP_REMOTE_DIR="$BACKUP_REMOTE_DIR" \
  ./selfhost/scripts/configure-production-env.sh

run_step "install-root-dependencies" npm ci --no-audit --no-fund
run_step "verify-production-config" npm run verify:production-config
run_step "verify-prisma-migrations" npm run verify:prisma-migrations
run_step "deploy-with-auto-rollback" env DEPLOY_ROOT="$DEPLOY_ROOT" HEALTH_URL="https://${API_DOMAIN}/api/health" ./selfhost/scripts/deploy-with-auto-rollback.sh
run_step "bootstrap-public-launch-data" env ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD:-}" ADMIN_BOOTSTRAP_PASSWORD_HASH="${ADMIN_BOOTSTRAP_PASSWORD_HASH:-}" ./selfhost/scripts/bootstrap-public-launch-data.sh

if [ "$INSTALL_BACKUP_CRON" = "1" ]; then
  run_step "install-backup-cron" ./selfhost/scripts/install-backup-cron.sh
else
  log "Skipping install-backup-cron because INSTALL_BACKUP_CRON=0"
  event_json "install-backup-cron" "skipped" "INSTALL_BACKUP_CRON=0" ""
fi

if [ "$SKIP_COLLECT_EVIDENCE" != "1" ]; then
  run_step "collect-evidence" env \
    API="https://${API_DOMAIN}" \
    ADMIN_EMAIL="$ADMIN_EMAIL" \
    ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" \
    RESTORE_VERIFY_COMMAND="$RESTORE_VERIFY_COMMAND" \
    RUN_NPM_INSTALL=0 \
    RUN_PRODUCTION_CONFIG=1 \
    RUN_BOOTSTRAP_DATA=0 \
    RUN_DEPLOY_ROLLBACK=0 \
    ./selfhost/scripts/collect-vps-release-evidence.sh
else
  log "Skipping collect-evidence because SKIP_COLLECT_EVIDENCE=1"
  event_json "collect-evidence" "skipped" "SKIP_COLLECT_EVIDENCE=1" ""
fi

run_step "public-launch-check" env API="https://${API_DOMAIN}" npm run verify:public-launch

write_report "passed"
log "First run completed. Do not publish unless release-evidence/public-launch/public-launch-check-latest.json has publicLaunchReady=true."
