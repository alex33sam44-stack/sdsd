import { SetMetadata } from '@nestjs/common';
import type { TenantRole } from '@prisma/client';
import { TENANT_ROLES_KEY } from '../tenancy/tenant-roles.guard';

export const TenantRoles = (...roles: TenantRole[]) => SetMetadata(TENANT_ROLES_KEY, roles);
