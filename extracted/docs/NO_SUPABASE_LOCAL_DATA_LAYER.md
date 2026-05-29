# No third-party hosted data layer

This build removes the previous hosted database/client dependency completely.

## What changed

- Removed the hosted database SDK dependency from `package.json` and lockfile.
- Removed the old integration folder and migration directory.
- Replaced frontend data calls with `src/marketing/integrations/data/client.ts`.
- The new data client is local/offline-first and stores demo/user interaction data in browser `localStorage`.
- Realtime subscriptions are no-op client-side listeners, so they do not open backend sockets.
- Route share OG previews use deterministic fallback data and do not call an external hosted database.

## Load behavior

- Map tiles are still served from `VITE_PMTILES_URL`, which should point to CDN/Object Storage.
- Search can use static/seeded local indexes.
- Live-location demo pings are local/offline unless a future backend adapter is explicitly connected.
- The app no longer depends on any hosted database client for frontend operation.

## Future production adapter

For production, replace `src/marketing/integrations/data/client.ts` with a first-party API adapter that talks only to your own backend/edge services.
