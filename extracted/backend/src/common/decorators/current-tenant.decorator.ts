import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ tenantContext?: { currentTenant?: unknown } }>();
  return req.tenantContext?.currentTenant ?? null;
});

export const CurrentTenantRole = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ tenantContext?: { currentTenantRole?: unknown } }>();
  return req.tenantContext?.currentTenantRole ?? null;
});
