import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { toUserEmail, toUserId } from '../users/types/user.types';
import { LoginDto } from './dto/login.dto';
import {
  JwtPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';
import { LoginResult, TokenSubject } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authenticates within the CURRENT tenant (resolved from the x-tenant-id header
   * by the tenant-aware layer). Identity is per-tenant: the same email in another
   * tenant is a different account, so logging into the wrong hotel simply fails.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.usersService.findByEmailWithSecret(
      toUserEmail(dto.email),
    );
    // Uniform error whether the user is missing, inactive, or the password is
    // wrong — don't leak which accounts exist.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.markLoggedIn(toUserId(user.id));

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.signRefreshToken(user),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }

  private signAccessToken(subject: TokenSubject): Promise<string> {
    const payload: JwtPayload = {
      sub: subject.id,
      email: subject.email,
      tenantId: subject.tenantId,
      role: subject.role,
      permissions: subject.permissions,
    };
    return this.jwt.signAsync(payload);
  }

  private signRefreshToken(subject: TokenSubject): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: subject.id,
      tenantId: subject.tenantId,
      tokenType: 'refresh',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '30d',
      ) as SignOptions['expiresIn'],
    });
  }
}
