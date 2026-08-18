import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { TenantGuard } from './tenant.guard';

interface RequestParts {
  user?: Partial<AuthenticatedUser>;
  tenantId?: string;
}

/** Minimal ExecutionContext exposing `req.user` / `req.tenantId` to the guard. */
function contextFor(req: RequestParts): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardWith(isPublic: boolean): TenantGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  return new TenantGuard(reflector);
}

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

describe('TenantGuard', () => {
  it('allows @Public() routes without inspecting the request', () => {
    const guard = guardWith(true);
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('allows when the header tenant matches the token tenant', () => {
    const guard = guardWith(false);
    const ctx = contextFor({
      user: { tenantId: TENANT_A },
      tenantId: TENANT_A,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when the header tenant differs from the token tenant', () => {
    const guard = guardWith(false);
    const ctx = contextFor({
      user: { tenantId: TENANT_A },
      tenantId: TENANT_B,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects an authenticated request that carries no x-tenant-id header', () => {
    const guard = guardWith(false);
    const ctx = contextFor({ user: { tenantId: TENANT_A } });
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('defers to the auth layer when there is no user (no crash)', () => {
    const guard = guardWith(false);
    expect(guard.canActivate(contextFor({ tenantId: TENANT_A }))).toBe(true);
  });
});
