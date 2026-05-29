# Self-Host Production `.env` Runbook

This runbook explains every variable in `selfhost/.env.production`,
how to generate its value, and how to rotate it without downtime.

`selfhost/.env.production.template` ships with the repo; the live
file `selfhost/.env.production` is `.gitignored` and lives only on
the VPS.

## First-time generation

```bash
cd /opt/mwasalat
cp selfhost/.env.production.template selfhost/.env.production
chmod 600 selfhost/.env.production
bash selfhost/scripts/configure-production-env.sh   # interactive
```

The interactive helper:

1. Generates random values for every variable matching `__GENERATE_*__`.
2. Asks for domains and OAuth/SMTP/Stripe values.
3. Validates with `npm run verify:production-config`.
4. Refuses to overwrite a non-empty existing file unless `FORCE=1`.

## Variable groups

### Domains
| Variable | Purpose |
|---|---|
| `APP_DOMAIN` | Public web app domain (Caddy serves SPA on this) |
| `API_DOMAIN` | Public API domain (Caddy serves backend on this) |
| `APP_REDIRECT_URI` | OAuth callback prefix; usually `https://$APP_DOMAIN` |
| `PUBLIC_APP_URL` | Used in OG previews + share captions |
| `VITE_API_BASE_URL` | Compiled into the SPA at build time |

### Database
| Variable | Notes |
|---|---|
| `MYSQL_ROOT_PASSWORD` | 32 random chars; never reused across environments |
| `MYSQL_PASSWORD` | App-user password; `DATABASE_URL` MUST quote it correctly |
| `DATABASE_URL` | `mysql://app:PASS@mysql:3306/mwasalat` (host = compose service) |

### App secrets
| Variable | Generation |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `COOKIE_SECRET` | `openssl rand -hex 16` |
| `APP_VERSION` | Git tag of the deployed release |

### Email + SMTP
Required when `EMAIL_VERIFICATION_REQUIRED=true`. See `docs/SMTP_PRODUCTION.md`.

### Billing
Stripe and Lemon Squeezy variables are optional — leaving them empty
keeps the platform running with `manual` billing only. See
`docs/SAAS_BILLING_FOUNDATION_REPORT.md` for the variant-id mapping.

### Backup
| Variable | Default | Effect when changed |
|---|---|---|
| `BACKUP_REQUIRE_EXTERNAL_TARGET` | `true` | `false` only for local smoke tests |
| `BACKUP_REMOTE_DIR` | `/mnt/mwasalat-backups` | Must be a real mount, not the OS disk |
| `BACKUP_RCLONE_REMOTE` | empty | When set, takes precedence over local mount |
| `BACKUP_RETENTION_DAYS` | 30 | Local snapshots retention |
| `BACKUP_REMOTE_RETENTION_DAYS` | 90 | Off-site retention (rclone) |

### MySQL retention (db-prune)
Tunable per the matrix in `docs/MYSQL_RETENTION.md`.

### AI / Translation
All optional. Empty values activate the deterministic Noop fallback,
keeping the platform fully operational offline.

## Rotating a secret without downtime

1. Generate a new value: `openssl rand -hex 32`.
2. Edit `selfhost/.env.production` and update the value.
3. Restart the affected container only:
   ```bash
   docker compose --env-file selfhost/.env.production restart backend
   ```
4. Run the verifier:
   ```bash
   npm run verify:production-config
   ```

For `JWT_SECRET` rotation, plan a 2× window: hold the new value behind a
feature flag for 24h before flipping (refresh tokens issued under the old
key remain valid for `JWT_REFRESH_TTL`).

## Validation checklist

After any edit:

```bash
npm run verify:production-config       # validates required vars exist
npm run verify:secret-hygiene          # rejects committed secrets
npm run verify:no-legacy-provider      # blocks Supabase/Google leaks
node backend/scripts/verify-data-quality.mjs --min=70   # gate
```

## Audit trail

Every change to `.env.production` should be recorded in
`release-evidence/public-launch/release-evidence.log` with the date, the
operator id, and the variable touched (NEVER the new value). The
`secret-hygiene` verifier emits a warning if `selfhost/.env.production`
is detected inside any zip artifact — that warning is a feature.
