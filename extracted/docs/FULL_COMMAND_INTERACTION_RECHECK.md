# Full command interaction recheck

Date: 2026-05-07

## Scope
Reviewed the latest upload candidate after adding:

- selfhost production env and frontend env gate
- MySQL backup cron and off-site target settings
- initial station/line/stop seed
- platform_admin bootstrap/grant flow
- VPS release evidence collection
- automatic rollback deployment
- release evidence placeholder files
- production blocker validation gate

## Local checks actually run in this environment

These checks were run without Docker/VPS access:

```bash
bash -n selfhost/scripts/*.sh
node --check scripts/*.mjs backend/scripts/*.mjs
find release-evidence -name '*.json' -print0 | xargs -0 JSON.parse
node scripts/validate-release-evidence.mjs
node scripts/validate-production-config.mjs
node scripts/release-verify.mjs
RELEASE_VERIFY_STRICT=1 node scripts/release-verify.mjs
unzip -t <final-zip>
```

## Results

### Passed

- All shell scripts parse successfully.
- All Node `.mjs` scripts parse successfully.
- All release evidence JSON files are valid JSON.
- Required release evidence files are present: missing count is `0`.
- Root release verifier can run without crashing.
- The initial data seed columns match the Prisma schema names for tenants, cities, stations, station_layouts, layout_zones, lines, route_stops, availability_logs, users, profiles, user_roles, and tenant_memberships.
- The `platform_admin` role value exists in the Prisma `AppRole` enum.
- The initial station/line enum values match Prisma mapped MySQL values: Arabic `vehicle_type` values and `active` line status.

### Expected blockers still failing before public launch

These failures are intentional blockers, not code breakage:

- `verify:evidence` returns non-zero because the 7 evidence files are present but still `not_verified` until run on a real VPS.
- `verify:production-config` returns non-zero because real HTTPS domains, frontend `VITE_API_BASE_URL`, and external backup target proof are not configured yet.
- `RELEASE_VERIFY_STRICT=1` fails until real release evidence and `BACKEND_URL` / `VITE_API_BASE_URL` are provided.
- `npm install` / `npm ci` cannot complete in this environment because DNS to npm registries fails; Docker build on the VPS requires outbound npm access.

## Interaction fix applied during this recheck

A real interaction bug was found and fixed in `selfhost/scripts/collect-vps-release-evidence.sh`:

1. `npm run staging:smoke` defaulted to `selfhost/.env.staging`, which is not included in the package. The collector now defaults to:
   - `STAGING_ENV_FILE=selfhost/.env.production`
   - `STAGING_COMPOSE_FILE=docker-compose.yml`
   while still allowing overrides.
2. `deploy-with-auto-rollback.sh` wrote rollback evidence to `/opt/mwasalat/release-evidence/rollback`, while `npm run verify:evidence` checks the current package path. The collector now passes:
   - `EVIDENCE_DIR="$ROOT_DIR/release-evidence/rollback"`
   so the canonical `rollback-readiness.json` is written where the verifier expects it.

## Conclusion

The package is safe to upload to a VPS for staging validation. It is not safe to share publicly until the remaining runtime blockers pass on the VPS:

```bash
npm run verify:production-config
npm run verify:evidence
RELEASE_VERIFY_STRICT=1 BACKEND_URL=https://<real-api-domain> npm run verify:release
```
