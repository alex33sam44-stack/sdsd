import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantResolverService } from './tenant-resolver.service';
import { OptionalTenantContextGuard, RequiredTenantContextGuard } from './tenant-context.guard';
import { TenantRolesGuard } from './tenant-roles.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantResolverService, OptionalTenantContextGuard, RequiredTenantContextGuard, TenantRolesGuard],
  exports: [TenantResolverService, OptionalTenantContextGuard, RequiredTenantContextGuard, TenantRolesGuard],
})
export class TenancyModule {}
