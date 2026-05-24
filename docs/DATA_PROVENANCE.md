# Data provenance — where did this station/line/stop come from?

## The problem

Before this change, a station row in the database had no field indicating
whether it was:

- Hard-coded demo/seed data (`selfhost/seeds/001-initial-station.sql`)
- Manually entered by an admin via the dashboard
- Imported from an official GTFS feed
- Submitted by a community user
- Collected during a field survey
- Of completely unknown origin

This made it impossible for operators to audit data quality, prioritise
verification, or filter the dashboard by trust level.

## The solution

Three new nullable columns on `stations`, `lines`, and `route_stops`:

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `provenance` | ENUM | `'unknown'` | Machine-readable origin tag |
| `provenance_detail` | VARCHAR(500) | `NULL` | Free-form detail (filename, GTFS feed URL, contributor ID, …) |

### `DataProvenance` enum values

| Value | When to use |
| --- | --- |
| `seed` | Inserted by `selfhost/seeds/*.sql` or the legacy migration tool |
| `manual_admin` | Created/edited through the admin dashboard by an operator |
| `gtfs_import` | Imported from an official GTFS feed (detail = feed URL + import date) |
| `community_contribution` | Came from a user contribution (PR #1) that was approved |
| `field_survey` | Entered by a verified surveyor on-site |
| `unknown` | Pre-existing row with no recorded origin (safe default for backfill) |

## Where provenance is set

| Action | Sets to |
| --- | --- |
| `selfhost/seeds/001-initial-station.sql` | `seed` / filename |
| `AdminDataTools` import JSON | `manual_admin` / "json-import \<filename\>" |
| Admin line/station create via dashboard | `manual_admin` / "dashboard" |
| GTFS import tool (planned) | `gtfs_import` / feed URL |
| `UserContribution` approved → applied | `community_contribution` / contribution ID |
| Future field-survey module | `field_survey` / surveyor ID + date |

## Frontend surface

- **Deploy checklist** (`AdminDeploymentChecklist`): a new check counts
  how many published rows are still `unknown` provenance and warns when
  the proportion exceeds 20%.
- **Admin station detail**: a small badge shows the provenance tag so the
  operator can tell at a glance whether a station is verified GTFS data
  or an unconfirmed community suggestion.
- **Validation center** (planned): a rule can flag `unknown`-provenance
  published rows as a quality warning.

## Migration

The `20260524120000_data_provenance` migration adds the columns with
`DEFAULT 'unknown'` so it's non-blocking on existing tables of any size.
The initial seed row (`33333333-...`) is explicitly backfilled to `seed`.

## Without breaking

- All new columns are nullable with safe defaults; existing queries that
  don't SELECT provenance keep working unchanged.
- The frontend `Station` type gains an optional `provenance?: string`
  field; existing destructuring is unaffected.
- No existing endpoint response shape changes — provenance is only
  included when the backend explicitly serialises it (admin detail views).
- The `STATIONS` array in `src/data/stations.ts` (legacy fallback) is
  unchanged; it's never used in production mode.
