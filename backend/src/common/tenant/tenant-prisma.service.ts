import { Injectable, Scope } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Tenant-aware data-access layer. This is the single place that knows *how*
 * tenant isolation is enforced (single schema + RLS). Feature modules call
 * `run()` and work with a Prisma client that only ever sees the current
 * tenant's rows — they never touch `tenant_id` filters, `search_path`, or the
 * session variable directly.
 *
 * Isolation mechanism: each unit of work runs inside a transaction that first
 * sets `app.current_tenant_id` with `SET LOCAL` semantics (via `set_config(...,
 * true)`). RLS policies read that variable, so the guarantee lives in the
 * database, not in application `WHERE` clauses. `SET LOCAL` is scoped to the
 * transaction, so the value cannot leak across pooled connections.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Run `work` in the current request's tenant context. Throws if the request
   * carried no tenant. The tenant id is also passed to `work` for convenience
   * (e.g. to stamp `tenant_id` on inserts — RLS filters reads/writes but does
   * not populate the column).
   */
  run<T>(
    work: (tx: Prisma.TransactionClient, tenantId: string) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.runFor(tenantId, (tx) => work(tx, tenantId));
  }

  /**
   * Run `work` in an explicit tenant context, independent of the request.
   * Useful for background jobs (queues, webhooks) that resolve the tenant
   * themselves rather than from an HTTP header.
   */
  runFor<T>(
    tenantId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Parameterized: set_config binds the value, so no SQL injection.
      // is_local = true → the setting is reverted at transaction end.
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return work(tx);
    });
  }
}
