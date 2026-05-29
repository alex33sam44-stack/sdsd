# Release evidence blockers

This package now contains all seven required evidence files, so validators no longer fail with `missing file`.

Important: the included JSON files start as `status: not_verified`. They are not launch approval evidence. They are explicit placeholders that must be overwritten on a real VPS with Docker, MySQL, and HTTPS.

## Required evidence files

| Evidence | File | How it becomes passing |
|---|---|---|
| staging-smoke | `release-evidence/staging/staging-smoke-readiness.json` | `npm run staging:smoke` against real HTTPS staging API |
| docker-smoke | `release-evidence/staging/docker-smoke-readiness.json` | Docker Compose stage stack builds and starts |
| restore | `release-evidence/staging/restore-verified.json` | `RESTORE_VERIFY_COMMAND` succeeds against restored MySQL backup |
| tenant-isolation | `release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json` | `cd backend && npm run test:tenant-isolation:mysql:docker` succeeds |
| initial-data | `release-evidence/initial-data/initial-data-readiness.json` | published station, line, and route stops exist in live MySQL |
| platform-admin | `release-evidence/platform-admin/platform-admin-readiness.json` | target admin user has `user_roles.role = platform_admin` |
| rollback | `release-evidence/rollback/rollback-readiness.json` | `deploy-with-auto-rollback.sh` succeeds and records evidence |

## One command on the VPS

Run from the project root after configuring `selfhost/.env.production` with real domains and secrets:

```bash
API=https://<real-api-domain> \
ADMIN_EMAIL='mosm97829@gmail.com' \
RESTORE_VERIFY_COMMAND='./selfhost/scripts/verify-restore.sh' \
./selfhost/scripts/collect-vps-release-evidence.sh
```

Then verify:

```bash
npm run verify:evidence
```

A public launch is only ready when `publicLaunchReady` is `true`.
