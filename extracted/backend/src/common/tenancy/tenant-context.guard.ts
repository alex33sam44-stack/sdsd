import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TenantResolverService } from './tenant-resolver.service';

@Injectable()
export class OptionalTenantContextGuard implements CanActivate {
  constructor(private readonly resolver: TenantResolverService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: any; tenantContext?: any }>();
    const user = req.user;
    req.tenantContext = user?.id
      ? await this.resolver.resolveForUser(req, user.id, user.platformRoles ?? user.roles ?? [])
      : await this.resolver.resolvePublicTenant(req, false);

    if (user) {
      req.user = {
        ...user,
        platformRoles: req.tenantContext.platformRoles,
        roles: req.tenantContext.legacyRoles,
        memberships: req.tenantContext.memberships,
        currentTenant: req.tenantContext.currentTenant,
        currentTenantRole: req.tenantContext.currentTenantRole,
      };
    }
    return true;
  }
}

@Injectable()
export class RequiredTenantContextGuard implements CanActivate {
  constructor(private readonly resolver: TenantResolverService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: any; tenantContext?: any }>();
    const user = req.user;
    if (!user?.id) throw new ForbiddenException('Authentication required');

    req.tenantContext = await this.resolver.requireForUser(req, user.id, user.platformRoles ?? user.roles ?? []);
    req.user = {
      ...user,
      platformRoles: req.tenantContext.platformRoles,
      roles: req.tenantContext.legacyRoles,
      memberships: req.tenantContext.memberships,
      currentTenant: req.tenantContext.currentTenant,
      currentTenantRole: req.tenantContext.currentTenantRole,
    };
    return true;
  }
}
