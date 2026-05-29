import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
@TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  list(@CurrentTenant() tenant: { id: string }, @Query('entity') entity?: string, @Query('limit') limit?: string) {
    return this.service.list(tenant.id, entity, limit ? Number(limit) : undefined);
  }

  @Post()
  async create(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body() body: { entity: string; entityId?: string | null; action: string; diff?: unknown },
  ) {
    await this.service.log(tenant.id, user.id, body.entity, body.action, body.entityId ?? undefined, body.diff);
    return { ok: true };
  }
}
