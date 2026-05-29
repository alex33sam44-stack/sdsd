# Interactive Maps Without Google Maps

## Decision
Use **MapLibre GL JS + Protomaps PMTiles** for the live trip-following and shared route map layer.

This avoids Google Maps completely in the shared tracking experience and avoids running a tile server on the Mwasalat backend.

## Why this architecture

- **MapLibre GL JS** renders the interactive map in the user's browser using WebGL.
- **PMTiles** stores the basemap as one static `.pmtiles` file.
- The backend only sends trip coordinates and metadata; it does not serve map tiles.

## Runtime flow

```txt
User opens /t/:token
        ↓
React loads InteractiveTripMap
        ↓
MapLibre renders client-side
        ↓
PMTiles vector map chunks are fetched from CDN via HTTP Range Requests
        ↓
        ↓
Live route line + current marker render on top of the map
```

## Required frontend variable

```env
VITE_PMTILES_URL=https://cdn.example.com/maps/egypt-cairo.pmtiles
```

If this is missing, the app still shows a no-tile interactive tracking layer so the backend stays protected, but the full basemap will not appear.

## Scaling target

For very high concurrency, including viral spikes, cache the PMTiles file at the edge:

```txt
Browser → CDN edge cache → object storage
```

The backend receives only the light live-trip data requests. It does not receive tile traffic.

## Do not use public OSM raster tiles

Do not point the app to `tile.openstreetmap.org` or any public free raster tile endpoint for production traffic. Those services are not meant for heavy application traffic or bulk usage.

## Added files

- `src/marketing/components/InteractiveTripMap.tsx`
- `src/marketing/lib/mapTiles.ts`
- `/t/:token` now uses the MapLibre/PMTiles interactive map.
- Google Maps links were removed from the live tracking share page.
