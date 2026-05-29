# Stage 3 - platform_admin Auto Bootstrap Fix

## What changed

The public-launch bootstrap no longer assumes that the requested admin user already exists.

`selfhost/scripts/grant-platform-admin.sh` performs an idempotent bootstrap for `ADMIN_EMAIL`:

1. Creates the admin user if it does not already exist.
2. Creates or updates the profile display name.
3. Adds `user_roles.role = 'platform_admin'`.
4. Adds `tenant_owner` membership for the seeded demo tenant when that tenant exists.
5. Writes runtime evidence to `release-evidence/platform-admin/platform-admin-readiness.json`.

## Secure bootstrap password behavior

No static platform admin password is packaged anymore.

When `ADMIN_BOOTSTRAP_PASSWORD_HASH` is not supplied, the script generates a one-time random password on the VPS, hashes it with Argon2, and stores the one-time password in a local `0600` file under:

```text
release-evidence/platform-admin/admin-bootstrap-credentials.txt
```

Keep that file private, use the password once, then rotate it inside the app.

## Default admin command

```bash
ADMIN_EMAIL='mosm97829@gmail.com' \
ADMIN_DISPLAY_NAME='mah mos' \
./selfhost/scripts/grant-platform-admin.sh
```

The script does **not** reset an existing user's password by default. To force a reset to a supplied hash:

```bash
ADMIN_BOOTSTRAP_PASSWORD_HASH='<argon2id-hash>' \
ADMIN_RESET_PASSWORD_HASH=true \
./selfhost/scripts/grant-platform-admin.sh
```

## Full public-launch bootstrap

```bash
ADMIN_EMAIL='mosm97829@gmail.com' ./selfhost/scripts/bootstrap-public-launch-data.sh
```

This seeds public station data, verifies the data, then ensures the requested admin account exists and has `platform_admin`.
