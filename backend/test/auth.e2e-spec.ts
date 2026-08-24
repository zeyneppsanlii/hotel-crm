import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, getAdminPool, resetDatabase } from './helpers/db';
import { closeRedis, resetLoginAttempts } from './helpers/redis';
import { FIXTURE_PASSWORD, seedTenant, seedUser } from './helpers/fixtures';

interface LoginBody {
  data: { accessToken: string; refreshToken: string; user: { id: string } };
}
interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let tenantId: string;
  let activeUserId: string;

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', tenantId)
      .send({ email, password });

  const callMe = (token: string) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .set('x-tenant-id', tenantId)
      .set('Authorization', `Bearer ${token}`);

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
    const active = await seedUser({
      tenantId,
      email: 'active@alpha.test',
      role: 'admin',
      permissions: ['users:manage'],
    });
    activeUserId = active.id;
    await seedUser({
      tenantId,
      email: 'inactive@alpha.test',
      role: 'staff',
      isActive: false,
    });
  });

  // These specs deliberately fail logins; without this the brute-force counter
  // would carry over and lock the account mid-suite.
  beforeEach(async () => {
    await resetLoginAttempts();
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
    await closeRedis();
  });

  describe('successful login', () => {
    it('returns an access token, a refresh token and the user profile', async () => {
      const res = await login('active@alpha.test', FIXTURE_PASSWORD);

      expect(res.status).toBe(200);
      const body = res.body as LoginBody;
      expect(body.data.accessToken).toEqual(expect.any(String));
      expect(body.data.refreshToken).toEqual(expect.any(String));
      expect(body.data.user.id).toBe(activeUserId);
    });

    it('never exposes the password hash anywhere in the response', async () => {
      const res = await login('active@alpha.test', FIXTURE_PASSWORD);

      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|password_hash/,
      );
      expect(JSON.stringify(res.body)).not.toContain('$2b$');
    });

    it('stamps lastLoginAt', async () => {
      await login('active@alpha.test', FIXTURE_PASSWORD);

      const { rows } = await getAdminPool().query<{ last_login_at: Date }>(
        'SELECT last_login_at FROM users WHERE id = $1',
        [activeUserId],
      );
      expect(rows[0].last_login_at).toBeInstanceOf(Date);
    });

    it('grants access to a protected route', async () => {
      const res = await login('active@alpha.test', FIXTURE_PASSWORD);
      const me = await callMe((res.body as LoginBody).data.accessToken);

      expect(me.status).toBe(200);
    });
  });

  describe('rejected login', () => {
    it('rejects a wrong password with 401', async () => {
      const res = await login('active@alpha.test', 'wrong-password');

      expect(res.status).toBe(401);
    });

    it('rejects an inactive user with 401 even with the right password', async () => {
      const res = await login('inactive@alpha.test', FIXTURE_PASSWORD);

      expect(res.status).toBe(401);
    });

    it('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await login('active@alpha.test', 'wrong-password');
      const unknownAccount = await login('nobody@alpha.test', FIXTURE_PASSWORD);

      expect(unknownAccount.status).toBe(wrongPassword.status);
      expect((unknownAccount.body as ErrorBody).error.message).toBe(
        (wrongPassword.body as ErrorBody).error.message,
      );
      expect((unknownAccount.body as ErrorBody).error.code).toBe(
        (wrongPassword.body as ErrorBody).error.code,
      );
    });
  });

  describe('token validation on protected routes', () => {
    it('rejects a request with no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('x-tenant-id', tenantId);

      expect(res.status).toBe(401);
    });

    it('rejects a malformed token', async () => {
      const res = await callMe('not-a-jwt');

      expect(res.status).toBe(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwt.sign(
        { sub: activeUserId, email: 'active@alpha.test', tenantId },
        'an-attacker-chosen-secret',
        { expiresIn: '24h' },
      );

      const res = await callMe(forged);

      expect(res.status).toBe(401);
    });

    it('rejects an expired token', async () => {
      const expired = jwt.sign(
        {
          sub: activeUserId,
          email: 'active@alpha.test',
          tenantId,
          role: 'admin',
          permissions: ['users:manage'],
        },
        process.env.JWT_SECRET as string,
        { expiresIn: '-1s' },
      );

      const res = await callMe(expired);

      expect(res.status).toBe(401);
    });

    it('rejects the refresh token when used as an access token', async () => {
      const res = await login('active@alpha.test', FIXTURE_PASSWORD);

      const me = await callMe((res.body as LoginBody).data.refreshToken);

      expect(me.status).toBe(401);
    });
  });
});
