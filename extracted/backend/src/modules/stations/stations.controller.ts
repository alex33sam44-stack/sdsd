import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { StationsService } from './stations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('stations')
export class StationsController {
  constructor(private readonly service: StationsService) {}

  @UseGuards(OptionalTenantContextGuard)
  @Get()
  list(@CurrentTenant() tenant: { id: string } | null) {
    if (!tenant?.id) return [];
    return this.service.listPublished(tenant.id);
  }

  @UseGuards(OptionalTenantContextGuard)
  @Get('nearest')
  nearest(@CurrentTenant() tenant: { id: string } | null, @Query('lat') lat: string, @Query('lng') lng: string) {
    if (!tenant?.id) return null;
    return this.service.nearest(tenant.id, Number(lat), Number(lng));
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Get('admin/all')
  adminList(@CurrentTenant() tenant: { id: string }) {
    return this.service.listAll(tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Get('admin/:id')
  adminOne(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.getWithLines(id, tenant.id, true);
  }

  @UseGuards(OptionalTenantContextGuard)
  @Get(':id')
  one(@CurrentTenant() tenant: { id: string } | null, @Param('id') id: string) {
    if (!tenant?.id) return null;
    return this.service.getWithLines(id, tenant.id);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post()
  create(@CurrentTenant() tenant: { id: string }, @Body() body: { id?: string; name: string; area?: string; lat: number; lng: number; cityId?: string }) {
    return this.service.create(tenant.id, body as any);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Patch(':id')
  update(@CurrentTenant() tenant: { id: string }, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(tenant.id, id, body as never);
  }

  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete(':id')
  remove(@CurrentTenant() tenant: { id: string }, @Param('id') id: string) {
    return this.service.remove(tenant.id, id);
  }
}
