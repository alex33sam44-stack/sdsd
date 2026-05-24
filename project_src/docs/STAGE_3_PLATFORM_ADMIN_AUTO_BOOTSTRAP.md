# Stage 3 — Platform admin bootstrap

The public-launch bootstrap no longer assumes that the requested admin user already exists.

## Prerequisites — fill these in before step 1

`grant-platform-admin.sh` runs `docker compose exec mysql ...` against the production stack, so `selfhost/.env.production` MUST contain at least the following variables filled with real values **before you run the script**:

| Group | Variables | Why the script needs them |
|---|---|---|
| Public hostname | `API_DOMAIN` | Backend boot, Caddy routing, OAuth redirect URIs |
| MySQL credentials | `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | `docker compose exec mysql` cannot authenticate without them |
| JWT signing | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Backend container will not boot, so MySQL exec will hit nothing |

If any of these are missing or empty, the script aborts with exit code `64` (EX_USAGE) and a single message listing every missing variable. You can run the same check standalone:

```bash
node scripts/check-bootstrap-prereqs.mjs --env selfhost/.env.production
```

Reference template: `selfhost/.env.example`.

## What the script does

`selfhost/scripts/grant-platform-admin.sh` performs an idempotent bootstrap for `ADMIN_EMAIL`:

1. Creates the admin user if it does not already exist.
2. Grants `user_roles.role = 'platform_admin'` to the user.
3. Adds the user as `tenant_owner` of the seeded tenant when the tenant exists.
4. Optionally rotates the user's `password_hash` when explicitly requested.

## Bootstrap password handling

No static platform admin password is packaged anymore.

When `ADMIN_BOOTSTRAP_PASSWORD_HASH` is not supplied, the script generates a one-time random password on the VPS, hashes it with Argon2, and stores the one-time password in a local `0600` file under:

```text
release-evidence/platform-admin/admin-bootstrap-credentials.txt
```

You can also run the script with a precomputed hash and ask for a deliberate reset:

```bash
ADMIN_BOOTSTRAP_PASSWORD_HASH='<argon2id-hash>' \
ADMIN_RESET_PASSWORD_HASH=true \
./selfhost/scripts/grant-platform-admin.sh
```

## Re-run safety: credentials file always matches the database

There is a subtle failure mode that older versions of this bootstrap had: if you run the script a second time without setting `ADMIN_RESET_PASSWORD_HASH=true`, the SQL `ON DUPLICATE KEY UPDATE` keeps the **existing** `password_hash` (because the user already has one), but the password-hash script still generates and writes a **new** credentials file. The file would then point at a password the database refuses.

The script now reconciles this automatically:

1. Before overwriting `admin-bootstrap-credentials.txt`, it backs the existing file up to `admin-bootstrap-credentials.txt.previous` with mode 0600.
2. The SQL emits a new field `passwordHashApplied: true|false` derived by comparing the row's `password_hash` after the upsert to the hash this run produced.
3. After the SQL succeeds, the script reconciles:
   - **Hash applied** → keep the new credentials, drop the `.previous` backup.
   - **Hash NOT applied + previous backup exists** → **restore** `.previous` over the new file, write `credentials-not-applied.txt` explaining what happened.
   - **Hash NOT applied + no previous backup** → **delete** the misleading new file, write `credentials-not-applied.txt`.
   - **Outcome unknown** (e.g. older SQL output) → keep credentials, log uncertainty.

The marker file `release-evidence/platform-admin/credentials-not-applied.txt` is the operator's signal that the credentials file does not point at a freshly-generated password and that re-running with `ADMIN_RESET_PASSWORD_HASH=true` is required to actually rotate the password.

## Examples

```bash
# First-time bootstrap on a fresh VPS — generates a random password,
# stores it in admin-bootstrap-credentials.txt, applies the hash to
# the new admin user.
ADMIN_EMAIL='mosm97829@gmail.com' \
ADMIN_DISPLAY_NAME='mah mos' \
./selfhost/scripts/grant-platform-admin.sh

# Re-run on an existing admin user (idempotent — preserves the old
# password). The script detects the old hash was kept, restores the
# previous credentials file, and writes credentials-not-applied.txt.
./selfhost/scripts/grant-platform-admin.sh

# Deliberate password rotation — the new password will be applied and
# the credentials file will reflect it.
ADMIN_RESET_PASSWORD_HASH=true \
./selfhost/scripts/grant-platform-admin.sh
```
