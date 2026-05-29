import fs from 'node:fs';
import process from 'node:process';

const envPath = process.env.PRODUCTION_ENV_FILE || 'selfhost/.env.production';

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return { exists: false, values: {} };
  const values = {};
  const raw = fs.readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return { exists: true, values };
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function hasPlaceholder(value) {
  if (isBlank(value)) return false;
  return /(\$\{[^}]+\}|\.local\b|yourdomain\.com|example\.com|localhost|127\.0\.0\.1|<real-|<actual-)/i.test(String(value));
}

const { exists, values } = parseEnvFile(envPath);
const failures = [];
if (!exists) failures.push(`${envPath} is missing`);

if (String(values.EMAIL_VERIFICATION_REQUIRED ?? '').toLowerCase() !== 'true') {
  failures.push(`${envPath}: EMAIL_VERIFICATION_REQUIRED must be true`);
}
if (String(values.EMAIL_VERIFICATION_DELIVERY ?? '').toLowerCase() !== 'smtp') {
  failures.push(`${envPath}: EMAIL_VERIFICATION_DELIVERY must be smtp`);
}

for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS']) {
  if (isBlank(values[key])) failures.push(`${envPath}: ${key} is required`);
  else if (hasPlaceholder(values[key])) failures.push(`${envPath}: ${key} is a placeholder (${values[key]})`);
}

const port = Number(values.SMTP_PORT);
if (!Number.isInteger(port) || port <= 0 || port > 65535) failures.push(`${envPath}: SMTP_PORT must be a valid TCP port`);

if (failures.length) {
  console.error('[verify-smtp-config] SMTP production configuration is not ready:');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log('[verify-smtp-config] OK');
