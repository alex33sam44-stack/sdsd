# Dynamic Open Graph previews for shared links

Shared growth links must not rely on the Vite SPA title because WhatsApp, Facebook, Telegram, Slack, and similar crawlers do not execute client JavaScript reliably.

This package adds server-rendered previews for:

- `/t/:token` live trip links
- `/g/:token` group trip links
- `/c/:slug` channel links

## How it works

1. Caddy detects social crawler user agents on `/t/*`, `/g/*`, and `/c/*`.
2. Those crawler requests are rewritten to the NestJS backend:
   - `/api/og/preview/t/:token`
   - `/api/og/preview/g/:token`
   - `/api/og/preview/c/:slug`
3. The backend returns real HTML with:
   - `og:title`
   - `og:description`
   - `og:image`
   - `og:url`
   - Twitter large-card tags
4. The OG image URL points to a route-specific generated image:
   - `/api/og/image/t/:token.svg`
   - `/api/og/image/g/:token.svg`
   - `/api/og/image/c/:slug.svg`
5. Normal browsers still receive the Vite app and open the original route.

## Environment variables

Set these in production for best dynamic metadata:

```env
PUBLIC_APP_URL=https://mwasalat.app
# or, if public RPC/RLS allows it:
```


## Fallback behavior


## Testing

After deployment, test with crawler user agents:

```bash
curl -A "WhatsApp" https://mwasalat.app/t/example-token | grep -E "og:title|og:description|og:image"
curl -A "facebookexternalhit/1.1" https://mwasalat.app/g/example-token | grep -E "og:title|og:description|og:image"
curl -A "TelegramBot" https://mwasalat.app/c/ramsees-nasr-city | grep -E "og:title|og:description|og:image"
```

And test the image endpoint:

```bash
curl -I https://mwasalat.app/api/og/image/t/example-token.svg
```
