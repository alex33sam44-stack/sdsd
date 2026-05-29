# Release Verification Runbook

Run these commands before any production release.

## Frontend

```bash
npm ci
VITE_API_BASE_URL=https://api.example.com/api \
VITE_APP_VERSION=2026.05.02 \
VITE_RELEASE_NAME=prod@2026-05-02 \
npm run build

BACKEND_URL=https://api.example.com/api \
RELEASE_VERIFY_STRICT=1 \
npm run verify:release
```

## Backend

```bash
cd backend
npm install
npm run prisma:generate
APP_VERSION=2026.05.02 npm run build
VERIFY_HTTP_BASE_URL=https://api.example.com/api \
DATABASE_URL=mysql://... \
JWT_ACCESS_SECRET=... \
JWT_REFRESH_SECRET=... \
RELEASE_VERIFY_STRICT=1 \
npm run release:verify
```

## Expected evidence
- `/api/health` returns `{status:"ok",db:"up"}`
- `/api/stations` returns JSON
- DB counts are visible in backend verification output
- frontend and backend build successfully
- CI workflow is green on the release commit/tag

## If release verification fails
- do **not** promote the release
- inspect the JSON report/artifacts from GitHub Actions
- fix the blocking issue
- rerun verification


Frontend build variables live in `.env.frontend.example`.
