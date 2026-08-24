import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PageRequest, skipFor } from '../common/http/page-request';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { TenantId } from '../common/tenant/tenant.types';
import {
  NewUserRecord,
  UserEmail,
  UserId,
  UserUpdateRecord,
} from './types/user.types';

// Every column except password_hash — the safe shape to return over HTTP.
const PUBLIC_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  fullName: true,
  role: true,
  permissions: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_SELECT;
}>;

export interface UserPage {
  items: PublicUser[];
  total: number;
}

/**
 * All Prisma access for users lives here (Repository Pattern) — services never
 * touch Prisma directly. Every query runs through the tenant-aware layer, so RLS
 * scopes it to the current tenant and inserts are stamped with the tenant id.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Page and total are read in the SAME transaction as the tenant context, so
   * the count can never describe a different tenant's rows than the page does.
   * Ordering carries `id` as a tiebreaker: without it, users sharing a
   * `createdAt` could shuffle between pages and be shown twice or skipped.
   */
  async findPage(page: PageRequest): Promise<UserPage> {
    return this.tenantPrisma.withCurrentTenant(async (tx) => {
      const [items, total] = await Promise.all([
        tx.user.findMany({
          select: PUBLIC_USER_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: skipFor(page),
          take: page.limit,
        }),
        tx.user.count(),
      ]);
      return { items, total };
    });
  }

  findById(id: UserId): Promise<PublicUser | null> {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.findFirst({ where: { id }, select: PUBLIC_USER_SELECT }),
    );
  }

  /**
   * Scoped by `updateMany` rather than `update`: a bare `update` matches on the
   * primary key alone, which RLS turns into a "record not found" crash for
   * another tenant's id. `updateMany` reports zero rows instead, so the service
   * can answer a clean 404.
   */
  async update(id: UserId, data: UserUpdateRecord): Promise<PublicUser | null> {
    return this.tenantPrisma.withCurrentTenant(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id }, data });
      if (count === 0) {
        return null;
      }
      return tx.user.findFirst({ where: { id }, select: PUBLIC_USER_SELECT });
    });
  }

  create(data: NewUserRecord): Promise<PublicUser> {
    return this.tenantPrisma.withCurrentTenant((tx, tenantId) =>
      tx.user.create({
        data: { tenantId, ...data },
        select: PUBLIC_USER_SELECT,
      }),
    );
  }

  findByIdInTenant(id: UserId, tenantId: TenantId): Promise<PublicUser | null> {
    return this.tenantPrisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id }, select: PUBLIC_USER_SELECT }),
    );
  }

  /** Full record INCLUDING password_hash — for authentication only. */
  findByEmailWithSecret(email: UserEmail): Promise<User | null> {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.findFirst({ where: { email } }),
    );
  }

  markLoggedIn(id: UserId): Promise<User> {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),
    );
  }
}
