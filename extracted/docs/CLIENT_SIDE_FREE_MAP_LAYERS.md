# Client-side Free Map Layers

## What changed

The shared live tracking map now includes an optional basemap selector rendered by `MapLibre GL JS`.

All basemap tiles are requested by the user's browser directly from the selected provider URL. The Mwasalat backend does not proxy, download, cache, or serve any map tiles.

## Included layers

- `pmtiles` — production-safe default when `VITE_PMTILES_URL` is configured.
- `none` — no external map tiles; trip line and markers only.
- `osm_standard` — OpenStreetMap standard raster tiles.
- `carto_positron` — CARTO light basemap.
- `carto_dark_matter` — CARTO dark basemap.
- `carto_voyager` — CARTO voyager basemap.
- `opentopomap` — OpenTopoMap raster tiles.
- `esri_world_imagery` — Esri World Imagery raster tiles.

## Production scaling rule

For viral traffic or very high concurrency, keep the default architecture:

```txt
Browser → CDN edge cache → object storage PMTiles
```

Do not send tile traffic to the application backend.

Public free tile endpoints are useful for demos, testing, or low-volume deployments, but their usage policies can limit heavy or commercial traffic. For a target like one million concurrent users, use PMTiles on CDN/Object Storage or a provider plan that explicitly permits that traffic.

## Configuration

```env
# Recommended production setup
VITE_PMTILES_URL=https://cdn.example.com/maps/egypt-cairo.pmtiles
VITE_DEFAULT_MAP_LAYER=pmtiles

# Optional demo/default alternatives
# VITE_DEFAULT_MAP_LAYER=none
# VITE_DEFAULT_MAP_LAYER=osm_standard
# VITE_DEFAULT_MAP_LAYER=carto_positron
# VITE_DEFAULT_MAP_LAYER=carto_dark_matter
# VITE_DEFAULT_MAP_LAYER=carto_voyager
# VITE_DEFAULT_MAP_LAYER=opentopomap
# VITE_DEFAULT_MAP_LAYER=esri_world_imagery
```

## Files touched

- `src/marketing/lib/mapTiles.ts`
- `src/marketing/components/InteractiveTripMap.tsx`
- `docs/CLIENT_SIDE_FREE_MAP_LAYERS.md`
