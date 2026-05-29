# Production blockers acknowledgement

These items are intentionally treated as public-launch blockers. They are not safe to auto-fill inside the repository because they depend on the real VPS, DNS, TLS certificate, frontend URL, Google OAuth project, npm egress, and off-site backup target.

## Current blockers

1. `selfhost/.env.production` still contains local placeholder values such as `api.mwasalat.local` and `app.mwasalat.local`.
2. Frontend production env `.env.production.frontend` now has an explicit `VITE_API_BASE_URL`; keep it synchronized with `selfhost/.env.production`.
3. Docker build on the VPS requires outbound access to `registry.npmjs.org` so `npm ci` can complete during image build.
4. External backup target must be proven by setting either `BACKUP_RCLONE_REMOTE` or an externally mounted `BACKUP_REMOTE_DIR`.

## Required values before public launch

Set `selfhost/.env.production`:

```env
API_DOMAIN=<real-api-domain>
PUBLIC_URL=https://<real-api-domain>
CORS_ORIGIN=https://<real-frontend-domain>,https://<real-api-domain>
GOOGLE_REDIRECT_URI=https://<real-api-domain>/api/auth/google/callback
APP_REDIRECT_URI=https://<real-frontend-domain>/auth/callback
BILLING_APP_URL=https://<real-frontend-domain>
BILLING_SUCCESS_URL=https://<real-frontend-domain>/admin/billing?checkout=success
BILLING_CANCEL_URL=https://<real-frontend-domain>/admin/billing?checkout=cancel
BILLING_PORTAL_RETURN_URL=https://<real-frontend-domain>/admin/billing
BACKUP_RCLONE_REMOTE=s3:<bucket-or-remote>/mysql
# OR, if using a mounted external disk:
BACKUP_REMOTE_DIR=/mnt/<external-disk>/mwasalat-mysql
```

Verify `.env.production.frontend` before frontend build:

```env
VITE_API_BASE_URL=https://api.mwasalat.com/api
```

## Gate command

Run this on the VPS after filling the values:

```bash
npm run verify:production-config
```

It writes:

```text
release-evidence/config/production-config-readiness.json
```

The command must pass before sharing the public URL.

## npm / Docker build requirement

Verify outbound npm access on the VPS:

```bash
getent hosts registry.npmjs.org
npm ping --registry=https://registry.npmjs.org/
```

If the VPS is behind a firewall/proxy, configure npm/Docker proxy settings before running:

```bash
docker compose --env-file selfhost/.env.production build
```
