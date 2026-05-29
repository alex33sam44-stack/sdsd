import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRole } from '@prisma/client';

export const TENANT_ROLES_KEY = 'tenant_roles';

@Injectable()
export class TenantRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<TenantRole[]>(TENANT_ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<{ user?: any }>();
    const user = req.user;
    const platformRoles = (user?.platformRoles ?? user?.roles ?? []) as string[];
    if (platformRoles.some((r) => ['platform_owner', 'platform_admin', 'support_agent'].includes(r))) return true;

    const currentTenantRole = user?.currentTenantRole as TenantRole | undefined;
    if (!currentTenantRole || !required.includes(currentTenantRole)) {
      throw new ForbiddenException('Insufficient tenant role');
    }
    return true;
  }
}
