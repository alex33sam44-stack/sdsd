import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRole } from '@prisma/client';
import { TenantRolesGuard } from '../src/common/tenancy/tenant-roles.guard';

// ─────────────────────────────────────────────────────────────────────────────
// TenantRolesGuard is the multi-tenant equivalent of RolesGuard. Its quirky
// rule is that platform staff (platform_owner / platform_admin / support_agent)
// always pass — they need to assist tenants without joining each one. We test
// every branch including that staff-bypass and the deny-by-default case.
// ─────────────────────────────────────────────────────────────────────────────

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => function _Cls() {},
  } as unknown as ExecutionContext;
}

function makeReflector(required: TenantRole[] | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('TenantRolesGuard', () => {
  const ANY_REQUIRED = ['tenant_admin'] as unknown as TenantRole[];

  it('allows the request when no tenant roles are declared on the route', () => {
    const guard = new TenantRolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext({ currentTenantRole: 'tenant_admin' }))).toBe(true);
  });

  it.each(['platform_owner', 'platform_admin', 'support_agent'])(
    'lets platform staff (%s) bypass tenant-role checks',
    (role) => {
      const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
      expect(
        guard.canActivate(makeContext({ platformRoles: [role], currentTenantRole: undefined })),
      ).toBe(true);
    },
  );

  it('falls back to user.roles for the staff-bypass when platformRoles is missing', () => {
    // Some auth flows populate user.roles instead of user.platformRoles. The
    // guard tolerates both shapes and we lock that contract in.
    const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
    expect(
      guard.canActivate(makeContext({ roles: ['platform_admin'] })),
    ).toBe(true);
  });

  it('grants access to a tenant member whose role is on the required list', () => {
    const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
    expect(
      guard.canActivate(makeContext({ platformRoles: [], currentTenantRole: 'tenant_admin' })),
    ).toBe(true);
  });

  it('denies a tenant member whose role is not on the required list', () => {
    const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
    expect(() =>
      guard.canActivate(
        makeContext({ platformRoles: [], currentTenantRole: 'viewer' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies a request that has no current tenant role at all', () => {
    const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
    expect(() =>
      guard.canActivate(makeContext({ platformRoles: [] })),
    ).toThrow(ForbiddenException);
  });

  it('denies a missing user (anonymous request)', () => {
    const guard = new TenantRolesGuard(makeReflector(ANY_REQUIRED));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
