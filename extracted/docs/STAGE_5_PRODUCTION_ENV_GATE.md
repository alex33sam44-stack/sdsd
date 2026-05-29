# Stage 5 - Production domains and frontend env gate

This stage turns the remaining domain/frontend placeholders into a strict deployment gate.

## Configure on the VPS

Use real DNS names that already point to the VPS:

```bash
APP_DOMAIN=app.example.com \
API_DOMAIN=api.example.com \
BACKUP_RCLONE_REMOTE=s3:mwasalat-prod-backups/mysql \
./selfhost/scripts/configure-production-env.sh
```

The script updates both:

- `selfhost/.env.production`
- `.env.production.frontend`

It derives these values consistently:

- `PUBLIC_URL=https://$API_DOMAIN`
- `CORS_ORIGIN=https://$APP_DOMAIN,https://$API_DOMAIN`
- `GOOGLE_REDIRECT_URI=https://$API_DOMAIN/api/auth/google/callback`
- `APP_REDIRECT_URI=https://$APP_DOMAIN/auth/callback`
- `BILLING_*_URL=https://$APP_DOMAIN/...`
- `VITE_API_BASE_URL=https://$API_DOMAIN/api`

## Verification

```bash
npm run verify:production-config
```

The verifier fails if:

- any `.local`, `example.com`, `yourdomain.com`, `localhost`, wildcard, or `<placeholder>` remains
- `APP_DOMAIN` or `API_DOMAIN` includes protocol/path
- public URLs are not HTTPS
- frontend `VITE_API_BASE_URL` does not match backend env
- `CORS_ORIGIN` does not include both app and API origins
- backup target is not external or off-site
- npm registry DNS is unavailable on the VPS

For local/offline syntax checks only, you may use:

```bash
SKIP_NPM_NETWORK_CHECK=1 npm run verify:production-config
```

Do not use the skip flag for public launch approval.
