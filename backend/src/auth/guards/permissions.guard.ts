import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Enforces @RequirePermissions(...). No-op on routes without the decorator.
 * `admin` bypasses all checks; every other user must hold every listed permission.
 * Runs after JwtAuthGuard, so `req.user` is present.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }
    if (user.role === 'admin') {
      return true;
    }

    const held = user.permissions ?? [];
    const ok = required.every((p) => held.includes(p));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
