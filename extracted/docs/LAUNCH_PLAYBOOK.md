# Cairo Pilot — 7-Day Launch Playbook

A field-tested checklist for taking the platform from "deployable"
to "real users on real microbuses". Companion to:

- `docs/RELEASE_READINESS.md` (technical gates)
- `docs/PILOT_READINESS.md` (data gates)
- `docs/MYSQL_BACKUP_RUNBOOK.md`, `docs/MYSQL_RETENTION.md`
- `docs/SELFHOST_PRODUCTION_ENV.md`

## Day 0 — Prerequisites (before opening the playbook)

- [ ] DNS A records for `APP_DOMAIN` and `API_DOMAIN` point to the VPS.
- [ ] `selfhost/.env.production` exists, owned `root:root`, mode `600`.
- [ ] Backup mount provisioned (`/mnt/mwasalat-backups` or rclone remote).
- [ ] First successful run of `bash selfhost/scripts/vps-first-run.sh`.
- [ ] `npm run frontend:verify` returns 251 files intact.

## Day 1 — Deploy + smoke

| Step | Command | Pass criteria |
|---|---|---|
| 1.1 | `npm run prisma:deploy` | all migrations applied, no drift |
| 1.2 | `npm --prefix backend run seed:i18n` | ~225 overrides upserted |
| 1.3 | `npm --prefix backend run seed:intercity` | ≥15 routes seeded |
| 1.4 | `npm --prefix backend run seed:pilot` | 5 stations / 12 lines / ≥36 stops |
| 1.5 | `curl -sf https://$API_DOMAIN/api/health` | 200 |
| 1.6 | `curl -sf https://$API_DOMAIN/api/health/deep` | status: pass |
| 1.7 | `node backend/scripts/verify-data-quality.mjs --min=85 --band=green` | exit 0 |

## Day 2 — Operator + tenant onboarding

- [ ] Promote first user to `platform_admin` via `bash selfhost/scripts/grant-platform-admin.sh USER_ID`.
- [ ] Create a `pilot` tenant from the admin UI (`/platform`).
- [ ] Invite 3 station operators by email.
- [ ] Operators publish at least 3 stations under their tenant scope.
- [ ] Run data-quality gate per tenant (`?tenantId=...`).

## Day 3 — Pilot moqef (one stop, one champion)

Pick **one** moqef with the highest organic foot traffic. Field
recipe (see also `docs/FOCUSED_LAUNCH_CAMPAIGNS.md`):

- [ ] 5 volunteers wear branded t-shirts with the QR + handle.
- [ ] 100 photos uploaded to the moqef's UGC stream.
- [ ] WhatsApp group for the moqef created and linked from the
      station page.

## Day 4 — Marketing (the playbook above)

- [ ] Programmatic SEO sitemap submitted to Google + Bing
      (`https://$APP_DOMAIN/api/seo/sitemap.xml`).
- [ ] 5 reels posted (TikTok + Instagram + Facebook + YouTube Shorts).
- [ ] First WhatsApp blast to seed users (announce the platform).

## Day 5 — Observability checkpoint

- [ ] `GET /api/health/deep` warns/passes everything.
- [ ] `GET /api/realtime/stats` shows live subscribers (≥1).
- [ ] First nightly mysqldump completed (check `/var/log/mwasalat-mysql-backup.log`).
- [ ] First nightly db-prune completed (check `/var/log/mwasalat/db-prune.log`).
- [ ] Sentry / log aggregator receiving events.

## Day 6 — Backup drill (do NOT skip)

- [ ] `node backend/scripts/verify-restore.mjs --json` returns ok=true.
- [ ] Document any deltas in `release-evidence/public-launch/release-evidence.log`.

## Day 7 — Public launch + retro

- [ ] Public launch announcement.
- [ ] 24h triage rotation assigned (one operator on call).
- [ ] Retro on what blocked or surprised the team.
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`.

## Stop-the-launch criteria

Roll back instantly (per `selfhost/scripts/rollback-current-release.sh`)
when ANY of the following fires:

- `/api/health` returns non-200 for ≥ 60 s.
- Data-quality band drops to red.
- Backup-drill verification fails.
- Mass `share_trip_story` UGC posts contain abuse/incorrect fares
  that bypass the validation queue (ops decision).
