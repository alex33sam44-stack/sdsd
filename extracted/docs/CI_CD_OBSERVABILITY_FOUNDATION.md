# CI/CD + Observability Foundation

This phase adds the minimum operational foundation required before treating the
platform like a production SaaS:

- automated CI for frontend and backend
- manual release-verification workflow
- structured backend request/error logging
- request correlation IDs
- release verification scripts for frontend and backend
- deployment docs aligned with the self-hosted architecture

## What is included

### Frontend
- `scripts/release-verify.mjs`
- `npm run verify:release`
- existing `src/lib/sentry.ts`, `src/lib/logger.ts`, and `src/lib/perf.ts`
  remain the primary observability hooks in the browser
- `src/lib/api.ts` now sends:
  - `X-Client-Request-Id`
  - `X-App-Release`

### Backend
- request context middleware assigns a request id and surfaces it in
  `x-request-id`
- request logging interceptor records one structured line per request
- all-exceptions filter emits structured error logs and returns request ids to
  clients
- `npm run release:verify` checks env, DB connectivity, counts, and optionally
  live HTTP endpoints

### GitHub Actions
- `.github/workflows/ci.yml`
- `.github/workflows/release-verification.yml`

## What is intentionally NOT included yet
- paid monitoring vendors wired in the backend runtime
- distributed tracing infrastructure
- queue workers / async jobs observability
- deployment automation to a specific cloud provider

Those come later. This phase provides the baseline required to observe and
verify releases safely.

## Recommended next step after this phase
1. deploy backend + MySQL to the VPS
2. run frontend/backend release verification scripts
3. complete the frontend runtime cutover if still pending
4. add a real backend error sink (Sentry or equivalent)
5. add deployment promotion + rollback automation


Frontend build variables live in `.env.frontend.example`.
