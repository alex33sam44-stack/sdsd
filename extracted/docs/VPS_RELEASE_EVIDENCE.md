# VPS release evidence collection

Use this runbook to close the two release blockers:

1. staging evidence under `release-evidence/staging/`
2. Docker-backed tenant-isolation evidence under `release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json`

These artifacts must be generated on a real VPS or CI runner. They must not be hand-written.

## Requirements

- Public DNS pointing to the VPS
- Valid HTTPS endpoint for the staging API
- Docker and Docker Compose v2
- Node.js and npm
- MySQL restore verification command configured

## One command

```bash
cd <repo>
cp selfhost/.env.example selfhost/.env.staging
# Fill selfhost/.env.staging with real staging values and secrets.

API=https://staging.<real-domain> \
RESTORE_VERIFY_COMMAND='./selfhost/scripts/verify-restore.sh' \
./selfhost/scripts/collect-vps-release-evidence.sh
```

## Expected outputs

```text
release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json
release-evidence/staging/staging-smoke-readiness.json
release-evidence/staging/docker-smoke-readiness.json
release-evidence/staging/restore-verified.json
```

## Validation

After the command succeeds:

```bash
BACKEND_URL=https://staging.<real-domain> RELEASE_VERIFY_STRICT=1 npm run verify:release
```

The verifier rejects placeholders, localhost/private IPs, non-HTTPS URLs, and fake tenant-isolation evidence.
