#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT_DIR/selfhost/.env.production}"
FRONTEND_ENV_FILE="${FRONTEND_ENV_FILE:-$ROOT_DIR/.env.production.frontend}"
APP_DOMAIN="${APP_DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
BACKUP_REMOTE_DIR="${BACKUP_REMOTE_DIR:-}"

usage() {
  cat <<'USAGE'
Usage:
  APP_DOMAIN=app.example.com API_DOMAIN=api.example.com \
  BACKUP_RCLONE_REMOTE=s3:bucket/mysql \
  ./selfhost/scripts/configure-production-env.sh

Required:
  APP_DOMAIN  frontend public hostname, without https://
  API_DOMAIN  backend API public hostname, without https://

Backup target, choose one:
  BACKUP_RCLONE_REMOTE=s3:bucket/mysql
  BACKUP_REMOTE_DIR=/mnt/external-disk/mwasalat-mysql
USAGE
}

fail() { echo "FAIL: $*" >&2; exit 1; }

is_domain() {
  local v="$1"
  [[ "$v" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]
}

[ -n "$APP_DOMAIN" ] || { usage; fail "APP_DOMAIN is required"; }
[ -n "$API_DOMAIN" ] || { usage; fail "API_DOMAIN is required"; }
is_domain "$APP_DOMAIN" || fail "APP_DOMAIN must be a plain real domain without protocol/path: $APP_DOMAIN"
is_domain "$API_DOMAIN" || fail "API_DOMAIN must be a plain real domain without protocol/path: $API_DOMAIN"
[ "$APP_DOMAIN" != "$API_DOMAIN" ] || fail "APP_DOMAIN and API_DOMAIN must be different"
[ -f "$ENV_FILE" ] || fail "Missing env file: $ENV_FILE"
[ -f "$FRONTEND_ENV_FILE" ] || fail "Missing frontend env file: $FRONTEND_ENV_FILE"

API_URL="https://${API_DOMAIN}"
APP_URL="https://${APP_DOMAIN}"
VITE_API_BASE_URL="${API_URL}/api"

python3 - "$ENV_FILE" "$FRONTEND_ENV_FILE" <<'PYENV'
import os, sys
from pathlib import Path
backend = Path(sys.argv[1])
frontend = Path(sys.argv[2])
app_domain = os.environ['APP_DOMAIN']
api_domain = os.environ['API_DOMAIN']
api_url = f'https://{api_domain}'
app_url = f'https://{app_domain}'
vite_api = f'{api_url}/api'
updates = {
    'APP_DOMAIN': app_domain,
    'API_DOMAIN': api_domain,
    'PUBLIC_URL': api_url,
    'CORS_ORIGIN': f'{app_url},{api_url}',
    'GOOGLE_REDIRECT_URI': f'{api_url}/api/auth/google/callback',
    'APP_REDIRECT_URI': f'{app_url}/auth/callback',
    'BILLING_APP_URL': app_url,
    'BILLING_SUCCESS_URL': f'{app_url}/admin/billing?checkout=success',
    'BILLING_CANCEL_URL': f'{app_url}/admin/billing?checkout=cancel',
    'BILLING_PORTAL_RETURN_URL': f'{app_url}/admin/billing',
    'VITE_API_BASE_URL': vite_api,
}
if os.environ.get('BACKUP_RCLONE_REMOTE'):
    updates['BACKUP_RCLONE_REMOTE'] = os.environ['BACKUP_RCLONE_REMOTE']
    updates['BACKUP_REMOTE_DIR'] = ''
elif os.environ.get('BACKUP_REMOTE_DIR'):
    remote_dir = os.environ['BACKUP_REMOTE_DIR']
    if not remote_dir.startswith('/'):
        raise SystemExit(f'BACKUP_REMOTE_DIR must be absolute: {remote_dir}')
    updates['BACKUP_REMOTE_DIR'] = remote_dir
    updates['BACKUP_RCLONE_REMOTE'] = ''
    updates['BACKUP_REMOTE_DIR_REQUIRE_MOUNT'] = 'true'
else:
    print('WARN: No external backup target supplied. Public launch gate will keep failing until BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR is configured.', file=sys.stderr)

def update_file(path, mapping):
    lines = path.read_text().splitlines()
    seen = set()
    out = []
    for line in lines:
        if '=' in line and not line.lstrip().startswith('#'):
            key = line.split('=', 1)[0]
            if key in mapping:
                out.append(f'{key}={mapping[key]}')
                seen.add(key)
                continue
        out.append(line)
    for key, value in mapping.items():
        if key not in seen:
            out.append(f'{key}={value}')
    path.write_text('\n'.join(out) + '\n')

update_file(backend, updates)
update_file(frontend, {'VITE_API_BASE_URL': vite_api})
PYENV

cd "$ROOT_DIR"
SKIP_NPM_NETWORK_CHECK="${SKIP_NPM_NETWORK_CHECK:-1}" node scripts/validate-production-config.mjs

echo "Production env configured:"
echo "  APP_DOMAIN=$APP_DOMAIN"
echo "  API_DOMAIN=$API_DOMAIN"
echo "  VITE_API_BASE_URL=$VITE_API_BASE_URL"
echo "  ENV_FILE=$ENV_FILE"
echo "  FRONTEND_ENV_FILE=$FRONTEND_ENV_FILE"
