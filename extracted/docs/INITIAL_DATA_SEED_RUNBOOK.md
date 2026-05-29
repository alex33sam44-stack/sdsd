# Initial data seed runbook

This repository includes an idempotent MySQL seed that injects a minimal production-ready dataset for the self-hosted stack.

## What it creates

The station seed creates at least one published station:

- Tenant: `mwasalat-eg-demo`
- City: `القاهرة`
- Station: `موقف رمسيس`
- Lines:
  - `شبرا الخيمة` with 4 route stops
  - `مصر الجديدة` with 4 route stops
- Station layout zones and initial availability logs

The seed uses stable UUIDs and `ON DUPLICATE KEY UPDATE`, so it is safe to run again after deployment.

## Apply after the stack is up

From the repository root on the server:

```bash
./selfhost/scripts/seed-initial-data.sh
```

By default the script uses:

```bash
selfhost/.env.production
docker-compose.yml
selfhost/seeds/*.sql
```

It applies all SQL seeds in lexical order. To apply only the station seed, pass `SQL_FILE=selfhost/seeds/001-initial-station.sql`.

Override paths if needed:

```bash
ENV_FILE=selfhost/.env.production \
COMPOSE_FILE=docker-compose.yml \
SQL_FILE=selfhost/seeds/001-initial-station.sql \
./selfhost/scripts/seed-initial-data.sh
```

## Verify manually

```bash
docker compose --env-file selfhost/.env.production exec mysql \
  sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT id, name, area, is_published FROM stations; SELECT destination, cars, status FROM lines;"'
```

Expected minimum result:

- `stations` contains `موقف رمسيس`
- `lines` contains `شبرا الخيمة` and `مصر الجديدة`

## Notes

Run Prisma schema deployment first. The backend container already performs `prisma migrate deploy` or `prisma db push` during boot, so the tables should exist after `backend` is healthy.
