# Stage 8 recheck summary

## Result

VPS first-run orchestration is now resumable and safer to retry.

## Fixed risk

Before this stage, if a VPS run failed halfway through, operators could re-run the whole sequence and unintentionally repeat expensive or stateful operations such as deploy, bootstrap, cron install, or evidence collection.

Now each step is tracked with success/failure markers and logs. The next run resumes from the first unfinished or failed step by default.

## Files changed

- `selfhost/scripts/vps-first-run.sh`
- `package.json`
- `docs/STAGE_7_VPS_FIRST_RUN_ORCHESTRATION.md`
- `docs/STAGE_8_VPS_FIRST_RUN_IDEMPOTENCY.md`
- `docs/STAGE_8_RECHECK_SUMMARY.md`

## Verification performed

- Shell syntax check
- Node syntax check
- Evidence JSON parse check
- ZIP integrity check

## Still requires VPS

Runtime evidence, HTTPS health checks, Docker build, npm network access, and external backup verification still require the real VPS.
