# Community / marketing data-layer migration

## The problem

Every page under `src/marketing/**` (alerts, channels, chat, daily commute,
group trips, growth, heatmap, leaderboard, public profile, referrals,
savings, trip share, ugc, …) reads and writes through `dataClient`
(`src/marketing/integrations/data/client.ts`). That client mimics the
Supabase JavaScript SDK API — `dataClient.from(table).select()`,
`.insert()`, `.eq()`, `.subscribe()`, `dataClient.auth.signInWithPassword()`,
etc. — but it does NOT connect to Supabase or anything else over the
network. Every operation persists to the user's own `localStorage`.

The rest of the app talks to the NestJS backend at `VITE_API_BASE_URL` via
`src/lib/api.ts`. So we have two parallel "sources of truth":

| Concern | Backend (`/api/*`) | `dataClient` (localStorage) |
| --- | --- | --- |
| Stations / lines / stops | yes | no |
| Auth (real) | yes | no |
| Tenants / billing / drafts | yes | no |
| Alerts, chat, channels, leaderboard | **no** | **yes** |
| Group trips, growth events, referrals | **no** | **yes** |

A user signing up via `dataClient.auth.signUp` gets a fake `local-…` user
that is invisible to the backend; an alert they post never reaches a
moderator and never crosses devices; a "leaderboard" tally is per-browser.

## What this PR does

It does NOT migrate the data layer (that's the next phase). It stops
shipping the parallel source as if it were real:

1. **`src/marketing/lib/communityFlags.ts`** centralises the gate.
   `isCommunityEnabled()` returns:
     - `true` in `vite dev` builds (so devs/preview keep the UI),
     - `false` in production builds by default,
     - whatever `VITE_COMMUNITY_FEATURES_ENABLED` says when explicitly set.
2. **`src/marketing/components/CommunityGate.tsx`** wraps every community
   route in `App.tsx`. When the gate is closed it renders a clean
   "coming soon" notice instead of the route. When the gate is open and
   the data layer is still local, it prefixes the route with a sticky
   demo banner so users see that data is per-browser only.
3. **`dataClient.ts`** logs a single, prominent `console.warn` at module
   load when running in production with the gate forced open, naming this
   doc. It also exposes `dataClient.mode` (`"local" | "backend"`) so future
   moderation surfaces can branch without touching every consumer.
4. **`.env.production.example`** documents `VITE_COMMUNITY_FEATURES_ENABLED`
   and explains why the production default is off.

No consumer of `dataClient` had to be touched: all 19 import sites keep
working unchanged.

## The migration roadmap

The goal is to flip `communityDataLayer()` from `"local"` to `"backend"`
without changing any of the marketing source files. The plan below maps
the localStorage tables to backend tables and endpoints.

### Phase 1 — Read-only backing

Add Prisma models and read endpoints for the highest-traffic tables:

| Table (today) | Prisma model | Endpoints |
| --- | --- | --- |
| `line_channels` | `LineChannel` | `GET /community/channels`, `GET /community/channels/:slug` |
| `channel_members` | `ChannelMember` | `GET /community/channels/:id/membership` |
| `alerts` | `CommunityAlert` (separate from operator audit) | `GET /community/alerts` |
| `profiles` (community side) | `CommunityProfile` | `GET /community/profiles/:slug` |

These are pure reads, so the existing `dataClient.from('alerts').select()`
calls can resolve via REST without touching their callers — `dataClient`
internally checks a runtime mode, and `select()` becomes a `fetch()` to
the backend when the mode is `"backend"`.

### Phase 2 — Authenticated writes

Add write endpoints, gated by the existing JWT guard:

- `POST /community/alerts` (with `OptionalJwtAuthGuard` for anonymous
  reports + a 24-h TTL field).
- `POST /community/alerts/:id/confirmations` and
  `POST /community/alerts/:id/disputes`.
- `POST /community/channels/:id/messages` (rate-limited).
- `POST /community/channels/:id/members`.
- `POST /community/contributions` (already exists for line/feature
  suggestions — keep it as-is).

Each endpoint records to a tenant-scoped table so moderators can review
and approve. Re-use the moderation pattern from
`backend/src/modules/contributions` (see PR #1).

### Phase 3 — Realtime layer

Replace the no-op `dataClient.channel(...)` with a thin SSE or WebSocket
channel served by the backend (`/community/channels/:id/stream`). The
existing `subscribeChannel()` helper in `src/marketing/lib/channels.ts`
becomes the only call site that needs awareness — no UI page changes.

### Phase 4 — Auth consolidation

`dataClient.auth.*` returns fake users. Replace it with thin shims that
forward to `/auth/*` via `src/lib/api.ts` so the rest of the app and the
community surface share one identity. The fake `local-${email}` IDs in
existing user `localStorage` are discarded on first real login.

### Phase 5 — Flip the flag

Once all five phases are green:

1. `communityDataLayer()` returns `"backend"`.
2. `dataClient.from(...)` becomes a REST adapter.
3. `LocalDataDemoBanner` stops rendering automatically.
4. `VITE_COMMUNITY_FEATURES_ENABLED=true` becomes the production default.

## Until then

- **Do not** add new community features that rely on `dataClient`.
- **Do not** flip `VITE_COMMUNITY_FEATURES_ENABLED=true` in production
  without communicating to users that posts won't be persisted across
  devices.
- New community features should add their endpoint under
  `backend/src/modules/community/...` from day one, and route the
  frontend through `src/lib/api.ts` directly — bypassing `dataClient`.
