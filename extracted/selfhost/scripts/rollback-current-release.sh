#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DEPLOY_ROOT:-/opt/mwasalat}"
RELEASES_DIR="${RELEASES_DIR:-$ROOT_DIR/releases}"
CURRENT_LINK="${CURRENT_LINK:-$ROOT_DIR/current}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mwasalat}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-selfhost/.env.production}"
HEALTH_URL="${HEALTH_URL:-}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-10}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT_DIR/release-evidence/rollback}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_FILE="$EVIDENCE_DIR/manual-rollback-$TIMESTAMP.json"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

compose() {
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

current="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
previous="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | awk -v cur="$current" '$2 != cur {print $2; exit}')"

if [ -z "$previous" ]; then
  echo "No previous release found in $RELEASES_DIR" >&2
  exit 1
fi

ln -sfn "$previous" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
cd "$CURRENT_LINK"
compose up -d --remove-orphans

if [ -z "$HEALTH_URL" ] && [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
  if [ -n "${API_DOMAIN:-}" ]; then HEALTH_URL="https://${API_DOMAIN}/api/health"; fi
fi
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/api/health}"

status="failed"
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  code="$(curl -k -sS -o /tmp/mwasalat-manual-rollback-health.txt -w '%{http_code}' "$HEALTH_URL" || true)"
  if [ "$code" = "200" ]; then status="rolled-back"; break; fi
  log "Health check attempt $attempt/$HEALTH_RETRIES failed with HTTP $code"
  sleep "$HEALTH_INTERVAL_SECONDS"
done

mkdir -p "$EVIDENCE_DIR"
cat > "$EVIDENCE_FILE" <<JSON
{
  "status": "$status",
  "rolledBackTo": "$previous",
  "previousCurrentRelease": "$current",
  "healthUrl": "$HEALTH_URL",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
cp "$EVIDENCE_FILE" "$EVIDENCE_DIR/rollback-readiness.json"
log "Evidence written: $EVIDENCE_FILE"
log "Canonical rollback evidence updated: $EVIDENCE_DIR/rollback-readiness.json"
[ "$status" = "rolled-back" ]
