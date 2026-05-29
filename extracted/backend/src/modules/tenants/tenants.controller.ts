import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AppRole, TenantRole, TenantStatus } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, OptionalTenantContextGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Post()
  createTenant(@CurrentUser() user: AuthUser, @Body() body: { name: string; slug?: string }) {
    return this.service.createTenant(user.id, body);
  }

  @Get('me')
  myMemberships(@CurrentUser() user: AuthUser) {
    return this.service.listMyMemberships(user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.platform_admin, AppRole.platform_owner)
  @Get()
  listTenants() {
    return this.service.listTenants();
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Get('current/members')
  currentMembers(@CurrentTenant() tenant: { id: string }) {
    return this.service.listMembers(tenant.id);
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Get('current/invitations')
  currentInvites(@CurrentTenant() tenant: { id: string }) {
    return this.service.listInvites(tenant.id);
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Post('current/invitations')
  invite(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Body() body: { email: string; role: TenantRole; expiresInDays?: number },
  ) {
    return this.service.invite(tenant.id, user.id, body);
  }

  @Post('invitations/accept')
  acceptInvite(@CurrentUser() user: AuthUser, @Body() body: { token: string }) {
    return this.service.acceptInvite(body.token, user.id);
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete('current/invitations/:inviteId')
  revokeInvite(@CurrentTenant() tenant: { id: string }, @Param('inviteId') inviteId: string) {
    return this.service.revokeInvite(tenant.id, inviteId);
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Patch('current/members/:userId')
  changeMemberRole(
    @CurrentTenant() tenant: { id: string },
    @Param('userId') userId: string,
    @Body() body: { role: TenantRole },
  ) {
    return this.service.changeMemberRole(tenant.id, userId, body.role);
  }

  @UseGuards(RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(TenantRole.tenant_admin, TenantRole.tenant_owner)
  @Delete('current/members/:userId')
  removeMember(@CurrentTenant() tenant: { id: string }, @Param('userId') userId: string) {
    return this.service.removeMember(tenant.id, userId);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.platform_admin, AppRole.platform_owner)
  @Patch(':tenantId/status')
  setStatus(@Param('tenantId') tenantId: string, @Body() body: { status: TenantStatus }) {
    return this.service.setStatus(tenantId, body.status);
  }
}
