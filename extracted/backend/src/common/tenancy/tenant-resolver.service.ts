import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppRole, TenantStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedTenantContext, TenantMembershipSummary, TenantSummary } from './tenant.types';

@Injectable()
export class TenantResolverService {
  constructor(private readonly prisma: PrismaService) {}

  extractRequestedTenantSlug(req: Request): string | null {
    const headerValue = req.headers['x-tenant-slug'];
    const headerSlug = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (typeof headerSlug === 'string' && headerSlug.trim() && this.hasAuthenticatedUser(req)) {
      return headerSlug.trim().toLowerCase();
    }

    const querySlug = typeof req.query.tenant === 'string' ? req.query.tenant : null;
    if (querySlug?.trim()) return querySlug.trim().toLowerCase();

    const hostHeader = req.headers.host ?? '';
    const host = hostHeader.split(':')[0].toLowerCase();
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    const parts = host.split('.');
    if (parts.length >= 3 && !['www', 'api'].includes(parts[0])) return parts[0];
    return null;
  }

  private toSummary(tenant: { id: string; slug: string; name: string; status: TenantStatus }): TenantSummary {
    return { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status };
  }

  private async getDefaultTenant(): Promise<TenantSummary | null> {
    const envSlug = (process.env.LEGACY_TENANT_SLUG ?? process.env.LEGACY_DEFAULT_TENANT_SLUG ?? '').trim().toLowerCase();
    const tenant = envSlug
      ? await this.prisma.tenant.findFirst({ where: { slug: envSlug, status: TenantStatus.active } })
      : await this.prisma.tenant.findFirst({ where: { status: TenantStatus.active }, orderBy: { createdAt: 'asc' } });
    return tenant ? this.toSummary(tenant) : null;
  }

  async resolvePublicTenant(req: Request, required = false): Promise<ResolvedTenantContext> {
    const requestedTenantSlug = this.extractRequestedTenantSlug(req);
    let currentTenant: TenantSummary | null = null;

    if (requestedTenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: requestedTenantSlug } });
      if (tenant?.status === TenantStatus.active) currentTenant = this.toSummary(tenant);
    }

    if (!currentTenant && !requestedTenantSlug) currentTenant = await this.getDefaultTenant();
    if (required && !currentTenant) throw new ForbiddenException('Tenant is required for this route');

    return {
      requestedTenantSlug,
      currentTenant,
      currentTenantRole: null,
      memberships: [],
      platformRoles: [],
      legacyRoles: [],
    };
  }

  async resolveForUser(req: Request, userId: string, platformRoles: AppRole[] = []): Promise<ResolvedTenantContext> {
    const requestedTenantSlug = this.extractRequestedTenantSlug(req);
    const membershipRows = await this.prisma.tenantMembership.findMany({
      where: { userId, acceptedAt: { not: null } },
      include: { tenant: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    const memberships: TenantMembershipSummary[] = membershipRows
      .filter((m) => Boolean(m.tenant))
      .map((m) => ({
        tenantId: m.tenantId,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        tenantStatus: m.tenant.status,
        role: m.role,
        acceptedAt: m.acceptedAt,
      }));

    const currentMembership = requestedTenantSlug
      ? memberships.find((m) => m.tenantSlug === requestedTenantSlug)
      : memberships[0];

    let currentTenant: TenantSummary | null = null;
    const currentTenantRole = currentMembership?.role ?? null;

    if (currentMembership) {
      currentTenant = {
        id: currentMembership.tenantId,
        slug: currentMembership.tenantSlug,
        name: currentMembership.tenantName,
        status: currentMembership.tenantStatus,
      };
    } else if (requestedTenantSlug && this.hasPlatformAccess(platformRoles)) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: requestedTenantSlug } });
      if (tenant) {
        currentTenant = this.toSummary(tenant);
        await this.logPlatformTenantAccess(tenant.id, userId, requestedTenantSlug);
      }
    } else if (!requestedTenantSlug && !this.hasPlatformAccess(platformRoles)) {
      currentTenant = await this.getDefaultTenant();
    }

    const legacyRoles = this.deriveLegacyRoles(platformRoles, currentTenantRole);

    return {
      requestedTenantSlug,
      currentTenant,
      currentTenantRole,
      memberships,
      platformRoles,
      legacyRoles,
    };
  }

  async requireForUser(req: Request, userId: string, platformRoles: AppRole[] = []): Promise<ResolvedTenantContext> {
    const ctx = await this.resolveForUser(req, userId, platformRoles);
    if (!ctx.currentTenant) throw new ForbiddenException('Tenant is required for this route');
    const hasPlatformAccess = this.hasPlatformAccess(platformRoles);
    if (!ctx.currentTenantRole && !hasPlatformAccess) {
      throw new ForbiddenException('No access to this tenant');
    }
    if (ctx.currentTenant.status !== TenantStatus.active && !hasPlatformAccess) {
      throw new ForbiddenException('Tenant is not active');
    }
    return ctx;
  }

  private hasAuthenticatedUser(req: Request): boolean {
    const auth = req.headers.authorization;
    return typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ');
  }

  private async logPlatformTenantAccess(tenantId: string, userId: string, requestedTenantSlug: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        entity: 'tenant',
        entityId: tenantId,
        action: 'platform_admin_tenant_access',
        diff: { requestedTenantSlug, accessPath: 'x-tenant-slug-or-requested-slug', membership: false } as any,
      },
    });
  }

  hasPlatformAccess(platformRoles: AppRole[]): boolean {
    return platformRoles.some((r) => ['platform_admin', 'platform_owner', 'support_agent'].includes(r));
  }

  private deriveLegacyRoles(platformRoles: AppRole[], tenantRole: ResolvedTenantContext['currentTenantRole']): AppRole[] {
    const legacy = new Set<AppRole>(platformRoles);
    if (tenantRole && ['tenant_owner', 'tenant_admin', 'ops_manager', 'station_manager', 'line_supervisor'].includes(tenantRole)) {
      legacy.add('station_operator');
    }
    return [...legacy];
  }
}
