import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, resetDatabase } from './helpers/db';
import { closeRedis, resetLoginAttempts } from './helpers/redis';
import { FIXTURE_PASSWORD, seedTenant, seedUser } from './helpers/fixtures';

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

// Mirrors .env.test — the suite runs with a tiny threshold and a 2s lock so the
// expiry case costs seconds, not minutes.
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS);
const LOCKOUT_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Login brute-force lockout (e2e)', () => {
  let app: INestApplication<App>;
  let alphaId: string;
  let betaId: string;

  const login = (
    tenantId: string,
    email: string,
    password: string,
  ): request.Test =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', tenantId)
      .send({ email, password });

  const failLogin = (tenantId: string, email: string) =>
    login(tenantId, email, 'wrong-password');

  const failTimes = async (
    tenantId: string,
    email: string,
    times: number,
  ): Promise<void> => {
    for (let i = 0; i < times; i++) {
      await failLogin(tenantId, email);
    }
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
    alphaId = (await seedTenant({ name: 'Hotel Alpha', slug: 'alpha' })).id;
    betaId = (await seedTenant({ name: 'Hotel Beta', slug: 'beta' })).id;
    await seedUser({ tenantId: alphaId, email: 'staff@alpha.test' });
    await seedUser({ tenantId: alphaId, email: 'other@alpha.test' });
    await seedUser({ tenantId: betaId, email: 'staff@alpha.test' });
  });

  beforeEach(async () => {
    await resetLoginAttempts();
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
    await closeRedis();
  });

  it('sanity-checks that the test environment lowered the thresholds', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_ATTEMPTS).toBeLessThan(5);
    expect(LOCKOUT_SECONDS).toBeLessThanOrEqual(5);
  });

  describe('reaching the threshold', () => {
    it('still answers 401 for the failures below the threshold', async () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        const res = await failLogin(alphaId, 'staff@alpha.test');
        expect(res.status).toBe(401);
      }
    });

    it('locks the account once the threshold is reached', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);

      const res = await failLogin(alphaId, 'staff@alpha.test');

      expect(res.status).toBe(429);
      expect((res.body as ErrorBody).error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('rejects the CORRECT password while locked', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);

      const res = await login(alphaId, 'staff@alpha.test', FIXTURE_PASSWORD);

      expect(res.status).toBe(429);
    });

    it('does not name the account or hint at it in the lock message', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);

      const res = await failLogin(alphaId, 'staff@alpha.test');

      const { message } = (res.body as ErrorBody).error;
      expect(message).not.toContain('staff@alpha.test');
      expect(message).not.toMatch(/exist|unknown|password|user/i);
    });
  });

  describe('user enumeration', () => {
    it('locks an unknown account the same way, so 429 cannot confirm an email exists', async () => {
      await failTimes(alphaId, 'nobody@alpha.test', MAX_ATTEMPTS);

      const unknown = await failLogin(alphaId, 'nobody@alpha.test');

      expect(unknown.status).toBe(429);
    });

    it('answers a known and an unknown account identically at every step', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);
      const known = await failLogin(alphaId, 'staff@alpha.test');

      await resetLoginAttempts();
      await failTimes(alphaId, 'nobody@alpha.test', MAX_ATTEMPTS);
      const unknown = await failLogin(alphaId, 'nobody@alpha.test');

      expect(unknown.status).toBe(known.status);
      expect((unknown.body as ErrorBody).error).toEqual(
        (known.body as ErrorBody).error,
      );
    });
  });

  describe('scope of a lock', () => {
    it('leaves another account in the same hotel able to log in', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);

      const res = await login(alphaId, 'other@alpha.test', FIXTURE_PASSWORD);

      expect(res.status).toBe(200);
    });

    it('does not lock the same email in another hotel', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);

      const res = await login(betaId, 'staff@alpha.test', FIXTURE_PASSWORD);

      expect(res.status).toBe(200);
    });
  });

  describe('releasing a lock', () => {
    it('lets the user back in once the lockout expires', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS);
      expect((await failLogin(alphaId, 'staff@alpha.test')).status).toBe(429);

      await sleep(LOCKOUT_SECONDS * 1000 + 500);

      const res = await login(alphaId, 'staff@alpha.test', FIXTURE_PASSWORD);
      expect(res.status).toBe(200);
    });

    it('clears the counter after a successful login', async () => {
      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS - 1);
      expect(
        (await login(alphaId, 'staff@alpha.test', FIXTURE_PASSWORD)).status,
      ).toBe(200);

      await failTimes(alphaId, 'staff@alpha.test', MAX_ATTEMPTS - 1);

      const res = await login(alphaId, 'staff@alpha.test', FIXTURE_PASSWORD);
      expect(res.status).toBe(200);
    });
  });
});
