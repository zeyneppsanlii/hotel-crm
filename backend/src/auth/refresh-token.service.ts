import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { TenantId, toTenantId } from '../common/tenant/tenant.types';
import { toUserId } from '../users/types/user.types';
import { RefreshTokenPayload } from './interfaces/jwt-payload.interface';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenSubject } from './types/auth.types';
import {
  ConsumedRefreshToken,
  RefreshTokenFamilyId,
  RefreshTokenHash,
  toRefreshTokenFamilyId,
  toRefreshTokenHash,
} from './types/refresh-token.types';

const INVALID_REFRESH_TOKEN = 'Invalid refresh token';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  startFamily(): RefreshTokenFamilyId {
    return toRefreshTokenFamilyId(randomUUID());
  }

  async issue(
    subject: TokenSubject,
    familyId: RefreshTokenFamilyId,
  ): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: subject.id,
      tenantId: subject.tenantId,
      tokenType: 'refresh',
      jti: randomUUID(),
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    const tenantId = toTenantId(subject.tenantId);
    const userId = toUserId(subject.id);
    await this.refreshTokens.deleteExpiredForUser(tenantId, userId);
    await this.refreshTokens.create(tenantId, {
      userId,
      familyId,
      tokenHash: this.hash(token),
      expiresAt: this.expiresAtOf(token),
    });

    return token;
  }

  async consume(rawToken: string): Promise<ConsumedRefreshToken> {
    const payload = this.verify(rawToken);
    const tenantId = toTenantId(payload.tenantId);

    const stored = await this.refreshTokens.findByHash(
      tenantId,
      this.hash(rawToken),
    );
    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    const claimed = await this.refreshTokens.claim(tenantId, stored.id);
    if (!claimed) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking token family ${stored.familyId}`,
      );
      await this.refreshTokens.revokeFamily(tenantId, stored.familyId);
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    return {
      userId: stored.userId,
      tenantId,
      familyId: stored.familyId,
    };
  }

  async revokeSession(rawToken: string): Promise<void> {
    const payload = this.tryVerify(rawToken);
    if (!payload) {
      return;
    }
    const tenantId = toTenantId(payload.tenantId);
    const stored = await this.refreshTokens.findByHash(
      tenantId,
      this.hash(rawToken),
    );
    if (!stored) {
      return;
    }
    await this.refreshTokens.revokeFamily(tenantId, stored.familyId);
  }

  revokeFamily(
    tenantId: TenantId,
    familyId: RefreshTokenFamilyId,
  ): Promise<void> {
    return this.refreshTokens.revokeFamily(tenantId, familyId);
  }

  private verify(rawToken: string): RefreshTokenPayload {
    const payload = this.tryVerify(rawToken);
    if (!payload) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }
    return payload;
  }

  private tryVerify(rawToken: string): RefreshTokenPayload | null {
    try {
      const payload = this.jwt.verify<RefreshTokenPayload>(rawToken, {
        secret: this.refreshSecret,
      });
      return payload.tokenType === 'refresh' ? payload : null;
    } catch {
      return null;
    }
  }

  private hash(rawToken: string): RefreshTokenHash {
    return toRefreshTokenHash(
      createHash('sha256').update(rawToken).digest('hex'),
    );
  }

  private expiresAtOf(token: string): Date {
    const decoded = this.jwt.decode<{ exp?: number } | null>(token);
    if (!decoded?.exp) {
      throw new Error('Refresh token was signed without an expiry claim');
    }
    return new Date(decoded.exp * 1000);
  }

  private get refreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private get refreshExpiresIn(): SignOptions['expiresIn'] {
    return this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    ) as SignOptions['expiresIn'];
  }
}
