# Stage 2 — Prisma migrations production fix

## What changed

Production startup no longer falls back to:

```bash
npx prisma db push --accept-data-loss
```

That fallback is unsafe for public launch because it can mutate schema without a committed migration history.

## Added

- `backend/prisma/migrations/20260507162000_init/migration.sql`
- `scripts/verify-prisma-migrations.mjs`
- `npm run verify:prisma-migrations`

## Docker behavior now

`backend/Dockerfile` runs only committed migrations before starting the API:

```bash
npx prisma migrate deploy && node dist/main.js
```

If migrations are missing, the container fails fast instead of trying destructive schema sync.

## VPS check

Run before public launch:

```bash
npm run verify:prisma-migrations
```

Then deploy normally:

```bash
docker compose --env-file selfhost/.env.production up -d --build
```

## Notes

The initial migration is a baseline generated from `backend/prisma/schema.prisma` and includes the tables needed by the production seed scripts: tenants, users, roles, stations, lines, stops, tenant memberships, billing records, logs, and draft changes.
