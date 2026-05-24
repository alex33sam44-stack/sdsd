#!/usr/bin/env node
/**
 * Bootstrap prerequisite check (CLI).
 *
 * Run before any of the selfhost/scripts/*.sh that talk to docker compose.
 * Verifies that selfhost/.env.production (or the file pointed at by --env /
 * $ENV_FILE) has the minimum required variables filled in. Prints a single,
 * paste-friendly error message listing every missing variable and exits 64
 * (EX_USAGE) — distinct from the SQL/Docker failure exit codes so callers
 * can tell apart "operator forgot to fill the env file" vs "stack is broken".
 *
 * Pure logic lives in scripts/lib/env-required.cjs so the rules are unit-
 * testable. This wrapper just plumbs IO around it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REQUIRED_BOOTSTRAP_VARS, checkRequiredEnvVars, parseEnvFile, formatPrereqError } =
  require('./lib/env-required.cjs');

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const envPath = readArg('--env')
  || process.env.ENV_FILE
  || path.resolve(process.cwd(), 'selfhost/.env.production');

let envContent = '';
let envExisted = true;
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') {
    envExisted = false;
  } else {
    console.error(`[bootstrap-prereqs] could not read ${envPath}: ${error.message}`);
    process.exit(64);
  }
}

if (!envExisted) {
  console.error(`[bootstrap-prereqs] env file not found: ${envPath}`);
  console.error('Copy selfhost/.env.example to selfhost/.env.production and fill in:');
  for (const v of REQUIRED_BOOTSTRAP_VARS) console.error(`  - ${v}`);
  process.exit(64);
}

const env = parseEnvFile(envContent);
const verdict = checkRequiredEnvVars(env, REQUIRED_BOOTSTRAP_VARS);

if (!verdict.ok) {
  console.error(`[bootstrap-prereqs] ${formatPrereqError(verdict.missing, envPath)}`);
  process.exit(64);
}

console.log(`[bootstrap-prereqs] ok — ${verdict.present.length}/${REQUIRED_BOOTSTRAP_VARS.length} required vars present in ${envPath}`);
