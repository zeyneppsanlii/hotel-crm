import { BadRequestException, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Request-scoped holder for the current tenant. Populated from the request by
 * TenantMiddleware (via the `x-tenant-id` header). Feature code should not read
 * the header directly — depend on this service instead, so the transport detail
 * stays in one place.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  /** Current tenant id, or `undefined` if the request carried no `x-tenant-id`. */
  get tenantId(): string | undefined {
    return this.request.tenantId;
  }

  /** Current tenant id, or throw if the request is not tenant-scoped. */
  requireTenantId(): string {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new BadRequestException(
        'Missing tenant context: the x-tenant-id header is required for this request.',
      );
    }
    return tenantId;
  }
}
