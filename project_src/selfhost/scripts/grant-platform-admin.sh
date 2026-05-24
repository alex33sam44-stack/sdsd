#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/selfhost/.env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.yml"}
ADMIN_EMAIL=${ADMIN_EMAIL:-"mosm97829@gmail.com"}
ADMIN_DISPLAY_NAME=${ADMIN_DISPLAY_NAME:-"mah mos"}
ADMIN_BOOTSTRAP_PASSWORD_HASH=${ADMIN_BOOTSTRAP_PASSWORD_HASH:-}
ADMIN_BOOTSTRAP_PASSWORD=${ADMIN_BOOTSTRAP_PASSWORD:-}
ADMIN_CREDENTIALS_DIR=${ADMIN_CREDENTIALS_DIR:-"$ROOT_DIR/release-evidence/platform-admin"}
ADMIN_RESET_PASSWORD_HASH=${ADMIN_RESET_PASSWORD_HASH:-"false"}
TENANT_ID=${TENANT_ID:-"11111111-1111-4111-8111-111111111111"}
EVIDENCE_DIR=${EVIDENCE_DIR:-"$ROOT_DIR/release-evidence/platform-admin"}
EVIDENCE_FILE=${EVIDENCE_FILE:-"$EVIDENCE_DIR/platform-admin-readiness.json"}

if [ ! -f "$ENV_FILE" ]; then
  echo "[platform-admin] env file not found: $ENV_FILE" >&2
  echo "[platform-admin] copy selfhost/.env.example to $ENV_FILE and fill in the required vars before re-running" >&2
  exit 64
fi

# Prerequisite check: bail out early with a single, paste-friendly error
# listing every missing variable rather than letting docker compose fail
# later with a cryptic "Access denied" / "no such service". The shared
# Node module also enforces the same rules in unit tests so the runbook
# stays in sync with the script.
if ! ENV_FILE="$ENV_FILE" node "$ROOT_DIR/scripts/check-bootstrap-prereqs.mjs" --env "$ENV_FILE" >&2; then
  echo "[platform-admin] aborting before docker compose call (exit 64 = EX_USAGE: env file is incomplete)" >&2
  exit 64
fi

# Track whether we generate a fresh password this run, so we can detect the
# case where the new credentials file would lie (DB kept the old hash) and
# roll back the file before the operator ever looks at it.
PASSWORD_WAS_GENERATED=0
GENERATED_CREDENTIALS_FILE=""
PREVIOUS_CREDENTIALS_FILE=""

if [ -z "$ADMIN_BOOTSTRAP_PASSWORD_HASH" ]; then
  echo "[platform-admin] ADMIN_BOOTSTRAP_PASSWORD_HASH not provided; generating a one-time bootstrap password and argon2 hash"
  if [ ! -d "$ROOT_DIR/backend/node_modules/argon2" ]; then
    echo "[platform-admin] installing backend dependencies needed for argon2 hashing"
    (cd "$ROOT_DIR/backend" && npm install --no-audit --no-fund)
  fi
  hash_json=$(ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_BOOTSTRAP_PASSWORD="$ADMIN_BOOTSTRAP_PASSWORD" ADMIN_CREDENTIALS_DIR="$ADMIN_CREDENTIALS_DIR" node "$ROOT_DIR/selfhost/scripts/hash-admin-password.mjs")
  ADMIN_BOOTSTRAP_PASSWORD_HASH=$(printf '%s' "$hash_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.passwordHash)})")
  GENERATED_CREDENTIALS_FILE=$(printf '%s' "$hash_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.credentialsFile||'')})")
  PREVIOUS_CREDENTIALS_FILE=$(printf '%s' "$hash_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.previousCredentialsFile||'')})")
  PASSWORD_WAS_GENERATED=1
  echo "[platform-admin] one-time bootstrap password stored with mode 600 at: $GENERATED_CREDENTIALS_FILE"
fi

mkdir -p "$EVIDENCE_DIR"
cd "$ROOT_DIR"

tmp_sql=$(mktemp)
trap 'rm -f "$tmp_sql"' EXIT INT TERM

# Escape values safely for SQL string literal usage.
escaped_email=$(printf '%s' "$ADMIN_EMAIL" | sed "s/'/''/g")
escaped_display_name=$(printf '%s' "$ADMIN_DISPLAY_NAME" | sed "s/'/''/g")
escaped_password_hash=$(printf '%s' "$ADMIN_BOOTSTRAP_PASSWORD_HASH" | sed "s/'/''/g")
escaped_tenant_id=$(printf '%s' "$TENANT_ID" | sed "s/'/''/g")
escaped_reset=$(printf '%s' "$ADMIN_RESET_PASSWORD_HASH" | sed "s/'/''/g")

cat > "$tmp_sql" <<SQL
SET NAMES utf8mb4;
SET @admin_email = '$escaped_email';
SET @display_name = '$escaped_display_name';
SET @password_hash = '$escaped_password_hash';
SET @tenant_id = '$escaped_tenant_id';
SET @reset_password_hash = LOWER('$escaped_reset');
SET @existing_user_id = (SELECT id FROM users WHERE email = @admin_email LIMIT 1);
SET @existing_password_hash = (SELECT password_hash FROM users WHERE email = @admin_email LIMIT 1);
SET @target_user_id = COALESCE(@existing_user_id, UUID());
SET @user_was_created = IF(@existing_user_id IS NULL, true, false);

START TRANSACTION;

INSERT INTO users (id, email, password_hash, google_sub, email_verified, created_at, updated_at)
VALUES (@target_user_id, @admin_email, @password_hash, NULL, 1, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  email_verified = 1,
  password_hash = CASE
    WHEN @reset_password_hash IN ('1','true','yes') THEN VALUES(password_hash)
    WHEN password_hash IS NULL OR password_hash = '' THEN VALUES(password_hash)
    ELSE password_hash
  END,
  updated_at = NOW(3);

SET @user_id = (SELECT id FROM users WHERE email = @admin_email LIMIT 1);
SET @new_password_hash = (SELECT password_hash FROM users WHERE id = @user_id LIMIT 1);

INSERT INTO profiles (id, display_name, avatar_url, default_station_id, created_at, updated_at)
SELECT @user_id, @display_name, NULL, NULL, NOW(3), NOW(3)
WHERE @user_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  updated_at = NOW(3);

INSERT INTO user_roles (id, user_id, role, created_at)
SELECT UUID(), @user_id, 'platform_admin', NOW(3)
WHERE @user_id IS NOT NULL
ON DUPLICATE KEY UPDATE role = VALUES(role);

INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at, accepted_at)
SELECT UUID(), @tenant_id, @user_id, 'tenant_owner', NOW(3), NOW(3)
WHERE @user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tenants WHERE id = @tenant_id)
ON DUPLICATE KEY UPDATE
  role = VALUES(role),
  accepted_at = VALUES(accepted_at);

COMMIT;

SELECT JSON_OBJECT(
  'status', CASE
    WHEN @user_id IS NULL THEN 'failed'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = @user_id AND role = 'platform_admin') THEN 'ready'
    ELSE 'failed'
  END,
  'checkedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
  'adminEmail', @admin_email,
  'displayName', @display_name,
  'userId', @user_id,
  'userCreated', @user_was_created,
  'emailVerified', EXISTS (SELECT 1 FROM users WHERE id = @user_id AND email_verified = 1),
  'passwordHashPresent', EXISTS (SELECT 1 FROM users WHERE id = @user_id AND password_hash IS NOT NULL AND password_hash <> ''),
  'passwordHashResetRequested', @reset_password_hash IN ('1','true','yes'),
  'passwordHashApplied', (@new_password_hash = @password_hash),
  'passwordHashUnchanged', (@existing_password_hash IS NOT NULL AND @new_password_hash = @existing_password_hash AND @new_password_hash <> @password_hash),
  'requiredRole', 'platform_admin',
  'rolePresent', EXISTS (SELECT 1 FROM user_roles WHERE user_id = @user_id AND role = 'platform_admin'),
  'tenantId', @tenant_id,
  'tenantOwnerMembershipPresent', EXISTS (SELECT 1 FROM tenant_memberships WHERE user_id = @user_id AND tenant_id = @tenant_id AND role = 'tenant_owner'),
  'evidence', CASE
    WHEN @user_id IS NULL THEN 'admin user could not be created or found'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = @user_id AND role = 'platform_admin') THEN 'admin user exists and user_roles contains platform_admin for the requested account'
    ELSE 'platform_admin role is not present after insert'
  END
) AS readiness_json;
SQL

echo "[platform-admin] ensuring platform_admin account and role for $ADMIN_EMAIL"
set +e
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$tmp_sql" > "$EVIDENCE_FILE" 2> "$EVIDENCE_FILE.err"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  now_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  err=$(tr '\n' ' ' < "$EVIDENCE_FILE.err" | sed 's/"/\\"/g')
  cat > "$EVIDENCE_FILE" <<JSON
{"status":"failed","checkedAt":"$now_utc","adminEmail":"$ADMIN_EMAIL","error":"$err"}
JSON
  cat "$EVIDENCE_FILE" >&2
  exit "$status"
fi
rm -f "$EVIDENCE_FILE.err"

# ─── Credentials-truth reconciliation ─────────────────────────────────────────
# If we generated a new password this run but the database kept the old
# password_hash (existing user + ADMIN_RESET_PASSWORD_HASH=false), the
# credentials file we just wrote points at a password that will not work.
# Detect that here and either restore the previous credentials file or
# delete the misleading one. Either way, write a marker explaining what
# happened so the operator does not silently get locked out.
if [ "$PASSWORD_WAS_GENERATED" = "1" ] && [ -n "$GENERATED_CREDENTIALS_FILE" ]; then
  applied=$(node -e "
    const fs=require('fs');
    const txt=fs.readFileSync(process.argv[1],'utf8');
    const m=txt.match(/\"passwordHashApplied\"\s*:\s*(true|false|1|0)/);
    process.stdout.write(m ? (m[1]==='true'||m[1]==='1' ? 'true' : 'false') : 'unknown');
  " "$EVIDENCE_FILE")

  abs_credentials_file="$ROOT_DIR/$GENERATED_CREDENTIALS_FILE"
  abs_previous_file=""
  if [ -n "$PREVIOUS_CREDENTIALS_FILE" ]; then
    abs_previous_file="$ROOT_DIR/$PREVIOUS_CREDENTIALS_FILE"
  fi
  marker_file="$EVIDENCE_DIR/credentials-not-applied.txt"

  if [ "$applied" = "false" ]; then
    now_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    if [ -n "$abs_previous_file" ] && [ -f "$abs_previous_file" ]; then
      mv "$abs_previous_file" "$abs_credentials_file"
      chmod 600 "$abs_credentials_file" 2>/dev/null || true
      cat > "$marker_file" <<MARKER
$now_utc
The current run generated a NEW one-time password but the database kept the
PREVIOUS password_hash for $ADMIN_EMAIL (ADMIN_RESET_PASSWORD_HASH was not
true and the user already had a password). The new credentials file would
have lied to you — it has been REPLACED with the previous credentials file
that still matches the password_hash in the database.

If you do not have access to the previous one-time password and want to set
a new one, re-run with: ADMIN_RESET_PASSWORD_HASH=true
MARKER
      echo "[platform-admin] WARNING: existing user kept its old password_hash. Restored previous credentials file." >&2
      echo "[platform-admin] See: $marker_file" >&2
    else
      rm -f "$abs_credentials_file"
      cat > "$marker_file" <<MARKER
$now_utc
The current run generated a NEW one-time password but the database kept the
existing password_hash for $ADMIN_EMAIL (ADMIN_RESET_PASSWORD_HASH was not
true and the user already had a password). No previous credentials file
existed, so the misleading new credentials file has been DELETED rather
than left to mislead future operators.

To set a new password, re-run with: ADMIN_RESET_PASSWORD_HASH=true
MARKER
      echo "[platform-admin] WARNING: existing user kept its old password_hash. Removed the misleading new credentials file." >&2
      echo "[platform-admin] See: $marker_file" >&2
    fi
  else
    # Hash was applied — the new credentials file is correct. Drop the
    # backup so the directory does not accumulate stale .previous files.
    if [ -n "$abs_previous_file" ] && [ -f "$abs_previous_file" ]; then
      rm -f "$abs_previous_file"
    fi
    rm -f "$marker_file"
  fi
fi

cat "$EVIDENCE_FILE"
printf '\n[platform-admin] evidence written: %s\n' "$EVIDENCE_FILE"

if ! grep -q '"status": "ready"\|"status":"ready"' "$EVIDENCE_FILE"; then
  exit 2
fi
