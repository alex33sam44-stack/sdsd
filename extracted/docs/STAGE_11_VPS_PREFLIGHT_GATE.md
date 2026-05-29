# Stage 11 - VPS preflight gate

This stage adds a strict preflight check that must run on the real VPS before first deployment.

## Command

```bash
APP_DOMAIN=app.example.com \
API_DOMAIN=api.example.com \
BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql \
npm run verify:vps-preflight
```

The command writes:

```text
release-evidence/vps-preflight/vps-preflight-latest.json
release-evidence/vps-preflight/vps-preflight-<timestamp>.json
```

## Checks

- Real `APP_DOMAIN` and `API_DOMAIN` hostnames.
- External backup target.
- Required commands: bash, node, npm, docker, curl, openssl, tar, gzip.
- rclone when `BACKUP_RCLONE_REMOTE` is configured.
- Docker Compose v2 and Docker daemon readiness.
- Free disk and memory thresholds.
- Ports 80 and 443 availability before Caddy starts.
- DNS and HTTPS reachability for npm, GitHub, Docker Hub, and the configured domains.

`vps-first-run.sh` now runs this as the first resumable step. Use `SKIP_VPS_PREFLIGHT=1` only for local dry runs, not for public launch approval.
