#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${PRODUCTION_ENV_FILE:-selfhost/.env.production}

require() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "${value}" ]; then
    echo "ERROR: ${name} is required" >&2
    exit 1
  fi
  case "${value}" in
    *'${'*|*example.com*|*localhost*|*127.0.0.1*|*yourdomain.com*|*'<real-'*|*'<actual-'*)
      echo "ERROR: ${name} looks like a placeholder: ${value}" >&2
      exit 1
      ;;
  esac
}

require SMTP_HOST
require SMTP_PORT
require SMTP_USER
require SMTP_PASS
require SMTP_FROM

if ! [[ "${SMTP_PORT}" =~ ^[0-9]+$ ]] || [ "${SMTP_PORT}" -lt 1 ] || [ "${SMTP_PORT}" -gt 65535 ]; then
  echo "ERROR: SMTP_PORT must be a valid TCP port" >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} not found" >&2
  exit 1
fi

quote_env() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped=$(printf '%s' "$value" | sed 's/[\\&]/\\&/g')
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "${ENV_FILE}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

set_env SMTP_HOST "${SMTP_HOST}"
set_env SMTP_PORT "${SMTP_PORT}"
set_env SMTP_SECURE "${SMTP_SECURE:-false}"
set_env SMTP_STARTTLS "${SMTP_STARTTLS:-true}"
set_env SMTP_FROM "$(quote_env "${SMTP_FROM}")"
set_env SMTP_USER "${SMTP_USER}"
set_env SMTP_PASS "${SMTP_PASS}"
set_env EMAIL_VERIFICATION_REQUIRED "true"
set_env EMAIL_VERIFICATION_DELIVERY "smtp"

if [ -n "${EMAIL_VERIFICATION_BASE_URL:-}" ]; then
  set_env EMAIL_VERIFICATION_BASE_URL "${EMAIL_VERIFICATION_BASE_URL}"
fi

node scripts/verify-smtp-config.mjs

echo "[setup-smtp] SMTP production configuration written to ${ENV_FILE} and validated."
