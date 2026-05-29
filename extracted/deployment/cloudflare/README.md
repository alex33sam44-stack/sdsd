# Cloudflare Workers — `mwasalat-og`

> Edge-side OG share preview worker. Sits in front of share roots
> (`/t/*`, `/g/*`, `/c/*`) and serves bot-friendly HTML so links
> unfurl on WhatsApp/Facebook/Twitter/etc. without hammering the VPS.

## Architecture

```
┌──────────────┐     /t/abc123     ┌──────────────────┐
│  WhatsApp    │  ───────────────▶ │ Cloudflare Edge  │
│  (bot UA)    │                   │   mwasalat-og    │
└──────────────┘                   └─────┬────────────┘
                                          │ KV cache hit?
                                          │  yes → return
                                          │  no  → fetch origin
                                          ▼
                                    /api/og/preview/t/abc123
                                          │
                                  ┌───────▼────────┐
                                  │ Origin (Caddy) │
                                  │   NestJS OG    │
                                  └────────────────┘

┌──────────────┐     /t/abc123     ┌──────────────────┐
│ Real browser │  ───────────────▶ │ Cloudflare Edge  │
│ (human UA)   │                   │  passthrough     │ ──▶ SPA
└──────────────┘                   └──────────────────┘
```

## Files

| File | What it does |
|---|---|
| `wrangler.toml` | Worker metadata, routes, KV bindings, env vars, staging env. |
| `worker.js` | The worker logic: bot detection, edge cache, origin fetch, fallback. |
| `README.md` | This file. |

## Routes

The worker only intercepts `/{t,g,c}/{token}` paths. Everything else
(`/api/*`, static assets, the SPA root) bypasses the worker.

## Required setup

### 1. Create the KV namespace

```bash
npx wrangler kv namespace create OG_CACHE
npx wrangler kv namespace create OG_CACHE --preview
```

Copy the returned IDs into `wrangler.toml` (`id` and `preview_id`).

### 2. Configure secrets

```bash
npx wrangler secret put ORIGIN_BASE   # https://api.mwasalat.app
npx wrangler secret put APP_ORIGIN    # https://mwasalat.app
```

### 3. Deploy

```bash
# production
npx wrangler deploy --config deployment/cloudflare/wrangler.toml

# staging
npx wrangler deploy --config deployment/cloudflare/wrangler.toml --env staging
```

### 4. Verify

```bash
# Should return server-rendered OG HTML
curl -A "WhatsApp/2.24.0" https://mwasalat.app/t/demo123

# Should fall through to the SPA (200 + index.html)
curl -A "Mozilla/5.0" https://mwasalat.app/t/demo123 -I
```

## Cache strategy

- **Edge KV TTL** — `EDGE_CACHE_TTL_SECONDS` (default `300`).
- **Cloudflare HTTP cache** — same TTL, `cacheEverything: true`.
- **Cache key** — `og:{kind}:{token}:{locale}` so localized previews
  don't collide.

When a token's underlying state changes (rider arrives, group
trip ends), the origin can invalidate via:

```bash
npx wrangler kv key delete --binding=OG_CACHE "og:t:abc123:ar"
```

A future iteration will expose a tiny `/api/og/invalidate?token=…`
endpoint that calls Cloudflare's KV REST API; for now operators do
this manually.

## Why not just keep using Caddy's `@sharePreview`?

Caddy already proxies bot UAs to the NestJS preview controller.
That works on a single origin but:

- A viral share (~10k bot fetches/min) will saturate Caddy's
  HTTP/2 stream limits before the backend even feels it.
- Geographic latency: every bot fetch round-trips to Frankfurt.
- No native KV cache — Caddy responses are RAM-only and reset on
  reload.

The Cloudflare worker layers on top: Caddy keeps doing its job for
human traffic, and the worker absorbs bot fetches at the edge.

## Free-tier headroom

| Limit | Cost at our scale |
|---|---|
| 100k requests/day (free tier) | covers >5x our pilot peak |
| 1 GB KV reads/day | OG HTML ≈ 4 KB → 250k reads in budget |
| 1k KV writes/day | a write only happens on cache miss |

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback --message "rolling back og worker"
```

The worker is fully bypass-safe — if it errors, share URLs fall
through to the origin via Caddy's `@sharePreview` rule. There is no
hard dependency on Cloudflare for the platform to function.
