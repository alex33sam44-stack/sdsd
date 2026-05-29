import type { AppRole, TenantRole, TenantStatus } from '@prisma/client';

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
};

export type TenantMembershipSummary = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  role: TenantRole;
  acceptedAt: Date | null;
};

export type ResolvedTenantContext = {
  requestedTenantSlug: string | null;
  currentTenant: TenantSummary | null;
  currentTenantRole: TenantRole | null;
  memberships: TenantMembershipSummary[];
  platformRoles: AppRole[];
  legacyRoles: AppRole[];
};
