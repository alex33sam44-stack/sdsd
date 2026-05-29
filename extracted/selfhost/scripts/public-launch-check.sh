#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_URL="${API:-${BACKEND_URL:-}}"
if [ -z "$API_URL" ]; then
  if [ -f selfhost/.env.production ]; then
    API_DOMAIN="$(awk -F= '$1=="API_DOMAIN"{print $2}' selfhost/.env.production | tail -n1 | tr -d '\r' || true)"
    if [ -n "$API_DOMAIN" ]; then
      API_URL="https://${API_DOMAIN}"
    fi
  fi
fi

EVIDENCE_OUT_DIR="release-evidence/public-launch"
mkdir -p "$EVIDENCE_OUT_DIR"
REPORT="$EVIDENCE_OUT_DIR/public-launch-check-$(date -u +%Y%m%dT%H%M%SZ).json"
LATEST="$EVIDENCE_OUT_DIR/public-launch-check-latest.json"

RUN_BUILD="${RUN_BUILD:-0}"
RUN_DOCKER_CONFIG="${RUN_DOCKER_CONFIG:-0}"
RUN_REMOTE_RELEASE_VERIFY="${RUN_REMOTE_RELEASE_VERIFY:-0}"
ALLOW_SKIP_NPM_NETWORK_CHECK="${ALLOW_SKIP_NPM_NETWORK_CHECK:-1}"

results_json='[]'
status_overall='passed'

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] || ""))' "$1"
}

append_result() {
  local name="$1"
  local status="$2"
  local command="$3"
  local output_file="$4"
  local detail="$5"
  if [ "$status" != "passed" ]; then
    status_overall='failed'
  fi
  local item
  item="$(node - <<'NODE' "$name" "$status" "$command" "$output_file" "$detail"
const [name,status,command,outputFile,detail] = process.argv.slice(2);
process.stdout.write(JSON.stringify({ name, status, command, outputFile, detail }));
NODE
)"
  results_json="$(node - <<'NODE' "$results_json" "$item"
const arr = JSON.parse(process.argv[2]);
arr.push(JSON.parse(process.argv[3]));
process.stdout.write(JSON.stringify(arr));
NODE
)"
}

run_gate() {
  local name="$1"
  shift
  local log="$EVIDENCE_OUT_DIR/${name}.log"
  echo "[public-launch] $name"
  set +e
  "$@" >"$log" 2>&1
  local code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    append_result "$name" "passed" "$*" "$log" "exit_code=0"
    echo "[public-launch] PASS $name"
  else
    append_result "$name" "failed" "$*" "$log" "exit_code=$code"
    echo "[public-launch] FAIL $name (see $log)" >&2
  fi
}

if [ "$ALLOW_SKIP_NPM_NETWORK_CHECK" = "1" ]; then
  export SKIP_NPM_NETWORK_CHECK=1
fi

run_gate "production-config" npm run verify:production-config
run_gate "backup-target" npm run verify:backup-target
run_gate "prisma-migrations" npm run verify:prisma-migrations
run_gate "secret-hygiene" npm run verify:secret-hygiene

if [ "$RUN_DOCKER_CONFIG" = "1" ]; then
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    run_gate "docker-compose-config" docker compose --env-file selfhost/.env.production config
  else
    append_result "docker-compose-config" "failed" "docker compose --env-file selfhost/.env.production config" "" "Docker Compose v2 is not available"
    status_overall='failed'
    echo "[public-launch] FAIL docker-compose-config (Docker Compose v2 is not available)" >&2
  fi
fi

if [ "$RUN_BUILD" = "1" ]; then
  run_gate "frontend-build" npm run build
fi

run_gate "release-evidence" npm run verify:evidence

if [ "$RUN_REMOTE_RELEASE_VERIFY" = "1" ]; then
  if [ -n "$API_URL" ]; then
  run_gate "no-legacy-provider" npm run verify:no-legacy-provider
  run_gate "release-verify-strict" env RELEASE_VERIFY_STRICT=1 BACKEND_URL="$API_URL" npm run verify:release
  else
    append_result "release-verify-strict" "failed" "RELEASE_VERIFY_STRICT=1 BACKEND_URL=<real-api> npm run verify:release" "" "API/BACKEND_URL could not be inferred"
    status_overall='failed'
    echo "[public-launch] FAIL release-verify-strict (API/BACKEND_URL missing)" >&2
  fi
fi

node - <<'NODE' "$status_overall" "$API_URL" "$results_json" "$REPORT" "$LATEST"
const fs = require('fs');
const [status, apiUrl, resultsRaw, reportPath, latestPath] = process.argv.slice(2);
const report = {
  checkedAt: new Date().toISOString(),
  status,
  publicLaunchReady: status === 'passed',
  apiUrl: apiUrl || null,
  gates: JSON.parse(resultsRaw),
  notes: [
    'This gate is intended to run on the real VPS after production domains, HTTPS, Docker, npm network access, backup target, and release evidence have been configured.',
    'Do not publish the public link unless publicLaunchReady is true.'
  ]
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
NODE

if [ "$status_overall" != "passed" ]; then
  echo "[public-launch] NOT READY. Report: $REPORT" >&2
  exit 1
fi

echo "[public-launch] READY. Report: $REPORT"
