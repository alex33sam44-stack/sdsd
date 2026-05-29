# Stage 9 — VPS orchestration deep recheck

This stage fixes a dangerous interaction between `vps-first-run.sh` and `collect-vps-release-evidence.sh`.

## Issue fixed

`vps-first-run.sh` already performs deployment and public data/admin bootstrap before collecting runtime evidence. The evidence collector previously ran those steps again because it did not honor the orchestration flags passed by `vps-first-run.sh`.

That could cause duplicate deploy/rollback attempts or duplicate bootstrap operations during the first VPS run.

## Fix

`selfhost/scripts/collect-vps-release-evidence.sh` now supports explicit step flags:

- `RUN_NPM_INSTALL`
- `RUN_PRODUCTION_CONFIG`
- `RUN_TENANT_ISOLATION`
- `RUN_STAGING_SMOKE`
- `RUN_BOOTSTRAP_DATA`
- `RUN_BACKUP_TARGET`
- `RUN_DEPLOY_ROLLBACK`
- `RUN_RELEASE_VERIFY`
- `RUN_EVIDENCE_VERIFY`

`selfhost/scripts/vps-first-run.sh` now calls the evidence collector with:

```bash
RUN_NPM_INSTALL=0
RUN_PRODUCTION_CONFIG=1
RUN_BOOTSTRAP_DATA=0
RUN_DEPLOY_ROLLBACK=0
```

This keeps the first-run order safe:

1. configure env
2. install dependencies
3. verify config
4. verify Prisma migrations
5. deploy with auto rollback
6. bootstrap seed/admin data
7. install backup cron
8. collect evidence without duplicate deploy/bootstrap
9. run public launch gate

## New validation

Run:

```bash
npm run verify:vps-orchestration
```

This checks that the orchestration scripts still honor the no-duplicate-deploy/no-duplicate-bootstrap contract.
