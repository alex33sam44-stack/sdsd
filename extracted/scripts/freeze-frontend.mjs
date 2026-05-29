#!/usr/bin/env node
/**
 * Frontend Freeze Guard
 * ---------------------------------------------------------------
 * Purpose:
 *   Lock the current frontend surface so that ANY change (add /
 *   remove / modify) to a file inside the frozen scope causes
 *   `verify` to exit with a non-zero status.
 *
 *   Once `freeze` has been executed and `frontend.lock.json` is
 *   committed, the freeze is enforced by:
 *     - GitHub Actions workflow `frontend-freeze.yml`
 *     - The CI job in `ci.yml` (calls `verify`)
 *     - The local `pre-commit` hook (Husky)
 *
 *   Re-freezing requires the explicit approval token:
 *     FRONTEND_UNFREEZE_TOKEN=I_HAVE_OWNER_APPROVAL
 *
 * Commands:
 *   node scripts/freeze-frontend.mjs freeze   # initial seal
 *   node scripts/freeze-frontend.mjs verify   # CI / hook check
 *   node scripts/freeze-frontend.mjs status   # human-readable summary
 *
 * Exit codes:
 *   0  OK
 *   1  Drift detected (verify) / lock missing (verify)
 *   2  Refusing to overwrite an existing lock without token
 *   3  Internal error
 * ---------------------------------------------------------------
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const LOCK_FILE = 'frontend.lock.json';
const UNFREEZE_TOKEN_ENV = 'FRONTEND_UNFREEZE_TOKEN';
const UNFREEZE_TOKEN_VALUE = 'I_HAVE_OWNER_APPROVAL';

/**
 * Frozen scope.
 * Anything matching these directories or these top-level files is
 * subject to the freeze. Everything else (backend, selfhost, docs,
 * package.json, package-lock.json, .github/, etc.) is unaffected so
 * we can keep operating the platform.
 */
const FROZEN_DIRS = ['src', 'public'];
const FROZEN_FILES = [
  'index.html',
  'vite.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tailwind.config.ts',
  'postcss.config.js',
  'components.json',
  'eslint.config.js',
  'capacitor.config.ts',
];

const EXCLUDE_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const norm = full.split(sep).join('/');
    if (EXCLUDE_PATTERNS.some((re) => re.test(norm))) continue;
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function collect() {
  const map = {};
  for (const dir of FROZEN_DIRS) {
    for await (const filePath of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, filePath).split(sep).join('/');
      map[rel] = sha256(readFileSync(filePath));
    }
  }
  for (const file of FROZEN_FILES) {
    const full = join(ROOT, file);
    try {
      statSync(full);
      map[file] = sha256(readFileSync(full));
    } catch {
      // file not present in this checkout — silently skip
    }
  }
  return map;
}

function readLock() {
  if (!existsSync(LOCK_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  } catch (err) {
    console.error(`! Failed to parse ${LOCK_FILE}: ${err.message}`);
    process.exit(3);
  }
}

function diff(expected, current) {
  const expectedKeys = new Set(Object.keys(expected));
  const currentKeys = new Set(Object.keys(current));
  const added = [...currentKeys].filter((k) => !expectedKeys.has(k)).sort();
  const removed = [...expectedKeys].filter((k) => !currentKeys.has(k)).sort();
  const modified = [...currentKeys]
    .filter((k) => expectedKeys.has(k) && current[k] !== expected[k])
    .sort();
  return { added, removed, modified };
}

async function cmdFreeze() {
  const lock = readLock();
  if (lock && process.env[UNFREEZE_TOKEN_ENV] !== UNFREEZE_TOKEN_VALUE) {
    console.error('');
    console.error('  Frontend is already FROZEN.');
    console.error(`  Sealed at: ${lock.frozenAt}`);
    console.error(`  Files locked: ${lock.fileCount}`);
    console.error('');
    console.error('  Refusing to overwrite the lock without explicit owner approval.');
    console.error(`  Re-freeze command:`);
    console.error(`    ${UNFREEZE_TOKEN_ENV}=${UNFREEZE_TOKEN_VALUE} \\`);
    console.error('        node scripts/freeze-frontend.mjs freeze');
    console.error('');
    process.exit(2);
  }
  const current = await collect();
  const payload = {
    schemaVersion: 1,
    frozenAt: new Date().toISOString(),
    policy:
      'FROZEN. The frontend surface listed in `scope` is locked. Any addition, ' +
      'removal or modification to those files MUST cause `verify` to fail. ' +
      'Unfreezing requires the owner-approval token and a follow-up audit entry.',
    scope: { dirs: FROZEN_DIRS, files: FROZEN_FILES },
    fileCount: Object.keys(current).length,
    hashAlgo: 'sha256',
    hashes: current,
  };
  writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(
    `OK  Frontend frozen. ${payload.fileCount} files sealed at ${payload.frozenAt}.`,
  );
  console.log(`    Lock written to ./${LOCK_FILE}`);
}

async function cmdVerify() {
  const lock = readLock();
  if (!lock) {
    console.error('');
    console.error('!  Frontend lock is missing.');
    console.error(`   Expected file: ./${LOCK_FILE}`);
    console.error('   The freeze policy requires this file. Run:');
    console.error('     node scripts/freeze-frontend.mjs freeze');
    console.error('');
    process.exit(1);
  }
  const expected = lock.hashes || {};
  const current = await collect();
  const { added, removed, modified } = diff(expected, current);

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    console.log(
      `OK  Frontend freeze intact — ${lock.fileCount} files verified ` +
        `(sealed ${lock.frozenAt}).`,
    );
    process.exit(0);
  }

  console.error('');
  console.error('!  FRONTEND FREEZE VIOLATION');
  console.error('   The frontend has been declared FROZEN.');
  console.error('   The following changes are NOT permitted:');
  console.error('');
  if (modified.length) {
    console.error(`   * Modified (${modified.length}):`);
    for (const f of modified) console.error(`       - ${f}`);
  }
  if (added.length) {
    console.error(`   + Added    (${added.length}):`);
    for (const f of added) console.error(`       - ${f}`);
  }
  if (removed.length) {
    console.error(`   - Removed  (${removed.length}):`);
    for (const f of removed) console.error(`       - ${f}`);
  }
  console.error('');
  console.error('   Either revert the change, or — with explicit owner approval —');
  console.error('   re-freeze:');
  console.error(`     ${UNFREEZE_TOKEN_ENV}=${UNFREEZE_TOKEN_VALUE} \\`);
  console.error('         node scripts/freeze-frontend.mjs freeze');
  console.error('');
  process.exit(1);
}

async function cmdStatus() {
  const lock = readLock();
  if (!lock) {
    console.log('Frontend freeze status: NOT FROZEN (no lock file found)');
    process.exit(0);
  }
  const current = await collect();
  const { added, removed, modified } = diff(lock.hashes || {}, current);
  console.log(`Frontend freeze status: ${lock.frozenAt}`);
  console.log(`  Files sealed:        ${lock.fileCount}`);
  console.log(`  Files in tree:       ${Object.keys(current).length}`);
  console.log(`  Drift (modified):    ${modified.length}`);
  console.log(`  Drift (added):       ${added.length}`);
  console.log(`  Drift (removed):     ${removed.length}`);
  process.exit(modified.length + added.length + removed.length === 0 ? 0 : 1);
}

const cmd = process.argv[2] || 'verify';
(async () => {
  try {
    if (cmd === 'freeze' || cmd === 'init') return await cmdFreeze();
    if (cmd === 'verify' || cmd === 'check') return await cmdVerify();
    if (cmd === 'status') return await cmdStatus();
    console.error(`Unknown command: ${cmd}`);
    console.error('Usage: node scripts/freeze-frontend.mjs <freeze|verify|status>');
    process.exit(3);
  } catch (err) {
    console.error(`Internal error: ${err.stack || err.message}`);
    process.exit(3);
  }
})();
