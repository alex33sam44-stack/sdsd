# Open Street View / OSM Layer

This project now uses a non-Google map stack:

- **Base interactive map:** MapLibre GL JS + PMTiles generated from OpenStreetMap data.
- **Street-level imagery:** KartaView by default, formerly OpenStreetView/OpenStreetCam.
- **Optional open/federated imagery:** Panoramax can be selected from environment config.

## Why this matters

OSM itself is map data, not a Google Street View clone. To build a Google Maps alternative, combine:

1. OSM/PMTiles for the map.
2. KartaView or Panoramax for street-level photos.
3. Community reports/UGC for local transit truth.

## Environment variables

```env
VITE_PMTILES_URL=https://cdn.example.com/maps/egypt-cairo.pmtiles
VITE_STREET_IMAGERY_PROVIDER=kartaview
```

Supported providers:

```env
VITE_STREET_IMAGERY_PROVIDER=kartaview
VITE_STREET_IMAGERY_PROVIDER=panoramax
```

For a custom viewer:

```env
VITE_STREET_IMAGERY_URL_TEMPLATE=https://example.com/viewer?lat={lat}&lng={lng}&z={zoom}
```

## Scaling rule

The app backend must not serve map tiles or street imagery. Serve PMTiles through CDN/Object Storage with HTTP Range Requests and CORS. Street imagery opens directly on the selected provider or on a custom static/provider URL.

## User experience

On `/t/:token`, the trip map now shows:

- The live trip route.
- A **شوف الشارع** / **افتح منظر الشارع** action.
- Fallback copy encouraging users to report or capture missing imagery.

No Google Maps or Google Street View is required.
