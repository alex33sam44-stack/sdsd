#!/usr/bin/env node
/**
 * Preflight: verifies package.json and package-lock.json are in sync.
 *
 * Checks:
 *  1. package-lock.json exists.
 *  2. lockfileVersion is >= 2 (npm v7+ format with `packages`).
 *  3. Every dependency / devDependency in package.json appears under
 *     packages[""] in the lockfile with a matching version range.
 *  4. No extra root-level deps in the lockfile that aren't in package.json.
 *
 * Exits non-zero with a clear message if anything is off, instructing the
 * user to run `npm install` to regenerate the lockfile.
 *
 * Skip with: PREFLIGHT_SKIP=1
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.PREFLIGHT_SKIP === "1") {
  console.log("[preflight] skipped (PREFLIGHT_SKIP=1)");
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = resolve(root, "package.json");
const lockPath = resolve(root, "package-lock.json");

function fail(msg) {
  console.error("\n[preflight] ❌ " + msg);
  console.error("[preflight] Run `npm install` to regenerate package-lock.json, then retry.\n");
  process.exit(1);
}

if (!existsSync(lockPath)) {
  fail("package-lock.json is missing.");
}

let pkg, lock;
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
} catch (e) {
  fail(`Cannot parse package.json: ${e.message}`);
}
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (e) {
  fail(`Cannot parse package-lock.json: ${e.message}`);
}

if (!lock.lockfileVersion || lock.lockfileVersion < 2) {
  fail(`Unsupported lockfileVersion ${lock.lockfileVersion} (need >= 2).`);
}

const rootEntry = lock.packages && lock.packages[""];
if (!rootEntry) {
  fail('Lockfile is missing the root packages[""] entry.');
}

const pkgDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const lockDeps = { ...(rootEntry.dependencies || {}), ...(rootEntry.devDependencies || {}) };

const missing = [];
const mismatched = [];
for (const [name, range] of Object.entries(pkgDeps)) {
  if (!(name in lockDeps)) {
    missing.push(`  - ${name}@${range} (in package.json, missing from lockfile)`);
    continue;
  }
  if (lockDeps[name] !== range) {
    mismatched.push(`  - ${name}: package.json="${range}" lockfile="${lockDeps[name]}"`);
  }
}

const extra = [];
for (const name of Object.keys(lockDeps)) {
  if (!(name in pkgDeps)) {
    extra.push(`  - ${name}@${lockDeps[name]} (in lockfile, missing from package.json)`);
  }
}

if (missing.length || mismatched.length || extra.length) {
  let msg = "package.json and package-lock.json are out of sync.";
  if (missing.length) msg += `\n\nMissing from lockfile (${missing.length}):\n` + missing.join("\n");
  if (mismatched.length) msg += `\n\nVersion mismatches (${mismatched.length}):\n` + mismatched.join("\n");
  if (extra.length) msg += `\n\nStale lockfile entries (${extra.length}):\n` + extra.join("\n");
  fail(msg);
}

console.log(
  `[preflight] ✅ package.json ↔ package-lock.json in sync (${Object.keys(pkgDeps).length} deps, lockfileVersion ${lock.lockfileVersion}).`,
);
