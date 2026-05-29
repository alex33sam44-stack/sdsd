import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DraftStatus, TenantRole } from '@prisma/client';
import { DraftsService } from './drafts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('drafts')
@UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
@TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
export class DraftsController {
  constructor(private readonly service: DraftsService) {}

  @Get()
  list(@CurrentTenant() tenant: { id: string }, @Query('status') status?: DraftStatus) {
    return this.service.list(tenant.id, status);
  }

  @Post()
  create(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body() body: { entity: string; entityId?: string; patch: any; note?: string },
  ) {
    return this.service.create(tenant.id, user.id, body);
  }

  @TenantRoles(TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Patch(':id/status')
  setStatus(@CurrentTenant() tenant: { id: string }, @Param('id') id: string, @Body() body: { status: DraftStatus }) {
    return this.service.setStatus(tenant.id, id, body.status);
  }

  @TenantRoles(TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post(':id/apply')
  apply(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.apply(tenant.id, id);
  }
}
