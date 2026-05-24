# Public launch bootstrap: initial data and platform admin

Run this on the real VPS after Docker, HTTPS, MySQL migrations, and the backend are up.

## Prerequisites — required before the one command below works

`bootstrap-public-launch-data.sh` and `grant-platform-admin.sh` both exec into the MySQL container via `docker compose`. That means `selfhost/.env.production` must already contain:

- `API_DOMAIN`
- `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`

If any are missing or blank, the script exits early with code `64` and a paste-friendly error listing every missing variable. To check without running the bootstrap:

```bash
node scripts/check-bootstrap-prereqs.mjs --env selfhost/.env.production
```

Reference template: `selfhost/.env.example`.

## One command

```bash
ADMIN_EMAIL='mosm97829@gmail.com' ./selfhost/scripts/bootstrap-public-launch-data.sh
```

This command:

1. Applies SQL seeds from `selfhost/seeds/`.
2. Verifies that public launch data exists:
   - at least one published station
   - at least one published line
   - at least one stop
3. Grants `platform_admin` to the existing account in `users` matching `ADMIN_EMAIL`.
4. Writes evidence JSON files under `release-evidence/`.

## Required evidence files

```text
release-evidence/initial-data/initial-data-readiness.json
release-evidence/platform-admin/platform-admin-readiness.json
```

## If the platform admin script says `user not found`

Create or log in with the intended admin account first so it exists in `users`, then rerun:

```bash
ADMIN_EMAIL='mosm97829@gmail.com' ./selfhost/scripts/grant-platform-admin.sh
```

## Manual SQL equivalent

```sql
INSERT INTO user_roles (id, user_id, role, created_at)
SELECT UUID(), id, 'platform_admin', NOW()
FROM users
WHERE email = 'mosm97829@gmail.com'
ON DUPLICATE KEY UPDATE role = VALUES(role);
```
