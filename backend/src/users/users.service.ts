import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PaginatedResult } from '../common/http/paginated-result';
import { TenantId } from '../common/tenant/tenant.types';
import { BCRYPT_ROUNDS } from '../auth/password.constants';
import { ROLE_DEFAULT_PERMISSIONS, Role } from '../auth/permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUser, UsersRepository } from './users.repository';
import { UserEmail, UserId, UserUpdateRecord } from './types/user.types';

/**
 * User business logic. Persistence is delegated to UsersRepository — no Prisma
 * here. This layer owns the rules: role defaults and password hashing.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findPage(
    query: ListUsersQueryDto,
  ): Promise<PaginatedResult<PublicUser>> {
    const { items, total } = await this.usersRepository.findPage(query);
    return new PaginatedResult(items, query.page, query.limit, total);
  }

  async findById(id: UserId): Promise<PublicUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const role: Role = dto.role ?? 'staff';
    const permissions = dto.permissions ?? ROLE_DEFAULT_PERMISSIONS[role];
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.usersRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role,
      permissions,
      phone: dto.phone,
    });
  }

  /**
   * A role change without an explicit permission list re-seeds that role's
   * defaults. Otherwise demoting a manager to staff would leave their elevated
   * permissions in place — and `permissions` is what the guard actually reads.
   */
  async update(
    id: UserId,
    dto: UpdateUserDto,
    actor: UserId,
  ): Promise<PublicUser> {
    const target = await this.usersRepository.findById(id);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    this.assertNotSelfLockout(id, actor, dto, target);
    await this.assertAnAdminRemains(dto, target);

    const data: UserUpdateRecord = { ...dto };
    if (dto.role && !dto.permissions) {
      data.permissions = ROLE_DEFAULT_PERMISSIONS[dto.role];
    }
    const updated = await this.usersRepository.update(id, data);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return updated;
  }

  /**
   * Nobody may switch off their own account or change their own role. Both are
   * one-way doors when done by the person holding the keys, and neither has a
   * legitimate use — another admin can do it for you.
   */
  private assertNotSelfLockout(
    id: UserId,
    actor: UserId,
    dto: UpdateUserDto,
    target: PublicUser,
  ): void {
    if (id !== actor) {
      return;
    }
    if (dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    if (dto.role !== undefined && dto.role !== target.role) {
      throw new ForbiddenException('You cannot change your own role');
    }
  }

  /**
   * Refuses the edit that would leave a hotel with no active admin at all —
   * recoverable only from the database. Managers hold `users:manage` too, so
   * this has to be checked here rather than left to the permission guard.
   */
  private async assertAnAdminRemains(
    dto: UpdateUserDto,
    target: PublicUser,
  ): Promise<void> {
    const dropsThisAdmin =
      target.role === 'admin' &&
      target.isActive &&
      (dto.isActive === false ||
        (dto.role !== undefined && dto.role !== 'admin'));
    if (!dropsThisAdmin) {
      return;
    }
    const activeAdmins = await this.usersRepository.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new ConflictException(
        'This is the last active admin — promote another admin first',
      );
    }
  }

  findByEmailWithSecret(email: UserEmail) {
    return this.usersRepository.findByEmailWithSecret(email);
  }

  findByIdInTenant(id: UserId, tenantId: TenantId): Promise<PublicUser | null> {
    return this.usersRepository.findByIdInTenant(id, tenantId);
  }

  markLoggedIn(id: UserId) {
    return this.usersRepository.markLoggedIn(id);
  }
}
