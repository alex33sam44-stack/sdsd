# SaaS P0 Runtime Foundation Report

## What was completed

### Backend tenancy runtime
- Hardened `TenantResolverService`:
  - no fallback to a default tenant when a specific tenant slug is requested but inactive/missing
  - no implicit default tenant for platform-level users without an explicit tenant selection
  - required tenant routes now reject suspended/archived tenants for non-platform users
- Existing request-scoped tenant resolution remains in place via:
  - `OptionalTenantContextGuard`
  - `RequiredTenantContextGuard`
  - `TenantRolesGuard`

### Customer lifecycle
- Extended tenant lifecycle endpoints with invitation management:
  - `GET /tenants/current/invitations`
  - `DELETE /tenants/current/invitations/:inviteId`
- Added protections so a tenant cannot lose its last `tenant_owner`
- Existing flows retained:
  - create tenant
  - list memberships
  - invite member
  - accept invite
  - list members
  - change member role
  - remove member
  - set tenant status

### Tenant-scoped operational permissions
- Converted key tenant-owned CRUD routes from platform-only to tenant-role-based access:
  - `stations.create`
  - `stations.delete`
  - `lines.delete`
  - `drafts.setStatus`
  - `drafts.apply`
- Platform-level admins still bypass tenant-role checks through the existing tenant role guard

### Frontend tenant awareness
- `TenantProvider` now preserves an explicitly selected tenant for platform admins even when they have no tenant memberships
- `PlatformAdmin` now allows selecting a tenant explicitly as the current working tenant
- `AdminTenantTeam` now supports:
  - listing pending invitations
  - revoking invitations
  - showing both platform roles and tenant roles clearly
- `OpsDashboard` now displays platform roles and current tenant role separately instead of relying on legacy `station_operator`
- `AdminDashboard` now warns clearly when no current tenant is selected

## Files changed

### Backend
- `backend/src/common/tenancy/tenant-resolver.service.ts`
- `backend/src/modules/tenants/tenants.service.ts`
- `backend/src/modules/tenants/tenants.controller.ts`
- `backend/src/modules/stations/stations.controller.ts`
- `backend/src/modules/lines/lines.controller.ts`
- `backend/src/modules/drafts/drafts.controller.ts`

### Frontend
- `src/modules/shared/services/tenants.ts`
- `src/pages/admin/AdminTenantTeam.tsx`
- `src/modules/ops/OpsDashboard.tsx`
- `src/modules/tenancy/TenantContext.tsx`
- `src/modules/admin/PlatformAdmin.tsx`
- `src/pages/admin/AdminDashboard.tsx`

## Verification performed
- `npx tsc --noEmit` ✅ passed

## Not verified here
- live backend runtime on VPS
- MySQL connectivity on deployed environment
- `build / lint / tests` in a fully installed environment with local CLI binaries present
- end-to-end auth/runtime verification against a live backend URL

## Remaining steps before SaaS beta readiness
1. Deploy backend to VPS
2. Run Prisma migrations and backfill scripts
3. Verify:
   - `/api/health`
   - `/api/stations`
   - tenant membership flows
   - invite acceptance
   - tenant-scoped admin flows
4. Run full `build / lint / test`
5. Add billing/subscriptions, CI/CD, and observability for SaaS maturity
