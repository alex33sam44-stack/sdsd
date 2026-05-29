# Platform admin bootstrap account

This self-hosted bundle includes an idempotent seed for a first platform administrator.

## Account

- Email: `platform_admin@mwasalat.local`
- Platform role: `platform_admin`
- Seeded tenant role: `tenant_owner` for `mwasalat-eg-demo`

The SQL seed stores only an Argon2id password hash in MySQL. Keep the initial password private and rotate it immediately after first login.

## Apply the seed

From the repository root after the MySQL container is healthy and Prisma schema deployment has completed:

```bash
./selfhost/scripts/seed-initial-data.sh
```

The script applies every SQL file in `selfhost/seeds` in lexical order, including:

```text
001-initial-station.sql
002-platform-admin.sql
```

To apply only the admin seed:

```bash
SQL_FILE=selfhost/seeds/002-platform-admin.sql ./selfhost/scripts/seed-initial-data.sh
```

## Verify

```bash
docker compose --env-file selfhost/.env.production exec mysql \
  sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT u.email, ur.role FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE u.email = '\''platform_admin@mwasalat.local'\'';"'
```

Expected result: one row with `platform_admin@mwasalat.local` and role `platform_admin`.

## Security checklist

1. Log in with the bootstrap account.
2. Change the password immediately.
3. Replace the local-only `@mwasalat.local` email with the real administrator email.
4. Remove or archive the bootstrap credential from any deployment notes.
