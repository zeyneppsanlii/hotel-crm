import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Reads the `x-tenant-id` header and attaches it to the request as `tenantId`.
 * The tenant-aware access layer (TenantPrismaService) later pushes this value
 * into the `app.current_tenant_id` session variable so RLS policies can filter
 * rows. This middleware only resolves the header — it does not authorize access;
 * a TenantGuard (planned, with the auth module) will check that the current user
 * actually belongs to the tenant.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers['x-tenant-id'];
    const tenantId = Array.isArray(header) ? header[0] : header;
    if (tenantId) {
      req.tenantId = tenantId;
    }
    next();
  }
}
