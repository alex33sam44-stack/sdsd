# Stage 11 recheck summary

## Added

- `scripts/vps-preflight.mjs`
- `selfhost/scripts/vps-preflight.sh`
- `npm run verify:vps-preflight`
- `release-evidence/vps-preflight/vps-preflight-latest.json`

## Updated

- `selfhost/scripts/vps-first-run.sh` starts with a resumable `vps-preflight` step.
- `scripts/validate-release-evidence.mjs` requires VPS preflight evidence.
- `scripts/release-verify.mjs` checks VPS preflight evidence and required scripts.

## Local result

In this container, the preflight is expected to fail because it is not the real VPS and does not provide Docker daemon, real domains, or full network access. That is the desired blocking behavior.
