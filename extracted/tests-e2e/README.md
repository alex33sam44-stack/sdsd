# E2E + Mobile Quality Suite

Playwright tests that run **outside** the frozen frontend tree.
They exercise the deployed product as a black box: hit URLs, click
real DOM, measure cookies, read the SSE stream.

## Why a separate folder

The frontend is locked by `frontend.lock.json`. Any test that needs
to live next to the frozen code would either violate the freeze or
be impossible to update. Putting the suite under `tests-e2e/` keeps
the freeze intact while still letting us add coverage as the
backend evolves.

## Specs

| File | What it covers |
|---|---|
| `01.welcome-arabic.spec.ts` | RTL baseline, html lang/dir, cookie default |
| `02.locale-switch.spec.ts` | `/api/i18n/runtime.js`, locale switch to en/fr/pt, persistence |
| `03.local-search.spec.ts` | Arabic / English / franko query variants for landmarks |
| `04.realtime-sse.spec.ts` | SSE handshake, hello event, stats endpoint |
| `05.data-quality.spec.ts` | Public quality endpoint shape + intercity seed presence |
| `06.mobile-pwa.spec.ts` | Manifest, console errors, 360px viewport overflow |

## Local run

```bash
cd tests-e2e
npm install
npx playwright install --with-deps
PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test
```

## CI

`.github/workflows/frontend-mobile-quality.yml` runs the full suite
on Pixel 5, iPhone 13 and desktop Chrome, against a freshly-built
frontend served by `npm run preview`. Failures upload the
Playwright HTML report as an artifact for forensics.

## Adding a spec

1. Create `tests-e2e/specs/NN.your-feature.spec.ts`.
2. Use only routes/APIs documented in this repo — never reach into
   `src/` directly. The freeze applies here too: tests that need
   internal hooks should drive them through endpoints, not through
   imports.
3. Run locally with `--ui` once before pushing:
   ```bash
   npx playwright test --ui specs/NN.your-feature.spec.ts
   ```
