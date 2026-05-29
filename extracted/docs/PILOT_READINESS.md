# Pilot readiness checklist

_Generated: 2026-04-27 — scope frozen, no new features._

## Summary

| Area | Status |
| --- | --- |
| Build / lint / tests | ✅ PASS (60/60) |
| Production data seeded | ✅ PASS (3 stations, 9 lines, 35 stops) |
| Data integrity (orphans / refs / coords) | ✅ PASS (0 issues) |
| Station visual layouts bootstrapped | ✅ PASS (empty layouts inserted) |
| RLS on every table | ✅ PASS |
| Pilot admins provisioned | ⏳ PENDING — see runbook below |
| End-to-end smoke test (manual) | ⏳ PENDING — to run after admin signs up |

**Launch risk:** Low. **Internal pilot:** Ready once first admin is granted the role.

---

## Seeded stations (real, production-like)

| Station | Area | Lines (pub) | Stops |
| --- | --- | --- | --- |
| موقف التحرير | وسط البلد، القاهرة | 3 / 3 | 12 |
| موقف رمسيس | وسط القاهرة | 4 / 4 | 16 |
| موقف محطة مصر | الإسكندرية | 2 / 2 | 7 |

All published. All have a default empty `station_layouts` row so the layout editor opens cleanly; operators draw zones during the pilot.

---

## Admin provisioning runbook (operator self-signup)

The pilot operators will sign up themselves at `/auth`. Immediately after each signup, run this in the database to elevate them. **Replace the email.**

```sql
-- Promote a signed-up user to platform_admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'platform_admin'::app_role
FROM auth.users
WHERE email = 'operator@example.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Or, for a station_operator (write access but not role management):
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'station_operator'::app_role
FROM auth.users
WHERE email = 'operator@example.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

Verify:
```sql
SELECT u.email, ur.role
FROM auth.users u JOIN public.user_roles ur ON ur.user_id = u.id
ORDER BY u.email;
```

---

## Manual smoke test (run after first admin is granted)

Pass/fail checklist — go through in order. Estimated time: 10 min.

### Passenger flows (no login required)
- [ ] `/` loads in Arabic RTL, no console errors
- [ ] Nearest-station flow: location prompt → returns one of the 3 stations with distance
- [ ] Station page (`/station/<id>`): shows lines, cars count, pickup areas
- [ ] Route page (`/route/<line-id>`): shows ordered stops with map
- [ ] Planner: search for a destination keyword → returns at least one matching line
- [ ] Search log row appears in `search_logs` table

### Auth
- [ ] `/auth` signup with real email succeeds; row appears in `auth.users` and `profiles`; default role `passenger` in `user_roles`
- [ ] Email verification link works (or auto-confirm if enabled)
- [ ] Login redirects to intended page

### Admin flows (after promoting account to platform_admin)
- [ ] `/admin` loads; non-admin users see access-denied
- [ ] Edit a line (color, vehicle_type, status, cars) → save succeeds, audit log row written
- [ ] Edit a route (reorder one stop, rename one) → save succeeds
- [ ] Layout editor opens for each station, allows adding one zone, saves
- [ ] Draft change → review → publish flow round-trips
- [ ] `/admin/validation` shows zero issues for current data
- [ ] `/admin/audit` shows the edits made above
- [ ] `/admin/tools` JSON export downloads a station package
- [ ] JSON re-import of the same package warns about duplicates and does not double-write

### Resilience
- [ ] Force a 503 (toggle airplane mode briefly) — UI shows graceful error, recovers on retry
- [ ] Refresh on a deep link (e.g. `/route/<id>`) loads correctly (SPA fallback)

---

## Known non-blockers (acceptable for pilot)

- `VITE_SENTRY_DSN` not configured — errors only go to console. OK for closed pilot; required before public launch.
- HIBP password check not enabled in auth settings.
- No custom domain — running on `*.lovable.app`.
- Layout zones empty for all 3 stations — operators will draw during pilot.

## Hard blockers (must clear before pilot start)

1. **At least one `platform_admin` exists** in `user_roles`. Until then, nobody can edit, review, publish, or use the validation/audit/tools pages.

That's the only one.
