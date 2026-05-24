'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Pure prerequisite check for selfhost/.env.production.
//
// The bootstrap shell scripts (grant-platform-admin.sh,
// bootstrap-public-launch-data.sh, vps-first-run.sh) all need a minimum set
// of env vars before they can usefully run docker compose against the
// production stack. Without a check, the failure modes are cryptic:
//
//   - "env file not found"        when ENV_FILE points at a missing file
//   - "no such service: mysql"    when docker compose has nothing to bring up
//   - "Access denied for user"    when MYSQL_* are unset
//   - silent backend boot failure when JWT_* are unset
//
// This module turns those late, confusing failures into one early, explicit
// error that lists every missing variable in a single message.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_BOOTSTRAP_VARS = [
  // Public hostname — backend boot, Caddy, OAuth redirect URIs all need it.
  'API_DOMAIN',
  // Docker compose mysql service credentials.
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  // JWT signing — backend will not boot without these.
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

function checkRequiredEnvVars(env, required) {
  if (env == null || typeof env !== 'object' || Array.isArray(env)) {
    // A null/missing env file is the same failure mode as an empty one for
    // our purposes: every required var is "missing".
    return { ok: false, missing: [...required], present: [] };
  }
  const missing = [];
  const present = [];
  for (const key of required) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      missing.push(key);
    } else {
      present.push(key);
    }
  }
  return { ok: missing.length === 0, missing, present };
}

function parseEnvFile(content) {
  // Minimal POSIX-style parser: KEY=VALUE per line, comments and blanks
  // skipped, surrounding single/double quotes stripped. Mirrors the parser
  // already used by validate-production-config.mjs and other release scripts
  // in this repo so we have one consistent interpretation of .env files.
  const out = {};
  if (typeof content !== 'string') return out;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function formatPrereqError(missing, envPath) {
  // Single multi-line message designed to be paste-friendly into a runbook.
  // We deliberately list ALL missing variables in one go rather than
  // failing on the first one — operators tend to come back with all of them
  // unset on a fresh VPS.
  const lines = [
    'PREREQUISITE CHECK FAILED',
    '',
    `The following required variables are missing or empty in ${envPath}:`,
    '',
    ...missing.map((v) => `  - ${v}`),
    '',
    'Required set:',
    '  - API_DOMAIN',
    '  - MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD',
    '  - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET',
    '',
    'Reference template: selfhost/.env.example',
    'After filling them in, re-run the same command.',
  ];
  return lines.join('\n');
}

module.exports = {
  REQUIRED_BOOTSTRAP_VARS,
  checkRequiredEnvVars,
  parseEnvFile,
  formatPrereqError,
};
