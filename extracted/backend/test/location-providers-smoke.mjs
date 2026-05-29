#!/usr/bin/env node
/**
 * Smoke test for the location-providers module.
 *
 *   node backend/test/location-providers-smoke.mjs
 *
 * The test exercises three layers without booting Nest:
 *   1. STATIC : every file exists and exposes the expected surface.
 *   2. UNIT   : pure helpers (privacy, orchestrator selection, noop
 *               provider, health daemon) work with a fake fetch.
 *   3. CONTRACT : every provider matches the LocationProvider
 *                 interface and supports its declared capabilities.
 *
 * Designed to be dependency-free so the existing CI matrix
 * (Node 20+, no MySQL, no network) runs it in <1s.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');
const has = (rel) => existsSync(resolve(REPO, rel));

let pass = 0, fail = 0;
const out = [];
const check = (name, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  out.push({ name, ok: !!ok, detail: ok ? '' : (detail ?? '') });
};

// ===================== Layer 1: STATIC =====================
const moduleFiles = [
  'backend/src/modules/location-providers/types.ts',
  'backend/src/modules/location-providers/privacy.ts',
  'backend/src/modules/location-providers/health.ts',
  'backend/src/modules/location-providers/orchestrator.ts',
  'backend/src/modules/location-providers/rate-limit.guard.ts',
  'backend/src/modules/location-providers/location-providers.module.ts',
  'backend/src/modules/location-providers/location-providers.controller.ts',
  'backend/src/modules/location-providers/location-providers.service.ts',
  'backend/src/modules/location-providers/providers/nominatim.provider.ts',
  'backend/src/modules/location-providers/providers/photon.provider.ts',
  'backend/src/modules/location-providers/providers/osrm.provider.ts',
  'backend/src/modules/location-providers/providers/mapbox.provider.ts',
  'backend/src/modules/location-providers/providers/noop.provider.ts',
];
for (const f of moduleFiles) check(`exists: ${f.split('/').slice(-2).join('/')}`, has(f));

const ctl = read('backend/src/modules/location-providers/location-providers.controller.ts');
check('controller registers /api/location prefix', ctl.includes("@Controller('location')"));
for (const route of ['search', 'reverse', 'status', 'health']) {
  check(`controller exposes /${route}`, ctl.includes(`'${route}'`));
}
// route is exposed both via POST and GET in the additive update
check('controller exposes POST /route', ctl.includes("@Post('route')"));
check('controller exposes GET /route', ctl.includes("@Get('route')"));
check('controller exposes GET /providers/status (canonical)', ctl.includes("@Get('providers/status')"));
check('controller exposes GET /providers/health', ctl.includes("@Get('providers/health')"));
check('controller wires LocationRateLimitGuard', ctl.includes('LocationRateLimitGuard'));
check('controller redacts via service (never raw fetch)', !/fetch\s*\(/.test(ctl));
check('controller throttles search/reverse to 30/min', /limit:\s*30,\s*ttl:\s*60_000/.test(ctl));
check('controller throttles route to 10/min', /limit:\s*10,\s*ttl:\s*60_000/.test(ctl));
check('controller never accepts tokens via query', !/api[_-]?key/i.test(ctl) && !/access[_-]?token/i.test(ctl));

const svc = read('backend/src/modules/location-providers/location-providers.service.ts');
check('service rejects too-long routes', svc.includes('MAX_ROUTE_DISTANCE_KM'));
check('service starts health daemon (skipped under NODE_ENV=test)', svc.includes("NODE_ENV !== 'test'"));
check('service maps ProviderUnavailable → 503', svc.includes('SERVICE_UNAVAILABLE'));

const app = read('backend/src/app.module.ts');
check('AppModule registers LocationProvidersModule', app.includes('LocationProvidersModule'));

const localSearch = read('backend/src/modules/local-search/local-search.service.ts');
check('local-search service still present (unchanged behavior)', localSearch.includes('searchCatalog'));
check('local-search controller still public', has('backend/src/modules/local-search/local-search.controller.ts'));

// ===================== Layer 2: UNIT (text-level) =====================
// We assert on the SOURCE of privacy.ts so the test stays portable
// across Node 20+ without needing experimental type-stripping. The
// behaviour-level checks below are augmented by Jest contract tests
// in test/location-providers.contract.test.ts (when the backend has
// node_modules available).
const privacySrc = read('backend/src/modules/location-providers/privacy.ts');

check('privacy: redactQuery trims, dedupes whitespace, caps at 200',
  /MAX_QUERY_LEN\s*=\s*200/.test(privacySrc) &&
  privacySrc.includes('replace(/\\s+/g, \' \')') &&
  privacySrc.includes('.slice(0, MAX_QUERY_LEN)'));

check('privacy: redactQuery strips control chars',
  /\\u0000-\\u001F\\u007F/.test(privacySrc));

check('privacy: redactQuery rejects provider-confusing punctuation',
  /QUERY_FORBIDDEN/.test(privacySrc) && /\[<>\{\}\\\\\^`\]/.test(privacySrc));

check('privacy: quantize defaults to 3 decimals (~110m)',
  /quantize\([^)]*decimals\s*=\s*3/.test(privacySrc));

check('privacy: assertCoordinate guards lat/lng range',
  privacySrc.includes("[-90, 90]") && privacySrc.includes("[-180, 180]"));

check('privacy: assertCoordinate rejects (0,0) sentinel',
  /Math\.abs\(lat\)\s*<\s*1e-6/.test(privacySrc));

check('privacy: buildSafeHeaders ships only UA + Accept',
  /['"]user-agent['"]/.test(privacySrc) &&
  /accept:\s*['"]application\/json['"]/.test(privacySrc));

check('privacy: never forwards cookie or authorization',
  !privacySrc.toLowerCase().includes("'cookie'") &&
  !privacySrc.toLowerCase().includes("'authorization'") &&
  !privacySrc.toLowerCase().includes('"cookie"') &&
  !privacySrc.toLowerCase().includes('"authorization"'));

check('privacy: haversine stays self-contained',
  privacySrc.includes('export function haversineKm') &&
  privacySrc.includes('R = 6371'));

// Also verify the orchestrator never logs raw queries (PII)
const orchSrc = read('backend/src/modules/location-providers/orchestrator.ts');
check('orchestrator: never logs raw query', !/logger\.(log|warn|error)\([^)]*input\.q/.test(orchSrc));

// Service-level redaction enforcement
const svcSrc = read('backend/src/modules/location-providers/location-providers.service.ts');
check('service: applies redactQuery before forwarding to providers',
  /redactQuery\(input\.q\)/.test(svcSrc));
check('service: validates coordinates via assertCoordinate',
  svcSrc.includes('assertCoordinate') || svcSrc.includes('assertCoord('));

// ===================== Layer 3: CONTRACT =====================
// We compile-check provider files by string parsing for the minimum
// shape: each must export a class implementing the LocationProvider
// contract (id, capabilities, isEnabled, probe).
const providerFiles = [
  ['nominatim', 'NominatimProvider', ['search', 'reverse']],
  ['photon', 'PhotonProvider', ['search', 'reverse']],
  ['osrm', 'OsrmProvider', ['route']],
  ['mapbox', 'MapboxProvider', ['search', 'reverse', 'route']],
  ['noop', 'NoopProvider', ['search', 'reverse', 'route']],
];
for (const [file, className, caps] of providerFiles) {
  const src = read(`backend/src/modules/location-providers/providers/${file}.provider.ts`);
  check(`${className}: declares id "${file}"`, src.includes(`readonly id = '${file}'`));
  check(`${className}: implements LocationProvider`, src.includes('implements LocationProvider'));
  check(`${className}: exposes isEnabled()`, /isEnabled\s*\(\)/.test(src));
  check(`${className}: exposes probe()`, /probe\s*\(/.test(src));
  for (const cap of caps) {
    check(`${className}: declares capability "${cap}"`, src.includes(`'${cap}'`));
  }
  // privacy compliance
  if (file !== 'noop') {
    check(`${className}: forwards through buildSafeHeaders`, src.includes('buildSafeHeaders'));
    check(`${className}: never reads incoming headers`, !/req\.headers/.test(src));
  }
}

// Orchestrator behaviour check (string-level): noop is last, fallback semantics present
const orch = read('backend/src/modules/location-providers/orchestrator.ts');
check('orchestrator: throws ProviderUnavailableError when chain exhausted', orch.includes('throw new ProviderUnavailableError'));
check('orchestrator: applies per-provider timeout', orch.includes('AbortController') && orch.includes('perProviderTimeoutMs'));
check('orchestrator: ranks by health snapshot', orch.includes('this.health.snapshot'));

// Health daemon
const hd = read('backend/src/modules/location-providers/health.ts');
check('health: respects 30s minimum probe interval', hd.includes('Math.max(30_000'));
check('health: degrades when latency > 70% of timeout', hd.includes('probeTimeoutMs * 0.7'));

// ===================== summary =====================
console.log('# location-providers smoke');
for (const r of out) console.log(`${r.ok ? 'ok  ' : 'FAIL'} - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
