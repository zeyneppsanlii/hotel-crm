import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, resetDatabase } from './helpers/db';
import { FIXTURE_PASSWORD, seedTwoTenants } from './helpers/fixtures';

interface LoginBody {
  data: { accessToken: string };
}
interface UsersBody {
  data: Array<{ email: string; tenantId: string }>;
}

// Exercises the whole e2e stack: real Postgres, migrations + RLS, tenant fixtures,
// login, and tenant-scoped reads. (The exhaustive isolation matrix is HCRM-24.)
describe('Test infra + tenant fixtures (e2e)', () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof seedTwoTenants>>;

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
    ctx = await seedTwoTenants();
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
  });

  it('logs in a seeded user and scopes /users to that tenant (real DB + RLS)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', ctx.alpha.id)
      .send({ email: 'admin@alpha.test', password: FIXTURE_PASSWORD });
    expect(login.status).toBe(200);
    const token = (login.body as LoginBody).data.accessToken;

    const users = await request(app.getHttpServer())
      .get('/users')
      .set('x-tenant-id', ctx.alpha.id)
      .set('Authorization', `Bearer ${token}`);
    expect(users.status).toBe(200);

    const list = (users.body as UsersBody).data;
    // Only Alpha's user is visible; Beta's admin never leaks in.
    expect(list.every((u) => u.tenantId === ctx.alpha.id)).toBe(true);
    expect(list.some((u) => u.email === 'admin@alpha.test')).toBe(true);
    expect(list.some((u) => u.email === 'admin@beta.test')).toBe(false);
  });
});
