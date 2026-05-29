#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const strict = process.env.RELEASE_VERIFY_STRICT === "1";
const requireEvidence = process.env.RELEASE_VERIFY_REQUIRE_EVIDENCE === "1";
const requireRemote = process.env.RELEASE_VERIFY_REMOTE === "1";
const backendUrl = (process.env.BACKEND_URL || process.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const outputFile = process.env.RELEASE_VERIFY_OUTPUT ? resolve(root, process.env.RELEASE_VERIFY_OUTPUT) : null;

function read(file) {
  return readFileSync(resolve(root, file), "utf8");
}

const report = {
  timestamp: new Date().toISOString(),
  strict,
  backendUrl: backendUrl || null,
  checks: [],
};

function add(id, status, detail) {
  report.checks.push({ id, status, detail });
}

function envValueFromFile(file, key) {
  if (!existsSync(resolve(root, file))) return null;
  const lines = read(file).split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    if (k === key) return line.slice(idx + 1).trim();
  }
  return null;
}


function flattenLocaleKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenLocaleKeys(child, next)
      : [next];
  });
}

function collectLocaleStrings(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).flatMap(collectLocaleStrings);
}

function verifyLocales() {
  const localeFiles = ['src/i18n/locales/ar.json', 'src/i18n/locales/en.json', 'src/i18n/locales/fr.json'];
  const locales = Object.fromEntries(localeFiles.map((file) => [file, JSON.parse(read(file))]));
  const baseKeys = flattenLocaleKeys(locales['src/i18n/locales/ar.json']).sort();
  for (const file of localeFiles) {
    const keys = flattenLocaleKeys(locales[file]).sort();
    const ok = JSON.stringify(keys) === JSON.stringify(baseKeys);
    add(`i18n:keys:${file}`, ok ? 'pass' : 'fail', ok ? `${keys.length} keys aligned` : 'locale key mismatch');
  }
  const englishCopy = collectLocaleStrings(locales['src/i18n/locales/en.json']).join('\n');
  add('i18n:english-copy', /[؀-ۿ]/.test(englishCopy) ? 'fail' : 'pass', 'English locale contains no Arabic copy');
  add('i18n:supported-languages', read('src/i18n/index.ts').includes('SUPPORTED_LANGS = ["ar", "en", "fr"]') ? 'pass' : 'fail', 'Arabic, English, and French are enabled');
}


function verifyMysqlTenantIsolationEvidence() {
  const file = 'release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json';
  const fullPath = resolve(root, file);
  const exists = existsSync(fullPath);
  if (!exists) {
    add('tenant-isolation:mysql:evidence', requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence });
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(fullPath, 'utf8'));
    const passed = evidence?.passed === true && evidence?.database === 'mysql' && evidence?.evidence === 'real_mysql_integration_test';
    add('tenant-isolation:mysql:evidence', passed ? 'pass' : 'fail', {
      exists: true,
      passed: evidence?.passed === true,
      database: evidence?.database ?? null,
      tested_at: evidence?.tested_at ?? null,
      env_flag_accepted_as_proof: false,
    });
  } catch (error) {
    add('tenant-isolation:mysql:evidence', 'fail', { exists: true, parse_error: String(error), env_flag_accepted_as_proof: false });
  }
}

function verifyStagingEvidence() {
  const files = [
    ['staging:smoke:evidence', 'release-evidence/staging/staging-smoke-readiness.json', 'real_https_staging_smoke_test'],
    ['staging:docker:evidence', 'release-evidence/staging/docker-smoke-readiness.json', 'docker_compose_stage0_up_build_succeeded'],
    ['staging:restore:evidence', 'release-evidence/staging/restore-verified.json', 'restore_verification_command_succeeded'],
  ];
  const fakeHostPattern = /(^|\.)((example|yourdomain|localhost)(\.|$)|example\.com$|example\.org$|example\.net$|example\.invalid$|test$|invalid$)/i;
  const isRealHttps = (value) => {
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && !fakeHostPattern.test(parsed.hostname) && !/^(127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname);
    } catch {
      return false;
    }
  };
  for (const [id, file, expectedEvidence] of files) {
    const fullPath = resolve(root, file);
    if (!existsSync(fullPath)) {
      add(id, requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence });
      continue;
    }
    try {
      const evidence = JSON.parse(readFileSync(fullPath, 'utf8'));
      const apiUrl = evidence?.api_url ?? null;
      const ok = evidence?.passed === true && evidence?.evidence === expectedEvidence && (!apiUrl || isRealHttps(apiUrl));
      add(id, ok ? 'pass' : 'fail', {
        exists: true,
        passed: evidence?.passed === true,
        evidence: evidence?.evidence ?? null,
        api_url: apiUrl,
        api_https_url_real: apiUrl ? isRealHttps(apiUrl) : false,
        placeholder_url_accepted_as_proof: false,
      });
    } catch (error) {
      add(id, 'fail', { exists: true, parse_error: String(error), placeholder_url_accepted_as_proof: false });
    }
  }
}




function verifyVpsPreflightEvidence() {
  const file = 'release-evidence/vps-preflight/vps-preflight-latest.json';
  const fullPath = resolve(root, file);
  if (!existsSync(fullPath)) {
    add('vps:preflight:evidence', requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence });
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(fullPath, 'utf8'));
    const passed = evidence?.status === 'passed' && evidence?.publicLaunchPreflightReady === true;
    add('vps:preflight:evidence', passed ? 'pass' : 'fail', {
      exists: true,
      status: evidence?.status ?? null,
      publicLaunchPreflightReady: evidence?.publicLaunchPreflightReady === true,
      failureCount: evidence?.failureCount ?? null,
      warningCount: evidence?.warningCount ?? null,
    });
  } catch (error) {
    add('vps:preflight:evidence', 'fail', { exists: true, parse_error: String(error), publicLaunchPreflightReady: false });
  }
}

function verifySecretHygieneEvidence() {
  const file = 'release-evidence/security/secret-hygiene-readiness.json';
  const fullPath = resolve(root, file);
  if (!existsSync(fullPath)) {
    add('security:secret-hygiene:evidence', requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence });
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(fullPath, 'utf8'));
    const passed = evidence?.passed === true && (evidence?.status === 'passed' || evidence?.status === 'passed_with_warnings');
    add('security:secret-hygiene:evidence', passed ? 'pass' : 'fail', {
      exists: true,
      status: evidence?.status ?? null,
      passed: evidence?.passed === true,
      failureCount: evidence?.failureCount ?? null,
      warningCount: evidence?.warningCount ?? null,
      privateDeploymentPackage: evidence?.privateDeploymentPackage === true,
    });
  } catch (error) {
    add('security:secret-hygiene:evidence', 'fail', { exists: true, parse_error: String(error), passed: false });
  }
}

function verifyExternalBackupEvidence() {
  const file = 'release-evidence/backup/external-backup-target-readiness.json';
  const fullPath = resolve(root, file);
  if (!existsSync(fullPath)) {
    add('backup:external-target:evidence', requireEvidence ? 'fail' : 'warn', { exists: false, required: requireEvidence });
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(fullPath, 'utf8'));
    const detail = evidence?.detail || {};
    const method = evidence?.method ?? null;
    const rcloneOk = method === 'rclone' && Boolean(detail.remote || evidence?.remote);
    const mountOk = method === 'mounted_directory'
      && Boolean(detail.remote_dir)
      && !String(detail.remote_dir).startsWith('/tmp/')
      && detail.mount_target
      && detail.mount_target !== '/'
      && detail.mount_fstype !== 'overlay'
      && !(detail.root_device && detail.remote_device && detail.root_device === detail.remote_device);
    const passed = evidence?.passed === true
      && evidence?.evidence === 'external_backup_target_verification'
      && evidence?.accepted_as_public_launch_evidence === true
      && (rcloneOk || mountOk);
    add('backup:external-target:evidence', passed ? 'pass' : 'fail', {
      exists: true,
      passed: evidence?.passed === true,
      status: evidence?.status ?? null,
      method,
      checked_at: evidence?.checked_at ?? null,
      accepted_as_public_launch_evidence: evidence?.accepted_as_public_launch_evidence === true,
      remote: detail.remote ?? evidence?.remote ?? null,
      remote_dir: detail.remote_dir ?? null,
      mount_target: detail.mount_target ?? null,
      mount_fstype: detail.mount_fstype ?? null,
      root_device: detail.root_device ?? null,
      remote_device: detail.remote_device ?? null,
    });
  } catch (error) {
    add('backup:external-target:evidence', 'fail', { exists: true, parse_error: String(error), accepted_as_public_launch_evidence: false });
  }
}

function verifyCaddyEdgeRateLimit() {
  const caddyfile = read('Caddyfile');
  const compose = read('docker-compose.yml');
  const dockerfilePath = 'selfhost/caddy/Dockerfile';
  const dockerfile = existsSync(resolve(root, dockerfilePath)) ? read(dockerfilePath) : '';
  add('security:caddy:custom-rate-limit-build', compose.includes('context: ./selfhost/caddy') && dockerfile.includes('github.com/mholt/caddy-ratelimit') ? 'pass' : 'fail', {
    custom_caddy_build: compose.includes('context: ./selfhost/caddy'),
    rate_limit_module: dockerfile.includes('github.com/mholt/caddy-ratelimit'),
  });
  add('security:caddy:edge-rate-limit', caddyfile.includes('rate_limit') && caddyfile.includes('zone auth_per_ip') && caddyfile.includes('zone api_per_ip') ? 'pass' : 'fail', {
    rate_limit_directive: caddyfile.includes('rate_limit'),
    auth_zone: caddyfile.includes('zone auth_per_ip'),
    api_zone: caddyfile.includes('zone api_per_ip'),
  });
}

function ensureFile(file) {
  const ok = existsSync(resolve(root, file));
  add(`file:${file}`, ok ? "pass" : "fail", ok ? "present" : "missing");
  return ok;
}
function collectFiles(dir) {
  const fullDir = resolve(root, dir);
  if (!existsSync(fullDir)) return [];
  return readdirSync(fullDir).flatMap((entry) => {
    const full = resolve(fullDir, entry);
    return statSync(full).isDirectory()
      ? collectFiles(`${dir}/${entry}`)
      : [full];
  });
}


function verifyPrismaMigrations() {
  const migrationsDir = resolve(root, 'backend/prisma/migrations');
  const dockerfile = existsSync(resolve(root, 'backend/Dockerfile')) ? read('backend/Dockerfile') : '';
  let migrationSqlFiles = [];
  if (existsSync(migrationsDir)) {
    migrationSqlFiles = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(migrationsDir, entry.name, 'migration.sql'))
      .filter((file) => existsSync(file));
  }
  const combinedSql = migrationSqlFiles.map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase();
  const requiredTables = ['tenants', 'users', 'user_roles', 'stations', 'lines', 'route_stops'];
  const missingTables = requiredTables.filter((table) => !combinedSql.includes('create table if not exists `' + table + '`'));
  const unsafeDockerFallback = /accept-data-loss|db push/i.test(dockerfile);
  add('db:prisma:migrations-present', migrationSqlFiles.length > 0 ? 'pass' : 'fail', { migration_sql_files: migrationSqlFiles.length });
  add('db:prisma:migrations-required-tables', missingTables.length === 0 ? 'pass' : 'fail', missingTables.length === 0 ? { required_tables: requiredTables } : { missing_tables: missingTables });
  add('db:prisma:no-destructive-startup-fallback', !unsafeDockerFallback && /prisma migrate deploy/.test(dockerfile) ? 'pass' : 'fail', {
    uses_migrate_deploy: /prisma migrate deploy/.test(dockerfile),
    contains_unsafe_fallback: unsafeDockerFallback,
  });
}



ensureFile('.github/workflows/ci.yml');
ensureFile('.github/workflows/release-verification.yml');
ensureFile('scripts/release-verify.mjs');
ensureFile('scripts/enterprise-readiness.mjs');
ensureFile('scripts/validate-real-url.mjs');
ensureFile('scripts/run-staging-smoke.mjs');
ensureFile('scripts/run-enterprise-proof.mjs');
ensureFile('selfhost/compose.stage0.yml');
ensureFile('selfhost/.env.example');
ensureFile('selfhost/scripts/smoke-test.sh');
ensureFile('selfhost/scripts/verify-restore.sh');
ensureFile('selfhost/scripts/verify-backup-target.sh');
ensureFile('selfhost/scripts/verify-backup-target.mjs');
ensureFile('selfhost/scripts/vps-preflight.sh');
ensureFile('scripts/vps-preflight.mjs');
ensureFile('SECURITY.md');
ensureFile('backend/scripts/release-verify.ts');
ensureFile('scripts/verify-prisma-migrations.mjs');
ensureFile('backend/prisma/migrations/20260507162000_init/migration.sql');
ensureFile('backend/scripts/run-mysql-tenant-isolation.mjs');
ensureFile('backend/scripts/run-mysql-tenant-isolation-with-docker.mjs');
ensureFile('backend/compose.mysql-isolation.yml');
ensureFile('backend/test/tenant-isolation.mysql.test.ts');
ensureFile('src/lib/sentry.ts');
ensureFile('backend/src/common/observability/request-logging.interceptor.ts');
ensureFile('backend/src/common/observability/all-exceptions.filter.ts');
verifyLocales();
verifyMysqlTenantIsolationEvidence();
verifyStagingEvidence();
verifyCaddyEdgeRateLimit();
verifyPrismaMigrations();
verifyExternalBackupEvidence();
verifyVpsPreflightEvidence();
verifySecretHygieneEvidence();

const packageJson = JSON.parse(read('package.json'));
const backendPackageJson = JSON.parse(read('backend/package.json'));
const frontendScripts = packageJson.scripts ?? {};
const backendScripts = backendPackageJson.scripts ?? {};
add('script:frontend:build', frontendScripts.build ? 'pass' : 'fail', frontendScripts.build ?? 'missing');
add('script:frontend:lint', frontendScripts.lint ? 'pass' : 'fail', frontendScripts.lint ?? 'missing');
add('script:frontend:test', frontendScripts.test ? 'pass' : 'fail', frontendScripts.test ?? 'missing');
add('script:frontend:release-verify', frontendScripts['verify:release'] ? 'pass' : 'fail', frontendScripts['verify:release'] ?? 'missing');
add('script:frontend:staging-url', frontendScripts['verify:staging-url'] ? 'pass' : 'fail', frontendScripts['verify:staging-url'] ?? 'missing');
add('script:frontend:staging-smoke', frontendScripts['staging:smoke'] ? 'pass' : 'fail', frontendScripts['staging:smoke'] ?? 'missing');
add('script:frontend:prove-enterprise', frontendScripts['prove:enterprise'] ? 'pass' : 'fail', frontendScripts['prove:enterprise'] ?? 'missing');
add('script:frontend:backup-target', frontendScripts['verify:backup-target'] ? 'pass' : 'fail', frontendScripts['verify:backup-target'] ?? 'missing');
add('script:frontend:vps-preflight', frontendScripts['verify:vps-preflight'] ? 'pass' : 'fail', frontendScripts['verify:vps-preflight'] ?? 'missing');
add('script:frontend:secret-hygiene', frontendScripts['verify:secret-hygiene'] ? 'pass' : 'fail', frontendScripts['verify:secret-hygiene'] ?? 'missing');
add('script:enterprise:readiness', frontendScripts['verify:enterprise'] ? 'pass' : 'fail', frontendScripts['verify:enterprise'] ?? 'missing');
add('script:backend:build', backendScripts.build ? 'pass' : 'fail', backendScripts.build ?? 'missing');
add('script:backend:lint', backendScripts.lint ? 'pass' : 'fail', backendScripts.lint ?? 'missing');
add('script:backend:test', backendScripts.test ? 'pass' : 'fail', backendScripts.test ?? 'missing');
add('script:backend:release-verify', backendScripts['release:verify'] ? 'pass' : 'fail', backendScripts['release:verify'] ?? 'missing');
add('script:backend:tenant-isolation:mysql', backendScripts['test:tenant-isolation:mysql'] ? 'pass' : 'fail', backendScripts['test:tenant-isolation:mysql'] ?? 'missing');
add('script:backend:tenant-isolation:mysql:docker', backendScripts['test:tenant-isolation:mysql:docker'] ? 'pass' : 'fail', backendScripts['test:tenant-isolation:mysql:docker'] ?? 'missing');

const apiBaseExample = envValueFromFile('.env.frontend.example', 'VITE_API_BASE_URL');
add('env:frontend:apiBaseExample', apiBaseExample ? 'pass' : 'warn', apiBaseExample ?? 'missing');
const appVersion = envValueFromFile('.env.production.example', 'APP_VERSION');
add('env:backend:appVersion', appVersion ? 'pass' : 'warn', appVersion ?? 'missing');
const sentryFrontend = envValueFromFile('.env.frontend.example', 'VITE_SENTRY_DSN');
add('env:frontend:sentry', sentryFrontend ? 'pass' : 'warn', sentryFrontend || 'not set in example');
const sentryBackend = envValueFromFile('backend/.env.example', 'SENTRY_DSN');
add('env:backend:sentry', sentryBackend ? 'pass' : 'warn', sentryBackend || 'not set in example');

const checksSummary = () => ({
  pass: report.checks.filter((c) => c.status === 'pass').length,
  warn: report.checks.filter((c) => c.status === 'warn').length,
  fail: report.checks.filter((c) => c.status === 'fail').length,
});

async function remoteChecks() {
  if (!backendUrl) {
    add('remote:backendUrl', requireRemote ? 'fail' : 'warn', 'BACKEND_URL / VITE_API_BASE_URL not provided');
    return;
  }
  const healthUrl = backendUrl.endsWith('/api') ? `${backendUrl}/health` : `${backendUrl}/api/health`;
  const stationsUrl = backendUrl.endsWith('/api') ? `${backendUrl}/stations` : `${backendUrl}/api/stations`;
  try {
    const healthRes = await fetch(healthUrl);
    const healthText = await healthRes.text();
    add('remote:health', healthRes.ok ? 'pass' : 'fail', `${healthRes.status} ${healthText.slice(0, 200)}`);
  } catch (error) {
    add('remote:health', requireRemote ? 'fail' : 'warn', String(error));
  }
  try {
    const stationsRes = await fetch(stationsUrl);
    const stationsText = await stationsRes.text();
    add('remote:stations', stationsRes.ok ? 'pass' : 'fail', `${stationsRes.status} ${stationsText.slice(0, 200)}`);
  } catch (error) {
    add('remote:stations', requireRemote ? 'fail' : 'warn', String(error));
  }
}

await remoteChecks();
report.summary = checksSummary();
if (outputFile) writeFileSync(outputFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (strict && report.summary.fail > 0) process.exit(1);
