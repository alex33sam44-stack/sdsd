# SaaS Billing + Plans + Limits Foundation Report

## Scope
This phase adds the next SaaS layer after runtime multi-tenancy:
- plan catalog
- tenant subscription/billing profile foundation
- usage counters
- limit enforcement for key operational entities
- tenant billing admin page
- platform billing summary access

## Implemented

### Backend schema
Added enums:
- `BillingProvider`
- `SubscriptionStatus`
- `BillingInterval`

Added models:
- `BillingPlan`
- `TenantBillingProfile`
- `TenantSubscription`

Extended existing models:
- `Tenant.billingProfile`
- `Tenant.subscription`
- `TenantPlan.features`
- `TenantPlan.code` indexed

### Backend module
Added `backend/src/modules/billing/`:
- `billing.module.ts`
- `billing.controller.ts`
- `billing.service.ts`
- `default-plans.ts`

Endpoints added:
- `GET /billing/plans`
- `GET /billing/current`
- `GET /billing/current/usage`
- `PATCH /billing/current/plan`
- `PATCH /billing/current/profile`
- `GET /billing/admin/summary`
- `POST /billing/admin/seed-defaults`

### Limit enforcement
Usage limits are enforced in:
- `StationsService.create()`
- `LinesService.create()`
- `StopsService.create()`
- `TenantsService.invite()` (seat capacity)

### Tenant creation defaults
New tenants now start with:
- starter plan
- manual billing profile
- trialing subscription
- initial seat allowance

### Customer lifecycle integration
`TenantsService` now supports billing-aware onboarding:
- create tenant with initial plan/profile/subscription
- invite flow respects seat limits
- pending invites list and revoke support remains intact
- guard against removing/demoting the last `tenant_owner`

### Frontend
Added:
- `src/modules/shared/services/billing.ts`
- `src/pages/admin/AdminBilling.tsx`

Updated:
- `src/modules/shared/types.ts`
- `src/App.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/modules/admin/PlatformAdmin.tsx`

Features exposed in UI:
- current tenant billing overview
- plan catalog
- plan change form
- seat limit override field
- billing profile update form
- usage vs limits cards
- platform admin tenant billing summary (entry point via admin link)

### Scripts
Added backend script:
- `billing:seed-foundation`

Script file:
- `backend/scripts/seed-billing-foundation.ts`

## Important behavior decisions
- `TenantPlan` and `TenantSubscription` keep `planCode` as a string identifier for backward-compatible migrations.
- No external billing provider integration is enforced yet.
- This is a SaaS foundation, not a full Stripe/Lemon checkout implementation.
- Seat capacity is checked at invitation time, not acceptance time, so pending invites reserve seats.

## Verification
### Completed here
- root/frontend TypeScript: `npx tsc --noEmit` ✅

### Not fully verifiable in this environment
- frontend build (`vite` not installed in this environment)
- backend TypeScript/build (backend deps not installed here)
- live MySQL-backed runtime verification
- real billing flow on deployed backend

## Remaining gaps before SaaS billing is production-ready
1. Stripe/Lemon/real provider integration
2. Webhook handling and reconciliation
3. Real invoice/payment lifecycle
4. Feature entitlements enforcement beyond basic limits
5. Usage metering persistence if finer-grained billing is needed
6. End-to-end runtime tests on deployed backend

## Recommended next phase
- real subscription provider integration
- usage entitlements / feature flags
- CI/CD and observability hardening
