import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRole, TenantRole, TenantStatus } from '@prisma/client';

export interface AuthMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  role: TenantRole;
  acceptedAt: Date | null;
}

export interface AuthTenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  /** legacy combined roles for backwards-compat in older guards */
  roles: AppRole[];
  /** platform-level roles only */
  platformRoles: AppRole[];
  memberships?: AuthMembership[];
  currentTenant?: AuthTenant | null;
  currentTenantRole?: TenantRole | null;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
