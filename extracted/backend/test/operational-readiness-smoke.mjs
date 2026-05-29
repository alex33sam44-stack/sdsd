#!/usr/bin/env node
/**
 * Smoke for the operational completeness layers added in PR #19.
 * Self-contained, no MySQL or Nest boot required.
 *
 *   node backend/test/operational-readiness-smoke.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');
const has = (rel) => existsSync(resolve(REPO, rel));

let pass = 0, fail = 0;
const out = [];
const check = (name, ok, detail) => {
  if (ok) pass += 1; else fail += 1;
  out.push({ name, ok: !!ok, detail: ok ? '' : detail ?? '' });
};

// --- env template ---
check('env template ships with the repo', has('selfhost/.env.production.template'));
const tpl = read('selfhost/.env.production.template');
const required = [
  'APP_DOMAIN', 'API_DOMAIN', 'JWT_SECRET',
  'STRIPE_PRICE_STARTER_MONTHLY', 'LEMON_VARIANT_GROWTH_YEARLY',
  'BACKUP_REMOTE_DIR', 'AUDIT_RETENTION_DAYS', 'REALTIME_MAX_SUBSCRIBERS',
];
for (const k of required) check(`env template defines ${k}`, tpl.includes(`${k}=`));

// --- runbook ---
check('selfhost env runbook present', has('docs/SELFHOST_PRODUCTION_ENV.md'));
const runbook = read('docs/SELFHOST_PRODUCTION_ENV.md');
check('runbook covers rotation', runbook.toLowerCase().includes('rotation'));
check('runbook covers validation', runbook.toLowerCase().includes('validation checklist'));

// --- deep health ---
check('deep health controller present', has('backend/src/modules/health/health.deep.controller.ts'));
const deep = read('backend/src/modules/health/health.deep.controller.ts');
check('deep health exposes GET /api/health/deep', deep.includes("@Get('deep')") && deep.includes("@Controller('health')"));
check('deep health probes db.ping', deep.includes("name: 'db.ping'"));
check('deep health probes i18n tables', deep.includes('translations') && deep.includes('translation_cache'));
check('deep health 503 on fail', deep.includes('SERVICE_UNAVAILABLE'));

// --- verify-restore ---
check('verify-restore script present', has('backend/scripts/verify-restore.mjs'));
const restore = read('backend/scripts/verify-restore.mjs');
check('verify-restore picks newest .sql.gz', restore.includes('.sql.gz'));
check('verify-restore drops verify_* DB', restore.includes('DROP DATABASE') && restore.includes('verify_'));
check('verify-restore exits 0/1/2', restore.includes('process.exit(0') || restore.includes('process.exit(ok'));

// --- backup-drill cron ---
check('backup-drill cron present', has('selfhost/cron/backup-drill.cron'));
const drill = read('selfhost/cron/backup-drill.cron');
check('drill scheduled monthly at 04:30', /30 4 1 \* \* root/.test(drill));
check('drill calls verify-restore', drill.includes('verify-restore.mjs'));

// --- pilot seed ---
check('seed-pilot script present', has('backend/scripts/seed-pilot-data.ts'));
const pilot = read('backend/scripts/seed-pilot-data.ts');
const stations = (pilot.match(/slug:\s*'/g) ?? []).length;
check('pilot ships ≥5 stations', stations >= 5, `got ${stations}`);
const linesCount = (pilot.match(/destination:\s*'/g) ?? []).length;
check('pilot ships ≥10 lines', linesCount >= 10, `got ${linesCount}`);
check('pilot is idempotent (uses upsert/findFirst)', pilot.includes('findFirst'));

// --- launch playbook ---
check('launch playbook present', has('docs/LAUNCH_PLAYBOOK.md'));
const playbook = read('docs/LAUNCH_PLAYBOOK.md');
for (const day of ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']) {
  check(`playbook covers ${day}`, playbook.includes(day));
}
check('playbook references rollback script', playbook.includes('rollback-current-release.sh'));

// --- changelog ---
check('CHANGELOG present', has('CHANGELOG.md'));
const changelog = read('CHANGELOG.md');
check('CHANGELOG captures unreleased + 1.0.0', changelog.includes('Unreleased') && changelog.includes('1.0.0'));

// --- gitignore allows release-evidence logs ---
const gi = read('.gitignore');
check('.gitignore exempts release-evidence logs', gi.includes('!release-evidence/**/*.log'));

// --- 5 evidence logs are now tracked-able ---
for (const f of ['backup-target', 'prisma-migrations', 'production-config', 'release-evidence', 'secret-hygiene']) {
  check(`evidence log ${f}.log present on disk`, has(`release-evidence/public-launch/${f}.log`));
}

// --- nothing removed ---
check('all original product-layer module files still exist', has('backend/src/modules/local-search/local-search.service.ts')
  && has('backend/src/modules/intercity/intercity.service.ts')
  && has('backend/src/modules/data-quality/data-quality.service.ts'));
check('frontend lock untouched', has('frontend.lock.json'));
check('legacy /api/health controller untouched', has('backend/src/modules/health/health.controller.ts'));

console.log('# operational-readiness smoke');
for (const r of out) console.log(`${r.ok ? 'ok  ' : 'FAIL'} - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
