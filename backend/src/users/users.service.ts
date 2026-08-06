import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { ROLE_DEFAULT_PERMISSIONS, Role } from '../auth/permissions';
import { CreateUserDto } from './dto/create-user.dto';

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

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // All queries run through the tenant-aware layer: RLS scopes them to the
  // current tenant, and inserts stamp the tenant id.
  findAll() {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.findMany({ select: PUBLIC_USER_SELECT }),
    );
  }

  create(dto: CreateUserDto) {
    return this.tenantPrisma.withCurrentTenant(async (tx, tenantId) => {
      const role: Role = dto.role ?? 'staff';
      const permissions = dto.permissions ?? ROLE_DEFAULT_PERMISSIONS[role];
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      return tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role,
          permissions,
          phone: dto.phone,
        },
        select: PUBLIC_USER_SELECT,
      });
    });
  }

  /**
   * Full user record INCLUDING password_hash — for authentication only. Scoped to
   * the current tenant by RLS, so login resolves within one hotel.
   */
  findByEmailWithSecret(email: string) {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.findFirst({ where: { email } }),
    );
  }

  markLoggedIn(id: string) {
    return this.tenantPrisma.withCurrentTenant((tx) =>
      tx.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),
    );
  }
}
