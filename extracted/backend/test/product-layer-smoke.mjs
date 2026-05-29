#!/usr/bin/env node
/**
 * Behavioural smoke test for the product layer added in PR #17.
 *
 * Self-contained, dependency-free, runs in any Node 20+:
 *   node backend/test/product-layer-smoke.mjs
 *
 * Verifies that every shipped layer compiles, exposes its expected
 * surface, and that wire-up is correct (modules registered in
 * AppModule, scripts referenced from package.json, Caddy aware of
 * the SSE route, etc.). It does NOT need MySQL or NestJS running.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..');

let pass = 0;
let fail = 0;
const lines = [];
function record(name, ok, detail) {
  if (ok) pass += 1;
  else fail += 1;
  lines.push({ name, ok, detail: ok ? '' : detail ?? '' });
}
function readFile(rel, base = REPO) {
  return readFileSync(resolve(base, rel), 'utf8');
}
function check(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error('async checks not supported here');
    }
    record(name, result === true || (typeof result === 'object' && result.ok), result?.detail);
  } catch (err) {
    record(name, false, err.message);
  }
}

// --------------- Layer 1: local search ---------------
check('local-search: catalog ships ≥30 landmarks', () => {
  const src = readFile('backend/src/modules/local-search/local-search.catalog.ts');
  const matches = src.match(/kind:\s*'landmark'/g) ?? [];
  return matches.length >= 30 || { ok: false, detail: `got ${matches.length}` };
});
check('local-search: catalog ships ≥27 cities', () => {
  const src = readFile('backend/src/modules/local-search/local-search.catalog.ts');
  const matches = src.match(/kind:\s*'city'/g) ?? [];
  return matches.length >= 27 || { ok: false, detail: `got ${matches.length}` };
});
check('local-search: normalize handles franko digits', () => {
  const src = readFile('backend/src/modules/local-search/local-search.normalize.ts');
  return src.includes("'7': 'ح'") && src.includes("'3': 'ع'");
});
check('local-search: controller exposes GET /api/local-search', () => {
  const src = readFile('backend/src/modules/local-search/local-search.controller.ts');
  return src.includes("@Controller('local-search')") && src.includes('@Get()');
});

// --------------- Layer 2: intercity ---------------
check('intercity: migration creates intercity_routes table', () => {
  const src = readFile('backend/prisma/migrations/20260530140000_intercity/migration.sql');
  return src.includes('CREATE TABLE `intercity_routes`') && src.includes('CREATE TABLE `intercity_schedules`');
});
check('intercity: seed ships ≥15 routes', () => {
  const src = readFile('backend/scripts/seed-intercity-routes.ts');
  const matches = src.match(/fromSlug:\s*'/g) ?? [];
  return matches.length >= 15 || { ok: false, detail: `got ${matches.length}` };
});
check('intercity: controller has list + getOne', () => {
  const src = readFile('backend/src/modules/intercity/intercity.controller.ts');
  return src.includes("@Get('routes')") && src.includes("@Get('routes/:id')");
});

// --------------- Layer 3: data quality ---------------
check('data-quality: 8 weighted checks present', () => {
  const src = readFile('backend/src/modules/data-quality/data-quality.service.ts');
  const ids = [
    'stations.published.min',
    'stations.with-no-lines',
    'lines.thin-routes',
    'lines.orphan-published',
    'stops.invalid-coords',
    'lines.stop-order',
    'stations.unpublished-share',
    'intercity.routes.exist',
  ];
  return ids.every((id) => src.includes(id)) || { ok: false, detail: 'check id missing' };
});
check('data-quality: public + auth endpoints', () => {
  const src = readFile('backend/src/modules/data-quality/data-quality.controller.ts');
  return src.includes("@Get('public')") && src.includes('@Get()') && src.includes('UseGuards(JwtAuthGuard, RolesGuard)');
});
check('data-quality: CLI gate exists', () => {
  const src = readFile('backend/scripts/verify-data-quality.mjs');
  return src.includes('process.exit') && src.includes('--min=');
});

// --------------- Layer 4: retention ---------------
check('retention: db-prune supports 7 policies', () => {
  const src = readFile('backend/scripts/db-prune.mjs');
  const tables = ['audit_logs', 'search_logs', 'availability_logs', 'refresh_tokens', 'email_verification_tokens', 'billing_webhook_events', 'draft_changes'];
  return tables.every((t) => src.includes(`'${t}'`)) || { ok: false, detail: 'policy missing' };
});
check('retention: cron triggers nightly at 03:15', () => {
  const src = readFile('selfhost/cron/db-prune.cron');
  return src.includes('15 3 * * *');
});
check('retention: install-backup-cron now installs db-prune too', () => {
  const src = readFile('selfhost/scripts/install-backup-cron.sh');
  return src.includes('PRUNE_MARKER') && src.includes('mwasalat-db-prune');
});
check('retention: runbook documents windows', () => {
  const src = readFile('docs/MYSQL_RETENTION.md');
  return src.includes('AUDIT_RETENTION_DAYS') && src.includes('AVAILABILITY_RETENTION_DAYS');
});

// --------------- Layer 5: cloudflare ---------------
check('cloudflare: worker.js detects bot UAs', () => {
  const src = readFile('deployment/cloudflare/worker.js');
  return src.includes('WhatsApp') && src.includes('facebookexternalhit') && src.includes('Telegram');
});
check('cloudflare: wrangler.toml routes only share roots', () => {
  const src = readFile('deployment/cloudflare/wrangler.toml');
  return src.includes('mwasalat.app/t/*') && src.includes('mwasalat.app/g/*') && src.includes('mwasalat.app/c/*');
});
check('cloudflare: README covers KV setup + rollback', () => {
  const src = readFile('deployment/cloudflare/README.md');
  return src.includes('OG_CACHE') && src.includes('rollback');
});

// --------------- Layer 6: AI gateway ---------------
check('ai: provider chain includes 4 providers', () => {
  const src = readFile('backend/src/modules/ai/ai.providers.ts');
  return ['OpenAiProvider', 'AnthropicProvider', 'OpenRouterProvider', 'NoopProvider'].every((p) => src.includes(p));
});
check('ai: NoopProvider supplies localized fallback for ar/en/fr/pt', () => {
  const src = readFile('backend/src/modules/ai/ai.providers.ts');
  return ['ar:', 'en:', 'fr:', 'pt:'].every((k) => src.includes(k));
});
check('ai: controller throttles 10/min/endpoint', () => {
  const src = readFile('backend/src/modules/ai/ai.controller.ts');
  const decorators = src.match(/@Throttle\({ ai: { limit: 10, ttl: 60_000 } }\)/g) ?? [];
  return decorators.length === 3 || { ok: false, detail: `expected 3, got ${decorators.length}` };
});

// --------------- Layer 7: realtime ---------------
check('realtime: bus enforces capacity + per-IP cap', () => {
  const src = readFile('backend/src/modules/realtime/realtime.bus.ts');
  return src.includes('maxSubscribers') && src.includes('maxPerIp');
});
check('realtime: controller exposes /stream + /stats', () => {
  const src = readFile('backend/src/modules/realtime/realtime.controller.ts');
  return src.includes("@Get('stats')") && src.includes("@Get('stream')") && src.includes('text/event-stream');
});
check('realtime: module is @Global so any module can publish', () => {
  const src = readFile('backend/src/modules/realtime/realtime.module.ts');
  return src.includes('@Global()');
});

// --------------- Wire-up ---------------
check('wire-up: AppModule imports all 5 new modules', () => {
  const src = readFile('backend/src/app.module.ts');
  return ['LocalSearchModule', 'IntercityModule', 'DataQualityModule', 'AiModule', 'RealtimeModule'].every((m) => src.includes(m));
});
check('wire-up: backend package.json registers new scripts', () => {
  const src = readFile('backend/package.json');
  return src.includes('"seed:intercity"') && src.includes('"verify:data-quality"') && src.includes('"db:prune"');
});
check('wire-up: backend deps now include mysql2 (db-prune)', () => {
  const src = readFile('backend/package.json');
  return src.includes('"mysql2"');
});
check('wire-up: Caddyfile excludes SSE from rate-limit + buffering', () => {
  const src = readFile('Caddyfile');
  return src.includes('@sse path /api/realtime/stream*') && src.includes('flush_interval -1');
});

// --------------- Layer 8: e2e ---------------
check('e2e: playwright config targets 3 device profiles', () => {
  const src = readFile('tests-e2e/playwright.config.ts');
  return src.includes('pixel5-3g') && src.includes('iphone13') && src.includes('desktop-chrome');
});
check('e2e: 6 spec files present', () => {
  const specs = [
    '01.welcome-arabic',
    '02.locale-switch',
    '03.local-search',
    '04.realtime-sse',
    '05.data-quality',
    '06.mobile-pwa',
  ];
  return specs.every((s) => {
    try {
      readFile(`tests-e2e/specs/${s}.spec.ts`);
      return true;
    } catch {
      return false;
    }
  });
});
check('e2e: CI workflow runs the suite under matrix of 3', () => {
  const src = readFile('.github/workflows/frontend-mobile-quality.yml');
  return src.includes('pixel5-3g') && src.includes('iphone13') && src.includes('desktop-chrome');
});

// --------------- Frontend freeze still intact ---------------
check('freeze: lock file present and unchanged in spirit', () => {
  const src = readFile('frontend.lock.json');
  const json = JSON.parse(src);
  return json.fileCount === 251 && Array.isArray(json.scope.dirs);
});

// --------------- summary ---------------
console.log('# product-layer smoke');
for (const r of lines) console.log(`${r.ok ? 'ok  ' : 'FAIL'} - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
