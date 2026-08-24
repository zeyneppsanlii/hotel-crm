import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, getAdminPool, resetDatabase } from './helpers/db';
import { closeRedis, resetLoginAttempts } from './helpers/redis';
import { FIXTURE_PASSWORD, seedTenant, seedUser } from './helpers/fixtures';

interface LoginBody {
  data: { accessToken: string };
}
interface UserBody {
  data: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    isActive: boolean;
    fullName: string;
  };
}
interface UserListBody {
  data: { id: string; email: string; tenantId: string }[];
  meta: { page: number; limit: number; total: number; hasMore: boolean };
}

describe('Users CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let alphaId: string;
  let betaId: string;
  let adminToken: string;
  let staffToken: string;
  let betaAdminToken: string;
  let staffUserId: string;
  let betaUserId: string;

  const login = async (tenantId: string, email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', tenantId)
      .send({ email, password: FIXTURE_PASSWORD });
    return (res.body as LoginBody).data.accessToken;
  };

  const asAdmin = (method: 'get' | 'post' | 'patch', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set('x-tenant-id', alphaId)
      .set('Authorization', `Bearer ${adminToken}`);

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
    await resetLoginAttempts();
    alphaId = (await seedTenant({ name: 'Hotel Alpha', slug: 'alpha' })).id;
    betaId = (await seedTenant({ name: 'Hotel Beta', slug: 'beta' })).id;

    await seedUser({
      tenantId: alphaId,
      email: 'admin@alpha.test',
      role: 'admin',
      permissions: ['users:manage'],
    });
    staffUserId = (
      await seedUser({
        tenantId: alphaId,
        email: 'staff@alpha.test',
        role: 'staff',
        permissions: ['guests:view'],
      })
    ).id;
    betaUserId = (
      await seedUser({
        tenantId: betaId,
        email: 'admin@beta.test',
        role: 'admin',
        permissions: ['users:manage'],
      })
    ).id;

    adminToken = await login(alphaId, 'admin@alpha.test');
    staffToken = await login(alphaId, 'staff@alpha.test');
    betaAdminToken = await login(betaId, 'admin@beta.test');
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
    await closeRedis();
  });

  describe('authorization (default-closed)', () => {
    it('lets an admin list users', async () => {
      expect((await asAdmin('get', '/users')).status).toBe(200);
    });

    it('refuses a staff user without users:manage', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('x-tenant-id', alphaId)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('refuses a staff user trying to create a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('x-tenant-id', alphaId)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          email: 'sneaky@alpha.test',
          password: 'secret1234',
          fullName: 'Sneaky',
        });

      expect(res.status).toBe(403);
    });

    it('refuses a staff user trying to change a role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${staffUserId}`)
        .set('x-tenant-id', alphaId)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('refuses an unauthenticated request', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('x-tenant-id', alphaId);

      expect(res.status).toBe(401);
    });
  });

  describe('listing and pagination', () => {
    it('reports page, limit, total and hasMore in meta', async () => {
      const res = await asAdmin('get', '/users?page=1&limit=1');

      const body = res.body as UserListBody;
      expect(body.data).toHaveLength(1);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(1);
      expect(body.meta.total).toBe(2);
      expect(body.meta.hasMore).toBe(true);
    });

    it('closes hasMore on the last page', async () => {
      const res = await asAdmin('get', '/users?page=2&limit=1');

      const body = res.body as UserListBody;
      expect(body.meta.hasMore).toBe(false);
    });

    it('returns no overlap between consecutive pages', async () => {
      const first = await asAdmin('get', '/users?page=1&limit=1');
      const second = await asAdmin('get', '/users?page=2&limit=1');

      const firstId = (first.body as UserListBody).data[0].id;
      const secondId = (second.body as UserListBody).data[0].id;
      expect(firstId).not.toBe(secondId);
    });

    it('defaults to page 1 when no query is given', async () => {
      const res = await asAdmin('get', '/users');

      const body = res.body as UserListBody;
      expect(body.meta.page).toBe(1);
      expect(body.data).toHaveLength(2);
    });

    it('counts only the caller’s tenant', async () => {
      const res = await asAdmin('get', '/users');

      const body = res.body as UserListBody;
      expect(body.meta.total).toBe(2);
      expect(body.data.every((u) => u.tenantId === alphaId)).toBe(true);
    });

    it('rejects a limit above the cap', async () => {
      expect((await asAdmin('get', '/users?limit=1000')).status).toBe(400);
    });

    it('rejects a non-numeric page', async () => {
      expect((await asAdmin('get', '/users?page=abc')).status).toBe(400);
    });
  });

  describe('reading one user', () => {
    it('returns a user in the caller’s tenant', async () => {
      const res = await asAdmin('get', `/users/${staffUserId}`);

      expect(res.status).toBe(200);
      expect((res.body as UserBody).data.email).toBe('staff@alpha.test');
    });

    it('404s for a user belonging to another hotel', async () => {
      const res = await asAdmin('get', `/users/${betaUserId}`);

      expect(res.status).toBe(404);
    });

    it('404s for an id that does not exist', async () => {
      const res = await asAdmin(
        'get',
        '/users/99999999-9999-4999-8999-999999999999',
      );

      expect(res.status).toBe(404);
    });

    it('400s for a malformed id', async () => {
      expect((await asAdmin('get', '/users/not-a-uuid')).status).toBe(400);
    });
  });

  describe('updating', () => {
    it('updates the profile fields', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        fullName: 'Güncel Ad',
        phone: '+905550001122',
      });

      expect(res.status).toBe(200);
      expect((res.body as UserBody).data.fullName).toBe('Güncel Ad');
    });

    it('re-seeds permissions when the role changes on its own', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        role: 'manager',
      });

      const { role, permissions } = (res.body as UserBody).data;
      expect(role).toBe('manager');
      expect(permissions).toContain('users:manage');
    });

    it('drops elevated permissions on a demotion', async () => {
      await asAdmin('patch', `/users/${staffUserId}`).send({ role: 'manager' });

      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        role: 'staff',
      });

      expect((res.body as UserBody).data.permissions).not.toContain(
        'users:manage',
      );
    });

    it('honours an explicit permission list', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        role: 'staff',
        permissions: ['reports:view'],
      });

      expect((res.body as UserBody).data.permissions).toEqual(['reports:view']);
    });

    it('rejects a permission outside the catalog', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        permissions: ['everything:always'],
      });

      expect(res.status).toBe(400);
    });

    it('rejects a role outside admin|manager|staff', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        role: 'superuser',
      });

      expect(res.status).toBe(400);
    });

    it('rejects an attempt to change the email', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        email: 'moved@alpha.test',
      });

      expect(res.status).toBe(400);
    });

    it('404s when updating a user in another hotel', async () => {
      const res = await asAdmin('patch', `/users/${betaUserId}`).send({
        fullName: 'Ele Geçirildi',
      });

      expect(res.status).toBe(404);
    });

    it('leaves the other hotel’s row untouched after that 404', async () => {
      await asAdmin('patch', `/users/${betaUserId}`).send({
        fullName: 'Ele Geçirildi',
      });

      const { rows } = await getAdminPool().query<{ full_name: string }>(
        'SELECT full_name FROM users WHERE id = $1',
        [betaUserId],
      );
      expect(rows[0].full_name).not.toBe('Ele Geçirildi');
    });
  });

  describe('deactivation instead of deletion', () => {
    it('deactivates a user and keeps the row', async () => {
      const res = await asAdmin('patch', `/users/${staffUserId}`).send({
        isActive: false,
      });

      expect(res.status).toBe(200);
      expect((res.body as UserBody).data.isActive).toBe(false);

      const { rows } = await getAdminPool().query(
        'SELECT id FROM users WHERE id = $1',
        [staffUserId],
      );
      expect(rows).toHaveLength(1);
    });

    it('stops a deactivated user from logging in', async () => {
      await asAdmin('patch', `/users/${staffUserId}`).send({ isActive: false });
      await resetLoginAttempts();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', alphaId)
        .send({ email: 'staff@alpha.test', password: FIXTURE_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('lets a reactivated user log in again', async () => {
      await asAdmin('patch', `/users/${staffUserId}`).send({ isActive: false });
      await asAdmin('patch', `/users/${staffUserId}`).send({ isActive: true });
      await resetLoginAttempts();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', alphaId)
        .send({ email: 'staff@alpha.test', password: FIXTURE_PASSWORD });

      expect(res.status).toBe(200);
    });
  });

  describe('creating', () => {
    it('creates a user and seeds the role defaults', async () => {
      const res = await asAdmin('post', '/users').send({
        email: 'yeni@alpha.test',
        password: 'secret1234',
        fullName: 'Yeni Personel',
        role: 'manager',
      });

      expect(res.status).toBe(201);
      expect((res.body as UserBody).data.permissions).toContain('users:manage');
    });

    it('rejects a duplicate email within the same hotel', async () => {
      const res = await asAdmin('post', '/users').send({
        email: 'admin@alpha.test',
        password: 'secret1234',
        fullName: 'Kopya',
      });

      expect(res.status).toBe(409);
    });

    it('allows the same email in a different hotel', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('x-tenant-id', betaId)
        .set('Authorization', `Bearer ${betaAdminToken}`)
        .send({
          email: 'admin@alpha.test',
          password: 'secret1234',
          fullName: 'Beta Adaşı',
        });

      expect(res.status).toBe(201);
    });
  });

  describe('the password hash never leaves the server', () => {
    it('is absent from the list', async () => {
      const res = await asAdmin('get', '/users');

      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|password_hash/,
      );
      expect(JSON.stringify(res.body)).not.toContain('$2b$');
    });

    it('is absent from a single user, a create and an update', async () => {
      const one = await asAdmin('get', `/users/${staffUserId}`);
      const created = await asAdmin('post', '/users').send({
        email: 'gizli@alpha.test',
        password: 'secret1234',
        fullName: 'Gizli',
      });
      const updated = await asAdmin('patch', `/users/${staffUserId}`).send({
        fullName: 'Yine Güncel',
      });

      for (const res of [one, created, updated]) {
        expect(JSON.stringify(res.body)).not.toMatch(
          /passwordHash|password_hash/,
        );
        expect(JSON.stringify(res.body)).not.toContain('$2b$');
      }
    });
  });
});
