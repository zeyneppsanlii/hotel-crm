import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { NewUserRecord, UserEmail, UserId } from './types/user.types';

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

/**
 * All Prisma access for users lives here (Repository Pattern) — services never
 * touch Prisma directly. Every query runs through the tenant-aware layer, so RLS
 * scopes it to the current tenant and inserts are stamped with the tenant id.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll(): Promise<PublicUser[]> {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.findMany({ select: PUBLIC_USER_SELECT }),
    );
  }

  create(data: NewUserRecord): Promise<PublicUser> {
    return this.tenantPrisma.withCurrentTenant((tx, tenantId) =>
      tx.user.create({
        data: { tenantId, ...data },
        select: PUBLIC_USER_SELECT,
      }),
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
