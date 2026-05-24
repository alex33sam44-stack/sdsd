import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole } from '@prisma/client';
import { RolesGuard } from '../src/common/guards/roles.guard';

// ─────────────────────────────────────────────────────────────────────────────
// RolesGuard is the last line of defence on every platform-admin route. It is
// short, but its correctness is non-negotiable: a regression here lets any
// authenticated passenger reach admin endpoints. We mock the bare minimum of
// Nest's ExecutionContext so the test focuses on the decision logic.
// ─────────────────────────────────────────────────────────────────────────────

function makeContext(user: { roles?: AppRole[] } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => function _Cls() {},
  } as unknown as ExecutionContext;
}

function makeReflector(required: AppRole[] | undefined): Reflector {
  // We intentionally short-circuit Reflector by stubbing only the method the
  // guard uses, rather than reaching into Nest's metadata system.
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows the request when the route declares no required roles', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext({ roles: [] }))).toBe(true);
  });

  it('allows the request when the required roles list is empty', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext({ roles: [] }))).toBe(true);
  });

  it('grants access when the user has one of the required roles', () => {
    const guard = new RolesGuard(makeReflector([AppRole.platform_admin]));
    expect(
      guard.canActivate(makeContext({ roles: [AppRole.platform_admin] })),
    ).toBe(true);
  });

  it('still grants access when the user has at least one of several allowed roles', () => {
    const guard = new RolesGuard(makeReflector([AppRole.platform_admin, AppRole.passenger]));
    expect(
      guard.canActivate(makeContext({ roles: [AppRole.passenger] })),
    ).toBe(true);
  });

  it('denies a missing user (anonymous request)', () => {
    const guard = new RolesGuard(makeReflector([AppRole.platform_admin]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('denies a user whose roles do not intersect the required set', () => {
    const guard = new RolesGuard(makeReflector([AppRole.platform_admin]));
    expect(() =>
      guard.canActivate(makeContext({ roles: [AppRole.passenger] })),
    ).toThrow(ForbiddenException);
  });

  it('denies a user with no roles array at all', () => {
    const guard = new RolesGuard(makeReflector([AppRole.platform_admin]));
    expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException);
  });
});
