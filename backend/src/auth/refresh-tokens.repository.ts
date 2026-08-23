import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { TenantId } from '../common/tenant/tenant.types';
import { UserId, toUserId } from '../users/types/user.types';
import {
  NewRefreshTokenRecord,
  RefreshTokenFamilyId,
  RefreshTokenHash,
  RefreshTokenId,
  StoredRefreshToken,
  toRefreshTokenFamilyId,
  toRefreshTokenId,
} from './types/refresh-token.types';

const STORED_REFRESH_TOKEN_SELECT = {
  id: true,
  userId: true,
  familyId: true,
  expiresAt: true,
} satisfies Prisma.RefreshTokenSelect;

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(
    tenantId: TenantId,
    record: NewRefreshTokenRecord,
  ): Promise<void> {
    await this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.create({ data: { tenantId, ...record } }),
    );
  }

  async findByHash(
    tenantId: TenantId,
    tokenHash: RefreshTokenHash,
  ): Promise<StoredRefreshToken | null> {
    const row = await this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.findFirst({
        where: { tokenHash },
        select: STORED_REFRESH_TOKEN_SELECT,
      }),
    );
    if (!row) {
      return null;
    }
    return {
      id: toRefreshTokenId(row.id),
      userId: toUserId(row.userId),
      familyId: toRefreshTokenFamilyId(row.familyId),
      expiresAt: row.expiresAt,
    };
  }

  async claim(tenantId: TenantId, id: RefreshTokenId): Promise<boolean> {
    const { count } = await this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return count === 1;
  }

  async revokeFamily(
    tenantId: TenantId,
    familyId: RefreshTokenFamilyId,
  ): Promise<void> {
    await this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  async deleteExpiredForUser(
    tenantId: TenantId,
    userId: UserId,
  ): Promise<void> {
    await this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      }),
    );
  }
}
