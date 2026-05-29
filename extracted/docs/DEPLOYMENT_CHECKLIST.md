# Deployment Checklist (Self-hosted SaaS)

Use this checklist before every production release.

## 1. Code health
- [ ] Frontend: `npm ci`
- [ ] Frontend: `npm run lint`
- [ ] Frontend: `npm run test`
- [ ] Frontend: `npm run build`
- [ ] Frontend: `npm run verify:release`
- [ ] Backend: `cd backend && npm install`
- [ ] Backend: `npm run prisma:generate`
- [ ] Backend: `npm run lint`
- [ ] Backend: `npm run test:ci`
- [ ] Backend: `npm run build`
- [ ] Backend: `npm run release:verify`

## 2. Environment
- [ ] `VITE_API_BASE_URL` points to the live backend
- [ ] `VITE_APP_VERSION` / `VITE_RELEASE_NAME` are bumped for this release
- [ ] `VITE_SENTRY_DSN` is set for production (or explicitly deferred)
- [ ] Backend env includes:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_ACCESS_SECRET`
  - [ ] `JWT_REFRESH_SECRET`
  - [ ] `APP_VERSION`
  - [ ] `CORS_ORIGIN`

## 3. Backend reachability
- [ ] `curl -i https://api.yourdomain.com/api/health` returns 200
- [ ] `curl -s https://api.yourdomain.com/api/stations` returns JSON
- [ ] `docker compose ps` shows `mysql`, `backend`, `caddy` healthy

## 4. Data & tenancy
- [ ] legacy backfill was run if migrating old data
- [ ] at least one active tenant exists
- [ ] tenant-scoped data exists for stations / lines / stops
- [ ] first `platform_admin` login works
- [ ] tenant team management works for at least one tenant

## 5. Billing & entitlements
- [ ] default plans are seeded
- [ ] current tenant has a subscription row
- [ ] `GET /billing/current/entitlements` returns JSON
- [ ] premium routes show correct locked/unlocked behavior

## 6. Observability
- [ ] frontend Sentry or equivalent is configured (or intentionally deferred)
- [ ] backend structured logs include request ids
- [ ] `/api/health` reports `version`
- [ ] release name is visible in logs or deployment metadata

## 7. Passenger runtime smoke test
- [ ] login / register
- [ ] nearest station
- [ ] station page
- [ ] route page
- [ ] planner
- [ ] search
- [ ] Google Maps links
- [ ] PWA install prompt / manifest

## 8. Admin runtime smoke test
- [ ] line edit
- [ ] route edit
- [ ] layout edit
- [ ] drafts / review / publish
- [ ] validation center
- [ ] audit log
- [ ] users / roles
- [ ] billing page
- [ ] tenant team page

## 9. Rollback
- [ ] DB backup created before release
- [ ] artifact / image tag recorded
- [ ] rollback steps tested or documented

## 10. Sign-off
- [ ] CI green
- [ ] release verification reports attached
- [ ] no Sev-1 issues open
- [ ] approval recorded


Frontend build variables live in `.env.frontend.example`.
