# Automated rollback during deployment

Use `selfhost/scripts/deploy-with-auto-rollback.sh` for production or staging VPS deployments.

## What it does

1. Creates a timestamped release under `/opt/mwasalat/releases/<timestamp>`.
2. Excludes unsafe/heavy local artifacts such as `node_modules`, `.git`, `dist`, and old `release-evidence`.
3. Runs `selfhost/scripts/mysql-backup.sh` from the current release before switching, when available.
4. Switches `/opt/mwasalat/current` to the new release.
5. Runs `docker compose up -d --build --remove-orphans`.
6. Checks the public health endpoint.
7. Automatically switches back to the previous release and restarts Docker if the new release fails.
8. Writes rollback evidence JSON under `/opt/mwasalat/release-evidence/rollback`.

## First deploy

Copy the release to the VPS, unpack it, fill `selfhost/.env.production`, then run:

```bash
DEPLOY_ROOT=/opt/mwasalat \
HEALTH_URL=https://staging.example.com/api/health \
./selfhost/scripts/deploy-with-auto-rollback.sh
```

For production, use the production domain:

```bash
DEPLOY_ROOT=/opt/mwasalat \
HEALTH_URL=https://api.example.com/api/health \
./selfhost/scripts/deploy-with-auto-rollback.sh
```

## Required environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEPLOY_ROOT` | `/opt/mwasalat` | Root folder for releases, current symlink, and evidence. |
| `HEALTH_URL` | `https://${API_DOMAIN}/api/health` | Public endpoint that must return HTTP 200. |
| `COMPOSE_PROJECT_NAME` | `mwasalat` | Docker Compose project name. |
| `HEALTH_RETRIES` | `18` | Number of health check attempts. |
| `HEALTH_INTERVAL_SECONDS` | `10` | Seconds between health checks. |
| `RUN_BACKUP_BEFORE_DEPLOY` | `true` | Runs MySQL backup before switching releases. |
| `KEEP_RELEASES` | `5` | Number of release folders to keep. |

## Manual rollback

If you need to rollback later without deploying a new release:

```bash
DEPLOY_ROOT=/opt/mwasalat \
HEALTH_URL=https://api.example.com/api/health \
./selfhost/scripts/rollback-current-release.sh
```

## Evidence files

Successful or failed deployments create files under:

```text
/opt/mwasalat/release-evidence/rollback/
```

Example generated files:

```text
deploy-rollback-20260507T151500Z.json
manual-rollback-20260507T153000Z.json
```

A run with `"status": "rolled-back"` means the new deployment failed and the previous release was restored. A run with `"status": "deployed"` means the new release passed health checks.
