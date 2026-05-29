#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const strict = process.env.SECRET_HYGIENE_STRICT !== '0';
const outDir = path.join(root, 'release-evidence', 'security');
fs.mkdirSync(outDir, { recursive: true });
const latestPath = path.join(outDir, 'secret-hygiene-readiness.json');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const stampPath = path.join(outDir, `secret-hygiene-${stamp}.json`);

const skippedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache']);
const binaryExt = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.tgz','.lockb','.woff','.woff2','.ttf','.eot','.mp4','.mov']);
const allowedSecretFiles = new Set([
  'selfhost/.env.production',
]);
const allowedSecretPatterns = [
  /^selfhost\/\.env\.example$/,
  /^\.env\.production\.example$/,
  /^backend\/\.env\.example$/,
  /^docs\//,
  /^README\.md$/,
  /^docker-compose\.yml$/,
  /^Caddyfile$/,
  /^\.github\//,
  /^scripts\/verify-secret-hygiene\.mjs$/,
  /^selfhost\/scripts\/grant-platform-admin\.sh$/,
  /^selfhost\/scripts\/hash-admin-password\.mjs$/,
  /^release-evidence\/security\//,
];
const highRiskFilePatterns = [
  /^\.env$/,
  /^\.env\.(?!production\.example$|production\.frontend$|frontend\.example$)/,
  /^backend\/\.env$/,
  /^frontend\/\.env$/,
];

function rel(p) { return path.relative(root, p).split(path.sep).join('/'); }
function isTextFile(file) {
  if (binaryExt.has(path.extname(file).toLowerCase())) return false;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    return !buf.subarray(0, n).includes(0);
  } catch { return false; }
}
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}
function allowedForSecret(file) {
  if (allowedSecretFiles.has(file)) return true;
  return allowedSecretPatterns.some((re) => re.test(file));
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

const checks = [];
const findings = [];
function add(name, status, detail, extra = {}) { checks.push({ name, status, detail, ...extra }); }
function record(file, line, kind, value, severity = 'high') {
  findings.push({ file, line, kind, severity, fingerprint: sha256(`${kind}:${value}`).slice(0, 16) });
}

const files = walk(root).map(rel).sort();
const highRiskFiles = files.filter((f) => highRiskFilePatterns.some((re) => re.test(f)) && f !== '.env.production.example');
if (highRiskFiles.length) add('files:no-unsafe-env-files', 'failed', 'Unexpected env-like files are included in the package', { files: highRiskFiles });
else add('files:no-unsafe-env-files', 'passed', 'No unsafe root/backend env files are packaged');

for (const f of files) {
  const full = path.join(root, f);
  if (!isTextFile(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const n = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const kv = trimmed.match(/^([A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|WEBHOOK_SECRET)[A-Z0-9_]*)=(.*)$/);
    if (kv) {
      const key = kv[1];
      const value = kv[2].trim().replace(/^['"]|['"]$/g, '');
      if (!value || /^(change-me|replace|replace-me|example|your-|\$\{|<)/i.test(value)) return;
      if (!allowedForSecret(f)) record(f, n, `secret-env:${key}`, value, 'critical');
    }

    if (/\b(sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/.test(line)) record(f, n, 'stripe-live-secret', line, 'critical');
    if (/\bAIza[0-9A-Za-z_-]{20,}\b/.test(line)) record(f, n, 'google-api-key', line, 'critical');
    if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(line)) record(f, n, 'jwt-like-token', line, 'high');
    if (/BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY/.test(line)) record(f, n, 'private-key', line, 'critical');
    if (/\$argon2id\$/.test(line) && !/^selfhost\/scripts\/grant-platform-admin\.sh$/.test(f) && !/^selfhost\/seeds\/002-platform-admin\.sql$/.test(f)) record(f, n, 'password-hash-in-doc-or-config', line, 'high');
    if (/Bootstrap password|For first login only/i.test(line)) record(f, n, 'plaintext-bootstrap-password-doc', line, 'critical');
  });
}

const disallowedFindings = findings.filter((x) => !allowedForSecret(x.file));
if (disallowedFindings.length) add('scan:no-disallowed-secrets', 'failed', 'Secret-like values found outside the allowed private env file or approved templates/docs', { findingCount: disallowedFindings.length, findings: disallowedFindings.slice(0, 100) });
else add('scan:no-disallowed-secrets', 'passed', 'No disallowed secret-like values found outside approved locations');

const privateEnv = path.join(root, 'selfhost/.env.production');
if (fs.existsSync(privateEnv)) {
  const mode = fs.statSync(privateEnv).mode & 0o777;
  const content = fs.readFileSync(privateEnv, 'utf8');
  const hasInternalSecrets = /^(MYSQL_ROOT_PASSWORD|MYSQL_PASSWORD|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET)=\S{24,}/m.test(content);
  add('private-env:selfhost-production-present', 'warning', 'selfhost/.env.production is packaged and contains deployment secrets; treat this ZIP as private and rotate if shared outside the deployment operator', { mode: mode.toString(8), hasInternalSecrets });
} else {
  add('private-env:selfhost-production-present', 'failed', 'selfhost/.env.production is missing');
}

const failed = checks.filter((c) => c.status === 'failed');
const warnings = checks.filter((c) => c.status === 'warning');
const report = {
  checkedAt: new Date().toISOString(),
  status: failed.length ? 'failed' : 'passed_with_warnings',
  passed: failed.length === 0,
  publicPackageSafe: failed.length === 0 && warnings.length === 0,
  privateDeploymentPackage: true,
  failureCount: failed.length,
  warningCount: warnings.length,
  checks,
  notes: [
    'This package intentionally includes selfhost/.env.production for private deployment. Do not publish it publicly.',
    'The scanner redacts matched values and stores only short fingerprints.',
    'Rotate selfhost/.env.production secrets if this ZIP is shared with anyone outside the deployment operator.'
  ]
};
fs.writeFileSync(latestPath, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(stampPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (strict && failed.length) process.exit(2);
