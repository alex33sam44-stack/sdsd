# Stage 5 recheck summary

Implemented:

- Added `selfhost/scripts/configure-production-env.sh`.
- Added `npm run configure:production-env`.
- Hardened `scripts/validate-production-config.mjs` with cross-field consistency checks.
- Fixed `.env.production.frontend` placeholder documentation.
- Extended `.env.production.example` with `PUBLIC_URL`, `VITE_API_BASE_URL`, and backup target fields.

Current expected state before VPS values are supplied:

- production config verification still fails, intentionally, because real domains and a real external backup target are not known inside this build environment.
- after running the configure script on the VPS with real values, `npm run verify:production-config` becomes the release gate.
