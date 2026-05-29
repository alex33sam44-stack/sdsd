# Release Readiness Report — 2026-04-27

Final pass before production handoff.

---

## 1. Build pipeline

| Check | Result | Notes |
|---|---|---|
| `npm install` | ✅ Clean | "up to date in 2s", no peer-dep issues |
| `npm run build` | ✅ Pass | 1807 modules transformed, built in ~7.5s |
| `npm run lint` | ✅ 0 errors | 7 warnings remain — all in `src/components/ui/*` (shadcn/ui generated files, `react-refresh/only-export-components`). Safe to ignore. |
| `npx vitest run` | ✅ 60/60 pass | 8 test files, ~5.4s |

### Known build warnings (non-blocking)

1. **Dynamic import of `audit.ts`** — intentional. Breaks a circular
   dependency chain `serviceError → audit → serviceError`. Documented
   in `src/lib/serviceError.ts`.
2. **Bundle > 500 KB** — single chunk is 786 KB (225 KB gzipped).
   Acceptable for v1; future optimization can route-split admin pages.
3. **Browserslist data 10 months old** — cosmetic; does not affect output.

---

## 2. Smoke test (route + service coverage)

Browser-driven UI smoke is restricted in this environment, so smoke
coverage was verified by:

1. **Route registration** — every required route is mounted in
   `src/App.tsx` and protected by the correct `RoleGuard`.
2. **Service test suite** — all 60 vitest cases cover the underlying
   business logic (stations, lines, stops, layout, roles, snapshot,
   validation, audit).

| Flow | Route | Guard | Status |
|---|---|---|---|
| Passenger → nearest station | `/` (`Welcome`) | public | ✅ mounted |
| Station page | `/station/:stationId` | public | ✅ mounted |
| Route page | `/route/:stationId/:lineId` | public | ✅ mounted |
| Planner | `/planner` | public | ✅ mounted |
| Auth (login/signup) | `/auth` | public | ✅ mounted |
| Admin dashboard | `/admin` | staff | ✅ mounted |
| Line edit | `/admin/line/:stationId/:lineId` | staff | ✅ mounted |
| Route edit | `/admin/route/:stationId/:lineId` | staff | ✅ mounted |
| Layout edit | `/admin/layout/:stationId` | staff | ✅ mounted |
| Drafts | `/admin/drafts` | staff | ✅ mounted |
| Review (publish) | `/admin/review` | platform_admin | ✅ mounted |
| Validation Center | `/admin/validation` | staff | ✅ mounted |
| Audit log | `/admin/audit` | staff | ✅ mounted |
| Import / Export | `/admin/tools` | staff | ✅ mounted |
| Deployment checklist | `/admin/deploy` | staff | ✅ mounted |

For end-to-end UI verification before launch, run the manual checklist
in [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md) §10
(Post-deploy smoke test).

---

## 3. Runtime observation — Cloud transient outage

While preparing this report, the preview console reported:

```
GET /rest/v1/stations  → 503
{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}
{"code":"PGRST001","message":"no connection to the server"}
```

The Cloud status check returned **healthy** immediately afterward, and
subsequent requests succeeded. This was a transient PostgREST
schema-cache reload on the managed backend, **not a code issue**.

The frontend handled it correctly:
- `useStationsData` logged a warning and surfaced the error via the
  central `logger`.
- `serviceError` normalized the response.
- The UI fell back to a retry rather than a blank page.

**No code change required.** If similar 5xx bursts happen often after
launch, consider widening the React Query retry/back-off in
`src/modules/shared/hooks/useStationsData.ts`.

---

## 4. Blockers preventing production launch

**None.** All technical gates pass.

The two remaining items below are **operational**, not code blockers:

1. **Production data seeding** — at least one fully published station
   (with lines and stops) must exist before the public link is shared.
   Use `/admin/tools` import or the admin editors. Verify via
   `/admin/validation` showing 0 errors.
2. **Platform admin account** — confirm at least one `platform_admin`
   row exists in `user_roles` for an account you control (see
   README §5B step 5).

---

## 5. Recommended (non-blocking) follow-ups

- Route-split the admin bundle to drop the main chunk under 500 KB.
- Run `npx update-browselist-db@latest` next time dependencies refresh.
- Enable HIBP (leaked-password) protection in Cloud → Users → Auth if
  not already on.
- Wire `VITE_SENTRY_DSN` if a remote error sink is desired (the logger
  already supports it).

---

## 6. Sign-off

- Build green, lint clean, all tests pass.
- All product routes mount and are correctly role-guarded.
- Cloud backend is healthy.
- No code-level blockers.

**The project is release-ready pending the two operational items in §4.**
