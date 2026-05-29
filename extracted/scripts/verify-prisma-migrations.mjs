#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'backend', 'prisma', 'migrations');
const dockerfile = path.join(root, 'backend', 'Dockerfile');
const failures = [];
const warnings = [];

function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }

if (!fs.existsSync(migrationsDir)) {
  fail('backend/prisma/migrations is missing');
} else {
  const migrationSqlFiles = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDir, entry.name, 'migration.sql'))
    .filter((file) => fs.existsSync(file));

  if (migrationSqlFiles.length === 0) {
    fail('No Prisma migration.sql files found');
  }

  const combinedSql = migrationSqlFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const combinedSqlLower = combinedSql.toLowerCase();
  const requiredTables = [
    'tenants',
    'users',
    'user_roles',
    'cities',
    'stations',
    'lines',
    'route_stops',
    'tenant_memberships',
  ];
  for (const table of requiredTables) {
    const expected = 'create table if not exists `' + table + '`';
    if (!combinedSqlLower.includes(expected)) {
      fail('Migration does not create required table: ' + table);
    }
  }

  if (/accept-data-loss|db push/i.test(combinedSql)) {
    fail('Migration SQL must not use prisma db push or accept-data-loss');
  }
}

if (!fs.existsSync(dockerfile)) {
  fail('backend/Dockerfile is missing');
} else {
  const docker = fs.readFileSync(dockerfile, 'utf8');
  if (/accept-data-loss|db push/i.test(docker)) {
    fail('backend/Dockerfile still contains db push / accept-data-loss fallback');
  }
  if (!/prisma migrate deploy/.test(docker)) {
    fail('backend/Dockerfile does not run prisma migrate deploy');
  }
  if (!/test -d prisma\/migrations/.test(docker)) {
    warn('backend/Dockerfile does not explicitly check prisma/migrations before boot');
  }
}

const result = {
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  failures,
  warnings,
};
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
