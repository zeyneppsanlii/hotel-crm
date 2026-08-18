import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Defence-in-depth tenant check. Runs after JwtAuthGuard (so `req.user` is set)
 * and confirms the tenant the caller is *acting as* (the `x-tenant-id` header,
 * resolved onto `req.tenantId` by TenantMiddleware) is the tenant the token was
 * issued for (`req.user.tenantId`).
 *
 * Identity is per-tenant here — a token belongs to exactly one hotel — so a valid
 * Alpha token paired with an `x-tenant-id` for Beta is an attempt to reach across
 * tenants and is rejected, even before RLS would scope the query. @Public() routes
 * (login, /health) carry no user and are skipped.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    // No authenticated user on a non-public route is JwtAuthGuard's concern; it
    // runs first and would already have rejected the request. Nothing to compare.
    if (!user) {
      return true;
    }

    const headerTenantId = req.tenantId;
    if (!headerTenantId) {
      throw new BadRequestException(
        'Missing tenant context: the x-tenant-id header is required for this request.',
      );
    }

    if (headerTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'Tenant mismatch: this token is not valid for the requested tenant.',
      );
    }

    return true;
  }
}
