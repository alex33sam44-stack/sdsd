import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LineStatus, TenantRole } from '@prisma/client';
import { LinesService } from './lines.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('lines')
export class LinesController {
  constructor(private readonly service: LinesService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get()
  list(@CurrentTenant() tenant: { id: string } | null, @Query('stationId') stationId: string) {
    if (!tenant?.id) return [];
    return this.service.listByStation(tenant.id, stationId);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Get('admin')
  adminList(@CurrentTenant() tenant: { id: string }, @Query('stationId') stationId: string) {
    return this.service.listByStation(tenant.id, stationId, true);
  }

  @UseGuards(OptionalTenantContextGuard)
  @Get(':id')
  one(@CurrentTenant() tenant: { id: string } | null, @Param('id') id: string) {
    if (!tenant?.id) return null;
    return this.service.getOne(tenant.id, id);
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
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete(':id')
  remove(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.remove(tenant.id, id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post(':id/availability')
  availability(
    @CurrentTenant() tenant: { id: string },
    @Param('id') id: string,
    @Body() body: { cars: number; status: LineStatus },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setAvailability(tenant.id, id, body.cars, body.status, user.id);
  }
}
