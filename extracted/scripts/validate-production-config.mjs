import fs from 'node:fs';
import dns from 'node:dns/promises';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const envPath = process.env.PRODUCTION_ENV_FILE || 'selfhost/.env.production';
const frontendEnvPath = process.env.FRONTEND_ENV_FILE || '.env.production.frontend';
const allowNetworkSkip = process.env.SKIP_NPM_NETWORK_CHECK !== '0' && process.env.REQUIRE_NPM_NETWORK_CHECK !== '1';

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
  return /(\.local\b|yourdomain\.com|example\.com|<real-|<actual-|localhost|127\.0\.0\.1|\*\.mwasalat\.local)/i.test(String(value));
}


function isPlainDomain(value) {
  if (isBlank(value)) return false;
  const v = String(value).trim();
  if (v.includes('://') || v.includes('/') || v.includes('*')) return false;
  if (hasPlaceholder(v)) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
}
function urlHost(value) { try { return new URL(value).hostname; } catch { return ''; } }
function urlPath(value) { try { return new URL(value).pathname.replace(/\/$/, ''); } catch { return ''; } }

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !hasPlaceholder(value);
  } catch {
    return false;
  }
}

const backend = parseEnvFile(envPath);
const frontend = parseEnvFile(frontendEnvPath);
const failures = [];
const warnings = [];

if (!backend.exists) failures.push(`${envPath} is missing`);
if (!frontend.exists) failures.push(`${frontendEnvPath} is missing`);

const b = backend.values;
const f = frontend.values;

for (const key of ['APP_DOMAIN', 'API_DOMAIN']) {
  if (isBlank(b[key])) failures.push(`${envPath}: ${key} is empty`);
  else if (!isPlainDomain(b[key])) failures.push(`${envPath}: ${key} must be a real domain without protocol/path/wildcard (${b[key]})`);
}
if (!isBlank(b.APP_DOMAIN) && !isBlank(b.API_DOMAIN) && String(b.APP_DOMAIN).trim() === String(b.API_DOMAIN).trim()) {
  failures.push(`${envPath}: APP_DOMAIN and API_DOMAIN must be different hostnames`);
}

for (const key of ['PUBLIC_URL', 'GOOGLE_REDIRECT_URI', 'APP_REDIRECT_URI', 'BILLING_APP_URL', 'BILLING_SUCCESS_URL', 'BILLING_CANCEL_URL', 'BILLING_PORTAL_RETURN_URL', 'VITE_API_BASE_URL']) {
  if (isBlank(b[key])) failures.push(`${envPath}: ${key} is empty`);
  else if (hasPlaceholder(b[key])) failures.push(`${envPath}: ${key} still contains a placeholder/local value (${b[key]})`);
  else if (!isHttpsUrl(b[key])) failures.push(`${envPath}: ${key} must be a real https:// URL`);
}

if (isHttpsUrl(b.PUBLIC_URL) && b.API_DOMAIN && urlHost(b.PUBLIC_URL) !== b.API_DOMAIN) failures.push(`${envPath}: PUBLIC_URL host must equal API_DOMAIN`);
if (isHttpsUrl(b.GOOGLE_REDIRECT_URI) && b.API_DOMAIN && urlHost(b.GOOGLE_REDIRECT_URI) !== b.API_DOMAIN) failures.push(`${envPath}: GOOGLE_REDIRECT_URI host must equal API_DOMAIN`);
for (const key of ['APP_REDIRECT_URI', 'BILLING_APP_URL', 'BILLING_SUCCESS_URL', 'BILLING_CANCEL_URL', 'BILLING_PORTAL_RETURN_URL']) {
  if (isHttpsUrl(b[key]) && b.APP_DOMAIN && urlHost(b[key]) !== b.APP_DOMAIN) failures.push(`${envPath}: ${key} host must equal APP_DOMAIN`);
}
if (isHttpsUrl(b.VITE_API_BASE_URL) && b.API_DOMAIN && urlHost(b.VITE_API_BASE_URL) !== b.API_DOMAIN) failures.push(`${envPath}: VITE_API_BASE_URL host must equal API_DOMAIN`);
if (isHttpsUrl(b.VITE_API_BASE_URL) && urlPath(b.VITE_API_BASE_URL) !== '/api') failures.push(`${envPath}: VITE_API_BASE_URL path must be exactly /api`);

const emailVerificationRequired = String(b.EMAIL_VERIFICATION_REQUIRED ?? '').toLowerCase() === 'true';
if (!emailVerificationRequired) failures.push(`${envPath}: EMAIL_VERIFICATION_REQUIRED must be true for password registration`);
if (String(b.EMAIL_VERIFICATION_DELIVERY ?? '').toLowerCase() !== 'smtp') failures.push(`${envPath}: EMAIL_VERIFICATION_DELIVERY must be smtp in production`);
if (isBlank(b.EMAIL_VERIFICATION_BASE_URL)) failures.push(`${envPath}: EMAIL_VERIFICATION_BASE_URL is empty`);
else if (hasPlaceholder(b.EMAIL_VERIFICATION_BASE_URL)) failures.push(`${envPath}: EMAIL_VERIFICATION_BASE_URL still contains a placeholder/local value (${b.EMAIL_VERIFICATION_BASE_URL})`);
else if (!isHttpsUrl(b.EMAIL_VERIFICATION_BASE_URL)) failures.push(`${envPath}: EMAIL_VERIFICATION_BASE_URL must be a real https:// URL`);
else if (b.API_DOMAIN && urlHost(b.EMAIL_VERIFICATION_BASE_URL) !== b.API_DOMAIN) failures.push(`${envPath}: EMAIL_VERIFICATION_BASE_URL host must equal API_DOMAIN`);
else if (urlPath(b.EMAIL_VERIFICATION_BASE_URL) !== '/api/auth/verify-email') failures.push(`${envPath}: EMAIL_VERIFICATION_BASE_URL path must be exactly /api/auth/verify-email`);
const smtpRequired = emailVerificationRequired && String(b.EMAIL_VERIFICATION_DELIVERY ?? '').toLowerCase() === 'smtp';
if (smtpRequired) {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS']) {
    if (isBlank(b[key])) failures.push(`${envPath}: ${key} is required for password-registration email verification`);
    else if (hasPlaceholder(b[key])) failures.push(`${envPath}: ${key} still contains a placeholder/local value (${b[key]})`);
  }
  const smtpPort = Number(b.SMTP_PORT);
  if (!Number.isInteger(smtpPort) || smtpPort <= 0 || smtpPort > 65535) failures.push(`${envPath}: SMTP_PORT must be a valid TCP port`);
}

if (!isBlank(b.CORS_ORIGIN)) {
  const origins = b.CORS_ORIGIN.split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
  const requiredOrigins = [`https://${b.APP_DOMAIN}`, `https://${b.API_DOMAIN}`];
  if (!origins.length) failures.push(`${envPath}: CORS_ORIGIN has no origins`);
  for (const origin of origins) {
    if (!isHttpsUrl(origin)) failures.push(`${envPath}: CORS_ORIGIN entry must be a real https:// origin: ${origin}`);
  }
  for (const requiredOrigin of requiredOrigins) {
    if (!hasPlaceholder(requiredOrigin) && !origins.includes(requiredOrigin)) failures.push(`${envPath}: CORS_ORIGIN must include ${requiredOrigin}`);
  }
}

const frontendApi = f.VITE_API_BASE_URL;
if (isBlank(frontendApi)) failures.push(`${frontendEnvPath}: VITE_API_BASE_URL is empty; set an explicit production URL`);
else if (/\$\{[^}]+\}/.test(String(frontendApi))) failures.push(`${frontendEnvPath}: VITE_API_BASE_URL contains an unexpanded shell template (${frontendApi})`);
else if (hasPlaceholder(frontendApi)) failures.push(`${frontendEnvPath}: VITE_API_BASE_URL still contains a placeholder/local value (${frontendApi})`);
else if (!isHttpsUrl(frontendApi)) failures.push(`${frontendEnvPath}: VITE_API_BASE_URL must be a real https:// URL`);
else if (urlPath(frontendApi) !== '/api') failures.push(`${frontendEnvPath}: VITE_API_BASE_URL path must be exactly /api`);
else if (b.VITE_API_BASE_URL && frontendApi !== b.VITE_API_BASE_URL) failures.push(`${frontendEnvPath}: VITE_API_BASE_URL must match ${envPath}: VITE_API_BASE_URL`);

const hasRclone = !isBlank(b.BACKUP_RCLONE_REMOTE);
const hasRemoteDir = !isBlank(b.BACKUP_REMOTE_DIR);
const requireExternalBackup = String(b.BACKUP_REQUIRE_EXTERNAL_TARGET ?? 'true').toLowerCase() !== 'false';
const requireRemoteDirMount = String(b.BACKUP_REMOTE_DIR_REQUIRE_MOUNT ?? 'true').toLowerCase() !== 'false';
if (requireExternalBackup && !hasRclone && !hasRemoteDir) {
  failures.push(`${envPath}: configure a verified external backup target: BACKUP_RCLONE_REMOTE or BACKUP_REMOTE_DIR`);
}
if (hasRclone && hasPlaceholder(b.BACKUP_RCLONE_REMOTE)) {
  failures.push(`${envPath}: BACKUP_RCLONE_REMOTE still looks like a placeholder (${b.BACKUP_RCLONE_REMOTE})`);
}
if (hasRemoteDir && hasPlaceholder(b.BACKUP_REMOTE_DIR)) {
  failures.push(`${envPath}: BACKUP_REMOTE_DIR still looks like a placeholder (${b.BACKUP_REMOTE_DIR})`);
}
if (hasRemoteDir && !b.BACKUP_REMOTE_DIR.startsWith('/')) {
  failures.push(`${envPath}: BACKUP_REMOTE_DIR must be an absolute path (${b.BACKUP_REMOTE_DIR})`);
}
if (hasRemoteDir && requireRemoteDirMount) {
  try {
    fs.mkdirSync(b.BACKUP_REMOTE_DIR, { recursive: true });
    const rootDevice = execFileSync('df', ['-P', root], { encoding: 'utf8' }).trim().split(/\n/).at(-1).split(/\s+/)[0];
    const remoteDevice = execFileSync('df', ['-P', b.BACKUP_REMOTE_DIR], { encoding: 'utf8' }).trim().split(/\n/).at(-1).split(/\s+/)[0];
    let mountTarget = '';
    let mountFstype = '';
    try {
      const mountInfo = execFileSync('findmnt', ['-T', b.BACKUP_REMOTE_DIR, '-n', '-o', 'TARGET,FSTYPE'], { encoding: 'utf8' }).trim();
      const parts = mountInfo.split(/\s+/);
      mountTarget = parts[0] || '';
      mountFstype = parts[1] || '';
    } catch {
      mountTarget = '';
      mountFstype = '';
    }
    if (!mountTarget) failures.push(`${envPath}: could not verify BACKUP_REMOTE_DIR mount target; install findmnt/util-linux or use BACKUP_RCLONE_REMOTE`);
    else if (mountTarget === '/') failures.push(`${envPath}: BACKUP_REMOTE_DIR resolves to root filesystem, not an external mount (${b.BACKUP_REMOTE_DIR})`);
    if (mountFstype === 'overlay') failures.push(`${envPath}: BACKUP_REMOTE_DIR resolves to overlay/root filesystem, not an external backup mount (${b.BACKUP_REMOTE_DIR})`);
    if (rootDevice === remoteDevice) failures.push(`${envPath}: BACKUP_REMOTE_DIR is on the same filesystem as the app root; use an external mount or BACKUP_RCLONE_REMOTE`);
  } catch (error) {
    failures.push(`${envPath}: failed to verify BACKUP_REMOTE_DIR as an external mount (${error.message})`);
  }
}

if (!allowNetworkSkip) {
  try {
    await dns.lookup('registry.npmjs.org');
  } catch (error) {
    failures.push(`VPS/network: registry.npmjs.org DNS lookup failed (${error.code || error.message}); Docker build/npm install will fail until outbound npm access works`);
  }
}

const checkedAt = new Date().toISOString();
const result = {
  checkedAt,
  tested_at: checkedAt,
  files: { productionEnv: envPath, frontendEnv: frontendEnvPath },
  passed: failures.length === 0,
  failures,
  warnings,
};

fs.mkdirSync('release-evidence/config', { recursive: true });
fs.writeFileSync('release-evidence/config/production-config-readiness.json', `${JSON.stringify(result, null, 2)}\n`);

if (warnings.length) {
  console.warn(warnings.map((w) => `WARN: ${w}`).join('\n'));
}
if (failures.length) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  console.error('Wrote release-evidence/config/production-config-readiness.json');
  process.exit(1);
}
console.log('Production config readiness: passed');
console.log('Wrote release-evidence/config/production-config-readiness.json');
