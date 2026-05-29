# Deep Dive marketing routes migration

Migrated the public growth/marketing route surfaces from `Deep Dive Analysis.zip` into the production-ready Vite/React shell.

## Added routes

- `/marketing` — Deep Dive public landing/community acquisition surface
- `/alerts` — route alerts viral/community surface
- `/channels` — line channels listing
- `/c/:slug` — line channel chat
- `/chat` — commuter Q&A/chat surface
- `/group/new` — create group trip
- `/g/:token` — public group-trip share page
- `/heatmap` — live community heatmap
- `/inbox` — live rider questions inbox
- `/invite` — referral/invite page
- `/leaderboard` — contributor leaderboard
- `/savings` — savings/shareable impact page
- `/trip` — live trip sharing surface
- `/t/:token` — public live-trip tracking share page

## Integration approach

The migrated pages live under `src/marketing` to avoid overwriting the existing production app, auth, tenant, billing, and operator modules. A small router compatibility layer adapts the original TanStack Router pages to the existing React Router app.

## Runtime requirements


```env
VITE_LOVABLE_API_KEY=
```

