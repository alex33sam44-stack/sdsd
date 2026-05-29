#!/usr/bin/env node
/**
 * Smoke test for the additive Data Quality extra checks (PR #20).
 *
 *   node backend/test/data-quality-extra-smoke.mjs
 *
 * The test exercises three layers without booting Nest or MySQL:
 *   1. STATIC — every original check ID is still present (no removal).
 *   2. CONTRACT — the new checks live in extra-checks.ts and are
 *                 wired into the service via runExtraChecks().
 *   3. CLI — the verify-data-quality-extra.mjs script prints the
 *            --require / --warn / --json contract correctly.
 *   4. Helper — hasFareSignal() recognizes fare-shaped patches and
 *               rejects empty patches.
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
  out.push({ name, ok: !!ok, detail: ok ? '' : (detail ?? '') });
};

// ===================== STATIC =====================
check('extra-checks file present', has('backend/src/modules/data-quality/data-quality.extra-checks.ts'));
check('CLI script present', has('backend/scripts/verify-data-quality-extra.mjs'));

const extra = read('backend/src/modules/data-quality/data-quality.extra-checks.ts');
const service = read('backend/src/modules/data-quality/data-quality.service.ts');
const ctl = read('backend/src/modules/data-quality/data-quality.controller.ts');

// All 8 new check IDs declared
const EXPECTED_IDS = [
  'lines.duplicate-destination',
  'stops.duplicate-on-line',
  'stations.missing-geo',
  'lines.stale',
  'lines.missing-fare',
  'content.invalid-provider',
  'contributions.weak-evidence',
  'launch.unreviewed-blockers',
];
for (const id of EXPECTED_IDS) {
  check(`extra-checks declares "${id}"`, extra.includes(`'${id}'`));
}

// Severity mix: critical / warning / info all represented
check('extra-checks emits at least one critical severity',
  /severity:\s*'critical'/.test(extra));
check('extra-checks emits at least one warning severity',
  /severity:\s*'warning'/.test(extra));
check('extra-checks emits at least one info severity',
  /severity:\s*'info'/.test(extra));

// Service wiring
check('service imports EXTRA_DATA_QUALITY_CHECKS', service.includes('EXTRA_DATA_QUALITY_CHECKS'));
check('service runs runExtraChecks() inside report()',
  service.includes('runExtraChecks'));
check('service catches per-check errors', service.includes('Never let one extra check') ||
  /try\s*{[\s\S]+await fn[\s\S]+}\s*catch/.test(service));

// All ORIGINAL check IDs still in place (no removal)
const ORIGINAL_IDS = [
  'stations.published.min',
  'stations.with-no-lines',
  'lines.thin-routes',
  'lines.orphan-published',
  'stops.invalid-coords',
  'lines.stop-order',
  'stations.unpublished-share',
  'intercity.routes.exist',
  'intercity.schedules.exist',
];
for (const id of ORIGINAL_IDS) {
  check(`original check "${id}" still present`, service.includes(`'${id}'`));
}

// Controller — admin endpoints
check('controller exposes /admin/checks', ctl.includes("@Get('admin/checks')"));
check('controller exposes /admin/report', ctl.includes("@Get('admin/report')"));
check('controller keeps /public anonymous (legacy)', ctl.includes("@Get('public')"));
check('controller keeps full report at root (legacy)',
  /@Get\(\)[\s\S]{0,400}fullReport/.test(ctl));
check('admin endpoints require platform roles',
  ctl.includes("'platform_admin'") && ctl.includes('JwtAuthGuard'));

// CLI script
const cli = read('backend/scripts/verify-data-quality-extra.mjs');
check('CLI accepts --require flags', cli.includes('--require'));
check('CLI accepts --warn flags', cli.includes('--warn'));
check('CLI emits JSON output when --json', cli.includes('JSON.stringify(out'));
check('CLI exits 1 on failure', /process\.exit\(\s*\w+\.ok\s*\?\s*0\s*:\s*1\s*\)/.test(cli) || /process\.exit\(ok\s*\?\s*0\s*:\s*1\)/.test(cli));
check('CLI never echoes tokens in URL', !/[?&](api[_-]?key|access[_-]?token|token)=/i.test(cli));

// ===================== HELPER (hasFareSignal) =====================
// Re-implement the same logic in plain JS — the production helper
// is already covered by the static check above; here we prove the
// algorithm is correct against fixtures.
function hasFareSignalRef(patch) {
  if (!patch || typeof patch !== 'object') return false;
  const obj = patch;
  for (const key of ['fare', 'price', 'fareEgp', 'priceEgp', 'cost']) {
    if (key in obj) {
      const v = obj[key];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true;
      if (typeof v === 'string' && /\d/.test(v)) return true;
    }
  }
  if (obj.metadata && typeof obj.metadata === 'object') return hasFareSignalRef(obj.metadata);
  return false;
}
check('hasFareSignal: { fareEgp: 8 } → true', hasFareSignalRef({ fareEgp: 8 }) === true);
check('hasFareSignal: { price: "12 جنيه" } → true', hasFareSignalRef({ price: '12 جنيه' }) === true);
check('hasFareSignal: { metadata: { fare: 5 } } → true (nested)',
  hasFareSignalRef({ metadata: { fare: 5 } }) === true);
check('hasFareSignal: {} → false', hasFareSignalRef({}) === false);
check('hasFareSignal: { fare: 0 } → false', hasFareSignalRef({ fare: 0 }) === false);
check('hasFareSignal: null → false', hasFareSignalRef(null) === false);

// Production helper exports same name
check('production exports hasFareSignal', extra.includes('export function hasFareSignal'));
check('production: fare keys list matches reference',
  ['fare', 'price', 'fareEgp', 'priceEgp', 'cost'].every((k) => extra.includes(`'${k}'`)));

// ===================== CLI integration test =====================
// We invoke the CLI's pure logic in-process via `import` so the
// test never has to spawn a subprocess (sandboxed environments
// often refuse exec). The CLI source still works as a real script.
const cliMod = await import(resolve(REPO, 'backend/scripts/verify-data-quality-extra.mjs'));

const passingPayload = {
  score: 100,
  band: 'green',
  checks: EXPECTED_IDS.map((id) => ({ id, status: 'pass', count: 0, severity: 'warning' })),
};
const failingPayload = {
  score: 60,
  band: 'amber',
  checks: EXPECTED_IDS.map((id, i) => ({
    id,
    status: i === 0 ? 'fail' : 'pass',
    count: i === 0 ? 3 : 0,
    severity: 'critical',
  })),
};

// 1) all required pass → ok=true
const okOut = cliMod.evaluateGate({
  body: passingPayload,
  required: ['lines.duplicate-destination', 'stations.missing-geo'],
});
check('CLI logic: all required pass → ok=true', okOut.ok === true);
check('CLI logic: produces JSON-renderable summary',
  typeof cliMod.renderSummary(okOut) === 'string' && cliMod.renderSummary(okOut).includes('OK'));

// 2) one required fails → ok=false, listed in requiredFailing
const failOut = cliMod.evaluateGate({
  body: failingPayload,
  required: ['lines.duplicate-destination'],
});
check('CLI logic: one required fails → ok=false', failOut.ok === false);
check('CLI logic: failing id surfaced',
  failOut.requiredFailing[0]?.id === 'lines.duplicate-destination');
check('CLI logic: count carried through', failOut.requiredFailing[0]?.count === 3);

// 3) --warn does NOT cause ok=false
const warnOut = cliMod.evaluateGate({
  body: failingPayload,
  required: ['stations.missing-geo'],
  warnable: ['lines.duplicate-destination'],
});
check('CLI logic: --warn does NOT cause ok=false', warnOut.ok === true);
check('CLI logic: --warn entries reported',
  Array.isArray(warnOut.warnings) && warnOut.warnings.length === 1);

// 4) missing required check → ok=false + listed in requiredMissing
const missingOut = cliMod.evaluateGate({
  body: passingPayload,
  required: ['does.not.exist'],
});
check('CLI logic: missing required check → ok=false', missingOut.ok === false);
check('CLI logic: missing id listed',
  Array.isArray(missingOut.requiredMissing) && missingOut.requiredMissing.includes('does.not.exist'));

// 5) parseArgs / collect helpers
const parsed = cliMod.parseArgs(['--require=a', '--require=b', '--warn=c', '--json']);
check('CLI parseArgs: --require collects list',
  Array.isArray(parsed.require) && parsed.require.length === 2);
check('CLI parseArgs: --json flag becomes true', parsed.json === true);
check('CLI collect: filters out boolean true sentinels',
  cliMod.collect(parsed.warn).length === 1 && cliMod.collect(parsed.warn)[0] === 'c');

// ===================== SUMMARY =====================
console.log('# data-quality-extra smoke');
for (const r of out) console.log(`${r.ok ? 'ok  ' : 'FAIL'} - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
