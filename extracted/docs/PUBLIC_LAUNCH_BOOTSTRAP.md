# Public launch bootstrap: initial data and platform admin

Run this on the real VPS after Docker, HTTPS, MySQL migrations, and the backend are up.

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
