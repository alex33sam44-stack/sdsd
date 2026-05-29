# Staging readiness

Staging is blocked until it is run on a real HTTPS host with Docker available.
The repository intentionally does not ship passing staging evidence.

## Required host

Use either:

- a temporary VPS with DNS `A` record pointing to it, or
- a CI runner where Docker Compose is available and the hostname resolves to the runner.

The hostname must be real HTTPS. The release workflow rejects placeholders such
as `staging.example.com`, `example.invalid`, `yourdomain.com`, `localhost`, and
private IPs before running enterprise readiness.

## Run

```bash
cd <repo>
cp selfhost/.env.example selfhost/.env.staging
# Replace placeholders with the real staging hostname and secrets.

API=https://staging.<real-domain> \
RESTORE_VERIFY_COMMAND='<your real restore verification command>' \
npm run staging:smoke
```

The script will:

1. reject placeholder/non-HTTPS URLs,
2. require Docker to exist,
3. run `docker compose -f selfhost/compose.stage0.yml --env-file selfhost/.env.staging up -d --build`,
4. run `selfhost/scripts/smoke-test.sh`,
5. run `RESTORE_VERIFY_COMMAND`,
6. write the three required evidence files under `release-evidence/staging/`.

## Evidence files

- `staging-smoke-readiness.json`: real HTTPS `/api/health` and `/api/stations` smoke passed.
- `docker-smoke-readiness.json`: Docker Compose staging stack built and started.
- `restore-verified.json`: the provided restore verification command succeeded.

Enterprise readiness remains blocked until all three are present and valid.

## One-command enterprise proof on a real VPS/CI runner

```bash
export STAGING_URL="https://staging.yourdomain.com"
export RESTORE_DATABASE_URL="mysql://user:password@host:3306/restored_db"
export RESTORE_VERIFY_COMMAND="./selfhost/scripts/verify-restore.sh"
npm run prove:enterprise
```

This command produces the required runtime evidence only after real checks pass:

- `release-evidence/tenant-isolation/mysql-tenant-isolation-readiness.json`
- `release-evidence/staging/staging-smoke-readiness.json`
- `release-evidence/staging/docker-smoke-readiness.json`
- `release-evidence/staging/restore-verified.json`

## VPS evidence wrapper

A convenience wrapper is included for the real VPS/CI runner:

```bash
API=https://staging.<real-domain> \
RESTORE_VERIFY_COMMAND='./selfhost/scripts/verify-restore.sh' \
./selfhost/scripts/collect-vps-release-evidence.sh
```

This wrapper installs dependencies, runs Docker-backed MySQL tenant isolation, runs staging smoke, and then runs strict release verification.
