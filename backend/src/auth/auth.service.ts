import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { toUserEmail, toUserId } from '../users/types/user.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RefreshTokenService } from './refresh-token.service';
import { LoginResult, TokenSubject } from './types/auth.types';
import { RefreshTokenFamilyId, TokenPair } from './types/refresh-token.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwt: JwtService,
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

    const tokens = await this.issueSession(
      user,
      this.refreshTokenService.startFamily(),
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<TokenPair> {
    const consumed = await this.refreshTokenService.consume(dto.refreshToken);

    const user = await this.usersService.findByIdInTenant(
      consumed.userId,
      consumed.tenantId,
    );
    if (!user || !user.isActive) {
      await this.refreshTokenService.revokeFamily(
        consumed.tenantId,
        consumed.familyId,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueSession(user, consumed.familyId);
  }

  logout(dto: RefreshTokenDto): Promise<void> {
    return this.refreshTokenService.revokeSession(dto.refreshToken);
  }

  private async issueSession(
    subject: TokenSubject,
    familyId: RefreshTokenFamilyId,
  ): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(subject),
      this.refreshTokenService.issue(subject, familyId),
    ]);
    return { accessToken, refreshToken };
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
}
