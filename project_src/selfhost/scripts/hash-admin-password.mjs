#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd().endsWith('/backend') ? path.resolve(process.cwd(), '..') : process.cwd();
const backendPkg = path.join(root, 'backend', 'package.json');
const requireFromBackend = createRequire(backendPkg);
let argon2;
try {
  argon2 = requireFromBackend('argon2');
} catch (error) {
  console.error('[admin-hash] argon2 is not installed under backend/node_modules. Run: cd backend && npm install --no-audit --no-fund');
  process.exit(2);
}

const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || crypto.randomBytes(24).toString('base64url');
const credentialsDir = process.env.ADMIN_CREDENTIALS_DIR || path.join(root, 'release-evidence', 'platform-admin');
const credentialsFile = process.env.ADMIN_CREDENTIALS_FILE || path.join(credentialsDir, 'admin-bootstrap-credentials.txt');
const printPassword = process.env.PRINT_ADMIN_BOOTSTRAP_PASSWORD === '1';

if (password.length < 20) {
  console.error('[admin-hash] ADMIN_BOOTSTRAP_PASSWORD must be at least 20 characters');
  process.exit(3);
}

const hash = await argon2.hash(password);
fs.mkdirSync(credentialsDir, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Back the existing credentials file up to .previous BEFORE we overwrite it.
// grant-platform-admin.sh uses this to roll back if the SQL ON DUPLICATE KEY
// UPDATE keeps the old password_hash (e.g. user already exists and
// ADMIN_RESET_PASSWORD_HASH=false). Without this safety net the credentials
// file would silently start pointing at a password the database does not
// accept — exactly the bug we are fixing.
// ─────────────────────────────────────────────────────────────────────────────
const previousFile = `${credentialsFile}.previous`;
let previousBackedUp = false;
if (fs.existsSync(credentialsFile)) {
  try {
    fs.copyFileSync(credentialsFile, previousFile);
    fs.chmodSync(previousFile, 0o600);
    previousBackedUp = true;
  } catch (error) {
    // A failed backup is not fatal — we still write the new file — but we
    // surface it so the operator can investigate filesystem permissions.
    console.error(`[admin-hash] WARN: could not back up existing credentials to ${previousFile}: ${error.message}`);
  }
}

fs.writeFileSync(credentialsFile, [
  'Generated platform admin bootstrap credential.',
  'Keep this file private, use it once, then rotate the password in the app.',
  `created_at=${new Date().toISOString()}`,
  `admin_email=${process.env.ADMIN_EMAIL || ''}`,
  `password=${password}`,
  '',
].join('\n'), { mode: 0o600 });

process.stdout.write(JSON.stringify({
  passwordHash: hash,
  credentialsFile: path.relative(root, credentialsFile).split(path.sep).join('/'),
  previousCredentialsFile: previousBackedUp
    ? path.relative(root, previousFile).split(path.sep).join('/')
    : null,
  generatedPassword: !process.env.ADMIN_BOOTSTRAP_PASSWORD,
  passwordPrinted: printPassword,
  password: printPassword ? password : undefined,
}, null, 2) + '\n');
