# Platform upload readiness recheck

Date: 2026-05-07
Scope: static package review for self-hosted VPS upload. Runtime checks that require Docker, MySQL, DNS and HTTPS were not marked as passed unless their final evidence JSON exists.

## Verdict

Status: CONDITIONAL READY FOR VPS STAGING UPLOAD, NOT READY FOR PUBLIC LINK YET.

The package contains the required deployment, backup, seed, platform admin, rollback and evidence-collection scripts. It should be uploaded to a VPS staging environment for real execution. It should not be shared publicly until the runtime evidence files are generated and reviewed.

## Ready inside the package

- Docker self-hosted stack is present: docker-compose.yml, backend Dockerfile, Caddy reverse proxy, MySQL internal network.
- Production env template/file exists with generated internal secrets.
- MySQL logical backup automation exists: selfhost/scripts/mysql-backup.sh, install-backup-cron.sh, mysqldump.cron.
- Initial data seed exists: selfhost/seeds/001-initial-station.sql.
- Bootstrap admin seed exists: selfhost/seeds/002-platform-admin.sql.
- Public launch bootstrap exists: selfhost/scripts/bootstrap-public-launch-data.sh.
- Platform admin grant script exists for ADMIN_EMAIL, defaulting to mosm97829@gmail.com.
- VPS evidence collector exists: selfhost/scripts/collect-vps-release-evidence.sh.
- Auto rollback deployment exists: selfhost/scripts/deploy-with-auto-rollback.sh and rollback-current-release.sh.
- Shell scripts pass bash/sh syntax checks.
- Node .mjs scripts pass node --check syntax checks.

## Still blocking public release

- Staging smoke evidence is not generated yet: release-evidence/staging/staging-smoke-readiness.json.
- Docker smoke evidence is not generated yet: release-evidence/staging/docker-smoke-readiness.json.
- Restore verification evidence is not generated yet: release-evidence/staging/restore-verified.json.
- Tenant isolation evidence is not generated yet: release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json.
- Initial data runtime evidence is not generated yet: release-evidence/initial-data/initial-data-readiness.json.
- Platform admin runtime evidence is not generated yet: release-evidence/platform-admin/platform-admin-readiness.json.
- Rollback deployment evidence is not generated yet: release-evidence/rollback/deploy-rollback-*.json.
- API_DOMAIN, PUBLIC_URL, CORS_ORIGIN and OAuth redirect URLs still use .local placeholder values and must be replaced with the real HTTPS domains before staging/public launch.
- External backup target must be configured and verified on the VPS: either BACKUP_RCLONE_REMOTE or a real mounted BACKUP_REMOTE_DIR.
- npm install/ci was not completed in this execution environment because npm registry DNS was unavailable. The VPS must have outbound access to npm during Docker build, or images must be built elsewhere and pushed to a registry.

## Required VPS command sequence

1. Upload the cleaned package to the VPS.
2. Set real DNS A records for API_DOMAIN and the frontend domain.
3. Edit selfhost/.env.production and replace .local placeholders.
4. Start the stack:

```bash
docker compose --env-file selfhost/.env.production up -d --build
```

5. Bootstrap launch data and platform admin:

```bash
ADMIN_EMAIL='mosm97829@gmail.com' ./selfhost/scripts/bootstrap-public-launch-data.sh
```

6. Install backup cron:

```bash
./selfhost/scripts/install-backup-cron.sh
```

7. Collect evidence:

```bash
API=https://<real-api-domain> \
RESTORE_VERIFY_COMMAND='./selfhost/scripts/verify-restore.sh' \
./selfhost/scripts/collect-vps-release-evidence.sh
```

8. Deploy future releases with rollback automation:

```bash
DEPLOY_ROOT=/opt/mwasalat \
HEALTH_URL=https://<real-api-domain>/api/health \
./selfhost/scripts/deploy-with-auto-rollback.sh
```

## Release gate

Public link can be shared only after all required JSON evidence files report status ready/passed/deployed and the API health endpoint returns HTTP 200 over HTTPS.
