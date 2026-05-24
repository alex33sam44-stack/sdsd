import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  TenantRole,
  UserContributionStatus,
  UserContributionType,
} from '@prisma/client';
import { ContributionsService } from './contributions.service';
import {
  CreateContributionDto,
  UpdateContributionStatusDto,
} from './contributions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import {
  OptionalTenantContextGuard,
  RequiredTenantContextGuard,
} from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('contributions')
export class ContributionsController {
  constructor(private readonly service: ContributionsService) {}

  /**
   * Public intake. Anyone (signed in or not) can submit a contribution; the
   * tenant context is resolved from `X-Tenant-Slug` / host. Each submission
   * lands as `pending_review` and is then visible to moderators.
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard, OptionalTenantContextGuard)
  submit(
    @Body() body: CreateContributionDto,
    @CurrentTenant() tenant: { id: string } | null,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.service.submit(body, tenant?.id ?? null, user?.id ?? null);
  }

  /** Moderator listing — scoped to the active tenant. */
  @Get()
  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(
    TenantRole.viewer,
    TenantRole.line_supervisor,
    TenantRole.station_manager,
    TenantRole.ops_manager,
    TenantRole.tenant_admin,
    TenantRole.tenant_owner,
  )
  list(
    @CurrentTenant() tenant: { id: string },
    @Query('status') status?: UserContributionStatus,
    @Query('type') type?: UserContributionType,
    @Query('stationId') stationId?: string,
    @Query('lineId') lineId?: string,
  ) {
    return this.service.list(tenant.id, { status, type, stationId, lineId });
  }

  /** Moderator action — approve / reject / mark applied. */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
  @TenantRoles(
    TenantRole.ops_manager,
    TenantRole.tenant_admin,
    TenantRole.tenant_owner,
  )
  setStatus(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateContributionStatusDto,
  ) {
    return this.service.setStatus(tenant.id, id, body, user.id);
  }
}
