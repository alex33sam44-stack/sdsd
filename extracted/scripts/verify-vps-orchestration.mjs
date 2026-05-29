#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const warnings = [];
function read(path) {
  if (!existsSync(path)) {
    failures.push(`${path} is missing`);
    return '';
  }
  return readFileSync(path, 'utf8');
}
function mustContain(path, token, label = token) {
  const content = read(path);
  if (!content.includes(token)) failures.push(`${path}: missing ${label}`);
}
function mustNotContain(path, token, label = token) {
  const content = read(path);
  if (content.includes(token)) failures.push(`${path}: should not contain ${label}`);
}

const collect = read('selfhost/scripts/collect-vps-release-evidence.sh');
const firstRun = read('selfhost/scripts/vps-first-run.sh');
const publicLaunch = read('selfhost/scripts/public-launch-check.sh');
const pkg = JSON.parse(read('package.json') || '{}');

for (const flag of [
  'RUN_NPM_INSTALL',
  'RUN_PRODUCTION_CONFIG',
  'RUN_TENANT_ISOLATION',
  'RUN_STAGING_SMOKE',
  'RUN_BOOTSTRAP_DATA',
  'RUN_BACKUP_TARGET',
  'RUN_DEPLOY_ROLLBACK',
  'RUN_RELEASE_VERIFY',
  'RUN_EVIDENCE_VERIFY',
]) {
  if (!collect.includes(`${flag}="`)) failures.push(`collect-vps-release-evidence.sh does not define ${flag}`);
}

if (!collect.includes('run_optional RUN_DEPLOY_ROLLBACK')) failures.push('collect script does not gate rollback deploy behind RUN_DEPLOY_ROLLBACK');
if (!collect.includes('run_optional RUN_BOOTSTRAP_DATA')) failures.push('collect script does not gate bootstrap behind RUN_BOOTSTRAP_DATA');
if (!firstRun.includes('RUN_NPM_INSTALL=0')) failures.push('vps-first-run must skip npm install inside collect after installing dependencies earlier');
if (!firstRun.includes('RUN_BOOTSTRAP_DATA=0')) failures.push('vps-first-run must skip duplicate bootstrap inside collect');
if (!firstRun.includes('RUN_DEPLOY_ROLLBACK=0')) failures.push('vps-first-run must skip duplicate deploy/rollback inside collect');
if (!firstRun.includes('FORCE_RERUN_STEPS')) warnings.push('vps-first-run has no FORCE_RERUN_STEPS support');
if (!firstRun.includes('RESET_FIRST_RUN_STATE')) warnings.push('vps-first-run has no RESET_FIRST_RUN_STATE support');
if (!firstRun.includes('vps-preflight')) failures.push('vps-first-run must run vps-preflight before deployment');
if (!pkg.scripts?.['verify:vps-preflight']) failures.push('package.json missing verify:vps-preflight');
if (!publicLaunch.includes('RELEASE_VERIFY_STRICT=1')) failures.push('public launch gate must use strict release verification');
if (!publicLaunch.includes('npm run verify:evidence')) failures.push('public launch gate must verify runtime evidence');

for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  if (['verify:public-launch', 'vps:first-run', 'verify:vps-preflight', 'verify:backup-target', 'verify:production-config', 'verify:evidence', 'verify:prisma-migrations'].includes(name) && !command) {
    failures.push(`package.json script ${name} is empty`);
  }
}
for (const script of ['verify:public-launch', 'vps:first-run', 'verify:vps-preflight', 'verify:backup-target', 'verify:production-config', 'verify:evidence', 'verify:prisma-migrations']) {
  if (!pkg.scripts?.[script]) failures.push(`package.json missing ${script}`);
}

const result = {
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  failures,
  warnings,
  checks: {
    collectEvidenceFlags: true,
    firstRunAvoidsDuplicateDeployAndBootstrap: firstRun.includes('RUN_BOOTSTRAP_DATA=0') && firstRun.includes('RUN_DEPLOY_ROLLBACK=0'),
    publicLaunchStrict: publicLaunch.includes('RELEASE_VERIFY_STRICT=1'),
    vpsPreflightFirst: firstRun.includes('vps-preflight'),
    packageScriptsPresent: ['verify:public-launch', 'vps:first-run', 'verify:vps-preflight', 'verify:backup-target', 'verify:production-config', 'verify:evidence', 'verify:prisma-migrations'].every((s) => Boolean(pkg.scripts?.[s])),
  },
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exit(1);
