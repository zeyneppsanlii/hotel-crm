import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantId, toTenantId } from '../common/tenant/tenant.types';
import { UserId } from '../users/types/user.types';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenSubject } from './types/auth.types';
import {
  NewRefreshTokenRecord,
  RefreshTokenFamilyId,
  RefreshTokenHash,
  RefreshTokenId,
  StoredRefreshToken,
  toRefreshTokenId,
} from './types/refresh-token.types';

const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

const SUBJECT: TokenSubject = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@alpha.test',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'admin',
  permissions: ['users:manage'],
};

interface StoredRow extends StoredRefreshToken {
  tenantId: TenantId;
  tokenHash: RefreshTokenHash;
  revokedAt: Date | null;
}

class InMemoryRefreshTokensRepository {
  readonly rows: StoredRow[] = [];
  private nextId = 0;

  create(tenantId: TenantId, record: NewRefreshTokenRecord): Promise<void> {
    this.rows.push({
      id: toRefreshTokenId(`row-${this.nextId++}`),
      tenantId,
      userId: record.userId,
      familyId: record.familyId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findByHash(
    tenantId: TenantId,
    tokenHash: RefreshTokenHash,
  ): Promise<StoredRefreshToken | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.tokenHash === tokenHash,
    );
    return Promise.resolve(row ?? null);
  }

  claim(tenantId: TenantId, id: RefreshTokenId): Promise<boolean> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === id,
    );
    if (!row || row.revokedAt) {
      return Promise.resolve(false);
    }
    row.revokedAt = new Date();
    return Promise.resolve(true);
  }

  revokeFamily(
    tenantId: TenantId,
    familyId: RefreshTokenFamilyId,
  ): Promise<void> {
    for (const row of this.rows) {
      if (row.tenantId === tenantId && row.familyId === familyId) {
        row.revokedAt ??= new Date();
      }
    }
    return Promise.resolve();
  }

  deleteExpiredForUser(tenantId: TenantId, userId: UserId): Promise<void> {
    const now = Date.now();
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (
        row.tenantId === tenantId &&
        row.userId === userId &&
        row.expiresAt.getTime() < now
      ) {
        this.rows.splice(i, 1);
      }
    }
    return Promise.resolve();
  }
}

describe('RefreshTokenService', () => {
  let repository: InMemoryRefreshTokensRepository;
  let service: RefreshTokenService;

  const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  const rowFor = (token: string) =>
    repository.rows.find((row) => row.tokenHash === sha256(token));

  beforeEach(() => {
    repository = new InMemoryRefreshTokensRepository();
    const config = {
      getOrThrow: jest.fn().mockReturnValue(REFRESH_SECRET),
      get: jest.fn().mockReturnValue('30d'),
    } as unknown as ConfigService;
    service = new RefreshTokenService(
      new JwtService({}),
      config,
      repository as unknown as RefreshTokensRepository,
    );
  });

  it('stores only a hash of the issued token, never the token itself', async () => {
    const token = await service.issue(SUBJECT, service.startFamily());

    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(repository.rows)).not.toContain(token);
  });

  it('stores an expiry taken from the token itself', async () => {
    const before = Date.now();
    await service.issue(SUBJECT, service.startFamily());

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = repository.rows[0].expiresAt.getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDays - 5000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays + 5000);
  });

  it('issues distinct tokens for the same subject in the same family', async () => {
    const familyId = service.startFamily();

    const first = await service.issue(SUBJECT, familyId);
    const second = await service.issue(SUBJECT, familyId);

    expect(first).not.toBe(second);
    expect(repository.rows).toHaveLength(2);
  });

  it('consuming a token revokes it and reports its family', async () => {
    const familyId = service.startFamily();
    const token = await service.issue(SUBJECT, familyId);

    const consumed = await service.consume(token);

    expect(consumed.userId).toBe(SUBJECT.id);
    expect(consumed.tenantId).toBe(toTenantId(SUBJECT.tenantId));
    expect(consumed.familyId).toBe(familyId);
    expect(rowFor(token)?.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects a token that was already consumed and revokes the whole family', async () => {
    const familyId = service.startFamily();
    const first = await service.issue(SUBJECT, familyId);
    await service.consume(first);
    const second = await service.issue(SUBJECT, familyId);

    await expect(service.consume(first)).rejects.toThrow(UnauthorizedException);

    expect(rowFor(second)?.revokedAt).toBeInstanceOf(Date);
    await expect(service.consume(second)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('leaves other families untouched when one is revoked for reuse', async () => {
    const compromised = service.startFamily();
    const other = service.startFamily();
    const stolen = await service.issue(SUBJECT, compromised);
    const healthy = await service.issue(SUBJECT, other);
    await service.consume(stolen);

    await expect(service.consume(stolen)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(rowFor(healthy)?.revokedAt).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const forged = new JwtService({}).sign(
      { sub: SUBJECT.id, tenantId: SUBJECT.tenantId, tokenType: 'refresh' },
      { secret: 'an-attacker-chosen-secret', expiresIn: '30d' },
    );

    await expect(service.consume(forged)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a correctly signed token that is not of the refresh type', async () => {
    const accessShaped = new JwtService({}).sign(
      { sub: SUBJECT.id, tenantId: SUBJECT.tenantId },
      { secret: REFRESH_SECRET, expiresIn: '24h' },
    );

    await expect(service.consume(accessShaped)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a valid signature whose token was never stored', async () => {
    const token = await service.issue(SUBJECT, service.startFamily());
    repository.rows.length = 0;

    await expect(service.consume(token)).rejects.toThrow(UnauthorizedException);
  });

  it('revokeSession revokes the family behind the token', async () => {
    const familyId = service.startFamily();
    const token = await service.issue(SUBJECT, familyId);
    const sibling = await service.issue(SUBJECT, familyId);

    await service.revokeSession(token);

    expect(rowFor(token)?.revokedAt).toBeInstanceOf(Date);
    expect(rowFor(sibling)?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokeSession is a no-op for a token it cannot verify', async () => {
    await service.issue(SUBJECT, service.startFamily());

    await expect(service.revokeSession('not-a-jwt')).resolves.toBeUndefined();

    expect(repository.rows[0].revokedAt).toBeNull();
  });

  it('prunes the user’s expired rows when issuing', async () => {
    const familyId = service.startFamily();
    await service.issue(SUBJECT, familyId);
    repository.rows[0].expiresAt = new Date(Date.now() - 1000);

    await service.issue(SUBJECT, familyId);

    expect(repository.rows).toHaveLength(1);
  });
});
