#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/selfhost/.env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.yml"}
SEEDS_DIR=${SEEDS_DIR:-"$ROOT_DIR/selfhost/seeds"}
SQL_FILE=${SQL_FILE:-}

if [ ! -f "$ENV_FILE" ]; then
  echo "[seed] env file not found: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"

apply_seed() {
  seed_file="$1"
  if [ ! -f "$seed_file" ]; then
    echo "[seed] SQL seed file not found: $seed_file" >&2
    exit 1
  fi
  echo "[seed] applying $seed_file"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$seed_file"
}

if [ -n "$SQL_FILE" ]; then
  apply_seed "$SQL_FILE"
else
  found=0
  for seed_file in "$SEEDS_DIR"/*.sql; do
    [ -e "$seed_file" ] || continue
    found=1
    apply_seed "$seed_file"
  done
  if [ "$found" -eq 0 ]; then
    echo "[seed] no SQL seed files found in $SEEDS_DIR" >&2
    exit 1
  fi
fi

echo "[seed] done"
