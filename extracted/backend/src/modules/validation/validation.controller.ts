import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { ValidationService } from './validation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiredTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { TenantRolesGuard } from '../../common/tenancy/tenant-roles.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';

@Controller('validation')
@UseGuards(JwtAuthGuard, RequiredTenantContextGuard, TenantRolesGuard)
@TenantRoles(TenantRole.viewer, TenantRole.line_supervisor, TenantRole.station_manager, TenantRole.ops_manager, TenantRole.tenant_admin, TenantRole.tenant_owner)
export class ValidationController {
  constructor(private readonly service: ValidationService) {}

  @Get()
  run(@CurrentTenant() tenant: { id: string }) {
    return this.service.runAll(tenant.id);
  }
}
