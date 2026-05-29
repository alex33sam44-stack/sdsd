# Stage 8 — VPS first-run idempotency and resume safety

This stage hardens `selfhost/scripts/vps-first-run.sh` so it can be re-run safely after a failed VPS attempt.

## What changed

- Every orchestration step writes a marker under `release-evidence/vps-first-run/`.
- Successful steps are skipped on the next run unless explicitly forced.
- Failed steps write `.failed` metadata and stop the run.
- Each step captures a log under `release-evidence/vps-first-run/logs/`.
- A latest progress report is written to `release-evidence/vps-first-run/vps-first-run-latest.json`.

## Resume behavior

Re-run the same command after fixing the failure. Completed steps will be skipped automatically.

## Force one step

```bash
FORCE_RERUN_STEPS=deploy-with-auto-rollback ./selfhost/scripts/vps-first-run.sh
```

Multiple steps can be comma-separated:

```bash
FORCE_RERUN_STEPS=collect-evidence,public-launch-check ./selfhost/scripts/vps-first-run.sh
```

## Reset all first-run state

```bash
RESET_FIRST_RUN_STATE=1 ./selfhost/scripts/vps-first-run.sh
```

## Public launch rule

The first-run report only proves orchestration progress. Public launch is allowed only when:

```json
{ "publicLaunchReady": true }
```

exists in:

```text
release-evidence/public-launch/public-launch-check-latest.json
```
