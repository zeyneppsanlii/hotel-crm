import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Both methods run through the tenant-aware layer: RLS scopes reads to the
  // current tenant, and inserts stamp the tenant id (RLS filters but does not
  // populate the column).
  findAll() {
    return this.tenantPrisma.run((tx) => tx.user.findMany());
  }

  create(dto: CreateUserDto) {
    return this.tenantPrisma.run((tx, tenantId) =>
      tx.user.create({
        data: { tenantId, email: dto.email, name: dto.name ?? dto.email },
      }),
    );
  }
}
