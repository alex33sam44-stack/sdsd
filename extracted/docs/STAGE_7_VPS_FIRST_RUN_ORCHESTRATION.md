# Stage 7 — VPS first-run orchestration

Adds a single command for the first real VPS run. It configures production env, verifies gates, deploys with rollback, bootstraps data/admin, installs backup cron, collects runtime evidence, and runs the public launch gate.

```bash
APP_DOMAIN=app.example.com \
API_DOMAIN=api.example.com \
BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql \
ADMIN_EMAIL=mosm97829@gmail.com \
ADMIN_DISPLAY_NAME='mah mos' \
./selfhost/scripts/vps-first-run.sh
```

Do not publish the public link unless `release-evidence/public-launch/public-launch-check-latest.json` contains `publicLaunchReady: true`.
