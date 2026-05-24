# Backup Verification — runbook

This document describes the **three-layer evidence chain** that turns the
documented backup strategy into a release gate. None of this changes how
backups are produced — it adds proof that they actually happened, arrived
intact, and can be restored.

## The three layers

| Layer | What it proves | Script | Evidence file |
|---|---|---|---|
| **1. Target reachability** | The remote/mount accepts a 1-byte test file and is on a separate device. Already existed before this work. | `selfhost/scripts/verify-backup-target.sh` | `release-evidence/backup/external-backup-target-readiness.json` |
| **2. Freshness (heartbeat)** | The cron actually fired within the last 25 hours and produced a non-empty dump with a real sha256. | `scripts/validate-backup-freshness.mjs` | `release-evidence/backup/backup-freshness-readiness.json` |
| **3. Round-trip restore** | A real dump pulled back from the external target matches its sha256 sidecar AND restores cleanly into a throwaway MySQL container. This is the only evidence that survives a "is the backup actually usable?" audit. | `selfhost/scripts/verify-backup-roundtrip.sh` | `release-evidence/backup/backup-roundtrip-readiness.json` |

`scripts/validate-release-evidence.mjs` enforces all three: a release fails
if any of the three evidence files is missing, malformed, or stale.

## How the heartbeat works

`selfhost/scripts/mysql-backup.sh` writes
`release-evidence/backup/last-backup-heartbeat.json` after every successful
run. The write is atomic (write-to-temp + rename) so a half-finished file
can never trip the freshness gate. The heartbeat carries:

- `completed_at` — UTC timestamp the dump finished.
- `bytes` — uncompressed-on-disk size of the gzip dump.
- `sha256` — the same checksum copied alongside the dump to the external
  target. Round-trip verification matches against this value.
- `target_kind` — `rclone`, `mounted_directory`, or `local_only`.
- `target_location` — the remote URL or absolute mount path.
- `external_target_configured` — `true` only when `target_kind` is not
  `local_only`. Production releases require `true`.

`scripts/validate-backup-freshness.mjs` reads the heartbeat and writes a
pass/fail evidence file. Run it on the VPS the same way you run the
existing target-reachability check:

```bash
node scripts/validate-backup-freshness.mjs
```

Tunables (env):

- `BACKUP_FRESHNESS_MAX_HOURS` — default `25`. Pad slightly above the cron
  period (24h) to absorb scheduling jitter.
- `BACKUP_FRESHNESS_REQUIRE_EXTERNAL` — set to `1` for the production
  release; rejects local-only backups.

## How the round-trip works

`selfhost/scripts/verify-backup-roundtrip.sh` does a full restore from the
external target into an isolated container:

1. Lists the external target (`rclone lsjson` or `readdir`) and picks the
   newest `*.sql.gz`.
2. Pulls the dump and its `.sha256` sidecar to a staging directory.
3. Recomputes sha256 on the local copy and matches against the sidecar.
   Any mid-transit corruption fails here.
4. `docker run -d --rm mysql:8.0` for a throwaway DB. The script never
   touches production credentials and never connects to the production DB.
5. Streams `gunzip -c | docker exec mysql -uroot DB` to restore.
6. Runs a smoke query (`SHOW TABLES` by default) to confirm the schema is
   present.
7. Tears the container down even on failure.

Run before the release:

```bash
selfhost/scripts/verify-backup-roundtrip.sh
```

This requires Docker on the runner (the production VPS already has it for
the main stack).

## Sequencing in CI / the public-launch checklist

The release checklist already runs `validate-release-evidence.mjs`. With
this PR it also requires:

```text
release-evidence/backup/backup-freshness-readiness.json    passed
release-evidence/backup/backup-roundtrip-readiness.json    passed
```

The recommended order on the VPS:

```bash
# 1. Static target check (fast, no DB).
selfhost/scripts/verify-backup-target.sh

# 2. Wait for the daily cron to land at least one heartbeat,
#    or trigger a manual run:
ENV_FILE=selfhost/.env.production selfhost/scripts/mysql-backup.sh

# 3. Confirm the heartbeat is fresh.
node scripts/validate-backup-freshness.mjs

# 4. Full round-trip (slow — pulls the dump and runs MySQL).
selfhost/scripts/verify-backup-roundtrip.sh

# 5. Aggregate gate.
RELEASE_VERIFY_REQUIRE_EVIDENCE=1 node scripts/validate-release-evidence.mjs
```

## Why these three and not more

We deliberately stop at three layers because each one closes a distinct
failure mode:

- Reachability misses "the cron silently didn't fire."
- Freshness misses "the dump was corrupted in transit."
- Round-trip misses nothing the others miss, but it costs a Docker pull
  and ~30s of MySQL boot, so it runs once per release rather than per
  cron tick.

Adding a fourth layer (e.g., periodic round-trip) is doable, but the cost
starts to dominate: a daily round-trip for every cron run would spin up
~30 Docker containers per month with little additional signal beyond what
freshness already gives us.
