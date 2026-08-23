import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import {
  JwtPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

const ACCESS_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const PASSWORD = 'secret1234';

const SEEDED_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@alpha.test',
  fullName: 'Alpha Admin',
  role: 'admin',
  permissions: ['users:manage'],
  isActive: true,
};

describe('AuthService token issuance', () => {
  let jwt: JwtService;
  let service: AuthService;
  let markLoggedIn: jest.Mock;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    jwt = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: '24h' },
    });
    markLoggedIn = jest.fn().mockResolvedValue(undefined);
    const usersService = {
      findByEmailWithSecret: jest
        .fn()
        .mockResolvedValue({ ...SEEDED_USER, passwordHash }),
      markLoggedIn,
    } as unknown as UsersService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(REFRESH_SECRET),
      get: jest.fn().mockReturnValue('30d'),
    } as unknown as ConfigService;

    const refreshTokens = {
      create: jest.fn().mockResolvedValue(undefined),
      findByHash: jest.fn().mockResolvedValue(null),
      claim: jest.fn().mockResolvedValue(true),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      deleteExpiredForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as RefreshTokensRepository;

    service = new AuthService(
      usersService,
      new RefreshTokenService(jwt, config, refreshTokens),
      jwt,
    );
  });

  it('issues both an access token and a refresh token on login', async () => {
    const result = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.accessToken).not.toEqual(result.refreshToken);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('signs the refresh token with a separate secret so it cannot pass as an access token', async () => {
    const { refreshToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });

    expect(() => {
      jwt.verify<RefreshTokenPayload>(refreshToken, { secret: ACCESS_SECRET });
    }).toThrow();

    const payload = jwt.verify<RefreshTokenPayload>(refreshToken, {
      secret: REFRESH_SECRET,
    });
    expect(payload.tokenType).toBe('refresh');
    expect(payload.sub).toBe(SEEDED_USER.id);
    expect(payload.tenantId).toBe(SEEDED_USER.tenantId);
    expect(payload).not.toHaveProperty('permissions');
  });

  it('keeps the access token payload single-tenant with permissions', async () => {
    const { accessToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });

    const payload = jwt.verify<JwtPayload>(accessToken, {
      secret: ACCESS_SECRET,
    });
    expect(payload.sub).toBe(SEEDED_USER.id);
    expect(payload.tenantId).toBe(SEEDED_USER.tenantId);
    expect(payload.permissions).toEqual(['users:manage']);
    expect(payload).not.toHaveProperty('tenants');
  });
});
