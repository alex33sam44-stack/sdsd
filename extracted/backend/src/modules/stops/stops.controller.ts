import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { StopsService } from './stops.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('stops')
export class StopsController {
  constructor(private readonly service: StopsService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get()
  list(@CurrentTenant() tenant: { id: string } | null, @Query('lineId') lineId: string) {
    if (!tenant?.id) return [];
    return this.service.listByLine(tenant.id, lineId);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post()
  create(@CurrentTenant() tenant: { id: string }, @Body() body: any) {
    return this.service.create(tenant.id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Patch(':id')
  update(@CurrentTenant() tenant: { id: string }, @Param('id') id: string, @Body() body: any) {
    return this.service.update(tenant.id, id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post('reorder')
  reorder(@CurrentTenant() tenant: { id: string }, @Body() body: { lineId: string; orderedIds: string[] }) {
    return this.service.reorder(tenant.id, body.lineId, body.orderedIds);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete(':id')
  remove(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.remove(tenant.id, id);
  }
}
