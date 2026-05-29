import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('zones')
export class ZonesController {
  constructor(private readonly service: ZonesService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get()
  list(@CurrentTenant() tenant: { id: string } | null, @Query('stationId') stationId: string) {
    if (!tenant?.id) return [];
    return this.service.listByStation(tenant.id, stationId);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post()
  create(@CurrentTenant() tenant: { id: string }, @Body() body: any) {
    return this.service.create(tenant.id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Patch(':id')
  update(@CurrentTenant() tenant: { id: string }, @Param('id') id: string, @Body() body: any) {
    return this.service.update(tenant.id, id, body);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete(':id')
  remove(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.remove(tenant.id, id);
  }
}
