import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, getAdminPool, resetDatabase } from './helpers/db';
import { FIXTURE_PASSWORD, seedTenant, seedUser } from './helpers/fixtures';

interface TokenPairBody {
  data: { accessToken: string; refreshToken: string };
}

interface StoredTokenRow {
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Auth refresh rotation & logout (e2e)', () => {
  let app: INestApplication<App>;
  let tenantId: string;
  let userId: string;

  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', tenantId)
      .send({ email: 'active@alpha.test', password: FIXTURE_PASSWORD });

  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  const logout = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/logout').send({ refreshToken });

  const callMe = (accessToken: string) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .set('x-tenant-id', tenantId)
      .set('Authorization', `Bearer ${accessToken}`);

  const loginTokens = async () => {
    const res = await login();
    return (res.body as TokenPairBody).data;
  };

  // `expires_at` is `timestamp` (no zone) holding UTC, as everywhere in this
  // schema. `AT TIME ZONE 'UTC'` re-attaches the zone so node-pg does not read
  // the value as local time and shift it.
  const storedTokens = async (): Promise<StoredTokenRow[]> => {
    const { rows } = await getAdminPool().query<StoredTokenRow>(
      `SELECT token_hash, family_id, revoked_at,
              expires_at AT TIME ZONE 'UTC' AS expires_at
       FROM refresh_tokens ORDER BY created_at`,
    );
    return rows;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    await resetDatabase();
    const tenant = await seedTenant({ name: 'Hotel Alpha', slug: 'alpha' });
    tenantId = tenant.id;
    const user = await seedUser({
      tenantId,
      email: 'active@alpha.test',
      role: 'admin',
      permissions: ['users:manage'],
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await getAdminPool().query('DELETE FROM refresh_tokens');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
  });

  describe('storage', () => {
    it('persists only a hash of the refresh token, never the token itself', async () => {
      const { refreshToken } = await loginTokens();

      const rows = await storedTokens();
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(sha256(refreshToken));
      expect(rows[0].token_hash).not.toBe(refreshToken);
    });

    it('gives the stored token a 30-day lifetime', async () => {
      await loginTokens();

      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const [row] = await storedTokens();
      const ttl = row.expires_at.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(thirtyDays - 60_000);
      expect(ttl).toBeLessThanOrEqual(thirtyDays);
    });

    it('scopes the stored token to the tenant that issued it', async () => {
      await loginTokens();

      const { rows } = await getAdminPool().query<{
        tenant_id: string;
        user_id: string;
      }>('SELECT tenant_id, user_id FROM refresh_tokens');
      expect(rows[0].tenant_id).toBe(tenantId);
      expect(rows[0].user_id).toBe(userId);
    });
  });

  describe('happy path', () => {
    it('exchanges a refresh token for a new token pair', async () => {
      const { refreshToken } = await loginTokens();

      const res = await refresh(refreshToken);

      expect(res.status).toBe(200);
      const body = res.body as TokenPairBody;
      expect(body.data.accessToken).toEqual(expect.any(String));
      expect(body.data.refreshToken).toEqual(expect.any(String));
      expect(body.data.refreshToken).not.toBe(refreshToken);
    });

    it('returns an access token that works on a protected route', async () => {
      const { refreshToken } = await loginTokens();

      const res = await refresh(refreshToken);
      const me = await callMe((res.body as TokenPairBody).data.accessToken);

      expect(me.status).toBe(200);
    });

    it('needs no x-tenant-id header — the token carries its own tenant', async () => {
      const { refreshToken } = await loginTokens();

      const res = await refresh(refreshToken);

      expect(res.status).toBe(200);
    });

    it('keeps the rotated token in the same family as its predecessor', async () => {
      const { refreshToken } = await loginTokens();

      await refresh(refreshToken);

      const rows = await storedTokens();
      expect(rows).toHaveLength(2);
      expect(rows[1].family_id).toBe(rows[0].family_id);
    });

    it('survives several consecutive rotations', async () => {
      let current = (await loginTokens()).refreshToken;
      const seen = new Set([current]);

      for (let i = 0; i < 3; i++) {
        const res = await refresh(current);
        expect(res.status).toBe(200);
        current = (res.body as TokenPairBody).data.refreshToken;
        seen.add(current);
      }

      expect(seen.size).toBe(4);
      expect((await callMe(current)).status).toBe(401);
    });
  });

  describe('rotation invalidates the previous token', () => {
    it('rejects the old refresh token after a rotation', async () => {
      const { refreshToken } = await loginTokens();
      await refresh(refreshToken);

      const replay = await refresh(refreshToken);

      expect(replay.status).toBe(401);
    });

    it('marks the consumed token revoked in the database', async () => {
      const { refreshToken } = await loginTokens();

      await refresh(refreshToken);

      const rows = await storedTokens();
      expect(rows[0].revoked_at).toBeInstanceOf(Date);
      expect(rows[1].revoked_at).toBeNull();
    });
  });

  describe('reuse detection', () => {
    it('revokes the whole family when a consumed token is replayed', async () => {
      const stolen = (await loginTokens()).refreshToken;
      const rotated = (await refresh(stolen)).body as TokenPairBody;

      const replay = await refresh(stolen);
      expect(replay.status).toBe(401);

      const afterRevocation = await refresh(rotated.data.refreshToken);
      expect(afterRevocation.status).toBe(401);
    });

    it('leaves a parallel session (a different family) alive', async () => {
      const firstSession = (await loginTokens()).refreshToken;
      const secondSession = (await loginTokens()).refreshToken;
      await refresh(firstSession);

      await refresh(firstSession);

      const stillValid = await refresh(secondSession);
      expect(stillValid.status).toBe(200);
    });
  });

  describe('logout', () => {
    it('returns 204 and invalidates the refresh token', async () => {
      const { refreshToken } = await loginTokens();

      const res = await logout(refreshToken);
      expect(res.status).toBe(204);

      const afterLogout = await refresh(refreshToken);
      expect(afterLogout.status).toBe(401);
    });

    it('ends the whole session chain, not just the token presented', async () => {
      const first = (await loginTokens()).refreshToken;
      const rotated = (await refresh(first)).body as TokenPairBody;
      const second = rotated.data.refreshToken;

      await logout(first);

      expect((await refresh(second)).status).toBe(401);
    });

    it('is idempotent and does not leak whether a token was known', async () => {
      const { refreshToken } = await loginTokens();

      expect((await logout(refreshToken)).status).toBe(204);
      expect((await logout(refreshToken)).status).toBe(204);
      expect((await logout('not-a-jwt')).status).toBe(204);
    });
  });

  describe('rejected refresh attempts', () => {
    it('rejects a malformed token', async () => {
      expect((await refresh('not-a-jwt')).status).toBe(401);
    });

    it('rejects a refresh token signed with the wrong secret', async () => {
      const forged = jwt.sign(
        { sub: userId, tenantId, tokenType: 'refresh', jti: 'forged' },
        'an-attacker-chosen-secret',
        { expiresIn: '30d' },
      );

      expect((await refresh(forged)).status).toBe(401);
    });

    it('rejects an access token presented as a refresh token', async () => {
      const { accessToken } = await loginTokens();

      expect((await refresh(accessToken)).status).toBe(401);
    });

    it('rejects a correctly signed refresh token that was never issued', async () => {
      const unknown = jwt.sign(
        { sub: userId, tenantId, tokenType: 'refresh', jti: 'never-stored' },
        process.env.JWT_REFRESH_SECRET as string,
        { expiresIn: '30d' },
      );

      expect((await refresh(unknown)).status).toBe(401);
    });

    it('rejects an empty body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects a refresh token belonging to a deactivated user', async () => {
      const { refreshToken } = await loginTokens();
      await getAdminPool().query(
        'UPDATE users SET is_active = false WHERE id = $1',
        [userId],
      );

      const res = await refresh(refreshToken);

      await getAdminPool().query(
        'UPDATE users SET is_active = true WHERE id = $1',
        [userId],
      );
      expect(res.status).toBe(401);
    });
  });
});
