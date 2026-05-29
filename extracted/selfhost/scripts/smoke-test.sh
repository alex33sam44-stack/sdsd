#!/usr/bin/env sh
set -eu
API="${1:-${API:-}}"
if [ -z "$API" ]; then
  echo "usage: API=https://staging.example.tld selfhost/scripts/smoke-test.sh https://staging.example.tld" >&2
  exit 2
fi
case "$API" in
  https://*) ;;
  *) echo "staging smoke URL must be https" >&2; exit 2 ;;
esac
case "$API" in
  *example.com*|*example.org*|*example.net*|*example.invalid*|*yourdomain.com*|*localhost*|*127.0.0.1*)
    echo "staging smoke URL is a placeholder/local URL: $API" >&2
    exit 2
    ;;
esac
BASE="${API%/}"
HEALTH="$BASE/api/health"
STATIONS="$BASE/api/stations"
echo "[smoke] checking $HEALTH"
curl -fsS --max-time 20 "$HEALTH" | grep -E '"status"[[:space:]]*:[[:space:]]*"ok"' >/dev/null
echo "[smoke] checking $STATIONS"
curl -fsS --max-time 20 "$STATIONS" | head -c 1 | grep -E '\[|\{' >/dev/null
echo "[smoke] ok"
