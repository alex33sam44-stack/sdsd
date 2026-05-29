# Deep Platform Recheck

Generated during the second deep review.

## Important fix applied

The backend did not include `backend/package-lock.json`, while `backend/Dockerfile` and `selfhost/scripts/collect-vps-release-evidence.sh` used `npm ci` inside `backend/`. That would fail on the VPS/Docker build.

Fixed by changing backend dependency installation to:

- use `npm ci` when `package-lock.json` exists
- fall back to `npm install` when it does not

Files changed:

- `backend/Dockerfile`
- `selfhost/scripts/collect-vps-release-evidence.sh`
- `scripts/validate-production-config.mjs` wording

## Still intentionally blocked before public launch

- real HTTPS domains are not configured
- `.env.production.frontend` includes explicit `VITE_API_BASE_URL=https://api.mwasalat.com/api`
- evidence files exist but remain `not_verified` until the VPS run
- external backup target must be confirmed on the VPS
- npm registry/DNS access must work on the VPS

## Commands executed in this review

```bash
find selfhost/scripts -type f -name '*.sh' -print0 | xargs -0 -I{} bash -n {}
find scripts backend/scripts -type f -name '*.mjs' -print0 | xargs -0 -I{} node --check {}
node /tmp/deep_audit.js
npm run verify:evidence
npm run verify:production-config
npm run verify:release
RELEASE_VERIFY_STRICT=1 npm run verify:release
```

## Results

- Shell syntax: passed.
- Node syntax: passed.
- Release evidence JSON parse: passed.
- Critical file existence: passed.
- Seed checks for published station, published lines, route stops: passed by static inspection.
- platform_admin seed and grant script: present and syntactically valid.
- `npm run verify:evidence`: fails as expected because the seven evidence files are present but still `not_verified`.
- `npm run verify:production-config`: fails as expected because real HTTPS domains, frontend API URL, npm DNS, and external backup target are not yet confirmed.
- `npm run verify:release`: exits zero in non-strict mode but reports four evidence failures.
- `RELEASE_VERIFY_STRICT=1 npm run verify:release`: exits non-zero as expected until real VPS evidence and backend URL are present.

## Final status

This package is suitable to upload to a VPS for staging validation. It is intentionally blocked from public launch until the VPS run replaces placeholders and generates real evidence.
