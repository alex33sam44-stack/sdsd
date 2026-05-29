# Changelog

All notable changes to this project, oldest at the bottom.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — operational completeness (PR #19)

- Tracked the five `release-evidence/public-launch/*.log` files via a
  `.gitignore` negation so future audits do not have to copy them
  manually from the operator's working tree.
- `selfhost/.env.production.template` covering all 73 production
  variables (was 28 in the example), each with a placeholder value
  and a runbook reference.
- `docs/SELFHOST_PRODUCTION_ENV.md` — per-variable runbook, rotation
  procedure, validation checklist.
- `GET /api/health/deep` — expanded health probe (DB ping, schema
  drift, i18n table presence, heap, host load, free memory). The
  legacy `/api/health` is unchanged so uptime monitors keep working.
- `backend/scripts/verify-restore.mjs` — monthly backup-restore
  drill that restores the latest snapshot into a temporary database
  and compares row counts on core tables. Wired into
  `selfhost/cron/backup-drill.cron`.
- `backend/scripts/seed-pilot-data.ts` — pilot dataset (5 stations,
  12 lines, 36+ stops in Cairo + Giza) so a fresh install passes
  the data-quality green band.
- `docs/LAUNCH_PLAYBOOK.md` — 7-day Cairo pilot playbook.
- `backend/test/operational-readiness-smoke.mjs` — smoke covering
  the new operational layers (no MySQL required).
- `CHANGELOG.md` — this file.

### Verified

- `frontend.lock.json` still seals 251 files — no frontend change.
- `backend/test/i18n-smoke.mjs` — 105/105 pass.
- `backend/test/product-layer-smoke.mjs` — 31/31 pass.
- `backend/test/seo-smoke.mjs` — 16/16 pass.
- `backend/test/operational-readiness-smoke.mjs` — additive coverage.

## [1.0.0] — 2026-05-29 (release/v1)

### Added

- Frontend freeze policy + lock file (251 files sealed). CI guard,
  pre-commit hook, owner-approval token to re-freeze.
- Runtime i18n layer with 4 locales (ar / en / fr / pt). Locale
  resolver, response interceptor, DOM overlay (injected via Caddy),
  3-tier translation cache, pluggable provider chain (Libre / DeepL
  / OpenAI / Noop). 225 curated UI overrides shipped via the
  `seed:i18n` script.
- 5 product-layer modules (`local-search`, `intercity`,
  `data-quality`, `ai`, `realtime`).
- Cloudflare Worker for OG share previews with edge KV cache.
- MySQL retention + db-prune cron.
- Mobile e2e suite (Playwright × 3 device profiles) + CI.
- Programmatic SEO surface (`sitemap.xml`, hreflang ar/en/fr/pt,
  server-rendered `from→to` and area landings).

### Notes

- The CHANGELOG starts at v1.0.0; earlier history is captured in
  the original tarball provided to the team.
- Self-host operators must re-run `selfhost/scripts/install-backup-cron.sh`
  to pick up the new db-prune and backup-drill cron entries.
