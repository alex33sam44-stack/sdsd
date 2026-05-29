#!/usr/bin/env node
/**
 * verify-data-quality
 * --------------------------------------------------------------
 * CI gate that fails the build when the platform's data quality
 * score drops below a threshold. Reads from the live API at
 * `${API_BASE_URL || http://localhost:4000}/api/data-quality/public`.
 *
 *   node backend/scripts/verify-data-quality.mjs --min=85
 *
 * Flags:
 *   --min=N       minimum acceptable score (default 70)
 *   --band=green  hard-fail unless band is at least this colour
 *                 (green ≥ amber ≥ red)
 *   --json        machine-readable output (release-evidence)
 *
 * Exit codes: 0 ok, 1 below threshold, 2 transport error.
 *
 * The script is intentionally dependency-free so it can run in
 * minimal CI containers. It mirrors the scoring logic in the
 * NestJS service so a green build is always green.
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const min = Number(args.min ?? 70);
const requiredBand = String(args.band ?? 'red');
const wantJson = !!args.json;
const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
const url = `${base.replace(/\/$/, '')}/api/data-quality/public`;

const BAND_RANK = { red: 0, amber: 1, green: 2 };

async function main() {
  let body;
  try {
    const res = await fetch(url, { headers: { 'x-i18n-skip': '1' } });
    if (!res.ok) {
      reportFatal(`HTTP ${res.status} from ${url}`);
      process.exit(2);
    }
    body = await res.json();
  } catch (err) {
    reportFatal(`fetch failed: ${err && err.message ? err.message : err}`);
    process.exit(2);
  }

  const score = Number(body.score ?? 0);
  const band = String(body.band ?? 'red');
  const ok =
    score >= min &&
    (BAND_RANK[band] ?? -1) >= (BAND_RANK[requiredBand] ?? -1);

  const result = {
    ok,
    url,
    score,
    band,
    readiness: body.readiness,
    threshold: { min, band: requiredBand },
    generatedAt: body.generatedAt,
  };

  if (wantJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const banner = ok ? 'OK ' : '!! ';
    process.stdout.write(
      `${banner}data-quality score=${score} band=${band} (need ≥${min}, band≥${requiredBand})\n`,
    );
  }
  process.exit(ok ? 0 : 1);
}

function reportFatal(message) {
  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
  } else {
    process.stderr.write(`!! data-quality verifier: ${message}\n`);
  }
}

main();
