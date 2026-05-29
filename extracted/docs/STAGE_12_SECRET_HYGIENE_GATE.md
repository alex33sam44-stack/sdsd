# Stage 12 - Secret Hygiene Gate

## Purpose

Stage 12 adds a package-level secret hygiene gate before VPS upload/public launch.

The release artifact is a **private deployment package** because it intentionally includes `selfhost/.env.production` with internal deployment secrets. This ZIP must not be published publicly or shared outside the deployment operator.

## What changed

- Added `scripts/verify-secret-hygiene.mjs`.
- Added `npm run verify:secret-hygiene`.
- Added `release-evidence/security/secret-hygiene-readiness.json`.
- Added secret hygiene to `npm run verify:evidence` and strict release verification.
- Added secret hygiene to `selfhost/scripts/public-launch-check.sh`.
- Removed the unsafe root `.env` from the package.
- Disabled the static `002-platform-admin.sql` admin account seed.
- Removed the packaged reusable `platform_admin` bootstrap password from docs and static SQL.

## platform_admin security change

Static SQL no longer creates `platform_admin@mwasalat.local` with a reusable password hash.

Use the runtime bootstrap instead:

```bash
ADMIN_EMAIL='mosm97829@gmail.com' \
ADMIN_DISPLAY_NAME='mah mos' \
./selfhost/scripts/grant-platform-admin.sh
```

If no `ADMIN_BOOTSTRAP_PASSWORD_HASH` is supplied, the script generates a one-time password on the VPS, hashes it with Argon2, and stores the one-time password in a local `0600` file:

```text
release-evidence/platform-admin/admin-bootstrap-credentials.txt
```

Keep that file private, use it once, then rotate the password in the app.

## Verification

Run:

```bash
npm run verify:secret-hygiene
```

Expected status for this private deployment package:

```json
{
  "passed": true,
  "status": "passed_with_warnings",
  "privateDeploymentPackage": true
}
```

The warning is expected because `selfhost/.env.production` contains real deployment secrets.
