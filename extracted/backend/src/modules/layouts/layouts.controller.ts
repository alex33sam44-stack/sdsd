import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { LayoutsService } from './layouts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('layouts')
export class LayoutsController {
  constructor(private readonly service: LayoutsService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get(':stationId')
  get(@CurrentTenant() tenant: { id: string } | null, @Param('stationId') stationId: string) {
    if (!tenant?.id) return null;
    return this.service.getByStation(tenant.id, stationId);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Put(':stationId')
  upsert(@CurrentTenant() tenant: { id: string }, @Param('stationId') stationId: string, @Body() body: { viewbox?: string; notes?: string }) {
    return this.service.upsert(tenant.id, stationId, body);
  }
}
