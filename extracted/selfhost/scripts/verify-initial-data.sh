#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/selfhost/.env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.yml"}
EVIDENCE_DIR=${EVIDENCE_DIR:-"$ROOT_DIR/release-evidence/initial-data"}
EVIDENCE_FILE=${EVIDENCE_FILE:-"$EVIDENCE_DIR/initial-data-readiness.json"}

if [ ! -f "$ENV_FILE" ]; then
  echo "[initial-data] env file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$EVIDENCE_DIR"
cd "$ROOT_DIR"

tmp_sql=$(mktemp)
trap 'rm -f "$tmp_sql"' EXIT INT TERM
cat > "$tmp_sql" <<'SQL'
SET NAMES utf8mb4;
SELECT JSON_OBJECT(
  'status', CASE
    WHEN (SELECT COUNT(*) FROM stations WHERE is_published = 1) >= 1
     AND (SELECT COUNT(*) FROM `lines` WHERE is_published = 1) >= 1
     AND (SELECT COUNT(*) FROM route_stops) >= 1
    THEN 'ready'
    ELSE 'not_ready'
  END,
  'checkedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
  'publishedStations', (SELECT COUNT(*) FROM stations WHERE is_published = 1),
  'publishedLines', (SELECT COUNT(*) FROM `lines` WHERE is_published = 1),
  'routeStops', (SELECT COUNT(*) FROM route_stops),
  'seededStationName', (SELECT name FROM stations WHERE is_published = 1 ORDER BY created_at LIMIT 1)
) AS readiness_json;
SQL

echo "[initial-data] verifying published station/line/stops"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$tmp_sql" > "$EVIDENCE_FILE"
cat "$EVIDENCE_FILE"
printf '\n[initial-data] evidence written: %s\n' "$EVIDENCE_FILE"

if ! grep -q '"status": "ready"\|"status":"ready"' "$EVIDENCE_FILE"; then
  exit 2
fi
