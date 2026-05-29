#!/usr/bin/env node
/**
 * verify-data-quality-extra
 * --------------------------------------------------------------
 * Lightweight CLI gate dedicated to the EXTRA data quality checks
 * shipped in `data-quality.extra-checks.ts` (PR #20). Runs the
 * normal `/api/data-quality` report and then asserts that every
 * `--require=<check-id>` argument is in `pass` state.
 *
 * Companion to the existing `verify-data-quality.mjs` script which
 * gates on overall score / band; this one lets release pipelines
 * gate on specific findings — typically:
 *
 *   node backend/scripts/verify-data-quality-extra.mjs \
 *        --require=stations.missing-geo \
 *        --require=launch.unreviewed-blockers \
 *        --require=lines.duplicate-destination
 *
 * Flags:
 *   --require=ID    repeat to add more required-pass check ids
 *   --warn=ID       repeat to add ids that may be 'fail' but only
 *                   emit a warning (still exits 0)
 *   --json          machine-readable summary
 *
 * Exit codes: 0 ok, 1 a required check failed, 2 transport error.
 */

/**
 * Pure logic — evaluates the report payload against the required /
 * warn lists. Exposed so unit tests can call the gate inside the
 * same Node process without spawning a subprocess.
 */
export function evaluateGate({ body, required = [], warnable = [] }) {
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const byId = new Map(checks.map((c) => [c.id, c]));

  const missing = required.filter((id) => !byId.has(id));
  const failing = required.filter((id) => byId.get(id)?.status === 'fail');
  const warnings = warnable.filter((id) => byId.get(id)?.status === 'fail');

  return {
    ok: failing.length === 0 && missing.length === 0,
    score: body?.score,
    band: body?.band,
    requiredFailing: failing.map((id) => ({
      id,
      count: byId.get(id)?.count ?? 0,
      sample: byId.get(id)?.sample ?? [],
    })),
    requiredMissing: missing,
    warnings: warnings.map((id) => ({ id, count: byId.get(id)?.count ?? 0 })),
  };
}

export function parseArgs(list) {
  const out = {};
  for (const a of list) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = out[k] === undefined ? (v ?? true) : [].concat(out[k], v ?? true);
  }
  return out;
}

export function collect(value) {
  if (value === undefined) return [];
  return [].concat(value).filter((x) => x !== true && x !== false);
}

export function renderSummary(out) {
  const banner = out.ok ? 'OK ' : '!! ';
  const lines = [
    `${banner}data-quality-extra score=${out.score} band=${out.band} ` +
      `required(${out.requiredFailing.length + out.requiredMissing.length}=` +
      `${out.ok ? 'all-pass' : `failing=${out.requiredFailing.length} missing=${out.requiredMissing.length}`})` +
      (out.warnings.length ? ` warn=${out.warnings.length}` : ''),
  ];
  for (const f of out.requiredFailing) lines.push(`  FAIL ${f.id} (count=${f.count})`);
  for (const m of out.requiredMissing) lines.push(`  MISSING ${m}`);
  for (const w of out.warnings) lines.push(`  WARN ${w.id} (count=${w.count})`);
  return lines.join('\n') + '\n';
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const required = collect(args.require);
  const warnable = collect(args.warn);
  const wantJson = !!args.json;
  const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const url = `${base.replace(/\/$/, '')}/api/data-quality`;

  let body;
  try {
    const res = await fetch(url, {
      headers: {
        'x-i18n-skip': '1',
        ...(process.env.DATA_QUALITY_TOKEN
          ? { authorization: `Bearer ${process.env.DATA_QUALITY_TOKEN}` }
          : {}),
      },
    });
    if (!res.ok) {
      reportFatal(wantJson, `HTTP ${res.status} from ${url}`);
      process.exit(2);
    }
    body = await res.json();
  } catch (err) {
    reportFatal(wantJson, `fetch failed: ${err && err.message ? err.message : err}`);
    process.exit(2);
  }

  const out = evaluateGate({ body, required, warnable });
  if (wantJson) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stdout.write(renderSummary(out));
  process.exit(out.ok ? 0 : 1);
}

function reportFatal(wantJson, message) {
  if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
  else process.stderr.write(`!! data-quality-extra: ${message}\n`);
}

// Run CLI when invoked directly. Avoid running on `import`.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
const isDirect = (() => {
  try {
    const here = realpathSync(fileURLToPath(import.meta.url));
    const argv1 = process.argv[1] ? realpathSync(process.argv[1]) : '';
    return here === argv1;
  } catch {
    return false;
  }
})();
if (isDirect) {
  runCli();
}
