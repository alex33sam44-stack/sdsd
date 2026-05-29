# Stage 3 Recheck Summary

The `platform_admin` bootstrap was reworked to avoid manual SQL and avoid packaging a reusable plaintext password.

## Current behavior

- `selfhost/scripts/grant-platform-admin.sh` creates or updates the requested `ADMIN_EMAIL`.
- It grants `user_roles.role = 'platform_admin'`.
- It can add `tenant_owner` membership for the seeded tenant.
- If no hash is supplied, it generates a one-time password on the VPS and stores it in a private `0600` credentials file.

## Security note

The static SQL admin seed is disabled. Use the runtime bootstrap script instead.
