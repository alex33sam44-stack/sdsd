# Stage 9 recheck summary

## Local checks expected to pass

- `bash -n selfhost/scripts/*.sh`
- `node --check scripts/*.mjs backend/scripts/*.mjs`
- `npm run verify:prisma-migrations`
- `npm run verify:vps-orchestration`
- JSON parsing for all `release-evidence/**/*.json`
- ZIP integrity check

## Checks expected to fail until real VPS setup exists

- `npm run verify:production-config` until real domains and verified external backup target are configured.
- `npm run verify:evidence` until runtime evidence is produced on a real HTTPS VPS.
- `npm run verify:public-launch` until Docker, npm network access, real domains, verified backup, built frontend, and all runtime evidence are available.

## Public launch rule

Do not share the public link unless:

```bash
API=https://api.<real-domain> npm run verify:public-launch
```

ends with `publicLaunchReady: true`.
