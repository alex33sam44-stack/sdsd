# API: location & local-search

> Operator-facing reference for the geocoding, routing, and local-search
> endpoints. The frozen frontend (`frontend.lock.json`) calls these
> through its existing client; the document is written for the admin
> dashboard, the Cloudflare worker, and partner integrations.

All endpoints are namespaced under `/api`. Default locale is `ar`; pass
`x-locale: en|fr|pt` (or `?lang=…`) to localize string fields. Tokens
are NEVER accepted via query string — provider secrets stay on the
server (`MAPBOX_TOKEN`, `LIBRETRANSLATE_API_KEY`, …).

## `GET /api/location/search`
Geocode a free-text place name. Walks the provider chain
(Nominatim → Photon → … → Noop) until one answers, then returns at
most 50 hits.

**Query**

| name      | required | type   | notes                                |
|-----------|----------|--------|--------------------------------------|
| `q`       | yes      | string | redacted server-side                 |
| `near`    | no       | `lat,lng` | bias point, quantized to 3 dp     |
| `limit`   | no       | int 1..50 | default 5                         |
| `country` | no       | ISO-2  | default `eg`                         |

**Throttling**: 30 req / min / IP (`LocationRateLimitGuard`).
**Caching**: `Cache-Control: public, max-age=60`.

## `GET /api/location/reverse`
Reverse-geocode a coordinate.

**Query**

| name | required | type     | notes                          |
|------|----------|----------|--------------------------------|
| `lat`| yes      | float    | -90..90                        |
| `lng`| yes      | float    | -180..180                      |
| `zoom` | no     | int 3..18| default 16 (street level)      |

The `(0,0)` sentinel is rejected (treated as a missing input bug).

## `POST /api/location/route` *(preferred)*
Estimate distance + duration + simplified polyline between two
coordinates with optional via-points.

**Body**

```json
{
  "from":   { "lat": 30.0444, "lng": 31.2357 },
  "to":     { "lat": 31.2001, "lng": 29.9187 },
  "profile": "driving",   // one of driving | walking | cycling
  "via":    [ { "lat": 30.7865, "lng": 31.0004 } ]
}
```

The route is rejected when straight-line distance exceeds 1500 km
(sanity check; tunable in `MAX_ROUTE_DISTANCE_KM`).

**Response**

```json
{
  "distanceKm": 220.3,
  "durationMinutes": 195,
  "polyline": [[30.0444, 31.2357], …],
  "profile": "driving",
  "provider": "osrm"
}
```

## `GET /api/location/route`
Convenience GET form. Useful for embedding inside a static link or
sharing in a chat. Coordinates are passed as `from=lat,lng&to=lat,lng`;
no body required.

| name      | required | format    |
|-----------|----------|-----------|
| `from`    | yes      | `lat,lng` |
| `to`      | yes      | `lat,lng` |
| `profile` | no       | `driving` \| `walking` \| `cycling` |

Same throttling and validation as POST.

## `GET /api/location/providers/status`
Operator-facing snapshot of the configured provider chain and the
selection rules currently in force.

```json
{
  "generatedAt": "2026-05-29T15:24:00.000Z",
  "providers": [
    { "id": "nominatim", "enabled": true, "capabilities": ["search","reverse"] },
    { "id": "noop",       "enabled": true, "capabilities": ["search","reverse","route"] }
  ],
  "selectionRules": [ "capability match", "health rank", "declared order" ]
}
```

`GET /api/location/status` is an alias of the above for backward-compat.

## `GET /api/location/providers/health`
Live snapshot from the heartbeat daemon (probe runs every 60 s,
never more frequent than 30 s).

```json
[
  { "provider": "nominatim", "state": "healthy", "latencyMs": 142,
    "checkedAt": "2026-05-29T15:23:51Z", "capabilities": ["search","reverse"] }
]
```

`state` ∈ `healthy | degraded | down | unknown`.

## `GET /api/local-search`
The intra-tenant catalogue search. Returns stations, lines, route
stops, plus a curated landmark + city catalog. Hub-aware ranking is
additive: a query like "ميدان رمسيس" boosts Cairo-area hits.

**Query**

| name   | required | type | notes |
|--------|----------|------|-------|
| `q`    | yes      | string | Arabic, English, or franko |
| `kind` | no       | one of `station / line / stop / landmark / city` | restrict |
| `near` | no       | `lat,lng` | proximity bias |
| `hub`  | no       | one of `cairo / giza / alexandria / delta / upper-egypt / sinai / red-sea` | hard filter |
| `limit`| no       | int 1..50 | default 5 per kind |

### Backward-compatible response

```json
{
  "query": "midan ramses",
  "normalized": "midan ramses",
  "hits": [
    {
      "id": "ramses-square",
      "kind": "landmark",
      "name": "ميدان رمسيس",
      "matchedAliases": ["ramses", "midan ramses", "ramsis"],
      "score": 0.92,
      "lat": 30.0626,
      "lng": 31.2497,
      "area": "القاهرة",
      "confidence": "high",
      "hub": "cairo",
      "alternateName": "ramses",
      "provider": "local-search-catalog"
    }
  ],
  "source": "catalog",
  "durationMs": 4,
  "detectedHub": "cairo",
  "suggestions": []
}
```

**Required fields** (unchanged from v1.0): `id`, `kind`, `name`,
`matchedAliases`, `score`, `query`, `normalized`, `hits`, `source`,
`durationMs`.

**New optional fields** (clients ignore them safely):

| field                       | level | notes |
|-----------------------------|-------|-------|
| `LocalSearchHit.confidence` | hit   | `high \| medium \| low` |
| `LocalSearchHit.hub`        | hit   | coarse geographic group |
| `LocalSearchHit.alternateName` | hit | Latin or Arabic alternate spelling |
| `LocalSearchHit.provider`   | hit   | `local-search-db \| local-search-catalog` |
| `LocalSearchResponse.detectedHub` | response | hub inferred from the query |
| `LocalSearchResponse.suggestions` | response | up to 5 "did you mean" picks when top score < 0.5 |

## Privacy guarantees

- Outbound provider calls use only `User-Agent` and `Accept` headers.
  Cookies, `X-Forwarded-For`, `Authorization`, and session tokens are
  stripped before any external fetch.
- `near=lat,lng` is quantized to 3 decimal places (~110 m) before it
  leaves the host, so a third party cannot rebuild a daily commute
  trace from bias coordinates.
- Provider tokens (`MAPBOX_TOKEN`, …) are read once from
  `selfhost/.env.production` and never echoed in URLs, logs, or
  response bodies.
- The orchestrator's logger NEVER includes the user query in the
  warning body — failures log only `provider id + capability + status`.

## Rate limits

| endpoint          | per-IP cap | window |
|-------------------|------------|--------|
| `/location/search`  | 30 | 60 s |
| `/location/reverse` | 30 | 60 s |
| `/location/route`   | 10 | 60 s |
| `/location/providers/*` | 60 | 60 s (default Throttler) |

The global `ThrottlerGuard` already caps every IP at 120 / min across
the entire API; the location guard tightens the chain further so a
single buggy client cannot exhaust upstream provider quotas.
