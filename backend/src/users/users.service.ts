import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../auth/password.constants';
import { ROLE_DEFAULT_PERMISSIONS, Role } from '../auth/permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { PublicUser, UsersRepository } from './users.repository';
import { UserEmail, UserId } from './types/user.types';

/**
 * User business logic. Persistence is delegated to UsersRepository — no Prisma
 * here. This layer owns the rules: role defaults and password hashing.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findAll(): Promise<PublicUser[]> {
    return this.usersRepository.findAll();
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

  findByEmailWithSecret(email: UserEmail) {
    return this.usersRepository.findByEmailWithSecret(email);
  }

  markLoggedIn(id: UserId) {
    return this.usersRepository.markLoggedIn(id);
  }
}
