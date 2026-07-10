import { Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantPrismaService } from './tenant-prisma.service';

/**
 * Provides the tenant-context abstraction. Import this in any feature module
 * that reads or writes tenant-scoped data, then depend on TenantPrismaService.
 * PrismaService is available globally (PrismaModule is @Global).
 */
@Module({
  providers: [TenantContextService, TenantPrismaService],
  exports: [TenantContextService, TenantPrismaService],
})
export class TenantModule {}
